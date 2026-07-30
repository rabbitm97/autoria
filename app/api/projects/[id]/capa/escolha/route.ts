export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { updateProject } from "@/lib/supabase-helpers";
import { validarProjectData } from "@/lib/project-data";
import type { OpcaoCapa, GaleriaCapaItem, CapaGeradaResult, DadosVersoIa } from "@/lib/project-data";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import { estimarLombadaCapaMm } from "@/lib/formatos";

// Regex do nome canônico gerado por `gerar-capa`. Aceita legado
// `capa_ia_<ts>_<i>.<ext>` (pré-B2-05, sempre frente) e o formato
// atual `capa_ia_<alvo>_<ts>_<i>.<ext>` onde alvo ∈ frente|verso|unica.
const NOME_CAPA_IA_REGEX = /^capa_ia_(?:(frente|verso|unica)_)?(\d+)_(\d+)\.(png|jpg)$/i;

type AlvoEscolha = "frente" | "verso" | "unica";

/**
 * Lista `capa_ia_*` do prefixo do projeto no bucket `capas`, filtrado
 * pelo alvo. Usado para confirmar que a URL escolhida pertence ao
 * projeto quando a memória (opcoes/galeria em `dados_capa`) está vazia
 * ou desatualizada. Legado (sem alvo no nome) só aparece para alvo="frente".
 */
async function listarGaleriaStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: SupabaseClient<any>,
  userId: string,
  projectId: string,
  alvo: AlvoEscolha,
): Promise<GaleriaCapaItem[]> {
  const prefix = `${userId}/${projectId}`;
  const { data: files, error } = await storage.storage
    .from("capas")
    .list(prefix, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error || !files) return [];

  const iaFiles = files.filter((f) => {
    const m = f.name.match(NOME_CAPA_IA_REGEX);
    if (!m) return false;
    const alvoNome = (m[1]?.toLowerCase() ?? "frente") as AlvoEscolha;
    return alvoNome === alvo;
  });
  iaFiles.sort((a, b) => {
    const ta = Number(a.name.match(NOME_CAPA_IA_REGEX)?.[2] ?? "0");
    const tb = Number(b.name.match(NOME_CAPA_IA_REGEX)?.[2] ?? "0");
    return tb - ta;
  });

  const itens: GaleriaCapaItem[] = [];
  for (const f of iaFiles) {
    const storagePath = `${prefix}/${f.name}`;
    const { url } = await signedUrlCapas(storage, storagePath);
    if (!url) continue;
    const ts = Number(f.name.match(NOME_CAPA_IA_REGEX)?.[2] ?? "0");
    itens.push({
      url,
      storage_path: storagePath,
      tipo: alvo,
      gerado_em: ts > 0 ? new Date(ts).toISOString() : new Date().toISOString(),
    });
  }
  return itens;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const dev = isDev();

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: SupabaseClient<any>;

  if (dev) {
    userId = "dev-user";
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : null;
  const storagePathIn = typeof body?.storage_path === "string" ? body.storage_path.trim() : null;
  const alvoRaw = typeof body?.alvo === "string" ? body.alvo.trim().toLowerCase() : "frente";
  const alvo: AlvoEscolha =
    alvoRaw === "verso" || alvoRaw === "unica" ? alvoRaw : "frente";
  if (!url) {
    return NextResponse.json({ error: "Campo 'url' obrigatório." }, { status: 400 });
  }

  // Fiscal: leitura pré-merge. Falha transiente aqui + escrita depois
  // apagaria `editor_data` inteiro (spread sobre `{}`). Distinguimos 404
  // (projeto não existe) de 500 (erro de rede/BD) para não confundir o
  // cliente com "não encontrado" quando é falha de infra.
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, dados_capa, dados_miolo")
    .eq("id", projectId)
    .single();

  if (projErr) {
    if ((projErr as { code?: string }).code === "PGRST116") {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }
    console.error("[capa-escolha] falha ao carregar dados_capa:", projErr.message);
    return NextResponse.json(
      { error: "Falha ao carregar a capa atual. Tente novamente." },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const dadosCapa = (project as Record<string, unknown>).dados_capa as Record<string, unknown> | null;

  // No-op: escolher a MESMA arte que já está escolhida não deve tocar em
  // nada (evita zerar editor_data por clique acidental na mesma opção).
  if (alvo === "verso") {
    const versoAtual = (dadosCapa?.verso as DadosVersoIa | null | undefined) ?? null;
    if (versoAtual?.url_escolhida === url) {
      return NextResponse.json(dadosCapa ?? {});
    }
  } else {
    if (dadosCapa && typeof dadosCapa.url_escolhida === "string" && dadosCapa.url_escolhida === url) {
      return NextResponse.json(dadosCapa);
    }
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ─── Legitimidade da URL: opcoes/galeria em memória OU storage ────────────
  // Aceita a escolha se a URL bate com opcoes/galeria no `dados_capa` atual
  // (para o alvo correspondente) OU com a listagem `capa_ia_*` do storage
  // filtrada por alvo (fonte de verdade — cobre pós-reset, galeria
  // desatualizada, refresh de signed URL, etc.).
  const opcoesMemory: OpcaoCapa[] = (() => {
    if (alvo === "verso") {
      const v = dadosCapa?.verso as DadosVersoIa | null | undefined;
      return Array.isArray(v?.opcoes) ? v.opcoes : [];
    }
    return Array.isArray(dadosCapa?.opcoes) ? (dadosCapa!.opcoes as OpcaoCapa[]) : [];
  })();
  const galeriaMemory: GaleriaCapaItem[] = Array.isArray(dadosCapa?.galeria)
    ? (dadosCapa!.galeria as GaleriaCapaItem[]).filter((g) => (g.tipo ?? "frente") === alvo)
    : [];
  const opcaoEmMem = opcoesMemory.find((o) => o.url === url);
  const galeriaEmMem = galeriaMemory.find((g) => g.url === url);

  // Só lista o storage se precisar validar contra a fonte de verdade
  // (a listagem custa uma chamada por objeto pro signedUrl).
  let galeriaStorage: GaleriaCapaItem[] | null = null;
  let itemStorage: GaleriaCapaItem | undefined;
  if (!opcaoEmMem && !galeriaEmMem) {
    galeriaStorage = await listarGaleriaStorage(storageClient, userId, projectId, alvo);
    itemStorage =
      (storagePathIn ? galeriaStorage.find((g) => g.storage_path === storagePathIn) : undefined) ||
      galeriaStorage.find((g) => g.url === url);
    if (!itemStorage) {
      return NextResponse.json(
        { error: "URL não pertence a nenhuma geração deste projeto para este alvo." },
        { status: 422 },
      );
    }
  }

  const storagePathResolvido =
    opcaoEmMem?.storage_path ??
    galeriaEmMem?.storage_path ??
    itemStorage?.storage_path ??
    storagePathIn ??
    "";

  // ─── Merge: preserva campos ricos do briefing; RESETA rascunho do editor ──
  // Contrato desta rota (decisão de produto 29/jul):
  //   - ESCOLHER UMA NOVA ARTE = CAPA REFEITA. Estado final: "IA escolhida,
  //     editor zerado". Na próxima abertura do editor cai no fluxo original
  //     de primeira abertura (B2-04c): injeta capa-ia-frente clipado na
  //     frente, pinta lombada/contracapa/orelhas com cor_predominante_hex
  //     e cria smart fields de título/subtítulo pré-posicionados pela
  //     posicao_titulo.
  //   - `dados_capa` é MERGE: preserva estilo, atmosfera, cor_predominante
  //     (+ hex), posicao_titulo, galeria, briefing_versao, opcoes, etc.
  //   - `url_escolhida` recebe a nova arte; `modo` = "ia".
  //   - REMOVE: `editor_data` (rascunho), `source`, `imagem_url`,
  //     `confirmed_at`, `analise_tecnica` — arte nova ≠ arte confirmada.
  //   - Rebuild minimal só quando dados_capa é null (projeto novo ou post-
  //     reset explícito) — nesse caso não há briefing a preservar.
  if (dadosCapa) {
    const dadosNovos: Record<string, unknown> = { ...dadosCapa };

    if (alvo === "verso") {
      // Escolher verso NÃO reseta editor nem toca em url_escolhida da
      // frente. Só atualiza dados_capa.verso.url_escolhida — o editor
      // detecta na próxima abertura e injeta/atualiza o elemento
      // `capa-ia-verso` na região da contracapa.
      const versoAnterior = (dadosNovos.verso as DadosVersoIa | null | undefined) ?? null;
      const versoNovo: DadosVersoIa = versoAnterior
        ? { ...versoAnterior, url_escolhida: url }
        : {
            modo: "independente",
            opcoes: [{ url, storage_path: storagePathResolvido }],
            url_escolhida: url,
            gerado_em: new Date().toISOString(),
          };
      dadosNovos.verso = versoNovo;

      // Refresca a fatia verso da galeria se veio do storage.
      if (itemStorage && galeriaStorage) {
        const galeriaAtual = Array.isArray(dadosNovos.galeria)
          ? (dadosNovos.galeria as GaleriaCapaItem[])
          : [];
        const semVerso = galeriaAtual.filter((g) => (g.tipo ?? "frente") !== "verso");
        dadosNovos.galeria = [...semVerso, ...galeriaStorage];
      }
    } else {
      // frente ou unica: escolha REFAZ a capa. Estado final "IA escolhida,
      // editor zerado" — na próxima abertura do editor cai no fluxo de
      // primeira abertura (B2-04c).
      dadosNovos.url_escolhida = url;
      dadosNovos.modo = "ia";
      dadosNovos.cobertura = alvo === "unica" ? "unica" : "frente_verso";

      delete dadosNovos.editor_data;
      delete dadosNovos.source;
      delete dadosNovos.imagem_url;
      delete dadosNovos.confirmed_at;
      delete dadosNovos.analise_tecnica;

      if (itemStorage && galeriaStorage) {
        // Preserva outros alvos, refresca fatia deste alvo.
        const galeriaAtual = Array.isArray(dadosNovos.galeria)
          ? (dadosNovos.galeria as GaleriaCapaItem[])
          : [];
        const semAlvo = galeriaAtual.filter((g) => (g.tipo ?? "frente") !== alvo);
        dadosNovos.galeria = [...semAlvo, ...galeriaStorage];
      }

      // Garante que `opcoes` contém pelo menos a URL escolhida (o schema IA
      // exige opcoes não-vazio). Necessário quando o merge partiu de um
      // dados_capa sem opcoes (upload puro, editor puro, etc.).
      const opcoesAtuais = Array.isArray(dadosNovos.opcoes) ? (dadosNovos.opcoes as OpcaoCapa[]) : [];
      if (opcoesAtuais.length === 0) {
        dadosNovos.opcoes = [{ url, storage_path: storagePathResolvido }];
      }
    }

    const vCapa = validarProjectData("dados_capa", dadosNovos, {
      modo: "estrito", contexto: "capa-escolha",
    });
    if (!vCapa.ok) {
      console.error("[zod-reject][capa-escolha][dados_capa]", vCapa.issues.join(" | "));
      return NextResponse.json(
        { error: "Dados da capa falharam na validação.", issues: vCapa.issues },
        { status: 500 },
      );
    }
    const { ok } = await updateProject(supabase, projectId, dev ? null : userId, {
      dados_capa: dadosNovos,
    }, "capa-escolha");
    if (!ok) {
      return NextResponse.json(
        { error: "Falha ao persistir escolha. Tente novamente." },
        { status: 500 },
      );
    }
    return NextResponse.json(dadosNovos);
  }

  // ─── Fallback minimal: dados_capa é null ──────────────────────────────────
  // Projeto sem capa alguma ou pós-reset explícito. Sem editor_data a
  // preservar; monta uma IA mínima só com o essencial. Autor pode regenerar
  // depois com briefing completo. Garantido `itemStorage` definido pelo
  // guard 422 acima (dadosCapa null → opcoes/galeria memória vazios → sempre
  // caiu no ramo de storage).
  //
  // Escolha de verso sem dados_capa é estado inválido (só se escolhe verso
  // depois de já haver frente) — barra explicitamente.
  if (alvo === "verso") {
    return NextResponse.json(
      { error: "Não é possível escolher verso sem uma capa frontal já definida." },
      { status: 422 },
    );
  }
  const item = itemStorage!;
  const dadosMiolo = (project as Record<string, unknown>).dados_miolo as
    | { paginas_reais?: number; paginas_estimadas?: number }
    | null;
  const paginas = dadosMiolo?.paginas_reais ?? dadosMiolo?.paginas_estimadas ?? 200;

  const reconstruida: CapaGeradaResult = {
    project_id: projectId,
    modo: "ia",
    briefing_versao: 2,
    estilo: "minimalista",
    atmosfera: [],
    cor_predominante: "",
    cor_predominante_hex: "",
    posicao_titulo: "sem_preferencia",
    usar_orelhas: false,
    orelha_mm: 0,
    prompt_usado: "",
    opcoes: [{ url: item.url, storage_path: item.storage_path }],
    galeria: galeriaStorage ?? [],
    url_escolhida: item.url,
    verso: null,
    cobertura: alvo === "unica" ? "unica" : "frente_verso",
    gerado_em: new Date().toISOString(),
    is_regeneracao: false,
    paginas_estimadas: paginas,
    lombada_mm: estimarLombadaCapaMm(paginas),
  };

  const vCapa = validarProjectData("dados_capa", reconstruida, {
    modo: "estrito", contexto: "capa-escolha-fallback",
  });
  if (!vCapa.ok) {
    console.error("[zod-reject][capa-escolha-fallback][dados_capa]", vCapa.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação (fallback).", issues: vCapa.issues },
      { status: 500 },
    );
  }

  const { ok } = await updateProject(supabase, projectId, dev ? null : userId, {
    dados_capa: reconstruida,
  }, "capa-escolha-fallback");
  if (!ok) {
    return NextResponse.json(
      { error: "Falha ao persistir escolha (fallback). Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json(reconstruida);
}

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { updateProject } from "@/lib/supabase-helpers";
import { validarProjectData } from "@/lib/project-data";
import type { OpcaoCapa, GaleriaCapaItem, CapaGeradaResult } from "@/lib/project-data";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import { estimarLombadaCapaMm } from "@/lib/formatos";

// Regex do nome canônico gerado por `gerar-capa` — capa_ia_<ts>_<i>.<ext>
const NOME_CAPA_IA_REGEX = /^capa_ia_(\d+)_(\d+)\.(png|jpg)$/i;

/**
 * Lista `capa_ia_*` do prefixo do projeto no bucket `capas`. Reusado pelo
 * fallback pós-reset — a fonte de verdade da galeria é o storage.
 */
async function listarGaleriaStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: SupabaseClient<any>,
  userId: string,
  projectId: string,
): Promise<GaleriaCapaItem[]> {
  const prefix = `${userId}/${projectId}`;
  const { data: files, error } = await storage.storage
    .from("capas")
    .list(prefix, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (error || !files) return [];

  const iaFiles = files.filter((f) => NOME_CAPA_IA_REGEX.test(f.name));
  iaFiles.sort((a, b) => {
    const ta = Number(a.name.match(NOME_CAPA_IA_REGEX)?.[1] ?? "0");
    const tb = Number(b.name.match(NOME_CAPA_IA_REGEX)?.[1] ?? "0");
    return tb - ta;
  });

  const itens: GaleriaCapaItem[] = [];
  for (const f of iaFiles) {
    const storagePath = `${prefix}/${f.name}`;
    const { url } = await signedUrlCapas(storage, storagePath);
    if (!url) continue;
    const ts = Number(f.name.match(NOME_CAPA_IA_REGEX)?.[1] ?? "0");
    itens.push({
      url,
      storage_path: storagePath,
      tipo: "frente",
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
  if (!url) {
    return NextResponse.json({ error: "Campo 'url' obrigatório." }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, dados_capa, dados_miolo")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const dadosCapa = (project as Record<string, unknown>).dados_capa as Record<string, unknown> | null;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // ─── Caminho normal: dados_capa é IA e a url está em opcoes/galeria ────────
  if (dadosCapa && dadosCapa.modo === "ia") {
    const opcoes: OpcaoCapa[] = Array.isArray(dadosCapa.opcoes)
      ? (dadosCapa.opcoes as OpcaoCapa[])
      : [];
    const galeria: GaleriaCapaItem[] = Array.isArray(dadosCapa.galeria)
      ? (dadosCapa.galeria as GaleriaCapaItem[])
      : [];

    const urlValida =
      opcoes.some((o) => o.url === url) || galeria.some((g) => g.url === url);

    if (urlValida) {
      // Trocar de arte da IA reseta o rascunho da IA no editor: (1) limpa a
      // flag `capaIaRemovida` (o autor tá pedindo pra ver a arte de novo);
      // (2) remove o elemento `capa-ia-frente` antigo do editor_data pra
      // forçar reinjeção da nova arte no próximo load do editor. Não mexe
      // em nada mais do editor_data — o resto do trabalho do autor sobrevive.
      const editorDataAtual = dadosCapa.editor_data as
        | { elements?: Array<{ id?: unknown }>; capaIaRemovida?: boolean }
        | null
        | undefined;
      let editorDataNovo: Record<string, unknown> | undefined;
      if (editorDataAtual && typeof editorDataAtual === "object") {
        editorDataNovo = { ...(editorDataAtual as Record<string, unknown>) };
        delete editorDataNovo.capaIaRemovida;
        if (Array.isArray(editorDataAtual.elements)) {
          editorDataNovo.elements = editorDataAtual.elements.filter(
            (el) => (el as { id?: unknown })?.id !== "capa-ia-frente",
          );
        }
      }
      const dadosNovos = {
        ...dadosCapa,
        url_escolhida: url,
        ...(editorDataNovo ? { editor_data: editorDataNovo } : {}),
      };
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
    // URL não bate com opcoes/galeria em memória — cai no fallback abaixo,
    // que confere contra a listagem do storage (fonte de verdade).
  }

  // ─── Fallback pós-reset ────────────────────────────────────────────────────
  // dados_capa é null, de outro modo, ou não conhece esta url (galeria
  // desatualizada). Confere a listagem do storage `capa_ia_*` do projeto —
  // se a url pertence à galeria real, reconstrói dados_capa como IA mínima.
  const galeriaStorage = await listarGaleriaStorage(storageClient, userId, projectId);
  const itemStorage =
    (storagePathIn && galeriaStorage.find((g) => g.storage_path === storagePathIn)) ||
    galeriaStorage.find((g) => g.url === url);

  if (!itemStorage) {
    return NextResponse.json(
      { error: "URL não pertence a nenhuma geração deste projeto." },
      { status: 422 },
    );
  }

  const dadosMiolo = (project as Record<string, unknown>).dados_miolo as
    | { paginas_reais?: number; paginas_estimadas?: number }
    | null;
  const paginas = dadosMiolo?.paginas_reais ?? dadosMiolo?.paginas_estimadas ?? 200;

  // Estilo neutro documentado; campos preservam schema estrito sem inventar
  // dados falsos (prompt_usado="" — houve prompt mas não temos; o autor
  // pode regenerar depois com novo briefing).
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
    opcoes: [{ url: itemStorage.url, storage_path: itemStorage.storage_path }],
    galeria: galeriaStorage,
    url_escolhida: itemStorage.url,
    verso: null,
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

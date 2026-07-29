export const maxDuration = 120;

import { GoogleGenAI, type Part } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject, negarPorPlano } from "@/lib/supabase-helpers";
import { lockFormato } from "@/lib/projects";
import { isDev } from "@/lib/anthropic";
import { estimarLombadaCapaMm } from "@/lib/formatos";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import { validarProjectData } from "@/lib/project-data";
import type { EstiloCapa, OpcaoCapa, CapaGeradaResult, GaleriaCapaItem } from "@/lib/project-data";
import { briefingCapaSchema, processarBriefingCapa, jaGerouCapaIa, type ContextoLivro } from "@/lib/capa-briefing";
import { debitarCreditos, estornarCreditos, CUSTOS_CREDITOS } from "@/lib/creditos";

// Re-export types for consumers that import from this route path
export type { EstiloCapa, OpcaoCapa, CapaGeradaResult } from "@/lib/project-data";

function buildContents(prompt: string, ref: string | undefined, intencao: "estilo" | "conteudo" = "estilo"): Part[] {
  if (ref) {
    const match = ref.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const instrucao = intencao === "conteudo"
        ? " Incorporate the provided reference image as actual subject matter of the artwork — integrate it naturally into the composition while matching the requested style and palette."
        : " Use the provided reference image as a style and mood guide only — do not copy it literally.";
      return [
        { text: prompt + instrucao } as Part,
        { inlineData: { mimeType: match[1], data: match[2] } } as Part,
      ];
    }
  }
  return [{ text: prompt } as Part];
}

const gerarCapaBodySchema = z.object({
  project_id: z.string().min(1),
  briefing: briefingCapaSchema,
  imagemRef: z.string().max(5_000_000).optional(),
  imagemRefIntencao: z.enum(["estilo", "conteudo"]).optional().default("estilo"),
  qtd: z.number().int().min(1).max(4).optional().default(4),
});

export async function POST(req: NextRequest) {
  try {
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

  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY não configurada." },
      { status: 503 }
    );
  }

  const parsed = gerarCapaBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", detalhes: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const { project_id } = body;

  // Fetch project — includes dados_capa for galeria merge
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select(
      "id, user_id, plano, formato, dados_elementos, dados_miolo, dados_capa, manuscripts(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, genero_principal)",
    )
    .eq("id", project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const gate = negarPorPlano((project as { plano?: unknown }).plano, "essencial", "gerar-capa");
  if (gate) return gate;

  const ms = (project as Record<string, unknown>).manuscripts as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  const dadosElementos = (project as Record<string, unknown>).dados_elementos as {
    sinopse_curta?: string;
    sinopse_longa?: string;
    palavras_chave?: string[];
  } | null;

  const titulo = ms?.titulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "";
  const genero = ms?.genero_principal || "literatura";
  const sinopse = dadosElementos?.sinopse_longa || dadosElementos?.sinopse_curta || "";

  const dadosMiolo = (project as Record<string, unknown>).dados_miolo as {
    paginas_reais?: number;
    paginas_estimadas?: number;
  } | null;
  const paginas = dadosMiolo?.paginas_reais ?? dadosMiolo?.paginas_estimadas ?? 200;

  if (!titulo) {
    return NextResponse.json(
      { error: "Título do livro ausente. Configure no upload do manuscrito." },
      { status: 422 }
    );
  }

  if (!sinopse) {
    return NextResponse.json(
      { error: "Sinopse ausente. Gere os elementos editoriais antes de criar a capa." },
      { status: 422 }
    );
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Decisão de cobrança server-side (B2-04a): marcador vive em usage_logs,
  // sobrevive a capa/reset — fail-closed no erro de leitura.
  const ehRegeneracao = await jaGerouCapaIa(storageClient, project_id);
  if (ehRegeneracao && !dev) {
    const debito = await debitarCreditos(storageClient, userId, "regenerar_capa_frente", project_id);
    if (!debito.ok) {
      if (debito.erro === "saldo_insuficiente") {
        return NextResponse.json(
          {
            error: `Créditos insuficientes. Regenerar capa custa ${CUSTOS_CREDITOS.regenerar_capa_frente} créditos.`,
            saldo: debito.saldo,
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: "Falha ao debitar créditos. Tente novamente." },
        { status: 500 },
      );
    }
  }

  const contexto: ContextoLivro = {
    titulo,
    subtitulo: ms?.subtitulo ?? "",
    autor,
    genero,
    sinopse: sinopse.slice(0, 1200),
    temas: JSON.stringify(dadosElementos?.palavras_chave ?? []).slice(0, 400),
  };

  // Prompt via agente intermediário (server-side — nunca do front)
  let prompt_imagem: string;
  let frase_confirmacao: string;
  try {
    const agente = await processarBriefingCapa({
      contexto,
      briefing: body.briefing,
      alvo: "frente",
      projectId: project_id,
      userId,
    });
    prompt_imagem = agente.prompt_imagem;
    frase_confirmacao = agente.frase_confirmacao;
  } catch (err) {
    console.error("[gerar-capa] agente briefing falhou:", err);
    return NextResponse.json(
      { error: "Não foi possível preparar a geração. Tente novamente." },
      { status: 502 },
    );
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const rodadaTs = Date.now();

  async function gerarUmaOpcao(i: number): Promise<OpcaoCapa | null> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: buildContents(prompt_imagem, body.imagemRef, body.imagemRefIntencao) }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "2:3", imageSize: "4K" },
        },
      });
      const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p) => p.inlineData);
      if (!imgPart?.inlineData?.data) {
        console.warn(`[gerar-capa] opção ${i}: inlineData ausente`);
        return null;
      }
      const mimeType = imgPart.inlineData.mimeType ?? "image/png";
      const ext = mimeType.includes("png") ? "png" : "jpg";
      const storagePath = `${userId}/${project_id}/capa_ia_${rodadaTs}_${i}.${ext}`;
      const buffer = Buffer.from(imgPart.inlineData.data, "base64");
      console.log(`[DEBUG-B2] opção ${i}: ${buffer.length} bytes, mime ${mimeType}`);
      const { error: uploadError } = await storageClient.storage
        .from("capas")
        .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
      if (uploadError) {
        console.error(`[gerar-capa] upload (opção ${i}):`, uploadError.message);
        return null;
      }
      const { url: publicUrl, error: signErr } = await signedUrlCapas(storageClient, storagePath);
      if (signErr || !publicUrl) {
        console.error(`[gerar-capa] signed URL (opção ${i}):`, signErr);
        return null;
      }
      return { url: publicUrl, storage_path: storagePath };
    } catch (err) {
      console.error(`[gerar-capa] generateContent (opção ${i}):`, err);
      return null;
    }
  }

  const resultados = await Promise.allSettled(
    Array.from({ length: body.qtd }, (_, i) => gerarUmaOpcao(i)),
  );
  const opcoes: OpcaoCapa[] = resultados
    .filter((r): r is PromiseFulfilledResult<OpcaoCapa | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((o): o is OpcaoCapa => o !== null);

  if (opcoes.length === 0) {
    if (ehRegeneracao && !dev) {
      await estornarCreditos(storageClient, userId, "regenerar_capa_frente", project_id);
    }
    return NextResponse.json(
      { error: "Nenhuma imagem foi gerada. Seus créditos não foram consumidos." },
      { status: 502 },
    );
  }

  // Galeria append-only, cap 24
  const dadosCapaAtual = (project as Record<string, unknown>).dados_capa as Record<string, unknown> | null;
  const galeriaAnterior: GaleriaCapaItem[] = Array.isArray(dadosCapaAtual?.galeria)
    ? (dadosCapaAtual.galeria as GaleriaCapaItem[])
    : [];

  const novosItens: GaleriaCapaItem[] = opcoes.map((o) => ({
    url: o.url,
    storage_path: o.storage_path,
    tipo: "frente" as const,
    gerado_em: new Date().toISOString(),
  }));

  let galeria: GaleriaCapaItem[] = [...galeriaAnterior, ...novosItens];

  if (galeria.length > 24) {
    const toDelete = galeria.slice(0, galeria.length - 24);
    galeria = galeria.slice(-24);
    // Best-effort delete dos mais antigos
    for (const item of toDelete) {
      storageClient.storage
        .from("capas")
        .remove([item.storage_path])
        .then(({ error }) => {
          if (error) {
            console.error("[gerar-capa] galeria: falha ao remover", item.storage_path, error.message);
          } else {
            console.log("[gerar-capa] galeria: item removido", item.storage_path);
          }
        })
        .catch((err) => {
          console.error("[gerar-capa] galeria: exception ao remover", item.storage_path, err);
        });
    }
  }

  const result: CapaGeradaResult = {
    project_id,
    modo: "ia",
    briefing_versao: 2,
    estilo: body.briefing.estilo as EstiloCapa,
    atmosfera: [...body.briefing.atmosfera],
    cor_predominante: body.briefing.cor_predominante.nome,
    cor_predominante_hex: body.briefing.cor_predominante.hex,
    posicao_titulo: body.briefing.posicao_titulo,
    descricao_livre: body.briefing.descricao_livre || undefined,
    referencias_texto: body.briefing.referencias_texto || undefined,
    evitar: body.briefing.evitar || undefined,
    usar_orelhas: false,
    orelha_mm: 0,
    prompt_usado: prompt_imagem,
    frase_confirmacao,
    opcoes,
    galeria,
    // Escolha é ATO EXPLÍCITO — nunca implícita. Sem esta null-idade,
    // F5 na tela de escolha fazia o sistema achar que opção 1 foi aceita.
    url_escolhida: null,
    verso: null,
    gerado_em: new Date().toISOString(),
    is_regeneracao: ehRegeneracao,
    paginas_estimadas: paginas,
    lombada_mm: estimarLombadaCapaMm(paginas),
  };

  // ─── Preserva editor_data em regeneração ─────────────────────────────────
  // Sem isso, o autor perde fills escolhidos, textos custom e ajustes de
  // layout ao clicar "Gerar novas opções" — a nova capa volta em branco.
  // Estratégia (espelha o endpoint de escolha):
  //   (1) preserva editor_data existente, limpando `capaIaRemovida` (autor
  //       pediu novas artes, quer ver de novo) e removendo o elemento
  //       `capa-ia-frente` antigo — o editor reinjeta a arte escolhida na
  //       próxima vez que abrir (id determinístico);
  //   (2) fills, layout, orelhaMm, elementos custom sobrevivem;
  //   (3) source/imagem_url/confirmed_at ficam obsoletos (arte nova ≠ arte
  //       confirmada) — o objeto `result` já não os carrega, então nada a
  //       fazer aqui (updateProject grava só o result novo).
  const editorDataAtual = dadosCapaAtual?.editor_data as
    | { elements?: Array<{ id?: unknown }>; capaIaRemovida?: boolean }
    | null
    | undefined;
  if (editorDataAtual && typeof editorDataAtual === "object") {
    const editorDataNovo: Record<string, unknown> = {
      ...(editorDataAtual as Record<string, unknown>),
    };
    delete editorDataNovo.capaIaRemovida;
    if (Array.isArray(editorDataAtual.elements)) {
      editorDataNovo.elements = editorDataAtual.elements.filter(
        (el) => (el as { id?: unknown })?.id !== "capa-ia-frente",
      );
    }
    (result as unknown as Record<string, unknown>).editor_data = editorDataNovo;
  }

  const vCapa = validarProjectData("dados_capa", result, {
    modo: "estrito", contexto: "gerar-capa",
  });
  if (!vCapa.ok) {
    console.error("[zod-reject][gerar-capa][dados_capa]", vCapa.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação. Tente novamente.", issues: vCapa.issues },
      { status: 500 }
    );
  }

  const updateUserId = dev ? null : userId;
  const { ok: capaOk } = await updateProject(supabase, project_id, updateUserId, {
    dados_capa: result,
  }, "gerar-capa");
  if (!capaOk) {
    return NextResponse.json(
      { error: "Capas geradas, mas falha ao salvar no banco. Tente novamente." },
      { status: 500 }
    );
  }

  await lockFormato(project_id);

  // Marcador anti-vazamento: registrar APÓS rodada persistida com sucesso.
  // Rodada estornada (opcoes===0) não chega aqui — próxima tentativa fica grátis.
  try {
    await storageClient.from("usage_logs").insert({
      agent_name: "gerar-capa",
      project_id,
      user_id: userId,
      metadata: {
        opcoes_geradas: opcoes.length,
        qtd_pedida: body.qtd,
        regeneracao: ehRegeneracao,
        estilo: body.briefing.estilo,
      },
    });
  } catch (e) {
    console.error("[gerar-capa] log de rodada falhou:", e);
  }

  return NextResponse.json(result);
  } catch (err) {
    console.error("[gerar-capa] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET /api/agentes/gerar-capa?project_id=... ───────────────────────────────

export async function GET(req: NextRequest) {
  try {
  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (isDev()) {
    return NextResponse.json(null);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", project_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  return NextResponse.json(data.dados_capa ?? null);
  } catch (err) {
    console.error("[gerar-capa] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

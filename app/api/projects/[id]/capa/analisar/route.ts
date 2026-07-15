export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { analisarCapa } from "@/lib/capa-analyzer";
import { validarProjectData } from "@/lib/project-data";
import type { FormatoLivro } from "@/lib/formatos";
import { signedUrlCapas } from "@/lib/capa-signed-url";

/**
 * POST /api/projects/[id]/capa/analisar
 *
 * Roda análise técnica sobre a capa atual e persiste em
 * `dados_capa.analise_tecnica`. Fire-and-forget dos handlers de
 * `upload-capa` e `cover-editor/confirm`. Nunca lança — retorna 500
 * com detalhes se algo falhar, mas o objetivo é ser resiliente para
 * não bloquear o fluxo principal.
 *
 * A análise apenas DETECTA (colorspace, sangria, DPI, marcas de corte).
 * Correção automática é 14.M.2; gate na publicação é 14.M.3.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev()) {
    userId = "dev-user";
    supabase = await createSupabaseServerClient();
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, formato, dados_capa, dados_miolo")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const formato = project.formato as FormatoLivro | null;
  if (!formato) {
    return NextResponse.json({ error: "Formato do projeto não definido." }, { status: 400 });
  }

  const dadosCapa = (project.dados_capa ?? null) as Record<string, unknown> | null;
  if (!dadosCapa) {
    return NextResponse.json({ error: "dados_capa ausente." }, { status: 400 });
  }

  const resolved = resolveCapaCompleta(dadosCapa, formato);
  if (!resolved.url_principal) {
    return NextResponse.json({ error: "Capa não resolvível." }, { status: 400 });
  }

  const dadosMiolo = (project.dados_miolo ?? null) as
    | { paginas_reais?: number | null; config?: { paginas_estimadas?: number } }
    | null;
  const paginas =
    dadosMiolo?.paginas_reais ??
    dadosMiolo?.config?.paginas_estimadas ??
    100;

  // Resolve URL pública do PDF original quando disponível — permite que
  // o analyzer inspecione o PDF cru para detectar colorspace CMYK real,
  // impossível de recuperar do PNG rasterizado.
  const pdfOriginalPath = (dadosCapa as { pdf_original_path?: string | null }).pdf_original_path;
  let pdfOriginalUrl: string | undefined;
  if (pdfOriginalPath) {
    const { url: pdfUrl, error: pdfSignErr } = await signedUrlCapas(supabase, pdfOriginalPath);
    if (pdfSignErr) {
      console.warn(`[capa/analisar] falha ao gerar signed URL do PDF: ${pdfSignErr}`);
    } else if (pdfUrl) {
      pdfOriginalUrl = pdfUrl;
    }
  }

  try {
    // Regenera signed URL da capa principal caso a persistida tenha
    // expirado (>7 dias sem uso). Prioriza storage_path se disponível;
    // fallback para url_principal quando path não está persistido.
    const storagePath = (dadosCapa as { storage_path?: string | null }).storage_path;
    let urlAnalise = resolved.url_principal;
    if (storagePath) {
      const { url: freshUrl, error: freshErr } = await signedUrlCapas(supabase, storagePath);
      if (freshErr) {
        console.warn(`[capa/analisar] falha ao regenerar signed URL: ${freshErr}`);
      } else if (freshUrl) {
        urlAnalise = freshUrl;
      }
    }

    const analise = await analisarCapa({
      url: urlAnalise,
      pdfOriginalUrl,
      formato,
      paginas,
      orelhaMm: resolved.orelha_mm,
      panoramica: resolved.is_panoramica,
    });

    // Re-fetch dados_capa imediatamente antes do PATCH: reduz race com
    // upload-capa/cover-editor/confirm que podem ter escrito no campo
    // durante os 2-3s de análise. Sem isso, o merge shallow com o
    // dadosCapa carregado no início pode sobrescrever mudanças recentes.
    const { data: atual } = await supabase
      .from("projects")
      .select("dados_capa")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    const dadosCapaAtual = (atual?.dados_capa ?? dadosCapa) as Record<string, unknown>;

    // Se dadosCapa foi zerado durante a análise (ex: autor apertou
    // "Refazer" chamando /capa/reset), não persiste — a capa nem existe mais.
    if (!dadosCapaAtual || Object.keys(dadosCapaAtual).length === 0) {
      console.warn(`[capa/analisar] dados_capa foi zerado durante análise do projeto ${projectId}; não persistindo.`);
      return NextResponse.json({ ok: true, analise, persisted: false });
    }

    // Descarta análise stale: se autor trocou capa durante os 2-3s de
    // análise, a URL analisada não bate com a URL atual do projeto.
    // Nesse caso, persistir sobrescreveria dados corretos com informação
    // antiga sobre a capa que não existe mais.
    //
    // Compara sem query string porque signed URLs (14.M.1.6) mudam a cada
    // sessão — mesma capa pode ter URL diferente em momentos diferentes.
    const urlAtualNoDado = (dadosCapaAtual as { url?: string }).url;
    if (urlAtualNoDado && analise.url_analisada) {
      const urlAtualClean = urlAtualNoDado.split("?")[0];
      const urlAnaliseClean = analise.url_analisada.split("?")[0];
      if (urlAtualClean !== urlAnaliseClean) {
        console.warn(
          `[capa/analisar] URL analisada divergente da atual — descartando análise stale.\n` +
          `  Analisada: ${urlAnaliseClean}\n` +
          `  Atual:     ${urlAtualClean}`
        );
        return NextResponse.json({ ok: true, analise, persisted: false, reason: "url_stale" });
      }
    }

    const novoDadosCapa = { ...dadosCapaAtual, analise_tecnica: analise };

    const vCapa = validarProjectData("dados_capa", novoDadosCapa, {
      modo: "estrito", contexto: "capa-analisar",
    });
    if (!vCapa.ok) {
      console.error("[zod-reject][capa-analisar][dados_capa]", vCapa.issues.join(" | "));
      return NextResponse.json({ ok: true, analise, persisted: false, reason: "zod_reject" });
    }

    const { ok: persistOk } = await updateProject(supabase, projectId, userId, {
      dados_capa: novoDadosCapa,
    }, "capa-analisar");

    return NextResponse.json({ ok: true, analise, persisted: persistOk });
  } catch (err) {
    console.error("[capa/analisar] falha:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na análise." },
      { status: 500 },
    );
  }
}

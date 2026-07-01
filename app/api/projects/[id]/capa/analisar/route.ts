export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { analisarCapa } from "@/lib/capa-analyzer";
import type { FormatoLivro } from "@/lib/formatos";

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

  try {
    const analise = await analisarCapa({
      url: resolved.url_principal,
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

    const novoDadosCapa = { ...dadosCapaAtual, analise_tecnica: analise };
    await supabase
      .from("projects")
      .update({ dados_capa: novoDadosCapa })
      .eq("id", projectId)
      .eq("user_id", userId);

    return NextResponse.json({ ok: true, analise, persisted: true });
  } catch (err) {
    console.error("[capa/analisar] falha:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha na análise." },
      { status: 500 },
    );
  }
}

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import type { CapaGeradaResult } from "@/app/api/agentes/gerar-capa/route";

// ─── POST /api/agentes/ajustar-lombada ───────────────────────────────────────
// Detects spine divergence between miolo (real) and capa (used at generation
// time) and, if > 2 mm, regenerates ONLY the spine element and recomposes the
// full cover. No credit charge — this is a correction, not aesthetic regen.

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev) {
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

  let body: { project_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Load project ────────────────────────────────────────────────────────────

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("dados_capa, dados_miolo, dados_elementos, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome, genero_principal)")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const dados_capa = project.dados_capa as (CapaGeradaResult & Record<string, unknown>) | null;
  const dados_miolo = project.dados_miolo as { paginas_reais?: number; lombada_mm?: number } | null;
  const dados_el = project.dados_elementos as { titulo_escolhido?: string } | null;
  const ms = project.manuscripts as { autor_primeiro_nome?: string; autor_sobrenome?: string; genero_principal?: string } | null;

  // ── Validate preconditions ───────────────────────────────────────────────────

  if (!dados_capa) {
    return NextResponse.json({ error: "Gere a capa antes de ajustar a lombada." }, { status: 422 });
  }

  if (!dados_miolo?.paginas_reais || !dados_miolo?.lombada_mm) {
    return NextResponse.json({ error: "Gere o miolo antes de ajustar a lombada." }, { status: 422 });
  }

  const modo = (dados_capa as { modo?: string }).modo;

  if (modo === "upload") {
    const lombadaCorreta = dados_miolo.lombada_mm;
    return NextResponse.json(
      {
        error: `Capa enviada por upload não pode ser ajustada automaticamente. Refaça o upload com a lombada correta de ${lombadaCorreta}mm.`,
      },
      { status: 422 }
    );
  }

  if (modo !== "ia") {
    return NextResponse.json(
      { error: "Somente capas geradas com IA podem ser ajustadas automaticamente." },
      { status: 422 }
    );
  }

  // ── Check divergence ─────────────────────────────────────────────────────────

  const lombadaCapa: number = (dados_capa.lombada_mm as number | undefined) ?? 0;
  const lombadaMiolo = dados_miolo.lombada_mm;
  const diff = Math.abs(lombadaCapa - lombadaMiolo);

  if (diff <= 2) {
    return NextResponse.json({
      ajustado: false,
      mensagem: "Lombada já dentro da tolerância — nenhum ajuste necessário.",
      lombada_atual: lombadaCapa,
      lombada_correta: lombadaMiolo,
    });
  }

  // ── Build metadata ───────────────────────────────────────────────────────────

  const titulo = dados_el?.titulo_escolhido ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ");
  const genero = ms?.genero_principal ?? "literatura";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cookieHeader = req.headers.get("cookie") ?? "";

  // ── Step 1: Regenerate spine element ────────────────────────────────────────

  const elementoRes = await fetch(`${baseUrl}/api/agentes/gerar-elemento-capa`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify({
      project_id,
      elemento: "lombada",
      titulo,
      autor,
      descricao: "Ajuste automático — match visual com a frente atual da capa.",
      genero,
      lombada_mm: lombadaMiolo,
      qtd: 1,
    }),
  });

  if (!elementoRes.ok) {
    const err = await elementoRes.json().catch(() => ({})) as { error?: string };
    return NextResponse.json(
      { error: err.error ?? "Falha ao regenerar lombada." },
      { status: 500 }
    );
  }

  const elementoData = await elementoRes.json() as { opcoes: Array<{ url: string; storage_path: string }> };
  const novaLombada = elementoData.opcoes[0];
  if (!novaLombada) {
    return NextResponse.json({ error: "Nenhuma imagem de lombada foi gerada." }, { status: 500 });
  }

  // ── Step 2: Recompose full cover ─────────────────────────────────────────────

  const frenteUrl = (dados_capa.url_escolhida as string | null) ?? (dados_capa.opcoes as Array<{ url: string }>)?.[0]?.url;
  const contraUrl = (dados_capa as Record<string, unknown>).contra_url as string | undefined ?? frenteUrl;

  const dadosCapaAtualizado: Record<string, unknown> = {
    ...dados_capa,
    lombada_mm: lombadaMiolo,
    paginas_estimadas: dados_miolo.paginas_reais,
    lombada_url_ajustada: novaLombada.url,
    lombada_storage_path_ajustada: novaLombada.storage_path,
    ajustado_em: new Date().toISOString(),
  };

  if (frenteUrl) {
    const montarRes = await fetch(`${baseUrl}/api/agentes/montar-capa`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({
        project_id,
        paginas: dados_miolo.paginas_reais,
        usar_orelhas: (dados_capa as Record<string, unknown>).usar_orelhas ?? false,
        titulo,
        autor,
        elementos: {
          frente_url: frenteUrl,
          contra_url: contraUrl,
          lombada_url: novaLombada.url,
        },
      }),
    });

    if (montarRes.ok) {
      const montarData = await montarRes.json() as { url: string; storage_path: string };
      dadosCapaAtualizado.url_capa_completa = montarData.url;
      dadosCapaAtualizado.capa_completa_path = montarData.storage_path;
    }
  }

  // ── Persist ──────────────────────────────────────────────────────────────────

  await supabase
    .from("projects")
    .update({ dados_capa: dadosCapaAtualizado })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json({
    ajustado: true,
    lombada_anterior: lombadaCapa,
    lombada_nova: lombadaMiolo,
    diff_mm: diff,
    nova_capa_url: (dadosCapaAtualizado.url_capa_completa as string | undefined) ?? null,
    mensagem: `Lombada ajustada de ${lombadaCapa}mm para ${lombadaMiolo}mm. A capa foi recomposta automaticamente.`,
  });
}

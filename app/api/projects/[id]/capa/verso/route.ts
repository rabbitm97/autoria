export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { updateProject } from "@/lib/supabase-helpers";
import { validarProjectData } from "@/lib/project-data";
import type { DadosVersoIa } from "@/lib/project-data";

// ─── POST /api/projects/[id]/capa/verso ──────────────────────────────────────
// Endpoint dedicado para verso em MODO "COR" — não passa pela IA.
// O editor preenche a região do verso com a cor predominante da frente.
// Registrar em dados_capa.verso permite hidratar o editor consistentemente
// e sinalizar ao dashboard que o autor decidiu por "verso simples".
//
// Não custa crédito (não gera imagem). Também não conta como rodada IA de
// verso — permanece livre a opção de trocar para continuacao/independente
// depois.

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
  const modo = typeof body?.modo === "string" ? body.modo.trim() : "";
  if (modo !== "cor") {
    return NextResponse.json(
      { error: "Modo inválido. Esta rota só aceita { modo: 'cor' }." },
      { status: 400 },
    );
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, dados_capa")
    .eq("id", projectId)
    .single();
  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const dadosCapa = (project as Record<string, unknown>).dados_capa as Record<string, unknown> | null;
  if (!dadosCapa || !dadosCapa.url_escolhida) {
    return NextResponse.json(
      { error: "Escolha uma capa frontal antes de definir o verso." },
      { status: 422 },
    );
  }

  const versoNovo: DadosVersoIa = {
    modo: "cor",
    opcoes: [],
    url_escolhida: null,
    gerado_em: new Date().toISOString(),
  };
  const dadosNovos: Record<string, unknown> = {
    ...dadosCapa,
    verso: versoNovo,
  };

  const v = validarProjectData("dados_capa", dadosNovos, {
    modo: "estrito",
    contexto: "capa-verso-cor",
  });
  if (!v.ok) {
    console.error("[zod-reject][capa-verso-cor][dados_capa]", v.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação.", issues: v.issues },
      { status: 500 },
    );
  }

  const { ok } = await updateProject(
    supabase,
    projectId,
    dev ? null : userId,
    { dados_capa: dadosNovos },
    "capa-verso-cor",
  );
  if (!ok) {
    return NextResponse.json(
      { error: "Falha ao salvar a escolha do verso. Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json(dadosNovos);
}

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { updateProject } from "@/lib/supabase-helpers";

const PROPOSITOS_VALIDOS = ["digital", "completa"] as const;
type PropositoValido = (typeof PROPOSITOS_VALIDOS)[number];

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
  const propositoRaw = body?.proposito as string | undefined;
  if (!propositoRaw || !(PROPOSITOS_VALIDOS as readonly string[]).includes(propositoRaw)) {
    return NextResponse.json(
      { error: "Campo 'proposito' obrigatório. Valores: digital, completa." },
      { status: 400 },
    );
  }
  const proposito = propositoRaw as PropositoValido;

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, dados_creditos")
    .eq("id", projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const dadosCreditos = (project as Record<string, unknown>).dados_creditos as Record<string, unknown> | null;
  const configAtual = (dadosCreditos?.config as Record<string, unknown>) ?? {};

  // Estado parcial intencional: persiste apenas proposito — campos completos
  // são preenchidos pelo dashboard de Créditos. Não chamar validarProjectData:
  // creditosResultSchema exige o resultado completo; aqui é estado de draft.
  // Autores legados ("pessoal"/"livrarias") já são normalizados pelo handler
  // de Créditos; aqui aceitamos apenas "digital"/"completa".
  const dadosNovos = {
    ...(dadosCreditos ?? {}),
    config: { ...configAtual, proposito },
  };

  const { ok } = await updateProject(
    supabase,
    projectId,
    dev ? null : userId,
    { dados_creditos: dadosNovos },
    "proposito",
  );

  if (!ok) {
    return NextResponse.json(
      { error: "Falha ao salvar trilha. Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({ proposito });
}

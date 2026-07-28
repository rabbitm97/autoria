export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { updateProject } from "@/lib/supabase-helpers";
import { validarProjectData } from "@/lib/project-data";
import type { OpcaoCapa, GaleriaCapaItem } from "@/lib/project-data";

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
  if (!url) {
    return NextResponse.json({ error: "Campo 'url' obrigatório." }, { status: 400 });
  }

  // Leitura com ownership
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

  if (!dadosCapa || dadosCapa.modo !== "ia") {
    return NextResponse.json(
      { error: "Projeto não tem capa IA ativa." },
      { status: 422 },
    );
  }

  // Validar que a url pertence a opcoes[] ou galeria[]
  const opcoes: OpcaoCapa[] = Array.isArray(dadosCapa.opcoes)
    ? (dadosCapa.opcoes as OpcaoCapa[])
    : [];
  const galeria: GaleriaCapaItem[] = Array.isArray(dadosCapa.galeria)
    ? (dadosCapa.galeria as GaleriaCapaItem[])
    : [];

  const urlValida =
    opcoes.some((o) => o.url === url) || galeria.some((g) => g.url === url);

  if (!urlValida) {
    return NextResponse.json(
      { error: "URL não pertence às opções ou galeria deste projeto." },
      { status: 422 },
    );
  }

  // Leitura-para-merge + check condicional (verdade 23)
  const dadosNovos = { ...dadosCapa, url_escolhida: url };

  const vCapa = validarProjectData("dados_capa", dadosNovos, {
    modo: "estrito",
    contexto: "capa-escolha",
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

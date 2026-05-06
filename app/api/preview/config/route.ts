import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import type { MioloConfig } from "@/lib/miolo-builder";

// POST /api/preview/config?project_id=...
// Persists the preview config back to dados_miolo.config without re-generating the full PDF.
export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const project_id = request.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  let config: MioloConfig;
  try {
    ({ config } = await request.json());
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  // Read existing dados_miolo so we only patch the config key
  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const updated = { ...(project.dados_miolo as object ?? {}), config };

  const { error } = await supabase
    .from("projects")
    .update({ dados_miolo: updated })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Erro ao salvar configuração" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

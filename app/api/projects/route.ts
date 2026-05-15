import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// ─── DELETE /api/projects?id=... ──────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // Get manuscript_id before deleting the project
  const { data: project } = await supabase
    .from("projects")
    .select("manuscript_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  // Delete the project
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete the associated manuscript if it exists
  if (project?.manuscript_id) {
    await supabase
      .from("manuscripts")
      .delete()
      .eq("id", project.manuscript_id)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}

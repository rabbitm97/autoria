import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// ─── DELETE /api/projects?id=... ──────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // Get manuscript_id and storage_path before deleting
  const { data: project, error: projSelErr } = await supabase
    .from("projects")
    .select("manuscript_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (projSelErr) {
    // C5-04: não-fatal — se o SELECT falhar, seguimos com o DELETE do
    // registro (RLS ainda protege). Sem manuscript_id, o cleanup do
    // manuscrito órfão é pulado; o DELETE do projeto abaixo lida com o
    // resto e retorna erro apropriado se o projeto não existir.
    console.warn("[projects DELETE] falha ao ler manuscript_id (cleanup pode ser incompleto):", projSelErr.message);
  }

  let manuscriptStoragePath: string | null = null;
  if (project?.manuscript_id) {
    const { data: ms, error: msSelErr } = await supabase
      .from("manuscripts")
      .select("storage_path")
      .eq("id", project.manuscript_id)
      .eq("user_id", user.id)
      .single();
    if (msSelErr) {
      // C5-04: não-fatal — sem storage_path, o arquivo do manuscrito não
      // é removido do bucket, mas o DELETE do projeto continua.
      console.warn("[projects DELETE] falha ao ler storage_path do manuscript:", msSelErr.message);
    }
    manuscriptStoragePath = (ms?.storage_path as string | null) ?? null;
  }

  // Delete the project (RLS verifica user_id)
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete the associated manuscript if it exists
  if (project?.manuscript_id) {
    // C5-01: check obrigatório (verdade #20 — nunca write cego). Não-fatal:
    // o project já foi deletado; um manuscript órfão é logado, não derruba.
    const { error: msDelErr } = await supabase
      .from("manuscripts")
      .delete()
      .eq("id", project.manuscript_id)
      .eq("user_id", user.id);
    if (msDelErr) {
      console.error("[projects DELETE] falha ao deletar manuscript associado:", msDelErr.message);
    }
  }

  // Cleanup de Storage: núcleo único lib/apagar-projeto.ts (FERR-3.0a).
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const storageAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { limparStorageProjeto } = await import("@/lib/apagar-projeto");
    await limparStorageProjeto(storageAdmin, user.id, id, manuscriptStoragePath);
  } catch (cleanupErr) {
    console.warn("[projects DELETE] cleanup de Storage falhou (não-fatal):", cleanupErr);
  }

  return NextResponse.json({ ok: true });
}

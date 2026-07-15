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
  const { data: project } = await supabase
    .from("projects")
    .select("manuscript_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  let manuscriptStoragePath: string | null = null;
  if (project?.manuscript_id) {
    const { data: ms } = await supabase
      .from("manuscripts")
      .select("storage_path")
      .eq("id", project.manuscript_id)
      .eq("user_id", user.id)
      .single();
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

  // Cleanup de Storage usando service role
  // Por que service role: usa um único client com permissão ampla para limpar
  // os buckets onde os arquivos do projeto residem, listando por prefixo do
  // path (userId/projectId/) e removendo em batch. Erros aqui são logados mas
  // não falham a operação — o registro principal (DB) já foi apagado.
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const storageAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const projectPrefix = `${user.id}/${id}`;

    // Buckets que armazenam arquivos por (userId/projectId/...)
    const buckets = ["capas", "livros", "audiolivros", "editor-assets"];

    await Promise.all(
      buckets.map(async (bucket) => {
        const { data: files, error: listErr } = await storageAdmin.storage
          .from(bucket)
          .list(projectPrefix, { limit: 1000 });

        if (listErr) {
          console.warn(`[projects DELETE] list ${bucket} falhou:`, listErr.message);
          return;
        }
        if (!files || files.length === 0) return;

        const paths = files.map((f) => `${projectPrefix}/${f.name}`);
        const { error: removeErr } = await storageAdmin.storage
          .from(bucket)
          .remove(paths);

        if (removeErr) {
          console.warn(`[projects DELETE] remove ${bucket} falhou:`, removeErr.message);
        } else {
          console.log(`[projects DELETE] removidos ${paths.length} de ${bucket}`);
        }
      }),
    );

    // Manuscrito é arquivo único no bucket manuscripts — apaga via storage_path
    if (manuscriptStoragePath) {
      const { error: msRemoveErr } = await storageAdmin.storage
        .from("manuscripts")
        .remove([manuscriptStoragePath]);
      if (msRemoveErr) {
        console.warn(`[projects DELETE] remove manuscripts falhou:`, msRemoveErr.message);
      }
    }
  } catch (cleanupErr) {
    console.warn("[projects DELETE] cleanup de Storage falhou (não-fatal):", cleanupErr);
  }

  return NextResponse.json({ ok: true });
}

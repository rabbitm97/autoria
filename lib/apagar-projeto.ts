// lib/apagar-projeto.ts
//
// NÚCLEO ÚNICO de limpeza de projeto (V47). Consumidores:
//   - DELETE /api/projects (autor apaga projeto da esteira)
//   - lib/ferramenta-jobs.ts (sombra apagado ao concluir/falhar; cron 3.0b)
// Fonte única da lista de buckets por-projeto.

import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKETS_PROJETO = ["capas", "livros", "audiolivros", "editor-assets"] as const;

/** Remove todos os arquivos do projeto nos buckets por-prefixo
 *  (userId/projectId/) + o arquivo do manuscrito. Best-effort: loga e
 *  segue — nunca lança. */
export async function limparStorageProjeto(
  storageAdmin: SupabaseClient,
  userId: string,
  projectId: string,
  manuscriptStoragePath: string | null,
): Promise<void> {
  const projectPrefix = `${userId}/${projectId}`;
  await Promise.all(
    BUCKETS_PROJETO.map(async (bucket) => {
      const { data: files, error: listErr } = await storageAdmin.storage
        .from(bucket)
        .list(projectPrefix, { limit: 1000 });
      if (listErr) {
        console.warn(`[apagar-projeto] list ${bucket} falhou:`, listErr.message);
        return;
      }
      if (!files || files.length === 0) return;
      const paths = files.map((f) => `${projectPrefix}/${f.name}`);
      const { error: removeErr } = await storageAdmin.storage.from(bucket).remove(paths);
      if (removeErr) {
        console.warn(`[apagar-projeto] remove ${bucket} falhou:`, removeErr.message);
      } else {
        console.log(`[apagar-projeto] removidos ${paths.length} de ${bucket}`);
      }
    }),
  );
  if (manuscriptStoragePath) {
    const { error } = await storageAdmin.storage
      .from("manuscripts")
      .remove([manuscriptStoragePath]);
    if (error) console.warn("[apagar-projeto] remove manuscripts falhou:", error.message);
  }
}

/** Apaga projeto + manuscrito (DB via admin) + Storage. Para o
 *  projeto-sombra e o cron — o DELETE da esteira mantém o caminho RLS
 *  próprio e delega só o Storage. */
export async function apagarProjetoComoAdmin(
  admin: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<void> {
  const { data: project } = await admin
    .from("projects")
    .select("manuscript_id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  let manuscriptStoragePath: string | null = null;
  const manuscriptId = (project as { manuscript_id?: string } | null)?.manuscript_id ?? null;
  if (manuscriptId) {
    const { data: ms } = await admin
      .from("manuscripts")
      .select("storage_path")
      .eq("id", manuscriptId)
      .maybeSingle();
    manuscriptStoragePath = (ms as { storage_path?: string } | null)?.storage_path ?? null;
  }
  const { error: delErr } = await admin
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId);
  if (delErr) {
    console.error("[apagar-projeto] delete project falhou:", delErr.message);
    return;
  }
  if (manuscriptId) {
    const { error } = await admin.from("manuscripts").delete().eq("id", manuscriptId);
    if (error) console.error("[apagar-projeto] delete manuscript falhou:", error.message);
  }
  await limparStorageProjeto(admin, userId, projectId, manuscriptStoragePath);
}

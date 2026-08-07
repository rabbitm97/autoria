import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGAL_DOCS, type LegalDocSlug } from "@/lib/legal-docs";

/**
 * Helper server-side para checar se o usuário já aceitou a versão VIGENTE
 * de um documento legal (comparando `doc_versao` e `doc_hash` contra
 * `LEGAL_DOCS[slug]`). Aceites de versões antigas NÃO satisfazem — verdade
 * 40: bump de versao força novo aceite.
 *
 * Recebe um `SupabaseClient` já configurado (server client autenticado ou
 * admin). Retorna `false` em erro/ausência de dados para forçar re-aceite
 * defensivamente.
 */
export async function jaAceitou(
  supabase: SupabaseClient,
  userId: string,
  slug: LegalDocSlug,
  opts?: { projectId?: string | null },
): Promise<boolean> {
  const doc = LEGAL_DOCS[slug];
  if (!doc) return false;

  let query = supabase
    .from("legal_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("doc_slug", slug)
    .eq("doc_versao", doc.versao)
    .eq("doc_hash", doc.conteudoHash)
    .limit(1);

  if (opts?.projectId) {
    query = query.eq("project_id", opts.projectId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[legal-acceptance] jaAceitou falhou:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

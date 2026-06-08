import { createClient } from "@supabase/supabase-js";
import { isFormatoValido, type FormatoLivro } from "./formatos";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getProjectFormato(projectId: string): Promise<FormatoLivro | null> {
  const supabase = adminClient();
  const { data } = await supabase
    .from("projects")
    .select("formato")
    .eq("id", projectId)
    .single();

  const v = data?.formato;
  return isFormatoValido(v) ? v : null;
}

export async function getProjectFormatoStatus(
  projectId: string
): Promise<{ formato: FormatoLivro | null; locked: boolean }> {
  const supabase = adminClient();
  const { data } = await supabase
    .from("projects")
    .select("formato, formato_locked_at")
    .eq("id", projectId)
    .single();

  const v = data?.formato;
  return {
    formato: isFormatoValido(v) ? v : null,
    locked: data?.formato_locked_at != null,
  };
}

// Idempotent — only sets formato_locked_at when it is still NULL.
export async function lockFormato(projectId: string): Promise<void> {
  const supabase = adminClient();
  await supabase
    .from("projects")
    .update({ formato_locked_at: new Date().toISOString() })
    .eq("id", projectId)
    .is("formato_locked_at", null);
}

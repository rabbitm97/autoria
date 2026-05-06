import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/supabase-server";
import PreviewClient from "./PreviewClient";
import type { MioloConfig } from "@/lib/miolo-builder";

interface Props {
  params: Promise<{ project_id: string }>;
}

export default async function PreviewPage({ params }: Props) {
  const { project_id } = await params;

  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch {
    redirect("/login");
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) redirect("/dashboard");

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";

  const dadosMiolo = project.dados_miolo as { config?: MioloConfig } | null;

  return (
    <PreviewClient
      data={{
        project_id,
        titulo,
        autor,
        config: dadosMiolo?.config ?? null,
      }}
    />
  );
}

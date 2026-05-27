import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { EditorClient } from "./editor-client";
import { FORMATS } from "./lib/dimensions";
import type { FormatKey, ProjectData } from "./types";
import type { EditorData } from "./lib/editor-serializer";

export const metadata = {
  title: "Editor de Capa · Autoria",
};

export default async function EditorCapaPage({
  params,
}: {
  params: Promise<{ project_id: string }>;
}) {
  const { project_id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "dados_elementos, dados_capa, dados_miolo, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome, subtitulo, isbn)",
    )
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    redirect("/dashboard");
  }

  const elementos = project.dados_elementos as Record<string, unknown> | null;
  const capa = project.dados_capa as Record<string, unknown> | null;
  const miolo = project.dados_miolo as {
    lombada_mm?: number;
    paginas_reais?: number;
  } | null;
  const manuscript = project.manuscripts as {
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    subtitulo?: string;
    isbn?: string;
  } | null;

  const rawFormat = capa?.formato as string | undefined;
  const format: FormatKey =
    rawFormat && rawFormat in FORMATS ? (rawFormat as FormatKey) : "16x23";

  const pages = miolo?.paginas_reais ?? 200;
  const title =
    (elementos?.titulo_escolhido as string) ??
    (elementos?.opcoes_titulo as string[])?.[0] ??
    "";
  const authorName = [
    manuscript?.autor_primeiro_nome,
    manuscript?.autor_sobrenome,
  ]
    .filter(Boolean)
    .join(" ");
  const synopsisShort = (elementos?.sinopse_curta as string) ?? "";
  const synopsisLong = (elementos?.sinopse_longa as string) ?? "";
  const subtitle = manuscript?.subtitulo ?? "";
  const isbn = manuscript?.isbn ?? null;

  // Load saved editor state if it exists
  const rawEditorData = capa?.editor_data;
  let initialEditorData: EditorData | null = null;
  if (
    rawEditorData &&
    typeof rawEditorData === "object" &&
    (rawEditorData as Record<string, unknown>).version === 1
  ) {
    initialEditorData = rawEditorData as EditorData;
  }

  const projectData: ProjectData = {
    projectId: project_id,
    format,
    pages,
    title,
    subtitle,
    authorName,
    isbn,
    synopsisShort,
    synopsisLong,
    pagesSource: miolo?.paginas_reais ? "real" : "default",
    initialEditorData,
  };

  return <EditorClient projectData={projectData} />;
}

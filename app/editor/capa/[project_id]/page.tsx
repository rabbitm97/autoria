import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { EditorClient } from "./editor-client";
import { FORMATS } from "./lib/dimensions";
import { deserializeEditorState } from "./lib/editor-serializer";
import type { FormatKey, HydratableEditorData, ProjectData } from "./types";

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
    console.log("[editor/capa] redirect: usuário não autenticado. error =", authError?.message);
    redirect("/login");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(
      "formato, dados_elementos, dados_capa, dados_miolo, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome, titulo, subtitulo)",
    )
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    console.log("[editor/capa] redirect: projeto não encontrado ou sem acesso. project_id =", project_id, "error =", projectError?.message);
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
    titulo?: string;
    subtitulo?: string;
  } | null;

  // Fonte única: projects.formato. Default temporário "padrao_br" só para o
  // caso (raro) de o autor abrir o editor sem ter escolhido formato — o fluxo
  // certo é forçar escolha em Elementos Editoriais antes de gerar a capa.
  const rawFormat = project.formato as string | undefined;
  const format: FormatKey =
    rawFormat && rawFormat in FORMATS ? (rawFormat as FormatKey) : "padrao_br";

  const pages = miolo?.paginas_reais ?? 200;
  // Ordem de precedência:
  //  1. titulo_escolhido: última decisão consciente do autor em Elementos
  //  2. opcoes_titulo[0]: primeira sugestão da IA (autor passou por Elementos
  //     mas não escolheu explicitamente)
  //  3. manuscripts.titulo: título original do manuscrito (fallback quando o
  //     autor pulou Elementos Editoriais — segundo a memória do projeto,
  //     manuscripts.titulo é single source of truth imutável)
  //  4. "": edge case (projeto sem título em nenhum lugar)
  const title =
    (elementos?.titulo_escolhido as string) ??
    (elementos?.opcoes_titulo as string[])?.[0] ??
    manuscript?.titulo ??
    "";
  const authorName = [
    manuscript?.autor_primeiro_nome,
    manuscript?.autor_sobrenome,
  ]
    .filter(Boolean)
    .join(" ");
  const synopsisShort = (elementos?.sinopse_curta as string) ?? "";
  const synopsisLong = (elementos?.sinopse_longa as string) ?? "";
  // Mesma cascata do title, mas subtítulo é opcional em muitos manuscritos.
  const subtitle =
    (elementos?.subtitulo as string) ??
    manuscript?.subtitulo ??
    "";
  const isbn = (capa?.isbn as string) ?? null;

  const confirmedAt = (capa?.confirmed_at as string) ?? null;
  const confirmedImageUrl = (capa?.imagem_url as string) ?? null;

  // Load saved editor state if it exists. Deserializer handles legacy schema
  // (comOrelhas boolean) → new schema (orelhaMm number) using format default.
  const rawEditorData = capa?.editor_data;
  const initialEditorData: HydratableEditorData | null = deserializeEditorState(
    rawEditorData,
    format,
  );

  // Background do editor: se já há editor_data com backgroundUrl salvo, ele
  // vem no `initialEditorData`. Caso contrário — autor abrindo o editor pela
  // primeira vez em cima de um upload puro — pegamos o `url` do modo upload.
  // IA fica sempre sem background (retorna só a frente, não uma panorâmica).
  const uploadUrl =
    capa?.modo === "upload" && typeof capa?.url === "string" ? (capa.url as string) : null;
  const backgroundUrl = initialEditorData?.backgroundUrl ?? uploadUrl;

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
    confirmedAt,
    confirmedImageUrl,
    backgroundUrl,
  };

  return <EditorClient projectData={projectData} />;
}

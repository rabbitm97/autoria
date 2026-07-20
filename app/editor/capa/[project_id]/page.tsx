import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { estimarPaginas, getFormatoDef } from "@/lib/formatos";
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
      "formato, dados_elementos, dados_capa, dados_miolo, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome, titulo, subtitulo, texto, texto_revisado)",
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
    texto?: string;
    texto_revisado?: string;
  } | null;

  // Fonte única: projects.formato. Sem formato definido, não há como abrir
  // o editor com dimensões corretas — força escolha em Elementos antes.
  const rawFormat = project.formato as string | undefined;
  if (!rawFormat || !(rawFormat in FORMATS)) {
    console.log("[editor/capa] redirect: formato não definido. project_id =", project_id);
    redirect(`/dashboard/elementos/${project_id}`);
  }
  const format: FormatKey = rawFormat as FormatKey;

  // Páginas: reais se diagramado; senão a MESMA estimativa da rota
  // estimativa-paginas (métrica cpp do 14.F, texto_revisado ?? texto).
  const textoRevisadoTrim = manuscript?.texto_revisado?.trim() ?? "";
  const textoBase = textoRevisadoTrim.length >= 50
    ? textoRevisadoTrim
    : (manuscript?.texto?.trim() ?? "");
  const pages = miolo?.paginas_reais
    ?? estimarPaginas(getFormatoDef(format).specs, undefined, textoBase.length);
  // Título/subtítulo: manuscripts é a fonte imutável (decisão de produto —
  // sem opções de título; a voz do autor é preservada).
  const title = manuscript?.titulo ?? "";
  const authorName = [
    manuscript?.autor_primeiro_nome,
    manuscript?.autor_sobrenome,
  ]
    .filter(Boolean)
    .join(" ");
  const synopsisShort = (elementos?.sinopse_curta as string) ?? "";
  const synopsisLong = (elementos?.sinopse_longa as string) ?? "";
  const subtitle = manuscript?.subtitulo ?? "";
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

  // Background do editor: reflete a regra dos 3 modos.
  //  - Upload: NUNCA herda como background. O arquivo do autor é final,
  //    não vai ser editado dentro da plataforma. O card "Editor
  //    interativo" na tela /dashboard/capa/[id] chama reset antes de
  //    navegar, então quando autor entra vindo daí o dados_capa está
  //    limpo e nada é herdado.
  //  - IA: HERDA como background quando o autor entra via botão "Editar
  //    no editor" do ResultadoCard. O editor abre com a arte da IA como
  //    camada travada zIndex 0, e o autor adiciona elementos por cima.
  //  - Editor puro: sem background. Autor começa do zero.
  //
  // Retrocompat: initialEditorData?.backgroundUrl (design 14.I legado)
  // ainda é respeitado. Projetos novos com upload não gravam isso mais.
  const iaUrl =
    capa?.modo === "ia" && typeof capa?.url_escolhida === "string"
      ? (capa.url_escolhida as string)
      : null;
  const backgroundUrl = initialEditorData?.backgroundUrl ?? iaUrl;

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
    pagesSource: miolo?.paginas_reais ? "real" : "estimativa",
    initialEditorData,
    confirmedAt,
    confirmedImageUrl,
    backgroundUrl,
  };

  return <EditorClient projectData={projectData} />;
}

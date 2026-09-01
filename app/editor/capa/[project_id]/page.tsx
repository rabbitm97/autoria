import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { estimarPaginas, getFormatoDef } from "@/lib/formatos";
import { EditorClient } from "./editor-client";
import { FORMATS } from "./lib/dimensions";
import { deserializeEditorState } from "./lib/editor-serializer";
import type { CapaIaHandoff, EditorLayout, FormatKey, HydratableEditorData, ProjectData } from "./types";

export const metadata = {
  title: "Editor de Capa · Autoria",
};

export default async function EditorCapaPage({
  params,
  searchParams,
}: {
  params: Promise<{ project_id: string }>;
  searchParams: Promise<{ avulso?: string }>;
}) {
  const { project_id } = await params;
  const { avulso } = await searchParams;
  const avulsoJob = typeof avulso === "string" && avulso.length > 0 ? avulso : null;

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
      "formato, dados_elementos, dados_capa, dados_creditos, dados_miolo, dados_pdf, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome, titulo, subtitulo, texto, texto_revisado)",
    )
    .eq("id", project_id)
    .single();

  if (projectError || !project) {
    console.log("[editor/capa] redirect: projeto não encontrado ou sem acesso. project_id =", project_id, "error =", projectError?.message);
    redirect("/dashboard");
  }

  const elementos = project.dados_elementos as Record<string, unknown> | null;
  const capa = project.dados_capa as Record<string, unknown> | null;
  const creditos = project.dados_creditos as Record<string, unknown> | null;
  const miolo = project.dados_miolo as {
    lombada_mm?: number;
    paginas_reais?: number;
  } | null;
  const dadosPdf = project.dados_pdf as { origem?: string } | null;
  const isExpress = dadosPdf?.origem === "upload";
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

  // Background do editor (upload → PNG panorâmico atrás dos elementos).
  //  - Upload: NUNCA herda automaticamente aqui — o card "Editor interativo"
  //    da tela /dashboard/capa/[id] chama reset antes de navegar, então
  //    dados_capa fica limpo. Se `editor_data.backgroundUrl` existe (edição
  //    prévia), ele é respeitado.
  //  - IA (B2-04c): NÃO é mais background esticado. Vira `capaIaHandoff` e
  //    o cliente injeta um ImageElement travado no rect da frente + fills.
  //  - Editor puro: sem background.
  const backgroundUrl = initialEditorData?.backgroundUrl ?? null;

  // Handoff da IA — só quando modo="ia" e temos url_escolhida (frente/unica).
  // Cobertura decide o formato do handoff:
  //  - "unica": url_escolhida é a arte panorâmica → vira unicaUrl, frenteUrl
  //    e versoUrl são null (a arte única é a única imagem que renderiza).
  //  - "frente_verso" (padrão retrocompat): url_escolhida é a frente.
  //    verso.url_escolhida pode existir (imagem) ou verso.modo === "cor"
  //    (só cor sem imagem).
  const iaUrl =
    capa?.modo === "ia" && typeof capa?.url_escolhida === "string"
      ? (capa.url_escolhida as string)
      : null;
  const cobertura: "frente_verso" | "unica" =
    capa?.cobertura === "unica" ? "unica" : "frente_verso";
  const verso = capa?.verso as
    | { modo?: string; url_escolhida?: string | null }
    | null
    | undefined;
  const versoUrl =
    cobertura === "frente_verso" && typeof verso?.url_escolhida === "string"
      ? verso.url_escolhida
      : null;
  const versoModoCor =
    cobertura === "frente_verso" && verso?.modo === "cor";

  const capaIaHandoff: CapaIaHandoff | null = iaUrl
    ? {
        cobertura,
        corPredominanteHex:
          typeof capa?.cor_predominante_hex === "string"
            ? (capa.cor_predominante_hex as string)
            : "",
        posicaoTitulo:
          capa?.posicao_titulo === "topo" ||
          capa?.posicao_titulo === "centro" ||
          capa?.posicao_titulo === "base" ||
          capa?.posicao_titulo === "sem_preferencia"
            ? (capa.posicao_titulo as CapaIaHandoff["posicaoTitulo"])
            : "sem_preferencia",
        frenteUrl: cobertura === "unica" ? null : iaUrl,
        versoUrl,
        versoModoCor,
        unicaUrl: cobertura === "unica" ? iaUrl : null,
      }
    : null;

  // Layout derivado do propósito da publicação (dados_creditos.config).
  //  - digital  → frente  (sem lombada/verso/orelhas)
  //  - completa → panoramica
  //  - retrocompat sem creditos → panoramica (comportamento anterior)
  // Layout salvo em editor_data vence sobre o derivado — respeita a
  // decisão do autor caso ele já tenha começado a editar.
  const creditosConfig = creditos?.config as { proposito?: string } | null | undefined;
  const propositoDerivado: EditorLayout =
    creditosConfig?.proposito === "digital" ? "frente" : "panoramica";
  const layout: EditorLayout = initialEditorData?.layout ?? propositoDerivado;

  const projectData: ProjectData = {
    projectId: project_id,
    isExpress,
    format,
    pages,
    layout,
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
    capaIaHandoff,
    avulsoJob,
  };

  return <EditorClient projectData={projectData} />;
}

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { EditorClient } from "./editor-client";
import { FORMATS } from "./lib/dimensions";
import type { FormatKey, ProjectData } from "./types";

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
      "dados_elementos, dados_capa, dados_miolo, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome)",
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
  } | null;

  const rawFormat = capa?.formato as string | undefined;

  if (!rawFormat || !(rawFormat in FORMATS)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-[#fdfcf9] text-[#1a1a2e]">
        <div className="mx-4 max-w-sm text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#c9a84c"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>
          <p className="mb-1 text-base font-medium">Formato do livro não definido</p>
          <p className="mb-6 text-sm text-zinc-400">
            Selecione o formato na página de capa antes de abrir o editor interativo.
          </p>
          <a
            href={`/dashboard/capa/${project_id}`}
            className="inline-block rounded-xl bg-[#1a1a2e] px-6 py-2.5 text-sm font-medium text-[#c9a84c] transition-opacity hover:opacity-90"
          >
            ← Voltar para edição de capa
          </a>
        </div>
      </div>
    );
  }

  const format = rawFormat as FormatKey;
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

  const projectData: ProjectData = {
    projectId: project_id,
    format,
    pages,
    title,
    subtitle: "",
    authorName,
    isbn: null, // TODO Onda 3: check if projects table has isbn column
    synopsisShort,
    pagesSource: miolo?.paginas_reais ? "real" : "default",
  };

  return <EditorClient projectData={projectData} />;
}

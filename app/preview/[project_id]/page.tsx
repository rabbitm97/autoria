import Link from "next/link";
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
    .select("id, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome, capitulos_detectados)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) redirect("/dashboard");

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    capitulos_detectados?: unknown[] | null;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";

  const dadosMiolo = project.dados_miolo as { config?: MioloConfig } | null;

  // Empty state: miolo never generated
  if (!dadosMiolo?.config) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-zinc-100">Gere o miolo primeiro</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              A página de preview funciona apenas para projetos que já passaram pela etapa de
              diagramação. Vá até a página do miolo, configure os parâmetros desejados e gere a
              primeira versão. Depois você pode voltar aqui para iterar visualmente sem custo.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href={`/miolo/${project_id}`}
              className="w-full text-center px-4 py-2.5 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400 transition-colors"
            >
              Ir para a diagramação
            </Link>
            <Link
              href="/dashboard"
              className="w-full text-center px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Warning: miolo exists but chapters were never detected (rare)
  const semCapitulos =
    !ms?.capitulos_detectados || !Array.isArray(ms.capitulos_detectados) || ms.capitulos_detectados.length === 0;

  return (
    <>
      {semCapitulos && (
        <div className="bg-amber-950/50 border-b border-amber-800/60 px-4 py-2.5 text-xs text-amber-300 text-center">
          Detecção de capítulos não foi executada ainda. O preview pode mostrar o livro como capítulo único.
          Regenere o miolo para detectar capítulos.
        </div>
      )}
      <PreviewClient
        data={{
          project_id,
          titulo,
          autor,
          config: dadosMiolo.config,
        }}
      />
    </>
  );
}

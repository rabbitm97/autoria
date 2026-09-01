import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { TOOLS } from "@/components/ferramentas/registry";
import type { EntregavelJob, EstadoJob } from "@/lib/ferramenta-jobs";

interface JobRow {
  id: string;
  ferramenta_id: string;
  estado: EstadoJob;
  entregaveis: EntregavelJob[];
  estornado_em: string | null;
  expira_em: string | null;
}

const MOCK_DEV: JobRow[] = [
  {
    id: "mock-job-1", ferramenta_id: "diagnostico", estado: "concluido",
    entregaveis: [{ tipo: "relatorio_pdf", storage_path: "x", bytes: 120_000, nome_exibicao: "Diagnóstico — O Empreendedor Aumentado.pdf" }],
    estornado_em: null,
    expira_em: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  },
  {
    id: "mock-job-2", ferramenta_id: "epub", estado: "processando",
    entregaveis: [], estornado_em: null,
    expira_em: new Date(Date.now() + 89 * 86_400_000).toISOString(),
  },
];

function labelFerramenta(id: string): string {
  const hit = TOOLS.find((t) => t.id === id);
  if (hit) return hit.label;
  // Jobs históricos (diagnostico-completo / diagnostico-expresso) foram unificados em "diagnostico".
  if (id.startsWith("diagnostico")) return "Diagnóstico editorial";
  return id;
}

const ESTADO_BADGE: Partial<Record<EstadoJob, { texto: string; cls: string }>> = {
  processando: { texto: "Em processamento", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  aguardando_autor: { texto: "Aguardando você", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  falhou: { texto: "Falhou — créditos devolvidos", cls: "bg-red-50 text-red-600 border-red-200" },
};

export async function ArquivosFerramentas() {
  let jobs: JobRow[] = [];
  if (isDev()) {
    jobs = MOCK_DEV;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("ferramenta_jobs")
      .select("id, ferramenta_id, estado, entregaveis, estornado_em, expira_em")
      .in("estado", ["concluido", "processando", "aguardando_autor", "falhou"])
      .order("criado_em", { ascending: false })
      .limit(12);
    jobs = (data ?? []) as JobRow[];
  }
  if (jobs.length === 0) return null;

  const seteDias = 7 * 86_400_000;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-heading text-lg text-brand-primary">Arquivos das ferramentas</h3>
        <p className="text-[11px] text-zinc-400">Disponíveis por 90 dias após a geração</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => {
          const badge = ESTADO_BADGE[job.estado];
          const expira = job.expira_em ? new Date(job.expira_em) : null;
          const urgente = expira ? expira.getTime() - Date.now() <= seteDias : false;
          return (
            <div key={job.id} className="rounded-xl border border-zinc-100 bg-white p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-medium text-brand-primary truncate">
                  {labelFerramenta(job.ferramenta_id)}
                </p>
                {badge && (
                  <span className={`whitespace-nowrap rounded border px-2 py-0.5 text-[10px] ${badge.cls}`}>
                    {badge.texto}
                  </span>
                )}
              </div>
              {job.estado === "concluido" && (
                <div className="space-y-1.5 mb-2">
                  {job.entregaveis.map((e, i) => (
                    <a
                      key={i}
                      href={`/api/ferramentas/jobs/${job.id}/download?i=${i}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-xs text-zinc-600 hover:border-brand-gold hover:text-brand-primary transition-colors"
                    >
                      <span className="truncate">{e.nome_exibicao}</span>
                      <span className="shrink-0 text-brand-gold font-medium">Baixar</span>
                    </a>
                  ))}
                </div>
              )}
              {job.estado === "concluido" && expira && (
                <p className={`text-[11px] ${urgente ? "text-amber-600 font-medium" : "text-zinc-400"}`}>
                  Disponível até {expira.toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-right">
        <Link href="/dashboard/ferramentas" className="text-xs text-brand-gold hover:underline">
          Ver todas as ferramentas →
        </Link>
      </p>
    </div>
  );
}

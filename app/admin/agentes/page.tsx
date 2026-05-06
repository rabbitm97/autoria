"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRow {
  name: string;
  label: string;
  model: string;
  hasPrompt: boolean;
  last_call: string | null;
  avg_cost: number | null;
  error_rate: number | null;
  total_calls: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtCost(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "US$ 0";
  return `US$ ${n.toFixed(4)}`;
}

function ErrorBadge({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-zinc-600 text-xs">—</span>;
  const color = rate === 0 ? "text-emerald-400" : rate < 5 ? "text-amber-400" : "text-red-400";
  return <span className={`text-xs font-mono ${color}`}>{rate.toFixed(1)}%</span>;
}

function ModelBadge({ model }: { model: string }) {
  const colors: Record<string, string> = {
    "claude-sonnet-4-6": "bg-violet-900/50 text-violet-300",
    "claude-haiku-4-5-20251001": "bg-sky-900/50 text-sky-300",
    "ElevenLabs": "bg-orange-900/50 text-orange-300",
    "Gemini Imagen 3": "bg-green-900/50 text-green-300",
  };
  const cls = colors[model] ?? "bg-zinc-800 text-zinc-400";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap ${cls}`}>
      {model}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminAgentesPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/agentes")
      .then(r => r.json())
      .then(data => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-1">
          Painel de agentes
        </p>
        <h1 className="text-2xl font-semibold text-zinc-100">Agentes IA</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Métricas agregadas das últimas 100 chamadas por agente.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-zinc-800/50 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {agents.map(agent => (
            <Link
              key={agent.name}
              href={`/admin/agentes/${agent.name}`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 hover:bg-zinc-800/80 transition-all group"
            >
              <div className="flex items-start justify-between mb-3 gap-2">
                <p className="text-sm font-medium text-zinc-100 leading-tight group-hover:text-amber-400 transition-colors">
                  {agent.label}
                </p>
                {agent.hasPrompt && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-400 uppercase tracking-wider shrink-0">
                    LLM
                  </span>
                )}
              </div>

              <div className="mb-3">
                <ModelBadge model={agent.model} />
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-500">
                  <span>Última chamada</span>
                  <span className="text-zinc-300">{fmtDate(agent.last_call)}</span>
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Custo médio</span>
                  <span className="text-zinc-300">{fmtCost(agent.avg_cost)}</span>
                </div>
                <div className="flex justify-between items-center text-zinc-500">
                  <span>Taxa de erro</span>
                  <ErrorBadge rate={agent.error_rate} />
                </div>
                <div className="flex justify-between text-zinc-500">
                  <span>Chamadas (100)</span>
                  <span className="text-zinc-300">{agent.total_calls}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

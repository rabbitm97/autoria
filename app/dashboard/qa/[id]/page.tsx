"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import type { QAResult, QAItem, QACategoria } from "@/app/api/agentes/qa/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<QACategoria, string> = {
  texto:       "Texto",
  metadados:   "Metadados",
  capa:        "Capa",
  diagramacao: "Diagramação",
};

const STATUS_STYLE = {
  ok:    { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
  aviso: { dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50 border-amber-100"   },
  erro:  { dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50 border-red-100"       },
};

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={96} height={96} viewBox="0 0 96 96">
      <circle cx={48} cy={48} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle
        cx={48} cy={48} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x={48} y={48} dominantBaseline="middle" textAnchor="middle"
        fontSize={20} fontWeight="bold" fill={color} fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QAPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<QAResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agentes/qa?project_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data) setResult(data as QAResult);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  async function handleAnalisar() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro na análise");
      setResult(data as QAResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setAnalyzing(false);
    }
  }

  // Group items by category
  const grouped = result
    ? (["texto", "metadados", "capa", "diagramacao"] as QACategoria[]).map(cat => ({
        cat,
        itens: result.itens.filter(i => i.categoria === cat),
      })).filter(g => g.itens.length > 0)
    : [];

  return (
    <div>

      <EtapasProgress currentStep={5} />

      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 6 — QA
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Verificação de qualidade
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed">
            Análise automática do projeto antes da publicação: texto, metadados, capa e diagramação.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-6">
                {error}
              </div>
            )}

            {result ? (
              <>
                {/* Score card */}
                <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col sm:flex-row items-center gap-6 mb-6">
                  <ScoreRing score={result.score} />
                  <div className="flex-1 text-center sm:text-left">
                    <p className={`font-heading text-2xl mb-1 ${result.aprovado ? "text-emerald-700" : "text-amber-700"}`}>
                      {result.aprovado ? "Aprovado para publicação" : "Revisão necessária"}
                    </p>
                    <p className="text-sm text-zinc-500 leading-relaxed">{result.recomendacao}</p>
                    <p className="text-xs text-zinc-300 mt-2">
                      Analisado em {new Date(result.analisado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>

                {/* Items by category */}
                <div className="space-y-4 mb-6">
                  {grouped.map(({ cat, itens }) => (
                    <div key={cat} className="bg-white rounded-2xl border border-zinc-100 p-5">
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
                        {CATEGORIA_LABEL[cat]}
                      </p>
                      <div className="space-y-2">
                        {itens.map((item: QAItem, i: number) => {
                          const s = STATUS_STYLE[item.status];
                          return (
                            <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.bg}`}>
                              <span className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 shrink-0`} />
                              <span className={`text-sm ${s.text}`}>{item.mensagem}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleAnalisar}
                    disabled={analyzing}
                    className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-brand-gold/30 transition-colors disabled:opacity-50"
                  >
                    {analyzing ? "Reanalisando…" : "Reanalisar"}
                  </button>
                  {result.aprovado && (
                    <button
                      onClick={() => router.push(`/dashboard/publicacao/${id}`)}
                      className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm hover:bg-brand-gold/90 transition-colors"
                    >
                      Aprovado → Publicação
                    </button>
                  )}
                  {!result.aprovado && (
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors"
                    >
                      Voltar ao dashboard para corrigir
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
                  <CheckIcon />
                </div>
                <h3 className="font-heading text-xl text-brand-primary mb-2">
                  Pronto para verificação
                </h3>
                <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
                  O agente vai verificar texto, metadados, capa e PDF, e gerar uma recomendação editorial.
                </p>
                <button
                  onClick={handleAnalisar}
                  disabled={analyzing}
                  className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-8 py-3 rounded-xl font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                      Analisando…
                    </>
                  ) : "Iniciar verificação QA"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-brand-gold">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

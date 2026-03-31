"use client";

import { useState } from "react";
import type { DiagnosticoFerramenta } from "@/app/api/ferramentas/diagnostico/route";
import { ManuscriptUpload } from "@/components/manuscript-upload";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiagnosticoFerramenta() {
  const [texto, setTexto] = useState("");
  const [result, setResult] = useState<DiagnosticoFerramenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ferramentas/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro desconhecido");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao analisar");
    } finally {
      setLoading(false);
    }
  }

  const complexidadeColor = {
    simples: "text-emerald-600 bg-emerald-50 border-emerald-100",
    médio:   "text-amber-600 bg-amber-50 border-amber-100",
    complexo: "text-violet-600 bg-violet-50 border-violet-100",
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">

      {/* Header */}
      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / IA</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Diagnóstico Editorial</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Cole o seu manuscrito e a IA fará uma análise completa: gênero, complexidade, pontos fortes e sugestões de melhoria.
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            Manuscrito ou trecho
          </label>
          <ManuscriptUpload onText={setTexto} />
        </div>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Cole aqui um trecho ou envie um arquivo PDF, DOCX ou TXT acima..."
          rows={12}
          className="w-full resize-none rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold/40 font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-zinc-400">{texto.length.toLocaleString("pt-BR")} caracteres</span>
          <button
            type="submit"
            disabled={loading || !texto.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? <Spinner /> : <ScanIcon />}
            {loading ? "Analisando…" : "Analisar manuscrito"}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-700 mb-6">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4 animate-in fade-in duration-300">

          {/* Metrics row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Palavras" value={result.num_palavras.toLocaleString("pt-BR")} />
            <MetricCard label="Capítulos (est.)" value={String(result.num_capitulos)} />
            <MetricCard label="Gênero" value={result.genero_provavel} />
            <div className="bg-white rounded-2xl border border-zinc-100 p-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Complexidade</p>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold border ${complexidadeColor[result.complexidade]}`}>
                {result.complexidade.charAt(0).toUpperCase() + result.complexidade.slice(1)}
              </span>
            </div>
          </div>

          {/* Mercado alvo */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Mercado-alvo</p>
            <p className="text-sm text-zinc-700">{result.mercado_alvo}</p>
          </div>

          {/* Pontos fortes + melhorar */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-3">Pontos fortes</p>
              <ul className="space-y-2">
                {result.pontos_fortes.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-zinc-700">
                    <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">A melhorar</p>
              <ul className="space-y-2">
                {result.pontos_melhorar.map((p, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-zinc-700">
                    <span className="text-amber-500 shrink-0 mt-0.5">→</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-4">
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-heading text-xl text-brand-primary truncate">{value}</p>
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}

function ScanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
      <path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10"/>
    </svg>
  );
}

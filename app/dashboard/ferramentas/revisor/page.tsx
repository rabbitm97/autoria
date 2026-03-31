"use client";

import { useState } from "react";
import type { SugestaoRevisor } from "@/app/api/ferramentas/revisor/route";
import { ManuscriptUpload } from "@/components/manuscript-upload";

// ─── Config ────────────────────────────────────────────────────────────────────

const TIPO_STYLE: Record<SugestaoRevisor["tipo"], { label: string; color: string; bg: string; border: string }> = {
  gramatica:  { label: "Gramática",   color: "text-red-700",    bg: "bg-red-50",    border: "border-red-100"    },
  ortografia: { label: "Ortografia",  color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-100" },
  estilo:     { label: "Estilo",      color: "text-violet-700", bg: "bg-violet-50", border: "border-violet-100" },
  coesao:     { label: "Coesão",      color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-100"   },
  clareza:    { label: "Clareza",     color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-100"  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RevisorPage() {
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState<SugestaoRevisor[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<SugestaoRevisor["tipo"] | "todos">("todos");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    setSugestoes(null);
    try {
      const res = await fetch("/api/ferramentas/revisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      setSugestoes(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao revisar");
    } finally {
      setLoading(false);
    }
  }

  const filtradas = sugestoes
    ? (filtro === "todos" ? sugestoes : sugestoes.filter(s => s.tipo === filtro))
    : [];

  const countByTipo = sugestoes
    ? Object.fromEntries(
        (["gramatica","ortografia","estilo","coesao","clareza"] as SugestaoRevisor["tipo"][])
          .map(t => [t, sugestoes.filter(s => s.tipo === t).length])
      )
    : {};

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / IA</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Revisor de Texto</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Análise gramatical, ortográfica e de estilo com IA especializada em literatura brasileira. Receba sugestões precisas que preservam sua voz.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Texto para revisar</label>
          <ManuscriptUpload onText={setTexto} />
        </div>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Cole aqui o trecho ou envie um arquivo PDF, DOCX ou TXT acima..."
          rows={10}
          className="w-full resize-none rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 font-mono leading-relaxed"
        />
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-zinc-400">{texto.length.toLocaleString("pt-BR")} caracteres</span>
          <button
            type="submit"
            disabled={loading || !texto.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? <Spinner /> : <CheckIcon />}
            {loading ? "Revisando…" : "Revisar texto"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-700 mb-6">{error}</div>
      )}

      {sugestoes && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-zinc-600 font-medium mr-2">{sugestoes.length} sugestões</span>
              <button onClick={() => setFiltro("todos")}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${filtro === "todos" ? "bg-brand-primary text-brand-gold border-brand-primary" : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}>
                Todas
              </button>
              {(Object.keys(TIPO_STYLE) as SugestaoRevisor["tipo"][]).map(t => (
                (countByTipo[t] ?? 0) > 0 && (
                  <button key={t} onClick={() => setFiltro(t)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${filtro === t ? `${TIPO_STYLE[t].bg} ${TIPO_STYLE[t].color} ${TIPO_STYLE[t].border}` : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-300"}`}>
                    {TIPO_STYLE[t].label} ({countByTipo[t]})
                  </button>
                )
              ))}
            </div>
          </div>

          {/* Suggestions */}
          <div className="space-y-3">
            {filtradas.map(s => {
              const style = TIPO_STYLE[s.tipo];
              return (
                <div key={s.id} className={`bg-white rounded-2xl border border-zinc-100 p-5`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style.bg} ${style.color} ${style.border}`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div className="rounded-xl bg-red-50/50 border border-red-100 px-3 py-2.5">
                      <p className="text-[10px] text-red-500 font-semibold uppercase tracking-wide mb-1">Original</p>
                      <p className="text-sm text-zinc-700 italic">&ldquo;{s.trecho_original}&rdquo;</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50/50 border border-emerald-100 px-3 py-2.5">
                      <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">Sugestão</p>
                      <p className="text-sm text-zinc-700 italic">&ldquo;{s.sugestao}&rdquo;</p>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{s.explicacao}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}
function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

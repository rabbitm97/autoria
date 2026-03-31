"use client";

import { useState } from "react";

type Formato = "kdp_6x9" | "a5" | "letter";

const FORMATOS: { id: Formato; label: string; desc: string }[] = [
  { id: "kdp_6x9", label: "KDP 6×9 pol.", desc: "Amazon KDP — padrão para ficção e não-ficção" },
  { id: "a5",      label: "A5",            desc: "Formato europeu — 14,8 × 21 cm" },
  { id: "letter",  label: "Carta 8,5×11", desc: "Formato americano — técnicos e relatórios" },
];

export default function PdfPage() {
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [texto, setTexto] = useState("");
  const [formato, setFormato] = useState<Formato>("kdp_6x9");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/ferramentas/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, autor, texto, formato }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(titulo || "livro").toLowerCase().replace(/\s+/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / Diagramação</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Gerar PDF</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Diagrame seu manuscrito em PDF profissional com tipografia editorial (Times Roman 11pt, espaçamento 1,6). Escolha o formato e baixe pronto para impressão ou upload na Amazon KDP.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Título do livro</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título" className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Autor</label>
            <input value={autor} onChange={e => setAutor(e.target.value)} placeholder="Nome do autor" className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Formato</label>
          <div className="grid grid-cols-3 gap-2">
            {FORMATOS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFormato(f.id)}
                className={`p-3 rounded-xl border text-left transition-all ${formato === f.id ? "border-brand-gold bg-brand-gold/5" : "border-zinc-200 hover:border-zinc-300"}`}
              >
                <p className={`text-sm font-semibold ${formato === f.id ? "text-brand-primary" : "text-zinc-700"}`}>{f.label}</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-tight">{f.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Manuscrito</label>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Cole o texto completo do seu livro aqui. Títulos de capítulos em LETRAS MAIÚSCULAS ou com prefixo 'Capítulo 1'..."
            rows={12}
            className="w-full resize-none px-4 py-3 rounded-xl border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 font-mono leading-relaxed"
          />
          <p className="text-xs text-zinc-400 mt-1">{texto.length.toLocaleString("pt-BR")} caracteres</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        {done && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">✓ PDF gerado e baixado com sucesso.</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !texto.trim()}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? <Spinner /> : <PdfIcon />}
            {loading ? "Gerando PDF…" : "Gerar e baixar PDF"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}
function PdfIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

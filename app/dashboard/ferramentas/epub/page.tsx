"use client";

import { useState } from "react";

export default function EpubPage() {
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [texto, setTexto] = useState("");
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
      const res = await fetch("/api/ferramentas/epub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, autor, texto }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(titulo || "livro").toLowerCase().replace(/\s+/g, "-")}.epub`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar EPUB");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / Diagramação</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Gerar EPUB 3</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Converta seu manuscrito em EPUB 3 compatível com Kindle, Kobo, Apple Books e todas as plataformas de eBook. Estrutura automática de capítulos e tipografia editorial.
        </p>
      </div>

      {/* What's included */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "EPUB 3.0",       desc: "Padrão universal" },
          { label: "Georgia 11pt",   desc: "Tipografia editorial" },
          { label: "Capítulos auto", desc: "Estrutura automática" },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-zinc-100 p-3 text-center">
            <p className="text-sm font-semibold text-brand-primary">{item.label}</p>
            <p className="text-xs text-zinc-400 mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título do livro" className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Autor</label>
            <input value={autor} onChange={e => setAutor(e.target.value)} placeholder="Nome do autor" className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Manuscrito</label>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Cole o texto completo. Capítulos são detectados automaticamente por linhas em MAIÚSCULAS ou com 'Capítulo N'..."
            rows={12}
            className="w-full resize-none px-4 py-3 rounded-xl border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 font-mono leading-relaxed"
          />
          <p className="text-xs text-zinc-400 mt-1">{texto.length.toLocaleString("pt-BR")} caracteres</p>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        {done && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3">✓ EPUB gerado e baixado com sucesso.</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !texto.trim()}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? <Spinner /> : <EpubIcon />}
            {loading ? "Gerando EPUB…" : "Gerar e baixar EPUB"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}
function EpubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="12" y1="6" x2="16" y2="6"/><line x1="12" y1="10" x2="16" y2="10"/>
    </svg>
  );
}

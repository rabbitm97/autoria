"use client";

import { useState } from "react";
import type { ElementosFerramenta } from "@/app/api/ferramentas/elementos/route";

export default function ElementosPage() {
  const [texto, setTexto] = useState("");
  const [result, setResult] = useState<ElementosFerramenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ferramentas/elementos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar elementos");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / IA</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Elementos Editoriais</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Gere sinopse, títulos alternativos, palavras-chave e ficha catalográfica a partir do seu manuscrito — prontos para Amazon KDP e livrarias.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Manuscrito ou trecho</label>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Cole um trecho representativo do seu livro (mínimo 300 palavras para melhor resultado)..."
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
            {loading ? <Spinner /> : <SparkleIcon />}
            {loading ? "Gerando…" : "Gerar elementos"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-700 mb-6">{error}</div>
      )}

      {result && (
        <div className="space-y-4">

          {/* Sinopses */}
          <div className="grid sm:grid-cols-2 gap-4">
            <CopyCard label="Sinopse Curta" value={result.sinopse_curta} onCopy={() => copy(result.sinopse_curta, "sc")} copied={copied === "sc"} />
            <CopyCard label="Sinopse Longa" value={result.sinopse_longa} onCopy={() => copy(result.sinopse_longa, "sl")} copied={copied === "sl"} large />
          </div>

          {/* Títulos */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Opções de título</p>
              <CopyButton onClick={() => copy(result.opcoes_titulo.join("\n"), "tt")} copied={copied === "tt"} />
            </div>
            <ul className="space-y-2">
              {result.opcoes_titulo.map((t, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-gold/15 text-brand-gold text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm text-zinc-800 font-medium">{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Keywords */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Palavras-chave</p>
              <CopyButton onClick={() => copy(result.palavras_chave.join(", "), "kw")} copied={copied === "kw"} />
            </div>
            <div className="flex flex-wrap gap-2">
              {result.palavras_chave.map((kw, i) => (
                <span key={i} className="px-3 py-1 rounded-full bg-brand-primary/5 text-brand-primary text-xs font-medium border border-brand-primary/10">
                  {kw}
                </span>
              ))}
            </div>
          </div>

          {/* Ficha catalográfica */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Ficha catalográfica (CBL)</p>
              <CopyButton onClick={() => copy(result.ficha_catalografica, "fc")} copied={copied === "fc"} />
            </div>
            <pre className="text-xs text-zinc-600 font-mono leading-relaxed whitespace-pre-wrap bg-zinc-50 rounded-xl p-4 border border-zinc-100">
              {result.ficha_catalografica}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function CopyCard({ label, value, onCopy, copied, large }: {
  label: string; value: string; onCopy: () => void; copied: boolean; large?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
        <CopyButton onClick={onCopy} copied={copied} />
      </div>
      <p className={`text-sm text-zinc-700 leading-relaxed ${large ? "" : ""}`}>{value}</p>
    </div>
  );
}

function CopyButton({ onClick, copied }: { onClick: () => void; copied: boolean }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-brand-gold transition-colors">
      {copied ? <span className="text-emerald-500">✓ Copiado</span> : <><CopyIcon /> Copiar</>}
    </button>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}
function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import type { CapaFerramenta } from "@/app/api/ferramentas/capa/route";
import { ImageUploadRef } from "@/components/image-upload-ref";

const GENEROS = ["Literatura", "Romance", "Ficção científica", "Fantasia", "Suspense/Thriller", "Terror", "Autoajuda", "Biografia", "Não-ficção", "Infantil"];

export default function CapaIAPage() {
  const [titulo, setTitulo] = useState("");
  const [sinopse, setSinopse] = useState("");
  const [genero, setGenero] = useState("Literatura");
  const [qtd, setQtd] = useState<1 | 2 | 3>(2);
  const [imagemRef, setImagemRef] = useState<string | null>(null);
  const [result, setResult] = useState<CapaFerramenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !sinopse.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ferramentas/capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, sinopse, genero, qtd, imagemRef }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Erro");
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar capa");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / IA</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Gerador de Capa IA</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Crie capas profissionais com inteligência artificial. Descreva seu livro e receba opções prontas para publicação.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Título do livro</label>
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Ex: O Último Manuscrito"
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Sinopse (resumo para a IA)</label>
          <textarea
            value={sinopse}
            onChange={e => setSinopse(e.target.value)}
            placeholder="Descreva a atmosfera, personagens e tom do livro em 2-3 frases..."
            rows={4}
            className="w-full resize-none px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Gênero</label>
            <select
              value={genero}
              onChange={e => setGenero(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
            >
              {GENEROS.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Quantidade de opções</label>
            <div className="flex gap-2">
              {([1, 2, 3] as const).map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQtd(n)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${qtd === n ? "bg-brand-primary text-brand-gold border-brand-primary" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
            Imagem de referência <span className="text-zinc-300 normal-case font-normal">(opcional)</span>
          </label>
          <ImageUploadRef onImage={setImagemRef} />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !titulo.trim() || !sinopse.trim()}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? <Spinner /> : <ImageIcon />}
            {loading ? "Gerando capas…" : "Gerar capas com IA"}
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 text-sm text-red-700 mb-6">{error}</div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
          <div className="w-12 h-12 border-4 border-brand-gold/20 border-t-brand-gold rounded-full animate-spin mb-4" />
          <p className="text-sm">Criando capas com IA… pode levar até 30 segundos</p>
        </div>
      )}

      {result && result.imagens.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
            {result.imagens.length} capa{result.imagens.length > 1 ? "s" : ""} gerada{result.imagens.length > 1 ? "s" : ""}
          </p>
          <div className={`grid gap-6 ${result.imagens.length === 1 ? "max-w-xs" : result.imagens.length === 2 ? "grid-cols-2 max-w-lg" : "grid-cols-3"}`}>
            {result.imagens.map((img, i) => (
              <div key={i} className="group relative bg-zinc-100 rounded-2xl overflow-hidden aspect-[2/3] border border-zinc-200">
                <Image
                  src={img.dataUrl}
                  alt={`Capa ${i + 1}`}
                  fill
                  className="object-cover"
                />
                <a
                  href={img.dataUrl}
                  download={`capa-${titulo.toLowerCase().replace(/\s+/g, "-")}-${i + 1}.png`}
                  className="absolute bottom-0 left-0 right-0 bg-brand-primary/90 text-brand-gold text-xs font-semibold text-center py-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ↓ Baixar capa {i + 1}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}
function ImageIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

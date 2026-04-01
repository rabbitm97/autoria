"use client";

import { useState } from "react";
import Image from "next/image";
import type { CapaFerramenta } from "@/app/api/ferramentas/capa/route";
import { ImageUploadRef } from "@/components/image-upload-ref";

// ─── Constants ────────────────────────────────────────────────────────────────

const GENEROS = [
  "Literatura", "Romance", "Ficção científica", "Fantasia",
  "Suspense/Thriller", "Terror", "Autoajuda", "Biografia",
  "Não-ficção", "Infantil",
];

const FORMATOS = [
  { id: "16x23",  label: "16×23 cm",    sub: "Padrão editorial",  w: 16, h: 23   },
  { id: "14x21",  label: "14×21 cm",    sub: "Formato compacto",  w: 14, h: 21   },
  { id: "11x18",  label: "11×18 cm",    sub: "Bolso",             w: 11, h: 18   },
  { id: "20x20",  label: "20×20 cm",    sub: "Quadrado",          w: 20, h: 20   },
  { id: "a4",     label: "A4",          sub: "21×29,7 cm",        w: 21, h: 29.7 },
] as const;

type FormatoId = typeof FORMATOS[number]["id"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapaIAPage() {
  // ── Setup state ─────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"setup" | "form">("setup");
  const [formato, setFormato] = useState<FormatoId | "">("");

  // ── Form state ───────────────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("");
  const [sinopse, setSinopse] = useState("");
  const [genero, setGenero] = useState("Literatura");
  const [qtd, setQtd] = useState<1 | 2 | 3>(2);
  const [imagemRef, setImagemRef] = useState<string | null>(null);
  const [result, setResult] = useState<CapaFerramenta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">
          Ferramentas / IA
        </p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Gerador de Capa IA</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Crie capas profissionais com inteligência artificial. Descreva seu livro e receba opções prontas para publicação.
        </p>
      </div>

      {/* ── Step 1: Setup ─────────────────────────────────────────────────────── */}
      {step === "setup" && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-8 space-y-8">

          {/* Format selection */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Qual o formato do seu livro?
            </p>
            <p className="text-xs text-zinc-400 mb-5">
              O formato define as proporções da capa gerada.
            </p>
            <div className="grid grid-cols-5 gap-3">
              {FORMATOS.map((fmt) => {
                const BOOK_H = 72;
                const bookW = Math.round((fmt.w / fmt.h) * BOOK_H);
                const selected = formato === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setFormato(fmt.id)}
                    className={`flex flex-col items-center gap-3 py-4 px-2 rounded-xl border-2 transition-all ${
                      selected
                        ? "border-brand-gold bg-brand-gold/5"
                        : "border-zinc-200 hover:border-zinc-300 bg-white"
                    }`}
                  >
                    {/* Book silhouette */}
                    <div className="flex items-end justify-center" style={{ height: BOOK_H + 8 }}>
                      <div
                        style={{ width: bookW, height: BOOK_H }}
                        className={`rounded-sm shadow-sm border transition-colors ${
                          selected
                            ? "bg-brand-primary border-brand-primary"
                            : "bg-zinc-100 border-zinc-300"
                        }`}
                      >
                        {/* Spine line */}
                        <div className={`w-[3px] h-full rounded-l-sm ${selected ? "bg-brand-gold/30" : "bg-zinc-200"}`} />
                      </div>
                    </div>
                    {/* Label */}
                    <div className="text-center">
                      <p className={`text-[11px] font-semibold leading-tight ${selected ? "text-brand-gold" : "text-zinc-700"}`}>
                        {fmt.label}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{fmt.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-zinc-100" />

          {/* Cover type */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Você tem uma capa pronta?
            </p>
            <p className="text-xs text-zinc-400 mb-5">
              Envie sua arte ou deixe a IA criar uma exclusiva para você.
            </p>
            <div className="grid grid-cols-3 gap-4">

              {/* Upload full */}
              <div className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-center opacity-50 cursor-not-allowed">
                <UploadIcon />
                <p className="text-xs font-semibold text-zinc-600">Enviar capa completa</p>
                <p className="text-[10px] text-zinc-400 leading-snug">Frente, lombada e verso</p>
                <span className="text-[9px] bg-zinc-200 text-zinc-500 px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">Em breve</span>
              </div>

              {/* Upload front */}
              <div className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-center opacity-50 cursor-not-allowed">
                <UploadIcon />
                <p className="text-xs font-semibold text-zinc-600">Enviar frente</p>
                <p className="text-[10px] text-zinc-400 leading-snug">PNG, JPEG ou PDF</p>
                <span className="text-[9px] bg-zinc-200 text-zinc-500 px-2 py-0.5 rounded-full font-medium uppercase tracking-wide">Em breve</span>
              </div>

              {/* Generate with AI — featured */}
              <button
                type="button"
                onClick={() => {
                  if (!formato) return;
                  setStep("form");
                }}
                disabled={!formato}
                className="flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-brand-primary bg-brand-primary text-white transition-all hover:bg-[#2a2a4e] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <SparkleIcon />
                <p className="text-sm font-semibold">Gerar com IA</p>
                <p className="text-[10px] text-white/70 leading-snug">A IA cria uma capa exclusiva</p>
              </button>

            </div>

            {!formato && (
              <p className="text-xs text-zinc-400 mt-3 text-center">
                Selecione um formato acima para continuar.
              </p>
            )}
          </div>

        </div>
      )}

      {/* ── Step 2: Generate form ──────────────────────────────────────────────── */}
      {step === "form" && (
        <>
          {/* Back + format badge */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => setStep("setup")}
              className="text-zinc-400 hover:text-zinc-700 text-sm flex items-center gap-1 transition-colors"
            >
              ← Voltar
            </button>
            <span className="text-[11px] bg-brand-primary/10 text-brand-primary font-semibold px-3 py-1 rounded-full uppercase tracking-wide">
              {FORMATOS.find(f => f.id === formato)?.label}
            </span>
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
                      className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition-all ${
                        qtd === n
                          ? "bg-brand-primary text-brand-gold border-brand-primary"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Imagem de referência{" "}
                <span className="text-zinc-300 normal-case font-normal">(opcional)</span>
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
              <div className={`grid gap-6 ${
                result.imagens.length === 1 ? "max-w-xs" :
                result.imagens.length === 2 ? "grid-cols-2 max-w-lg" :
                "grid-cols-3"
              }`}>
                {result.imagens.map((img, i) => (
                  <div
                    key={i}
                    className="group relative bg-zinc-100 rounded-2xl overflow-hidden border border-zinc-200"
                    style={{
                      aspectRatio: (() => {
                        const fmt = FORMATOS.find(f => f.id === formato);
                        return fmt ? `${fmt.w}/${fmt.h}` : "2/3";
                      })(),
                    }}
                  >
                    <Image src={img.dataUrl} alt={`Capa ${i + 1}`} fill className="object-cover" />
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
        </>
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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
function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}

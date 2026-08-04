"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  FORMATOS_LIVRO,
  estimarPaginas,
  PAPEIS_CALCULADORA,
  estimarLombadaPapelMm,
} from "@/lib/formatos";

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtMm(v: number): string {
  return v.toFixed(1).replace(".", ",") + " mm";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LombadaPaginasPage() {
  // Cálculo principal
  const [paginas, setPaginas] = useState<string>("200");
  const [papelId, setPapelId] = useState<string>("offset_75");
  const [copied, setCopied] = useState(false);

  // Estimador de texto
  const [texto, setTexto] = useState<string>("");
  const [caracteres, setCaracteres] = useState<string>("");
  const [corpoPt, setCorpoPt] = useState<number>(11);

  const paginasInputRef = useRef<HTMLInputElement>(null);

  const papel = PAPEIS_CALCULADORA.find(p => p.id === papelId) ?? PAPEIS_CALCULADORA[0];
  const paginasNum = parseInt(paginas, 10);
  const paginasValid = Number.isFinite(paginasNum) && paginasNum > 0;
  const lombadaMm = paginasValid ? estimarLombadaPapelMm(paginasNum, papel) : 0;

  const numCaracteresEfetivo = (() => {
    const cParsed = parseInt(caracteres, 10);
    if (Number.isFinite(cParsed) && cParsed > 0) return cParsed;
    return texto.length;
  })();

  const podeEstimar = numCaracteresEfetivo > 0;

  const onColarTexto = useCallback((valor: string) => {
    setTexto(valor);
    setCaracteres(String(valor.length));
  }, []);

  const onEditarCaracteres = useCallback((valor: string) => {
    setCaracteres(valor);
    if (texto.length > 0) setTexto("");
  }, [texto.length]);

  async function copiarLombada() {
    if (!paginasValid) return;
    await navigator.clipboard.writeText(fmtMm(lombadaMm));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function usarPaginas(n: number) {
    setPaginas(String(n));
    paginasInputRef.current?.focus();
    paginasInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div>
      <main className="max-w-3xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Ferramenta
          </p>
          <h1 className="font-heading text-3xl text-brand-primary mb-2">
            Lombada e estimativa de páginas
          </h1>
          <p className="text-zinc-500 text-sm">
            Calcule a lombada do seu livro pelo papel e, se ainda não tiver o
            miolo pronto, estime quantas páginas o texto vai render.
          </p>
        </div>

        {/* Card principal — cálculo de lombada */}
        <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
          <h2 className="font-heading text-lg text-brand-primary mb-5">
            Cálculo de lombada
          </h2>

          <div className="grid md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
                Quantidade de páginas
              </label>
              <input
                ref={paginasInputRef}
                type="number"
                min={0}
                inputMode="numeric"
                value={paginas}
                onChange={(e) => setPaginas(e.target.value)}
                className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
                placeholder="200"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
                Papel
              </label>
              <select
                value={papelId}
                onChange={(e) => setPapelId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 bg-white"
              >
                {PAPEIS_CALCULADORA.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-brand-primary/5 rounded-xl border border-brand-primary/10 px-5 py-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wide font-medium mb-1">
                Lombada
              </p>
              <p className="font-heading text-4xl text-brand-primary leading-none">
                {paginasValid ? fmtMm(lombadaMm) : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={copiarLombada}
              disabled={!paginasValid}
              className="rounded-xl border border-zinc-200 bg-white hover:border-brand-gold/40 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all px-4 py-2 text-xs font-semibold text-zinc-600"
            >
              {copied ? "✓ Copiado!" : "Copiar"}
            </button>
          </div>

          <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
            Cálculo com os papéis disponíveis na nossa gráfica. A medida final é
            confirmada na prova.
          </p>
        </section>

        {/* Card secundário — estimador de páginas por texto */}
        <section className="bg-white rounded-2xl border border-zinc-100 p-6">
          <h2 className="font-heading text-lg text-brand-primary mb-1">
            Não sabe quantas páginas?
          </h2>
          <p className="text-xs text-zinc-500 mb-5">
            Cole o texto do seu livro (ou informe o total de caracteres) e veja a
            estimativa por formato.
          </p>

          <div className="mb-4">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
              Texto do livro
            </label>
            <textarea
              value={texto}
              onChange={(e) => onColarTexto(e.target.value)}
              rows={5}
              className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 resize-y"
              placeholder="Cole aqui o texto completo do manuscrito…"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-5 mb-5">
            <div>
              <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
                Total de caracteres
              </label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={caracteres}
                onChange={(e) => onEditarCaracteres(e.target.value)}
                className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
                placeholder={texto.length > 0 ? String(texto.length) : "0"}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
                  Corpo do texto
                </label>
                <span className="text-sm font-mono text-zinc-600">
                  {corpoPt.toFixed(1)} pt
                </span>
              </div>
              <input
                type="range"
                min={9}
                max={14}
                step={0.5}
                value={corpoPt}
                onChange={(e) => setCorpoPt(parseFloat(e.target.value))}
                className="w-full mt-3 h-2 rounded-full appearance-none cursor-pointer bg-zinc-200 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-gold [&::-webkit-slider-thumb]:shadow-sm"
              />
            </div>
          </div>

          {podeEstimar ? (
            <div className="rounded-xl border border-zinc-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-zinc-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-2 text-xs uppercase tracking-wide">Formato</th>
                    <th className="text-left font-medium px-4 py-2 text-xs uppercase tracking-wide">Dimensões</th>
                    <th className="text-right font-medium px-4 py-2 text-xs uppercase tracking-wide">Páginas</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {FORMATOS_LIVRO.map(f => {
                    const pgs = estimarPaginas(f.specs, corpoPt, numCaracteresEfetivo);
                    return (
                      <tr key={f.value} className="border-t border-zinc-100">
                        <td className="px-4 py-3 text-brand-primary">{f.label}</td>
                        <td className="px-4 py-3 text-zinc-500">{f.dimensoes}</td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-700">{pgs}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => usarPaginas(pgs)}
                            className="text-xs font-semibold text-brand-gold hover:underline underline-offset-4"
                          >
                            Usar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">
              Cole texto ou informe a quantidade de caracteres para ver a estimativa.
            </div>
          )}

          <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
            Estimativa. A contagem final de páginas sai na diagramação.
          </p>
        </section>

        <div className="mt-6 text-center">
          <Link
            href="/dashboard/ferramentas"
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-4"
          >
            ← Voltar às ferramentas
          </Link>
        </div>
      </main>
    </div>
  );
}

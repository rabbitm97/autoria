"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { PdfResult, Formato } from "@/app/api/agentes/gerar-pdf/route";
import type { EpubResult } from "@/app/api/agentes/gerar-epub/route";

// ─── Format options ────────────────────────────────────────────────────────────

const FORMATOS: { id: Formato; label: string; desc: string }[] = [
  { id: "kdp_6x9",  label: "KDP 6×9 pol.",    desc: "Amazon Kindle Direct Publishing — padrão para ficção e não-ficção" },
  { id: "a5",       label: "A5",               desc: "Formato europeu — 14,8 × 21 cm" },
  { id: "letter",   label: "Carta (8,5×11)",   desc: "Formato americano — relatórios e livros técnicos" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiagramacaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [formato, setFormato] = useState<Formato>("kdp_6x9");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingEpub, setGeneratingEpub] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [epubResult, setEpubResult] = useState<EpubResult | null>(null);

  // ── Load existing PDF + EPUB ─────────────────────────────────────────────
  const loadExisting = useCallback(async () => {
    setLoading(true);
    try {
      const [pdfRes, epubRes] = await Promise.all([
        fetch(`/api/agentes/gerar-pdf?project_id=${id}`),
        fetch(`/api/agentes/gerar-epub?project_id=${id}`),
      ]);
      if (pdfRes.ok)  { const d = await pdfRes.json();  if (d) setResult(d as PdfResult); }
      if (epubRes.ok) { const d = await epubRes.json(); if (d) setEpubResult(d as EpubResult); }
    } catch { /* no existing files */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  // ── Generate PDF ─────────────────────────────────────────────────────────
  async function handleGerar() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/gerar-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, formato }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar PDF");
      setResult(data as PdfResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGenerating(false);
    }
  }

  // ── Generate EPUB ────────────────────────────────────────────────────────
  async function handleGerarEpub() {
    setGeneratingEpub(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/gerar-epub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar EPUB");
      setEpubResult(data as EpubResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGeneratingEpub(false);
    }
  }

  // ── Continue to QA ───────────────────────────────────────────────────────
  async function handleContinuar() {
    await supabase
      .from("projects")
      .update({ etapa_atual: "preview" })
      .eq("id", id);
    router.push(`/dashboard/qa/${id}`);
  }

  // ── Format label ─────────────────────────────────────────────────────────
  const formatoInfo = FORMATOS.find(f => f.id === (result?.formato ?? formato));

  return (
    <div className="min-h-screen bg-brand-surface">

      {/* Header */}
      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-brand-gold/60 hover:text-brand-gold transition-colors">
            Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-brand-gold/80">Diagramação</span>
        </div>
      </header>

      <EtapasProgress currentStep={4} />

      <main className="max-w-4xl mx-auto px-4 py-10">

        {/* Title */}
        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 5 — Diagramação
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Geração do PDF final
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed">
            O sistema formata seu manuscrito em um PDF profissional pronto para impressão e publicação digital.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Format selector */}
            {!result && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">
                  Formato de saída
                </p>
                <div className="space-y-3">
                  {FORMATOS.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFormato(f.id)}
                      className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-colors
                        ${formato === f.id
                          ? "border-brand-gold bg-brand-gold/5"
                          : "border-zinc-200 hover:border-brand-gold/30"}`}
                    >
                      <span className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center
                        ${formato === f.id ? "border-brand-gold" : "border-zinc-300"}`}
                      >
                        {formato === f.id && (
                          <span className="w-2 h-2 rounded-full bg-brand-gold block" />
                        )}
                      </span>
                      <div>
                        <p className={`text-sm font-medium ${formato === f.id ? "text-brand-primary" : "text-zinc-700"}`}>
                          {f.label}
                        </p>
                        <p className="text-xs text-zinc-400 mt-0.5">{f.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-6">
                {error}
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <PdfIcon />
                  </div>
                  <div>
                    <p className="font-medium text-brand-primary text-sm">PDF gerado com sucesso</p>
                    <p className="text-xs text-zinc-400">
                      Formato: {formatoInfo?.label} · Gerado em {new Date(result.gerado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href={result.url_download}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors"
                  >
                    <DownloadIcon />
                    Baixar PDF
                  </a>
                  <button
                    onClick={handleGerar}
                    disabled={generating}
                    className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-brand-gold/30 transition-colors disabled:opacity-50"
                  >
                    Regenerar
                  </button>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-100">
                  <p className="text-xs text-zinc-400 mb-3">
                    O link de download expira em 1 hora. Baixe agora ou regenere depois.
                  </p>
                </div>
              </div>
            )}

            {/* EPUB card — shown once PDF exists */}
            {result && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                    <EpubIcon />
                  </div>
                  <div>
                    <p className="font-medium text-brand-primary text-sm">EPUB — e-readers e Kindle</p>
                    <p className="text-xs text-zinc-400">
                      {epubResult
                        ? `${epubResult.capitulos} capítulo${epubResult.capitulos !== 1 ? "s" : ""} · Gerado em ${new Date(epubResult.gerado_em).toLocaleString("pt-BR")}`
                        : "Gera um arquivo compatível com Amazon Kindle, Apple Books e Kobo."}
                    </p>
                  </div>
                </div>

                {epubResult ? (
                  <div className="flex gap-3">
                    <a
                      href={epubResult.url_download}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 text-white font-medium text-sm hover:bg-violet-700 transition-colors"
                    >
                      <DownloadIcon />
                      Baixar EPUB
                    </a>
                    <button
                      onClick={handleGerarEpub}
                      disabled={generatingEpub}
                      className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-violet-300 transition-colors disabled:opacity-50"
                    >
                      Regenerar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGerarEpub}
                    disabled={generatingEpub}
                    className="w-full py-3 rounded-xl border border-violet-200 text-violet-700 font-medium text-sm hover:bg-violet-50 transition-colors disabled:opacity-50"
                  >
                    {generatingEpub ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                        Gerando EPUB…
                      </span>
                    ) : "Gerar EPUB"}
                  </button>
                )}
              </div>
            )}

            {/* Continue button — shows when PDF exists */}
            {result && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-4">
                <p className="text-xs text-zinc-400 mb-3 text-center">
                  Links expiram em 1 hora. Você pode regenerar a qualquer momento.
                </p>
                <button
                  onClick={handleContinuar}
                  className="w-full py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm hover:bg-brand-gold/90 transition-colors"
                >
                  Continuar → QA
                </button>
              </div>
            )}

            {/* Generate PDF button — shows when no PDF yet */}
            {!result && (
              <button
                onClick={handleGerar}
                disabled={generating}
                className="w-full py-4 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                  hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                    Gerando PDF… pode levar até 30s
                  </span>
                ) : (
                  "Gerar PDF profissional"
                )}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-emerald-600">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function EpubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-violet-600">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="9" y1="7" x2="15" y2="7"/>
      <line x1="9" y1="11" x2="15" y2="11"/>
    </svg>
  );
}

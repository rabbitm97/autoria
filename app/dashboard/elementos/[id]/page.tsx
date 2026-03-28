"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { ElementosEditoriais } from "@/app/api/elementos-editoriais/route";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = ["Upload", "Diagnóstico", "Revisão", "Capa", "Diagramação", "Publicação"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ElementosPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [elementos, setElementos] = useState<ElementosEditoriais | null>(null);
  const [manuscritoNome, setManuscritoNome] = useState("");
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable state
  const [sinopseCurta, setSinopseCurta] = useState("");
  const [sinopseLonga, setSinopseLonga] = useState("");
  const [tituloSelecionado, setTituloSelecionado] = useState(0);
  const [ficha, setFicha] = useState("");

  const populateFields = useCallback((el: ElementosEditoriais) => {
    setElementos(el);
    setSinopseCurta(el.sinopse_curta);
    setSinopseLonga(el.sinopse_longa);
    setTituloSelecionado(0);
    setFicha(el.ficha_catalografica);
  }, []);

  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_elementos, manuscripts(nome)")
      .eq("id", projectId)
      .single();

    if (project) {
      const el = project.dados_elementos as ElementosEditoriais | null;
      if (el) populateFields(el);
      setManuscritoNome(
        (project.manuscripts as unknown as { nome: string } | null)?.nome ?? "Manuscrito"
      );
    }
    setLoading(false);
  }, [projectId, populateFields]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function triggerElementos() {
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch("/api/elementos-editoriais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao gerar elementos.");
      } else {
        populateFields(data.elementos as ElementosEditoriais);
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setTriggering(false);
    }
  }

  async function salvarElementos() {
    if (!elementos) return;
    setSaving(true);
    setError(null);
    try {
      const { error: saveErr } = await supabase
        .from("projects")
        .update({
          dados_elementos: {
            ...elementos,
            sinopse_curta: sinopseCurta,
            sinopse_longa: sinopseLonga,
            ficha_catalografica: ficha,
            titulo_escolhido: elementos.opcoes_titulo[tituloSelecionado],
            salvo_em: new Date().toISOString(),
          },
          etapa_atual: "capa",
        })
        .eq("id", projectId);

      if (saveErr) throw saveErr;
      router.push(`/dashboard`);
    } catch {
      setError("Falha ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-brand-surface">

      {/* Header */}
      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-brand-gold/60 hover:text-brand-gold transition-colors">
            Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-brand-surface/50 max-w-[160px] truncate">{manuscritoNome}</span>
          <span className="text-white/20">/</span>
          <span className="text-brand-gold/80">Elementos</span>
        </div>
      </header>

      {/* Step indicator */}
      <div className="bg-brand-primary border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <ol className="flex items-center overflow-x-auto">
            {STEPS.map((step, i) => {
              const done   = i < 3;
              const active = i === 3;
              return (
                <li key={step} className="flex items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${done   ? "bg-emerald-500 text-white" :
                        active ? "bg-brand-gold text-brand-primary" :
                                 "bg-white/10 text-white/30"}`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className={`text-xs
                      ${done   ? "text-emerald-400" :
                        active ? "text-brand-gold font-medium" :
                                 "text-white/30"}`}
                    >
                      {step}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="mx-3 text-white/10 text-xs">›</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mb-4" />
            <p className="text-zinc-400 text-sm">Carregando…</p>
          </div>
        ) : !elementos ? (
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mx-auto mb-6">
              <FileTextIcon />
            </div>
            <h1 className="font-heading text-3xl text-brand-primary mb-3">
              Elementos editoriais
            </h1>
            <p className="text-zinc-500 leading-relaxed mb-8">
              A IA irá gerar sinopses, opções de título, palavras-chave para Amazon KDP
              e ficha catalográfica no padrão CBL — tudo editável.
            </p>
            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={triggerElementos}
              disabled={triggering}
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Gerando elementos…
                </>
              ) : (
                <>Gerar elementos editoriais →</>
              )}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
                Elementos editoriais
              </p>
              <h1 className="font-heading text-3xl text-brand-primary">{manuscritoNome}</h1>
              <p className="text-zinc-400 text-sm mt-1">
                Edite os campos abaixo e clique em Salvar.
              </p>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-6 mb-10">
              {/* Título */}
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <h2 className="font-heading text-lg text-brand-primary mb-4">Escolha o título</h2>
                <div className="space-y-2">
                  {elementos.opcoes_titulo.map((titulo, i) => (
                    <label key={i} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="titulo"
                        checked={tituloSelecionado === i}
                        onChange={() => setTituloSelecionado(i)}
                        className="w-4 h-4 accent-brand-gold"
                      />
                      <span className={`text-sm ${tituloSelecionado === i ? "font-semibold text-brand-primary" : "text-zinc-600"}`}>
                        {titulo}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Sinopse curta */}
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <h2 className="font-heading text-lg text-brand-primary mb-1">Sinopse curta</h2>
                <p className="text-zinc-400 text-xs mb-3">Para Amazon, redes sociais e capa traseira — máx. 60 palavras</p>
                <textarea
                  value={sinopseCurta}
                  onChange={(e) => setSinopseCurta(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold/40 transition-all"
                />
                <p className="text-zinc-300 text-xs mt-1 text-right">
                  {sinopseCurta.trim().split(/\s+/).filter(Boolean).length} palavras
                </p>
              </div>

              {/* Sinopse longa */}
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <h2 className="font-heading text-lg text-brand-primary mb-1">Sinopse longa</h2>
                <p className="text-zinc-400 text-xs mb-3">Para a página do produto — aprox. 150-200 palavras</p>
                <textarea
                  value={sinopseLonga}
                  onChange={(e) => setSinopseLonga(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold/40 transition-all"
                />
                <p className="text-zinc-300 text-xs mt-1 text-right">
                  {sinopseLonga.trim().split(/\s+/).filter(Boolean).length} palavras
                </p>
              </div>

              {/* Keywords */}
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <h2 className="font-heading text-lg text-brand-primary mb-1">Palavras-chave Amazon KDP</h2>
                <p className="text-zinc-400 text-xs mb-4">10 keywords para maximizar descoberta</p>
                <div className="flex flex-wrap gap-2">
                  {elementos.palavras_chave.map((kw, i) => (
                    <span
                      key={i}
                      className="bg-brand-primary/5 text-brand-primary text-xs font-medium px-3 py-1.5 rounded-full border border-brand-primary/10"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Ficha catalográfica */}
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <h2 className="font-heading text-lg text-brand-primary mb-1">Ficha catalográfica</h2>
                <p className="text-zinc-400 text-xs mb-3">Padrão CBL — obrigatório para impressão</p>
                <textarea
                  value={ficha}
                  onChange={(e) => setFicha(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold/40 transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200">
              <button
                onClick={triggerElementos}
                disabled={triggering}
                className="px-4 py-2 text-sm border border-zinc-200 rounded-xl text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-50"
              >
                {triggering ? "Gerando…" : "Regenerar"}
              </button>
              <button
                onClick={salvarElementos}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all whitespace-nowrap disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar e continuar →"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function FileTextIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

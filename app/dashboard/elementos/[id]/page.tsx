"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import { EscolhaFormato } from "@/components/escolha-formato";
import type { ElementosEditoriais } from "@/app/api/agentes/elementos-editoriais/route";
import type { FormatoSugerido } from "@/app/api/agentes/diagnostico/route";
import type { FormatoLivro } from "@/lib/formatos";
import { supabase } from "@/lib/supabase";

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
  const [formato, setFormato] = useState<FormatoLivro | null>(null);
  const [formatoLocked, setFormatoLocked] = useState(false);
  const [sugestaoFormato, setSugestaoFormato] = useState<FormatoSugerido | null>(null);

  // Editable state
  const [sinopseCurta, setSinopseCurta] = useState("");
  const [sinopseLonga, setSinopseLonga] = useState("");
  const [ficha, setFicha] = useState("");

  const populateFields = useCallback((el: ElementosEditoriais) => {
    setElementos(el);
    setSinopseCurta(el.sinopse_curta);
    setSinopseLonga(el.sinopse_longa);
    setFicha(el.ficha_catalografica);
  }, []);

  const loadData = useCallback(async () => {
    const [projRes, fmtRes] = await Promise.all([
      supabase
        .from("projects")
        .select("dados_elementos, diagnostico, manuscripts(nome, titulo)")
        .eq("id", projectId)
        .single(),
      fetch(`/api/projects/${projectId}/formato`).then(r => r.json()).catch(() => null),
    ]);

    if (projRes.data) {
      const el = projRes.data.dados_elementos as ElementosEditoriais | null;
      if (el) populateFields(el);
      const ms = projRes.data.manuscripts as unknown as { nome?: string; titulo?: string | null } | null;
      setManuscritoNome((ms?.titulo?.trim()) || ms?.nome || "Manuscrito");

      const diag = projRes.data.diagnostico as {
        status?: string;
        resultado?: { formato_sugerido?: FormatoSugerido };
      } | null;
      if (diag?.status === "concluido" && diag.resultado?.formato_sugerido) {
        setSugestaoFormato(diag.resultado.formato_sugerido);
      }
    }

    if (fmtRes) {
      setFormato((fmtRes as { formato: FormatoLivro | null }).formato);
      setFormatoLocked(!!(fmtRes as { locked: boolean }).locked);
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
      const res = await fetch("/api/agentes/elementos-editoriais", {
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
            salvo_em: new Date().toISOString(),
          },
          etapa_atual: "capa",
        })
        .eq("id", projectId);

      if (saveErr) throw saveErr;
      router.push(`/dashboard/capa/${projectId}`);
    } catch {
      setError("Falha ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>

      <EtapasProgress currentStep={2} projectId={projectId} />

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
              A IA irá gerar sinopses, palavras-chave para Amazon KDP
              e sugestão de ficha catalográfica — tudo editável.
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
              {/* Formato do livro */}
              <div className="bg-white rounded-2xl border border-zinc-100 p-6">
                <h2 className="font-heading text-lg text-brand-primary mb-1">Formato do livro</h2>
                <p className="text-zinc-400 text-xs mb-4">
                  Define as dimensões físicas do miolo, capa e PDF. Bloqueado após a capa ser gerada.
                </p>

                {sugestaoFormato && !formatoLocked && (
                  sugestaoFormato.formato === null ? (
                    <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-900 mb-1">
                        Escolha manual recomendada
                      </p>
                      <p className="text-sm text-amber-800 leading-relaxed">
                        {sugestaoFormato.motivo}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-4 bg-brand-gold/5 border border-brand-gold/20 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-brand-gold text-lg leading-none mt-0.5">✦</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold mb-1">
                            Sugestão do diagnóstico
                          </p>
                          <p className="text-sm font-medium text-brand-primary mb-1">
                            {sugestaoFormato.label}
                          </p>
                          <p className="text-xs text-zinc-600 leading-relaxed mb-2">
                            {sugestaoFormato.motivo}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Estimativa: ~{sugestaoFormato.paginas_estimadas} páginas · lombada {sugestaoFormato.lombada_mm.toFixed(1)} mm
                          </p>
                          {sugestaoFormato.aviso && (
                            <p className="text-[11px] text-amber-700 mt-1.5">⚠ {sugestaoFormato.aviso}</p>
                          )}
                          <p className="text-[10px] text-zinc-400 italic mt-2 leading-relaxed">
                            Estimativa considera corpo do texto em 11pt (padrão editorial). O número final de páginas será calculado após a diagramação.
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                )}

                <EscolhaFormato
                  projectId={projectId}
                  initialFormato={formato}
                  sugestao={sugestaoFormato?.formato ?? null}
                  locked={formatoLocked}
                  onSaved={setFormato}
                />
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

              {/* Sugestão de ficha catalográfica — gerada na etapa de Créditos (ABNT NBR 6029) */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 flex items-start gap-3">
                <span className="text-lg mt-0.5">📑</span>
                <div>
                  <p className="text-sm font-medium text-zinc-700">Sugestão de ficha catalográfica</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Gerada na etapa <strong>Créditos</strong> na estrutura ABNT NBR 6029, como sugestão editável.
                  </p>
                </div>
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

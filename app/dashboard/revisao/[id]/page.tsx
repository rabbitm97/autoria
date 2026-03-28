"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import type { SugestaoRevisao, RevisaoResult } from "@/app/api/revisao/route";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<SugestaoRevisao["tipo"], { label: string; color: string; bg: string }> = {
  gramatica:   { label: "Gramática",   color: "text-red-700",    bg: "bg-red-50 border-red-200"       },
  ortografia:  { label: "Ortografia",  color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  estilo:      { label: "Estilo",      color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
  coesao:      { label: "Coesão",      color: "text-blue-700",   bg: "bg-blue-50 border-blue-200"     },
  clareza:     { label: "Clareza",     color: "text-amber-700",  bg: "bg-amber-50 border-amber-200"   },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SugestaoCard({
  sugestao,
  aceita,
  rejeitada,
  onAceitar,
  onRejeitar,
}: {
  sugestao: SugestaoRevisao;
  aceita: boolean;
  rejeitada: boolean;
  onAceitar: () => void;
  onRejeitar: () => void;
}) {
  const tipo = TIPO_LABEL[sugestao.tipo] ?? TIPO_LABEL.clareza;

  return (
    <div
      className={`rounded-2xl border p-5 transition-all ${
        aceita
          ? "border-emerald-200 bg-emerald-50 opacity-80"
          : rejeitada
          ? "border-zinc-100 bg-white opacity-40"
          : "border-zinc-100 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${tipo.bg} ${tipo.color}`}>
          {tipo.label}
        </span>
        {aceita && (
          <span className="text-emerald-600 text-xs font-medium flex items-center gap-1">
            <CheckIcon /> Aceita
          </span>
        )}
        {rejeitada && (
          <span className="text-zinc-400 text-xs font-medium">Rejeitada</span>
        )}
      </div>

      <div className="space-y-2 mb-3">
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <p className="text-xs text-red-400 font-medium uppercase tracking-wide mb-1">Original</p>
          <p className="text-sm text-red-800 line-through leading-relaxed">
            {sugestao.trecho_original}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <p className="text-xs text-emerald-500 font-medium uppercase tracking-wide mb-1">Sugestão</p>
          <p className="text-sm text-emerald-800 leading-relaxed">{sugestao.sugestao}</p>
        </div>
      </div>

      <p className="text-xs text-zinc-500 leading-relaxed mb-4">{sugestao.explicacao}</p>

      {!aceita && !rejeitada && (
        <div className="flex gap-2">
          <button
            onClick={onAceitar}
            className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
          >
            Aceitar
          </button>
          <button
            onClick={onRejeitar}
            className="flex-1 py-2 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-semibold hover:border-zinc-300 hover:text-zinc-700 transition-colors"
          >
            Rejeitar
          </button>
        </div>
      )}

      {(aceita || rejeitada) && (
        <button
          onClick={aceita ? onRejeitar : onAceitar}
          className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 transition-colors"
        >
          {aceita ? "Desfazer aceitação" : "Aceitar afinal"}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RevisaoPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();

  const [revisao, setRevisao] = useState<RevisaoResult | null>(null);
  const [manuscritoNome, setManuscritoNome] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aceitas, setAceitas] = useState<Set<string>>(new Set());
  const [rejeitadas, setRejeitadas] = useState<Set<string>>(new Set());

  // Load initial data
  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_revisao, manuscripts(nome)")
      .eq("id", projectId)
      .single();

    if (project) {
      const rev = project.dados_revisao as RevisaoResult | null;
      setRevisao(rev);
      setManuscritoNome(
        (project.manuscripts as unknown as { nome: string } | null)?.nome ?? "Manuscrito"
      );
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function triggerRevisao() {
    setTriggering(true);
    setError(null);
    try {
      const res = await fetch("/api/revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao iniciar revisão.");
      } else {
        setRevisao(data.revisao as RevisaoResult);
        setAceitas(new Set());
        setRejeitadas(new Set());
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setTriggering(false);
    }
  }

  function aceitarTodas() {
    if (!revisao) return;
    setAceitas(new Set(revisao.sugestoes.map((s) => s.id)));
    setRejeitadas(new Set());
  }

  async function finalizarRevisao() {
    if (!revisao) return;
    setSaving(true);
    try {
      const { error: saveErr } = await supabase
        .from("projects")
        .update({
          dados_revisao: {
            ...revisao,
            aceitas: Array.from(aceitas),
            rejeitadas: Array.from(rejeitadas),
            finalizado_em: new Date().toISOString(),
          },
          etapa_atual: "sinopse_ficha",
        })
        .eq("id", projectId);

      if (saveErr) throw saveErr;
      router.push(`/dashboard/elementos/${projectId}`);
    } catch {
      setError("Falha ao salvar revisão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const aceitasCount = aceitas.size;
  const rejeitadasCount = rejeitadas.size;
  const totalCount = revisao?.sugestoes.length ?? 0;

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
          <span className="text-brand-gold/80">Revisão</span>
        </div>
      </header>

      <EtapasProgress currentStep={1} />

      <main className="max-w-4xl mx-auto px-4 py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mb-4" />
            <p className="text-zinc-400 text-sm">Carregando…</p>
          </div>
        ) : !revisao ? (
          /* No revision yet — show trigger */
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mx-auto mb-6">
              <EditIcon />
            </div>
            <h1 className="font-heading text-3xl text-brand-primary mb-3">
              Revisão editorial
            </h1>
            <p className="text-zinc-500 leading-relaxed mb-8">
              A IA irá revisar seu manuscrito para gramática, ortografia, estilo
              e coesão — preservando sua voz como autor.
            </p>
            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={triggerRevisao}
              disabled={triggering}
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Analisando com IA…
                </>
              ) : (
                <>Iniciar revisão →</>
              )}
            </button>
            <p className="text-zinc-400 text-xs mt-4">
              Leva cerca de 30–60 segundos dependendo do tamanho do manuscrito.
            </p>
          </div>
        ) : (
          /* Revision results */
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
                  Revisão completa
                </p>
                <h1 className="font-heading text-3xl text-brand-primary">{manuscritoNome}</h1>
                <p className="text-zinc-400 text-sm mt-1">
                  {totalCount} sugestões · {aceitasCount} aceitas · {rejeitadasCount} rejeitadas
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={aceitarTodas}
                  className="px-4 py-2 text-sm border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 transition-colors"
                >
                  Aceitar todas
                </button>
                <button
                  onClick={triggerRevisao}
                  disabled={triggering}
                  className="px-4 py-2 text-sm border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 transition-colors disabled:opacity-50"
                >
                  {triggering ? "Analisando…" : "Nova análise"}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {revisao.sugestoes.map((s) => (
                <SugestaoCard
                  key={s.id}
                  sugestao={s}
                  aceita={aceitas.has(s.id)}
                  rejeitada={rejeitadas.has(s.id)}
                  onAceitar={() => {
                    setAceitas((prev) => new Set([...prev, s.id]));
                    setRejeitadas((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
                  }}
                  onRejeitar={() => {
                    setRejeitadas((prev) => new Set([...prev, s.id]));
                    setAceitas((prev) => { const n = new Set(prev); n.delete(s.id); return n; });
                  }}
                />
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200">
              <p className="text-zinc-400 text-sm">
                Aceite as sugestões desejadas e clique em Finalizar para continuar.
              </p>
              <button
                onClick={finalizarRevisao}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all whitespace-nowrap disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Finalizar revisão →"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

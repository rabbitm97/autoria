"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { QAResult, QAItem, QACategoria } from "@/app/api/agentes/qa/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<QACategoria, string> = {
  texto:       "Texto",
  metadados:   "Metadados",
  capa:        "Capa",
  diagramacao: "Diagramação",
};

const STATUS_STYLE = {
  ok:    { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100" },
  aviso: { dot: "bg-amber-400",   text: "text-amber-700",   bg: "bg-amber-50 border-amber-100"   },
  erro:  { dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50 border-red-100"       },
};

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={96} height={96} viewBox="0 0 96 96">
      <circle cx={48} cy={48} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform="rotate(-90 48 48)" />
      <text x={48} y={48} dominantBaseline="middle" textAnchor="middle"
        fontSize={20} fontWeight="bold" fill={color} fontFamily="sans-serif">{score}</text>
    </svg>
  );
}

// ─── 3D Book viewer ───────────────────────────────────────────────────────────

interface BookData {
  coverUrl: string | null;
  titulo: string;
  autor: string;
  lombadaMm: number;
  paginas: number;
}

function Book3D({ book, approved, onApprove }: {
  book: BookData;
  approved: boolean;
  onApprove: () => void;
}) {
  const [angle, setAngle] = useState(25); // degrees Y rotation
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);

  // Dimensions in px (scaled down for display)
  const SCALE = 2.2; // px per mm
  const bookW = Math.round(160 * SCALE);
  const bookH = Math.round(230 * SCALE);
  const spineW = Math.max(12, Math.round(book.lombadaMm * SCALE));

  function onMouseDown(e: React.MouseEvent) {
    setDragging(true);
    setStartX(e.clientX);
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const delta = e.clientX - startX;
    setAngle(a => Math.max(-60, Math.min(80, a + delta * 0.4)));
    setStartX(e.clientX);
  }
  function onMouseUp() { setDragging(false); }

  function onTouchStart(e: React.TouchEvent) {
    setDragging(true);
    setStartX(e.touches[0].clientX);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startX;
    setAngle(a => Math.max(-60, Math.min(80, a + delta * 0.4)));
    setStartX(e.touches[0].clientX);
  }

  const perspDist = 900;

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs text-zinc-400">Arraste para girar o livro</p>

      {/* 3D scene */}
      <div
        className="relative select-none"
        style={{ perspective: perspDist, width: bookW + spineW + 60, height: bookH + 40 }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
      >
        <div
          className="relative cursor-grab active:cursor-grabbing"
          style={{
            transformStyle: "preserve-3d",
            transform: `translateX(${spineW / 2}px) rotateY(${angle}deg)`,
            transition: dragging ? "none" : "transform 0.3s ease",
            width: bookW,
            height: bookH,
            margin: "20px auto",
          }}
        >
          {/* Front cover */}
          <div
            style={{
              position: "absolute",
              width: bookW, height: bookH,
              backfaceVisibility: "hidden",
              transformOrigin: "left center",
            }}
            className="rounded-r-sm shadow-2xl overflow-hidden"
          >
            {book.coverUrl ? (
              <img src={book.coverUrl} alt="Capa" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand-primary flex flex-col items-center justify-center gap-4 p-6">
                <p className="text-brand-gold text-center font-heading text-lg leading-tight">
                  {book.titulo}
                </p>
                <p className="text-white/60 text-sm text-center">{book.autor}</p>
              </div>
            )}
          </div>

          {/* Spine */}
          <div
            style={{
              position: "absolute",
              width: spineW,
              height: bookH,
              left: -spineW,
              transform: "rotateY(-90deg)",
              transformOrigin: "right center",
              backfaceVisibility: "hidden",
              background: "linear-gradient(to right, #0f172a, #1e2a4a, #0f172a)",
            }}
            className="flex items-center justify-center shadow-inner"
          >
            <div className="transform -rotate-90 whitespace-nowrap overflow-hidden"
              style={{ maxWidth: bookH - 16 }}>
              <span className="text-brand-gold font-bold text-xs tracking-widest">
                {book.titulo}
              </span>
              <span className="text-white/50 text-[9px] ml-3">{book.autor}</span>
            </div>
          </div>

          {/* Back cover */}
          <div
            style={{
              position: "absolute",
              width: bookW, height: bookH,
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
              background: "linear-gradient(135deg, #1e2a4a 0%, #0f172a 100%)",
            }}
            className="rounded-l-sm shadow-inner flex flex-col items-center justify-center p-6"
          >
            <div className="w-16 h-1 bg-brand-gold/40 mb-4 rounded-full" />
            <p className="text-white/40 text-xs text-center">Verso da capa</p>
            <p className="text-white/20 text-[10px] text-center mt-2">{book.paginas} páginas</p>
          </div>
        </div>
      </div>

      {/* Book info */}
      <div className="text-center space-y-1">
        <p className="font-heading text-lg text-brand-primary">{book.titulo}</p>
        <p className="text-sm text-zinc-500">{book.autor}</p>
        <p className="text-xs text-zinc-400">
          {book.paginas} páginas · Lombada {book.lombadaMm}mm
        </p>
      </div>

      {/* Approval */}
      {!approved ? (
        <button
          onClick={onApprove}
          className="px-8 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm
            hover:bg-emerald-600 transition-colors shadow-sm"
        >
          Aprovar modelo final
        </button>
      ) : (
        <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          Modelo aprovado
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QAPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<QAResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [mioloPreviewUrl, setMioloPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"capa" | "interior">("capa");
  const [modelApproved, setModelApproved] = useState(false);
  const [approvingPub, setApprovingPub] = useState(false);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    try {
      // Load QA result
      const res = await fetch(`/api/agentes/qa?project_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data) setResult(data as QAResult);
      }

      // Load book data for 3D preview + miolo preview URL
      const { data: project } = await supabase
        .from("projects")
        .select("dados_capa, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
        .eq("id", id)
        .single();

      if (project) {
        const ms = project.manuscripts as unknown as {
          titulo?: string;
          autor_primeiro_nome?: string;
          autor_sobrenome?: string;
        } | null;
        const capa = project.dados_capa as {
          url_escolhida?: string;
          url?: string;
        } | null;
        const miolo = project.dados_miolo as {
          lombada_mm?: number;
          paginas_reais?: number;
          paginas_estimadas?: number;
        } | null;

        setBookData({
          coverUrl: capa?.url_escolhida ?? capa?.url ?? null,
          titulo: ms?.titulo ?? "Livro sem título",
          autor: [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor",
          lombadaMm: miolo?.lombada_mm ?? 10,
          paginas: miolo?.paginas_reais ?? miolo?.paginas_estimadas ?? 0,
        });

        // Fetch fresh signed URL for miolo interior preview
        const mioloRes = await fetch(`/api/agentes/miolo?project_id=${id}`);
        if (mioloRes.ok) {
          const mioloData = await mioloRes.json() as { preview_url?: string };
          if (mioloData?.preview_url) setMioloPreviewUrl(mioloData.preview_url);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  async function handleAnalisar() {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro na análise");
      setResult(data as QAResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handlePublicar() {
    if (!modelApproved) return;
    setApprovingPub(true);
    await supabase
      .from("projects")
      .update({ etapa_atual: "publicacao", qa_aprovado_em: new Date().toISOString() })
      .eq("id", id);
    router.push(`/dashboard/publicacao/${id}`);
  }

  const grouped = result
    ? (["texto", "metadados", "capa", "diagramacao"] as QACategoria[]).map(cat => ({
        cat,
        itens: result.itens.filter(i => i.categoria === cat),
      })).filter(g => g.itens.length > 0)
    : [];

  const canPublish = result?.aprovado && modelApproved;

  return (
    <div>
      <EtapasProgress currentStep={6} projectId={id} />
      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 7 — QA
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Verificação e aprovação final
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed">
            Análise automática do projeto e visualização 3D do livro antes da publicação.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* ── Book preview with Capa / Interior tabs ──────────────── */}
            {bookData && (
              <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                {/* Tab bar */}
                <div className="flex border-b border-zinc-100">
                  <button
                    onClick={() => setActiveTab("capa")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors
                      ${activeTab === "capa"
                        ? "text-brand-primary border-b-2 border-brand-gold"
                        : "text-zinc-400 hover:text-zinc-600"}`}
                  >
                    Capa 3D
                  </button>
                  <button
                    onClick={() => setActiveTab("interior")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors
                      ${activeTab === "interior"
                        ? "text-brand-primary border-b-2 border-brand-gold"
                        : "text-zinc-400 hover:text-zinc-600"}`}
                  >
                    Interior
                    {!mioloPreviewUrl && (
                      <span className="ml-1.5 text-[10px] text-zinc-300">(aguardando diagramação)</span>
                    )}
                  </button>
                </div>

                {activeTab === "capa" ? (
                  <div className="p-8">
                    <Book3D
                      book={bookData}
                      approved={modelApproved}
                      onApprove={() => setModelApproved(true)}
                    />
                  </div>
                ) : (
                  <div>
                    {mioloPreviewUrl ? (
                      <>
                        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs text-amber-700">
                          Este é o interior do livro como será publicado — tipografia, sumário, capítulos e página de créditos. Revise antes de aprovar.
                        </div>
                        <iframe
                          src={mioloPreviewUrl}
                          className="w-full border-0"
                          style={{ height: 600 }}
                          title="Interior do livro"
                        />
                      </>
                    ) : (
                      <div className="p-12 text-center text-zinc-400 text-sm">
                        <p className="mb-2">Nenhum miolo gerado ainda.</p>
                        <p className="text-xs text-zinc-300">Complete a etapa de Diagramação para visualizar o interior.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── QA analysis ─────────────────────────────────────────── */}
            {result ? (
              <>
                {/* Score card */}
                <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col sm:flex-row items-center gap-6">
                  <ScoreRing score={result.score} />
                  <div className="flex-1 text-center sm:text-left">
                    <p className={`font-heading text-2xl mb-1 ${result.aprovado ? "text-emerald-700" : "text-amber-700"}`}>
                      {result.aprovado ? "Aprovado para publicação" : "Revisão necessária"}
                    </p>
                    <p className="text-sm text-zinc-500 leading-relaxed">{result.recomendacao}</p>
                    <p className="text-xs text-zinc-300 mt-2">
                      Analisado em {new Date(result.analisado_em).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>

                {/* Items by category */}
                <div className="space-y-4">
                  {grouped.map(({ cat, itens }) => (
                    <div key={cat} className="bg-white rounded-2xl border border-zinc-100 p-5">
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
                        {CATEGORIA_LABEL[cat]}
                      </p>
                      <div className="space-y-2">
                        {itens.map((item: QAItem, i: number) => {
                          const s = STATUS_STYLE[item.status];
                          return (
                            <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${s.bg}`}>
                              <span className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 shrink-0`} />
                              <span className={`text-sm ${s.text}`}>{item.mensagem}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button onClick={handleAnalisar} disabled={analyzing}
                    className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
                      hover:border-brand-gold/30 transition-colors disabled:opacity-50">
                    {analyzing ? "Reanalisando…" : "Reanalisar"}
                  </button>

                  {canPublish ? (
                    <button onClick={handlePublicar} disabled={approvingPub}
                      className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-semibold text-sm
                        hover:bg-brand-gold/90 transition-colors disabled:opacity-50">
                      {approvingPub ? "Aguarde…" : "Publicar →"}
                    </button>
                  ) : result.aprovado && !modelApproved ? (
                    <div className="flex-1 py-3 rounded-xl bg-zinc-100 text-zinc-500 text-sm text-center">
                      Aprove o modelo 3D acima para publicar
                    </div>
                  ) : (
                    <button onClick={() => router.push("/dashboard")}
                      className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                        hover:bg-brand-primary/90 transition-colors">
                      Voltar ao dashboard para corrigir
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
                  <CheckIcon />
                </div>
                <h3 className="font-heading text-xl text-brand-primary mb-2">
                  Pronto para verificação
                </h3>
                <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
                  O agente vai verificar texto, metadados, capa e PDF, e gerar uma recomendação editorial.
                </p>
                <button onClick={handleAnalisar} disabled={analyzing}
                  className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-8 py-3
                    rounded-xl font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
                  {analyzing ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                      Analisando…
                    </>
                  ) : "Iniciar verificação QA"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-brand-gold">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

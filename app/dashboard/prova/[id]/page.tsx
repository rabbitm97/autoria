"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import type { ProvaResult, ProvaItem } from "@/app/api/agentes/prova/types";
import {
  FORMATS,
  SANGRIA_MM,
  ORELHA_MM,
  calcularLombada,
} from "@/app/editor/capa/[project_id]/lib/dimensions";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker do PDF.js servido localmente a partir de /public.
// Veja o script `postinstall` em package.json que mantém esse arquivo
// sincronizado com a versão instalada de pdfjs-dist.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

// ─── Book preview data ────────────────────────────────────────────────────────

interface BookData {
  coverUrl: string | null;
  isPanoramic: boolean;
  fills: { capa?: string; lombada?: string; contracapa?: string } | null;
  titulo: string;
  autor: string;
  lombadaMm: number;
  paginas: number;
  capaTemEditorData: boolean;
  comOrelhas: boolean;
  orelhaRatioW: number;
}

// ─── 3D Book viewer (paralelepípedo com 6 faces) ─────────────────────────────

function Book3D({ book }: {
  book: BookData;
}) {
  const [angle, setAngle] = useState(25);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!book.coverUrl || !book.isPanoramic) {
      setImgDims(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = book.coverUrl;
  }, [book.coverUrl, book.isPanoramic]);

  const SCALE = 2.2;
  const bookH = Math.round(230 * SCALE);

  let bookW: number;
  let spineW: number;
  let imgVisualW = 0;
  let orelhaOffsetPx = 0;

  if (book.isPanoramic && imgDims) {
    imgVisualW = (imgDims.w / imgDims.h) * bookH;
    spineW = Math.max(12, Math.round(book.lombadaMm * SCALE));

    // Desconta orelhas (esq + dir) antes de dividir a área útil entre contracapa e frente.
    orelhaOffsetPx = (book.orelhaRatioW ?? 0) * imgVisualW;
    const utilImgW = imgVisualW - 2 * orelhaOffsetPx;
    bookW = Math.max(100, Math.round((utilImgW - spineW) / 2));
  } else {
    bookW = Math.round(160 * SCALE);
    spineW = Math.max(12, Math.round(book.lombadaMm * SCALE));
  }

  const panoramicBgCommon: React.CSSProperties = book.isPanoramic && book.coverUrl && imgDims
    ? {
        backgroundImage: `url("${book.coverUrl}")`,
        backgroundSize: `${imgVisualW}px ${bookH}px`,
        backgroundRepeat: "no-repeat",
      }
    : {};

  const bgBack: React.CSSProperties = book.isPanoramic && imgDims
    ? { ...panoramicBgCommon, backgroundPosition: `-${orelhaOffsetPx}px 0px` }
    : {};
  const bgSpine: React.CSSProperties = book.isPanoramic && imgDims
    ? { ...panoramicBgCommon, backgroundPosition: `-${orelhaOffsetPx + bookW}px 0px` }
    : {};
  const bgFront: React.CSSProperties = book.isPanoramic && imgDims
    ? { ...panoramicBgCommon, backgroundPosition: `-${orelhaOffsetPx + bookW + spineW}px 0px` }
    : {};

  function onMouseDown(e: React.MouseEvent) { setDragging(true); setStartX(e.clientX); }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const delta = e.clientX - startX;
    setAngle(a => Math.max(-180, Math.min(180, a + delta * 0.4)));
    setStartX(e.clientX);
  }
  function onMouseUp() { setDragging(false); }
  function onTouchStart(e: React.TouchEvent) { setDragging(true); setStartX(e.touches[0].clientX); }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return;
    const delta = e.touches[0].clientX - startX;
    setAngle(a => Math.max(-180, Math.min(180, a + delta * 0.4)));
    setStartX(e.touches[0].clientX);
  }

  const perspDist = 1200;
  const paperEdgeBg = "linear-gradient(to bottom, #faf7ee 0%, #e8e0c8 50%, #faf7ee 100%)";
  const paperEdgeBgHoriz = "linear-gradient(to right, #faf7ee 0%, #e8e0c8 50%, #faf7ee 100%)";

  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-xs text-zinc-400">
        Arraste para girar o livro <span className="text-zinc-300">— gire até o final para ver a contracapa</span>
      </p>

      <div
        className="relative select-none"
        style={{
          perspective: perspDist,
          width: Math.max(bookW * 1.5, bookW + spineW * 8),
          height: bookH + 40,
        }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
      >
        <div
          className="cursor-grab active:cursor-grabbing"
          style={{
            position: "relative",
            width: bookW,
            height: bookH,
            margin: "20px auto",
            transformStyle: "preserve-3d",
            transform: `rotateY(${angle}deg)`,
            transition: dragging ? "none" : "transform 0.3s ease",
          }}
        >
          {/* Front */}
          <div
            style={{
              position: "absolute", inset: 0,
              transform: `translateZ(${spineW / 2}px)`,
              backfaceVisibility: "hidden",
              ...bgFront,
            }}
            className="shadow-2xl overflow-hidden"
          >
            {book.isPanoramic ? null : book.coverUrl ? (
              <img src={book.coverUrl} alt="Capa" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-brand-primary flex flex-col items-center justify-center gap-4 p-6">
                <p className="text-brand-gold text-center font-heading text-lg leading-tight">{book.titulo}</p>
                <p className="text-white/60 text-sm text-center">{book.autor}</p>
              </div>
            )}
          </div>

          {/* Back */}
          <div
            style={{
              position: "absolute", inset: 0,
              transform: `rotateY(180deg) translateZ(${spineW / 2}px)`,
              backfaceVisibility: "hidden",
              ...(book.isPanoramic && imgDims
                ? bgBack
                : book.fills?.contracapa
                ? { background: book.fills.contracapa }
                : { background: "linear-gradient(135deg, #1e2a4a 0%, #0f172a 100%)" }),
            }}
            className="shadow-inner flex flex-col items-center justify-center p-6"
          >
            {!book.isPanoramic && (
              <>
                <div className="w-16 h-1 bg-brand-gold/40 mb-4 rounded-full" />
                <p className="text-white/40 text-xs text-center">Verso da capa</p>
                <p className="text-white/20 text-[10px] text-center mt-2">{book.paginas} páginas</p>
              </>
            )}
          </div>

          {/* Spine (lombada esquerda) */}
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: spineW, height: bookH,
              transform: `rotateY(-90deg) translateZ(${spineW / 2}px)`,
              backfaceVisibility: "hidden",
              ...(book.isPanoramic && imgDims
                ? bgSpine
                : book.fills?.lombada
                ? { background: book.fills.lombada }
                : { background: "linear-gradient(to right, #0f172a, #1e2a4a, #0f172a)" }),
            }}
            className="flex items-center justify-center shadow-inner overflow-hidden"
          >
            {!book.isPanoramic && (
              <div className="transform -rotate-90 whitespace-nowrap overflow-hidden" style={{ maxWidth: bookH - 16 }}>
                <span className="text-brand-gold font-bold text-xs tracking-widest">{book.titulo}</span>
                <span className="text-white/50 text-[9px] ml-3">{book.autor}</span>
              </div>
            )}
          </div>

          {/* Fore-edge (papel, direita) */}
          <div style={{
            position: "absolute", top: 0, left: `${bookW - spineW}px`,
            width: spineW, height: bookH,
            transform: `rotateY(90deg) translateZ(${spineW / 2}px)`,
            backfaceVisibility: "hidden",
            background: paperEdgeBg,
          }} />

          {/* Top edge (papel, em cima) */}
          <div style={{
            position: "absolute", top: 0, left: 0,
            width: bookW, height: spineW,
            transform: `rotateX(-90deg) translateZ(${spineW / 2}px)`,
            backfaceVisibility: "hidden",
            background: paperEdgeBgHoriz,
          }} />

          {/* Bottom edge (papel, embaixo) */}
          <div style={{
            position: "absolute", top: `${bookH - spineW}px`, left: 0,
            width: bookW, height: spineW,
            transform: `rotateX(90deg) translateZ(${spineW / 2}px)`,
            backfaceVisibility: "hidden",
            background: paperEdgeBgHoriz,
          }} />
        </div>
      </div>

      <div className="text-center space-y-1">
        <p className="font-heading text-lg text-brand-primary">{book.titulo}</p>
        <p className="text-sm text-zinc-500">{book.autor}</p>
        <p className="text-xs text-zinc-400">{book.paginas} páginas · Lombada {book.lombadaMm}mm</p>
      </div>

      {book.comOrelhas && (
        <div className="mt-6 mx-auto max-w-md bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3 flex items-start gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <p className="text-xs text-amber-800 leading-relaxed">
            Este livro tem orelhas — elas dobram para dentro no livro impresso. Na versão digital (eBook), as orelhas não são consideradas.
          </p>
        </div>
      )}

    </div>
  );
}

// ─── Capa aberta ──────────────────────────────────────────────────────────────

function CapaAberta({ bookData }: { bookData: BookData }) {
  if (!bookData.coverUrl) {
    return (
      <div className="py-16 text-center text-sm text-zinc-400">
        Capa ainda não foi gerada.
      </div>
    );
  }

  if (!bookData.isPanoramic) {
    return (
      <div className="py-16 px-8 text-center">
        <p className="text-sm text-zinc-500 mb-2">Esta capa tem apenas a frente.</p>
        <p className="text-xs text-zinc-400">Volte ao Editor de Capa para gerar a versão panorâmica (frente + lombada + contracapa).</p>
      </div>
    );
  }

  return (
    <div className="bg-stone-100 py-8 px-4 flex flex-col items-center">
      <img
        src={bookData.coverUrl}
        alt="Capa estendida"
        className="max-w-full max-h-[70vh] object-contain shadow-xl"
      />
      <p className="mt-4 text-xs text-zinc-500 italic">
        Capa estendida — antes de dobrar
      </p>
    </div>
  );
}

// ─── PDF Folheador ────────────────────────────────────────────────────────────

function PdfFolheador({ projectId }: { projectId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [maxPageHeight, setMaxPageHeight] = useState(700);

  useEffect(() => {
    function update() {
      setMaxPageHeight(Math.max(420, window.innerHeight - 360));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const pdfUrl = `/api/agentes/prova/preview-pdf?project_id=${projectId}`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setPageNumber(p => Math.max(1, p - 1));
      else if (e.key === "ArrowRight") setPageNumber(p => Math.min(numPages || p, p + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numPages]);

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n);
    setLoadError(null);
  }

  function onDocumentLoadError(err: Error) {
    console.error("[PdfFolheador] load error:", err);
    setLoadError("Não foi possível carregar o PDF. Tente regenerar a versão final.");
  }

  const canPrev = pageNumber > 1;
  const canNext = numPages > 0 && pageNumber < numPages;
  const ASPECT_GUESS = 1.5;
  const widthByContainer = Math.min(containerWidth - 48, 600);
  const widthByHeight = maxPageHeight / ASPECT_GUESS;
  const pageWidth = Math.max(280, Math.min(widthByContainer, widthByHeight));

  return (
    <div ref={containerRef} className="w-full bg-stone-100 flex flex-col items-center py-8 px-4">
      {loadError ? (
        <div className="py-24 text-center text-sm text-zinc-500">{loadError}</div>
      ) : (
        <>
          <div className="bg-white shadow-xl rounded-sm" style={{ minHeight: 400 }}>
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div
                  className="flex items-center justify-center"
                  style={{ width: pageWidth, height: pageWidth * 1.4 }}
                >
                  <span className="w-8 h-8 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
                </div>
              }
              error={null}
            >
              <div key={pageNumber} className="animate-prova-page-in">
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  loading={
                    <div
                      className="flex items-center justify-center"
                      style={{ width: pageWidth, height: pageWidth * 1.4 }}
                    >
                      <span className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                    </div>
                  }
                />
              </div>
            </Document>
          </div>

          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={() => setPageNumber(p => Math.max(1, p - 1))}
              disabled={!canPrev}
              className="px-4 py-2 rounded-lg bg-white border border-zinc-200 text-sm font-medium text-zinc-700 hover:border-brand-gold/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Página anterior"
            >
              ← Anterior
            </button>

            <p className="text-sm text-zinc-600 font-mono min-w-[100px] text-center">
              {numPages > 0 ? `${pageNumber} / ${numPages}` : "—"}
            </p>

            <button
              onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))}
              disabled={!canNext}
              className="px-4 py-2 rounded-lg bg-white border border-zinc-200 text-sm font-medium text-zinc-700 hover:border-brand-gold/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Próxima página"
            >
              Próxima →
            </button>
          </div>

          <p className="text-xs text-zinc-400 mt-3">
            Use as setas{" "}
            <kbd className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-mono">
              ←
            </kbd>{" "}
            <kbd className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-[10px] font-mono">
              →
            </kbd>{" "}
            do teclado para navegar
          </p>
        </>
      )}
    </div>
  );
}

// ─── Pendencia card ──────────────────────────────────────────────────────────

function PendenciaCard({ item, onNavigate }: {
  item: ProvaItem;
  onNavigate: (etapa: string) => void;
}) {
  const isErro = item.status === "erro";
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-4 ${
      isErro ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
    }`}>
      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
        isErro ? "bg-red-500" : "bg-amber-400"
      }`} />
      <div className="flex-1">
        <p className={`text-sm ${isErro ? "text-red-700" : "text-amber-700"}`}>
          {item.mensagem}
        </p>
        {item.acao && (
          <button
            onClick={() => onNavigate(item.acao!.etapa)}
            className={`mt-3 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              isErro
                ? "bg-red-100 hover:bg-red-200 text-red-700"
                : "bg-amber-100 hover:bg-amber-200 text-amber-700"
            }`}
          >
            {item.acao.label} →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProvaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const projectIdStr = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ProvaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookData, setBookData] = useState<BookData | null>(null);
  const [activeTab, setActiveTab] = useState<"capa" | "capa_aberta" | "miolo">("capa");
  const [modelApproved, setModelApproved] = useState(false);
  const [approvingPub, setApprovingPub] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [lombadaAvisoDismissed, setLombadaAvisoDismissed] = useState(false);
  const [preparandoCapaGrafica, setPreparandoCapaGrafica] = useState(false);
  const [capaGraficaError, setCapaGraficaError] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agentes/prova?project_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data) setResult(data as ProvaResult);
      }

      const { data: project } = await supabase
        .from("projects")
        .select("formato, dados_capa, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
        .eq("id", id)
        .single();

      if (project) {
        const ms = project.manuscripts as unknown as {
          titulo?: string;
          autor_primeiro_nome?: string;
          autor_sobrenome?: string;
        } | null;
        const miolo = project.dados_miolo as {
          lombada_mm?: number;
          paginas_reais?: number;
          paginas_estimadas?: number;
        } | null;

        const dadosCapa = project.dados_capa as Record<string, unknown> | null;
        const capaResolvida = resolveCapaCompleta(dadosCapa);
        const editorDataRaw = dadosCapa?.editor_data as { version?: number; comOrelhas?: boolean } | undefined;
        const capaTemEditorData = editorDataRaw?.version === 1;
        const comOrelhas = Boolean(editorDataRaw?.comOrelhas);

        const paginasReais = miolo?.paginas_reais ?? 0;
        const formatoKey = ((project.formato as string) in FORMATS
          ? (project.formato as keyof typeof FORMATS)
          : "padrao_br") as keyof typeof FORMATS;
        const f = FORMATS[formatoKey] ?? FORMATS.padrao_br;
        const lombadaMmCalc = calcularLombada(paginasReais);
        const orelhaMm = comOrelhas ? ORELHA_MM : 0;
        const totalWMm = f.width_mm * 2 + lombadaMmCalc + orelhaMm * 2 + SANGRIA_MM * 2;
        const orelhaRatioW = comOrelhas ? ORELHA_MM / totalWMm : 0;

        setBookData({
          coverUrl: capaResolvida.url_principal,
          isPanoramic: capaResolvida.is_panoramica,
          fills: capaResolvida.fills,
          titulo: ms?.titulo ?? "Livro sem título",
          autor: [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor",
          lombadaMm: capaResolvida.lombada_mm ?? miolo?.lombada_mm ?? 10,
          paginas: paginasReais || (miolo?.paginas_estimadas ?? 0),
          capaTemEditorData,
          comOrelhas,
          orelhaRatioW,
        });
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
      const res = await fetch("/api/agentes/prova", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro na análise");
      setResult(data as ProvaResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGerarPdfDigital() {
    if (!projectIdStr) {
      setPdfError("ID do projeto inválido. Recarregue a página.");
      return;
    }

    setGerandoPdf(true);
    setPdfError(null);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75_000);

    try {
      const res = await fetch("/api/agentes/gerar-pdf-digital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectIdStr }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Erro do servidor (HTTP ${res.status})`);
      }

      await handleAnalisar();
    } catch (e) {
      clearTimeout(timeout);
      const isAbort = e instanceof Error && e.name === "AbortError";
      const msg = isAbort
        ? "A geração demorou demais (>75s). Tente novamente, ou volte à etapa Diagramação e gere o PDF por lá."
        : e instanceof Error
        ? e.message
        : "Erro ao gerar PDF.";
      setPdfError(msg);
      console.error("[Prova] handleGerarPdfDigital error:", e);
    } finally {
      setGerandoPdf(false);
    }
  }

  async function handlePrepararCapaGrafica() {
    if (!projectIdStr) return;
    setPreparandoCapaGrafica(true);
    setCapaGraficaError(null);
    try {
      const res = await fetch("/api/agentes/prova/preparar-capa-grafica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectIdStr }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; action?: string; ok?: boolean };
      if (!res.ok) {
        if (data.action === "ir_para_editor_capa") {
          router.push(`/editor/capa/${projectIdStr}`);
          return;
        }
        throw new Error(data.error ?? "Falha ao preparar PDF da capa.");
      }
      await handleAnalisar();
    } catch (e) {
      setCapaGraficaError(e instanceof Error ? e.message : "Erro ao preparar PDF da capa.");
    } finally {
      setPreparandoCapaGrafica(false);
    }
  }

  async function handlePublicar() {
    if (!digitalAprovado || !modelApproved) return;
    setApprovingPub(true);
    await supabase
      .from("projects")
      .update({ etapa_atual: "publicacao", qa_aprovado_em: new Date().toISOString() })
      .eq("id", id);
    router.push(`/dashboard/publicacao/${id}`);
  }

  function handleNavigateToEtapa(etapa: string) {
    if (etapa === "__gerar_pdf_digital__") { handleGerarPdfDigital(); return; }
    if (etapa === "__preparar_capa_grafica__") { handlePrepararCapaGrafica(); return; }
    router.push(`/dashboard/${etapa}/${id}`);
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const digitalAprovado = result?.digital.aprovado ?? false;
  const digitalPendencias = result?.digital.pendencias ?? [];
  const digitalAvisos = (result?.digital.avisos ?? []).filter(
    a => a.id !== "capa_grafica_lombada_divergente",
  );
  const graficaPendencias = (result?.grafica.pendencias ?? []).filter(
    i => i.categoria === "capa_grafica",
  );
  const graficaPreparada = result?.grafica.preparado ?? false;
  const avisosLombada = result?.grafica.avisos.filter(
    i => i.id === "capa_grafica_lombada_divergente",
  ) ?? [];
  const canPublish = digitalAprovado && modelApproved;
  const capaOrigem = bookData?.capaTemEditorData ? "editor" : "ia_ou_upload";

  const pdfPendente = result?.itens.find(i => i.categoria === "pdf") ?? null;
  const pdfPronto = result !== null && pdfPendente === null;

  return (
    <div>
      <EtapasProgress currentStep={6} projectId={id} />
      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Etapa final
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Prova
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed max-w-xl">
            Veja seu livro como ele será publicado. Quando estiver satisfeito, aprove para enviar à distribuição.
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

            {/* Book preview com abas Capa 3D / Miolo */}
            {bookData && (
              <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                <div className="flex border-b border-zinc-100">
                  <button
                    onClick={() => setActiveTab("capa")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      activeTab === "capa"
                        ? "text-brand-primary border-b-2 border-brand-gold"
                        : "text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    Livro 3D
                  </button>
                  <button
                    onClick={() => setActiveTab("capa_aberta")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      activeTab === "capa_aberta"
                        ? "text-brand-primary border-b-2 border-brand-gold"
                        : "text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    Capa aberta
                  </button>
                  <button
                    onClick={() => setActiveTab("miolo")}
                    className={`flex-1 py-3 text-sm font-medium transition-colors ${
                      activeTab === "miolo"
                        ? "text-brand-primary border-b-2 border-brand-gold"
                        : "text-zinc-400 hover:text-zinc-600"
                    }`}
                  >
                    Miolo
                  </button>
                </div>

                {activeTab === "capa" ? (
                  <div className="p-8">
                    <Book3D book={bookData} />
                  </div>
                ) : activeTab === "capa_aberta" ? (
                  <CapaAberta bookData={bookData} />
                ) : pdfPronto ? (
                  <PdfFolheador projectId={projectIdStr} />
                ) : (
                  <div className="p-12 text-center bg-stone-50">
                    {pdfPendente && (
                      <div className="text-zinc-400 text-sm mb-4">
                        {pdfPendente.mensagem}
                      </div>
                    )}
                    <button
                      onClick={handleGerarPdfDigital}
                      disabled={gerandoPdf}
                      className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                    >
                      {gerandoPdf ? (
                        <>
                          <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                          Gerando versão final… (até 60s)
                        </>
                      ) : (
                        pdfPendente?.acao?.label ?? "Gerar PDF digital"
                      )}
                    </button>

                    {pdfError && (
                      <div className="mt-4 text-xs text-red-600 max-w-md mx-auto">
                        {pdfError}
                      </div>
                    )}

                    {gerandoPdf && (
                      <p className="mt-3 text-xs text-zinc-400">
                        A geração pode demorar até um minuto. Não feche esta página.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Bloco de aprovação do modelo — visível em qualquer aba */}
            {bookData && (
              <div className="flex items-center justify-center py-2">
                {!modelApproved ? (
                  <button
                    onClick={() => setModelApproved(true)}
                    className="px-8 py-3 rounded-xl bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors shadow-sm"
                  >
                    Aprovar modelo final
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                      <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    Modelo aprovado
                  </div>
                )}
              </div>
            )}

            {/* Status */}
            {result ? (
              <div className="space-y-4">

                {/* Banner: lombada divergente */}
                {avisosLombada.length > 0 && !lombadaAvisoDismissed && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">Lombada desatualizada</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">{avisosLombada[0].mensagem}</p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handlePrepararCapaGrafica}
                          disabled={preparandoCapaGrafica}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 transition-colors disabled:opacity-50"
                        >
                          {preparandoCapaGrafica ? "Preparando…" : "Atualizar PDF da capa →"}
                        </button>
                        <button
                          onClick={() => setLombadaAvisoDismissed(true)}
                          className="text-xs text-amber-600 hover:text-amber-800 transition-colors"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Card: publicação digital */}
                <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-brand-primary text-sm">Publicação digital</p>
                      <p className="text-xs text-zinc-400 mt-0.5">Capa · Miolo · Créditos · PDF digital</p>
                    </div>
                    {digitalAprovado ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Aprovado
                      </span>
                    ) : (
                      <span className="text-xs text-red-500 font-medium">
                        {digitalPendencias.length} pendência{digitalPendencias.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {digitalAprovado ? (
                      <div className="py-3 text-center">
                        <p className="text-sm text-emerald-600 font-medium">Tudo certo para publicação digital!</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Conferido em {new Date(result.analisado_em).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    ) : (
                      <>
                        {digitalPendencias.map((item, i) => (
                          <PendenciaCard key={i} item={item} onNavigate={handleNavigateToEtapa} />
                        ))}
                        {digitalAvisos.map((item, i) => (
                          <PendenciaCard key={`av-${i}`} item={item} onNavigate={handleNavigateToEtapa} />
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {/* Card: envio para gráfica */}
                <div className={`bg-white rounded-2xl border overflow-hidden transition-opacity ${
                  !digitalAprovado ? "opacity-50 border-zinc-100" : "border-zinc-100"
                }`}>
                  <div className="px-6 py-4 border-b border-zinc-50 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-brand-primary text-sm">Envio para gráfica</p>
                      <p className="text-xs text-zinc-400 mt-0.5">PDF da capa com marcas de corte e sangria</p>
                    </div>
                    {!digitalAprovado ? (
                      <span className="text-xs text-zinc-400">Disponível após digital</span>
                    ) : graficaPreparada && graficaPendencias.length === 0 ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Preparado
                      </span>
                    ) : graficaPreparada ? (
                      <span className="text-xs text-red-500 font-medium">Requer atenção</span>
                    ) : (
                      <span className="text-xs text-zinc-400 font-medium">Não preparado</span>
                    )}
                  </div>
                  <div className="p-4 space-y-3">
                    {!digitalAprovado ? (
                      <p className="text-sm text-zinc-400 text-center py-3">
                        Conclua a trilha digital antes de preparar o envio para gráfica.
                      </p>
                    ) : !graficaPreparada ? (
                      <div className="text-center py-3">
                        <p className="text-sm text-zinc-600 mb-4">
                          {capaOrigem === "editor"
                            ? "Gere o PDF da capa com marcas de corte para envio à gráfica."
                            : "A capa precisa passar pelo Editor de Capa para gerar o PDF para gráfica."}
                        </p>
                        <button
                          onClick={capaOrigem === "editor"
                            ? handlePrepararCapaGrafica
                            : () => router.push(`/editor/capa/${projectIdStr}`)}
                          disabled={preparandoCapaGrafica}
                          className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                        >
                          {preparandoCapaGrafica ? (
                            <>
                              <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                              Preparando…
                            </>
                          ) : capaOrigem === "editor"
                            ? "Preparar PDF para gráfica"
                            : "Abrir Editor de Capa →"}
                        </button>
                        {capaGraficaError && (
                          <p className="mt-3 text-xs text-red-600">{capaGraficaError}</p>
                        )}
                      </div>
                    ) : graficaPendencias.length > 0 ? (
                      <>
                        {graficaPendencias.map((item, i) => (
                          <PendenciaCard key={i} item={item} onNavigate={handleNavigateToEtapa} />
                        ))}
                        <div className="pt-1">
                          <button
                            onClick={handlePrepararCapaGrafica}
                            disabled={preparandoCapaGrafica}
                            className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-5 py-2 rounded-xl text-xs font-medium hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                          >
                            {preparandoCapaGrafica ? (
                              <>
                                <span className="w-3 h-3 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                                Preparando…
                              </>
                            ) : "Preparar novamente"}
                          </button>
                          {capaGraficaError && (
                            <p className="mt-2 text-xs text-red-600">{capaGraficaError}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="py-3 text-center">
                        <p className="text-sm text-emerald-600 font-medium">PDF da capa pronto para gráfica!</p>
                        <button
                          onClick={handlePrepararCapaGrafica}
                          disabled={preparandoCapaGrafica}
                          className="mt-3 text-xs text-zinc-400 underline hover:text-zinc-600 disabled:opacity-50 transition-colors"
                        >
                          {preparandoCapaGrafica ? "Atualizando…" : "Atualizar PDF da capa"}
                        </button>
                        {capaGraficaError && (
                          <p className="mt-2 text-xs text-red-600">{capaGraficaError}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Detalhes da obra (colapsável) */}
                <details
                  className="bg-white rounded-2xl border border-zinc-100"
                  open={detailsOpen}
                  onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
                >
                  <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-zinc-600 hover:text-zinc-800 transition-colors flex items-center justify-between">
                    Detalhes da obra
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${detailsOpen ? "rotate-180" : ""}`}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </summary>
                  {bookData && (
                    <div className="px-6 pb-5 pt-1 text-sm space-y-2 text-zinc-600 border-t border-zinc-50">
                      <p><span className="text-zinc-400">Título:</span> {bookData.titulo}</p>
                      <p><span className="text-zinc-400">Autor:</span> {bookData.autor}</p>
                      <p><span className="text-zinc-400">Páginas:</span> {bookData.paginas}</p>
                      <p><span className="text-zinc-400">Lombada:</span> {bookData.lombadaMm}mm</p>
                    </div>
                  )}
                </details>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleAnalisar}
                    disabled={analyzing}
                    className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-brand-gold/30 transition-colors disabled:opacity-50"
                  >
                    {analyzing ? "Reanalisando…" : "Reanalisar"}
                  </button>

                  {canPublish ? (
                    <button
                      onClick={handlePublicar}
                      disabled={approvingPub}
                      className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-semibold text-sm hover:bg-brand-gold/90 transition-colors disabled:opacity-50"
                    >
                      {approvingPub ? "Aguarde…" : "Publicar →"}
                    </button>
                  ) : digitalAprovado && !modelApproved ? (
                    <div className="flex-1 py-3 rounded-xl bg-zinc-100 text-zinc-500 text-sm text-center">
                      Aprove o modelo 3D acima para publicar
                    </div>
                  ) : (
                    <div className="flex-1 py-3 rounded-xl bg-zinc-100 text-zinc-500 text-sm text-center">
                      Resolva as pendências da trilha digital para publicar
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
                <h3 className="font-heading text-xl text-brand-primary mb-2">
                  Conferir o livro
                </h3>
                <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
                  Vamos verificar capa, miolo, créditos e PDF, e mostrar o livro pronto para sua aprovação.
                </p>
                <button
                  onClick={handleAnalisar}
                  disabled={analyzing}
                  className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-8 py-3 rounded-xl font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                      Conferindo…
                    </>
                  ) : "Iniciar conferência"}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

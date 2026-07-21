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
  calcularLombada,
} from "@/app/editor/capa/[project_id]/lib/dimensions";
import {
  PLANO_LABEL,
  PLANO_TAGLINE,
  PLANO_DESTAQUES,
  PLANO_PRECO_CENTAVOS,
  formatarPrecoPlano,
} from "@/lib/planos";
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
  orelhaMm: number;
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
    spineW = Math.max(1, Math.round(book.lombadaMm * SCALE));

    // Desconta orelhas (esq + dir) antes de dividir a área útil entre contracapa e frente.
    orelhaOffsetPx = (book.orelhaRatioW ?? 0) * imgVisualW;
    const utilImgW = imgVisualW - 2 * orelhaOffsetPx;
    bookW = Math.max(100, Math.round((utilImgW - spineW) / 2));
  } else {
    bookW = Math.round(160 * SCALE);
    spineW = Math.max(1, Math.round(book.lombadaMm * SCALE));
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

      {book.orelhaMm > 0 && (
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

function CapaAberta({ bookData, isFrentePura = false }: { bookData: BookData; isFrentePura?: boolean }) {
  if (!bookData.coverUrl) {
    return (
      <div className="py-16 text-center text-sm text-zinc-400">
        Capa ainda não foi gerada.
      </div>
    );
  }

  // Capa em formato eBook (só frente): renderiza a imagem sozinha com
  // proporção correta. Book3D não é oferecido pra esse caso (nada pra
  // girar em 3D — a imagem é literalmente só a frente).
  if (isFrentePura) {
    return (
      <div className="bg-stone-100 py-8 px-4 flex flex-col items-center">
        <img
          src={bookData.coverUrl}
          alt="Capa (frente)"
          className="max-w-full max-h-[70vh] object-contain shadow-xl"
        />
        <p className="mt-4 text-xs text-zinc-500 text-center max-w-md">
          Esta é a capa em formato eBook — só a frente, pronta pra Amazon KDP, Apple Books e Kobo.
        </p>
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

// ─── Trilha card ─────────────────────────────────────────────────────────────

function TrilhaCard({
  icone,
  titulo,
  subtitulo,
  aprovado,
  pendencias,
  avisos,
  onNavigate,
  ctaLabel,
  ctaBusy,
  ctaError,
  onCta,
  avisoInfo,
  modoPrevia,
}: {
  icone: "tablet" | "livro";
  titulo: string;
  subtitulo: string;
  aprovado: boolean;
  pendencias: ProvaItem[];
  avisos: ProvaItem[];
  onNavigate: (etapa: string) => void;
  ctaLabel: string | null;
  ctaBusy: boolean;
  ctaError: string | null;
  onCta?: () => void;
  // Bloco 1m: mensagem positiva (azul) confirmando escolha explícita do autor.
  avisoInfo?: string;
  // FIX-14: trilha de impressão pra plano não-Pro — artefatos existem,
  // mas são prévia com marca d'água. Nunca exibir "Pronto".
  modoPrevia?: boolean;
}) {
  const status: "pronto" | "atencao" | "pendente" | "previa" =
    modoPrevia && aprovado ? "previa"
    : aprovado && avisos.length === 0 ? "pronto"
    : aprovado ? "atencao"
    : "pendente";

  const statusStyle =
    status === "pronto" ? "bg-emerald-50 text-emerald-700"
    : status === "atencao" || status === "previa" ? "bg-amber-50 text-amber-700"
    : "bg-zinc-100 text-zinc-500";
  const statusLabel =
    status === "pronto" ? "Pronto"
    : status === "previa" ? "Prévia"
    : status === "atencao" ? "Atenção"
    : "Pendente";

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icone === "tablet" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
            </svg>
          )}
          <p className="font-medium text-sm text-brand-primary">{titulo}</p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>
      <p className="text-xs text-zinc-500 mb-3">{subtitulo}</p>

      <div className="flex-1 space-y-1.5 mb-3">
        {modoPrevia && aprovado ? (
          <div className="flex items-start gap-2 text-xs text-amber-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>
              Seu PDF de impressão está disponível como prévia com marca d'água.
              Os arquivos definitivos de gráfica fazem parte do plano Pro.
            </span>
          </div>
        ) : aprovado && avisos.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Tudo pronto para {titulo === "Publicação digital" ? "publicação" : "envio à gráfica"}.
          </div>
        ) : (
          <>
            {pendencias.map((item, i) => (
              <div key={`p-${i}`} className="flex items-start gap-2 text-xs text-zinc-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2" className="shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" strokeDasharray="4 4"/>
                </svg>
                <div className="flex-1">
                  <span>{item.mensagem}</span>
                  {item.acao && (
                    <button
                      onClick={() => onNavigate(item.acao!.etapa)}
                      className="ml-2 text-brand-gold underline hover:text-brand-gold/80"
                    >
                      {item.acao.label} →
                    </button>
                  )}
                </div>
              </div>
            ))}
            {avisos.map((item, i) => (
              <div key={`a-${i}`} className="flex items-start gap-2 text-xs text-amber-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span className="flex-1">{item.mensagem}</span>
              </div>
            ))}
          </>
        )}
        {avisoInfo && (
          <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 rounded-md p-2 mt-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="flex-1">{avisoInfo}</span>
          </div>
        )}
      </div>

      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          disabled={ctaBusy}
          className="w-full text-xs font-medium py-2 px-3 rounded-lg border border-zinc-200 hover:border-brand-gold/40 hover:bg-zinc-50 transition-colors disabled:opacity-50"
        >
          {ctaBusy ? "Preparando…" : ctaLabel}
        </button>
      )}
      {ctaError && <p className="mt-2 text-xs text-red-600">{ctaError}</p>}
    </div>
  );
}

// ─── Helpers de auto-geração de artefatos ────────────────────────────────────

async function gerarArtefato(
  endpoint: string,
  projectId: string,
  timeoutMs = 75_000,
): Promise<{ ok: boolean; gated?: boolean; error?: string }> {
  // Retry silencioso: 2 tentativas com backoff (2s, 5s). Se falhar tudo,
  // o client mostra mensagem única genérica ("Estamos finalizando…") sem
  // culpar o autor. Não reintenta 422 (erro lógico do server, ex: capa
  // frente pura bloqueada) — apenas 5xx e timeouts.
  const backoffs = [2000, 5000];
  const maxAttempts = 2;
  let lastError = "Falha ao preparar arquivo";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, backoffs[attempt - 1]));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) return { ok: true };

      const data = await res.json().catch(() => null);
      const errorMsg = (data as { error?: string } | null)?.error ?? `Erro do servidor (HTTP ${res.status})`;

      // 422 = erro lógico (ex: is_frente_pura). Não vale reintentar.
      if (res.status === 422) return { ok: false, error: errorMsg };
      // 402 = gate de plano (D2-02). TERMINAL: re-tentar nunca resolve —
      // a resposta é upgrade, não retry. (D2-05)
      if (res.status === 402) return { ok: false, gated: true, error: errorMsg };
      lastError = errorMsg;
    } catch (e) {
      clearTimeout(timeout);
      const isAbort = e instanceof Error && e.name === "AbortError";
      lastError = isAbort ? "Geração demorou demais (>75s)" : e instanceof Error ? e.message : "Erro desconhecido";
    }
  }
  return { ok: false, error: lastError };
}

// PDF da capa gráfica só é auto-gerado quando a capa veio do editor visual E
// é panorâmica. Capa não-panorâmica (frente pura, ex: só-eBook) vira item
// "Alterar capa" com sentinel __alterar_capa__ — o autor decide entre editor
// ou upload, e o server bloqueia a rota com 422 se for chamada mesmo assim.
function detectarArtefatosAusentes(
  prova: ProvaResult,
  capaOrigem: "editor" | "ia_ou_upload",
  isPanoramic: boolean,
): Array<{ tipo: string; endpoint: string }> {
  const missing: Array<{ tipo: string; endpoint: string }> = [];
  const seen = new Set<string>();
  const all = [...prova.digital.pendencias, ...prova.grafica.pendencias];
  for (const p of all) {
    if (seen.has(p.categoria)) continue;
    seen.add(p.categoria);
    if (p.categoria === "pdf_ebook") {
      missing.push({ tipo: "pdf_ebook", endpoint: "/api/agentes/gerar-pdf-digital" });
    } else if (p.categoria === "pdf_miolo_grafica") {
      // PDF do miolo com sangria é gerável sempre — útil mesmo em livro
      // só eBook (se autor eventualmente trocar a capa, já está pronto).
      missing.push({ tipo: "pdf_miolo_grafica", endpoint: "/api/agentes/gerar-pdf" });
    } else if (p.categoria === "pdf_capa_grafica" && capaOrigem === "editor" && isPanoramic) {
      // Só tenta gerar PDF da capa quando: veio do editor E é panorâmica.
      // Se não é panorâmica, o item vem com etapa "__alterar_capa__" e
      // exige decisão do autor.
      missing.push({ tipo: "pdf_capa_grafica", endpoint: "/api/agentes/prova/preparar-capa-grafica" });
    }
  }
  return missing;
}

// ─── Tela de conversão (D2-05) ────────────────────────────────────────────────
// Renderizada no lugar das trilhas/aprovação quando o projeto é freemium ou
// algum artefato voltou 402. CTAs vão para /dashboard/planos até o D.4 —
// nada de simulação de venda aqui.

function TelaConversaoPlano() {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="text-center pt-2">
        <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-2">
          Seu livro está pronto
        </p>
        <h2 className="font-heading text-2xl text-brand-primary">
          Selecione o plano para continuar
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <PlanoCard
          plano="essencial"
          onContinuar={() => router.push("/dashboard/planos")}
        />
        <PlanoCard
          plano="pro"
          destaque
          onContinuar={() => router.push("/dashboard/planos")}
        />
      </div>
    </div>
  );
}

function PlanoCard({
  plano,
  destaque = false,
  onContinuar,
}: {
  plano: "essencial" | "pro";
  destaque?: boolean;
  onContinuar: () => void;
}) {
  return (
    <div
      className={`rounded-2xl p-6 flex flex-col relative ${
        destaque
          ? "border-2 border-brand-gold bg-white shadow-lg"
          : "border border-zinc-100 bg-white"
      }`}
    >
      {destaque && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-brand-gold text-brand-primary text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
            Recomendado
          </span>
        </div>
      )}

      <div className="mb-4">
        <p className="font-heading text-xl text-brand-primary mb-2">
          {PLANO_LABEL[plano]}
        </p>
        <p className="font-heading text-3xl text-brand-primary mb-3">
          {formatarPrecoPlano(plano)}
        </p>
        <p className="text-sm text-zinc-500">
          {PLANO_TAGLINE[plano]}
        </p>
      </div>

      <ul className="flex-1 space-y-2 mb-6">
        {PLANO_DESTAQUES[plano].map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c9a84c"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{d}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onContinuar}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
          destaque
            ? "bg-brand-primary text-brand-gold hover:bg-brand-primary/90"
            : "border border-brand-primary text-brand-primary hover:bg-brand-primary/5"
        }`}
      >
        Continuar com {PLANO_LABEL[plano]}
      </button>
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
  const [approvingPub, setApprovingPub] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [preparandoArtefatos, setPreparandoArtefatos] = useState(false);
  const [preparandoCapaGrafica, setPreparandoCapaGrafica] = useState(false);
  const [capaGraficaError, setCapaGraficaError] = useState<string | null>(null);
  const [isFrentePura, setIsFrentePura] = useState(false);
  // Bloco 1m: reflete escolha do autor sobre incluir página de créditos.
  // No modo completa é sempre true. No modo digital respeita config.incluir_creditos.
  const [hasCreditos, setHasCreditos] = useState<boolean>(true);
  const [plano, setPlano] = useState<string | null>(null);
  const [gateAtivo, setGateAtivo] = useState(false);

  const loadExisting = useCallback(async () => {
    setLoading(true);
    let prova: ProvaResult | null = null;
    let capaOrigemLocal: "editor" | "ia_ou_upload" = "ia_ou_upload";
    let isPanoramicLocal = true; // default seguro para casos onde a capa não carregou
    let planoLocal: string = "freemium";
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("plano, formato, dados_capa, dados_miolo, dados_creditos, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
        .eq("id", id)
        .single();

      if (project) {
        planoLocal = ((project as { plano?: string }).plano) ?? "freemium";
        setPlano(planoLocal);
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
        if (!((project.formato as string) in FORMATS)) {
          console.warn("[prova] [formato-fallback] projects.formato inválido/nulo — não deveria acontecer pós FIX-01.");
        }
        const formatoKey = ((project.formato as string) in FORMATS
          ? (project.formato as keyof typeof FORMATS)
          : "padrao_br") as keyof typeof FORMATS;
        const capaResolvida = resolveCapaCompleta(dadosCapa, formatoKey);
        const editorDataRaw = dadosCapa?.editor_data as { version?: number } | undefined;
        const capaTemEditorData = editorDataRaw?.version === 1;
        capaOrigemLocal = capaTemEditorData ? "editor" : "ia_ou_upload";
        isPanoramicLocal = capaResolvida.is_panoramica;

        const paginasReais = miolo?.paginas_reais ?? 0;
        const f = FORMATS[formatoKey] ?? FORMATS.padrao_br;
        const lombadaMmCalc = calcularLombada(paginasReais);
        const orelhaMm = capaResolvida.orelha_mm;
        const totalWMm = f.width_mm * 2 + lombadaMmCalc + orelhaMm * 2 + SANGRIA_MM * 2;
        const orelhaRatioW = orelhaMm > 0 ? (orelhaMm + SANGRIA_MM) / totalWMm : 0;

        setBookData({
          coverUrl: capaResolvida.url_area_util ?? capaResolvida.url_principal,
          isPanoramic: capaResolvida.is_panoramica,
          fills: capaResolvida.fills,
          titulo: ms?.titulo ?? "Livro sem título",
          autor: [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor",
          // Prioridade: lombada REAL do miolo (atualizada via P.3 no
          // auto-chain gerar-pdf após diagramação). Fallback para a
          // lombada salva na capa apenas quando o miolo ainda não gerou
          // PDF — cenário residual.
          lombadaMm: miolo?.lombada_mm ?? capaResolvida.lombada_mm ?? 10,
          paginas: paginasReais || (miolo?.paginas_estimadas ?? 0),
          capaTemEditorData,
          orelhaMm,
          orelhaRatioW,
        });
        setIsFrentePura(capaResolvida.analise_tecnica?.is_frente_pura ?? false);

        // Bloco 1m: computa hasCreditos com mesma lógica da tela de publicação.
        // Retrocompat: "pessoal" → digital + !incluir_creditos; "livrarias" → completa.
        const creditos = project.dados_creditos as {
          config?: { proposito?: string; incluir_creditos?: boolean };
        } | null;
        const propRaw = creditos?.config?.proposito;
        const propositoNormalizado =
          propRaw === "livrarias" ? "completa"
          : propRaw === "pessoal" ? "digital"
          : (propRaw ?? "digital");
        const incluirCreditosNormalizado =
          propRaw === "pessoal" ? false
          : (creditos?.config?.incluir_creditos !== false);
        setHasCreditos(
          propositoNormalizado === "completa" || incluirCreditosNormalizado
        );
      }

      // Primeira análise — sempre POST pra garantir shape novo em dados_qa.
      const analyzeRes = await fetch("/api/agentes/prova", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      if (analyzeRes.ok) {
        prova = await analyzeRes.json() as ProvaResult;
        setResult(prova);
      }
    } finally {
      setLoading(false);
    }

    // Fase 2 (visível): auto-gerar artefatos derivados em paralelo.
    // O autor vê "Preparando arquivos finais…" enquanto rodamos os PDFs.
    // Idempotente — se rodar de novo, só pega o que ainda falta.
    if (!prova) return;
    // Freemium não dispara auto-gen: os endpoints respondem 402 (gate) e a
    // Prova é ponto de conversão, não geração. (D2-05)
    if (planoLocal === "freemium") return;
    const missing = detectarArtefatosAusentes(prova, capaOrigemLocal, isPanoramicLocal);
    if (missing.length === 0) return;

    setPreparandoArtefatos(true);
    try {
      const results = await Promise.allSettled(
        missing.map(m => gerarArtefato(m.endpoint, id as string)),
      );
      // Defesa em profundidade: se qualquer artefato voltou gated (402),
      // marca gateAtivo — cobre projeto rebaixado no meio de uma sessão.
      const anyGated = results.some(r => r.status === "fulfilled" && r.value.gated === true);
      if (anyGated) setGateAtivo(true);

      const reAnalyze = await fetch("/api/agentes/prova", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      if (reAnalyze.ok) setResult(await reAnalyze.json() as ProvaResult);
    } finally {
      setPreparandoArtefatos(false);
    }
  }, [id]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  useEffect(() => {
    if (isFrentePura && activeTab === "capa") {
      setActiveTab("capa_aberta");
    }
  }, [isFrentePura, activeTab]);

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

  // Retry manual dispara o mesmo mecanismo do auto-gen: chama o endpoint
  // (com retry silencioso interno) e re-analisa. Erros são absorvidos —
  // o card "Estamos finalizando…" aparece se a pendência derivada persistir.
  async function retryArtefato(endpoint: string) {
    if (!projectIdStr) return;
    setPreparandoArtefatos(true);
    try {
      await gerarArtefato(endpoint, projectIdStr);
      const res = await fetch("/api/agentes/prova", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectIdStr }),
      });
      if (res.ok) setResult(await res.json() as ProvaResult);
    } finally {
      setPreparandoArtefatos(false);
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

  async function handleAprovarEPublicar() {
    if (!digitalAprovado || !projectIdStr) return;
    setApprovingPub(true);
    const { error } = await supabase
      .from("projects")
      .update({ etapa_atual: "publicacao", qa_aprovado_em: new Date().toISOString() })
      .eq("id", projectIdStr);
    if (error) {
      console.error("[prova] falha ao aprovar e publicar:", error);
      alert(`Não foi possível registrar a aprovação: ${error.message}`);
      setApprovingPub(false);
      return;
    }
    router.push(`/dashboard/publicacao/${projectIdStr}`);
  }

  function handleNavigateToEtapa(etapa: string) {
    if (etapa === "__gerar_pdf_digital__") { retryArtefato("/api/agentes/gerar-pdf-digital"); return; }
    if (etapa === "__gerar_pdf_miolo__") { retryArtefato("/api/agentes/gerar-pdf"); return; }
    // Capa gráfica tem branch de action=ir_para_editor_capa que redireciona pro editor,
    // então usa handler dedicado ao invés do retryArtefato genérico.
    if (etapa === "__preparar_capa_grafica__") { handlePrepararCapaGrafica(); return; }
    // Capa incompatível: destino depende da origem (editor vs upload/IA).
    if (etapa === "__alterar_capa__") {
      if (capaOrigem === "editor") router.push(`/editor/capa/${projectIdStr}`);
      else router.push(`/dashboard/capa/${projectIdStr}`);
      return;
    }
    router.push(`/dashboard/${etapa}/${id}`);
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  // Filtra pendências derivadas (artefatos que a plataforma gera sozinha) das
  // que exigem decisão do autor. Autor nunca vê "PDF eBook não pôde ser gerado"
  // — vê apenas o que ele pode acionar. Exceção: pdf_capa_grafica com sentinel
  // "__alterar_capa__" É acionável (autor decide entre editor ou upload).
  const isPendenciaDerivada = (p: ProvaItem) =>
    p.categoria === "pdf_ebook" ||
    p.categoria === "pdf_miolo_grafica" ||
    (p.categoria === "pdf_capa_grafica" && p.acao?.etapa !== "__alterar_capa__");

  // Bloco 1m: pendências da página de créditos ficam obsoletas quando o autor
  // conscientemente optou por não incluí-la (digital com toggle off).
  const isPendenciaCreditosObsoleta = (p: ProvaItem) =>
    !hasCreditos && p.acao?.etapa === "creditos";

  const digitalPendenciasRaw = result?.digital?.pendencias ?? [];
  const impressaPendenciasRaw = result?.grafica?.pendencias ?? [];
  const digitalPendencias = digitalPendenciasRaw.filter(
    p => !isPendenciaDerivada(p) && !isPendenciaCreditosObsoleta(p)
  );
  const impressaPendencias = impressaPendenciasRaw.filter(
    p => !isPendenciaDerivada(p) && !isPendenciaCreditosObsoleta(p)
  );
  const impressaAvisos = result?.grafica?.avisos ?? [];

  const digitalAprovado = digitalPendencias.length === 0;
  const impressaAprovado = impressaPendencias.length === 0;

  // Se ainda existem pendências derivadas no result mas o auto-gen não está
  // rodando, significa que estamos entre ciclos — a UI mostra "Estamos
  // finalizando…" ao invés de expor o erro cru ao autor.
  const artefatosPendentes =
    digitalPendenciasRaw.some(isPendenciaDerivada) ||
    impressaPendenciasRaw.some(isPendenciaDerivada);
  const finalizandoArtefatos = artefatosPendentes && !preparandoArtefatos;

  const capaOrigem = bookData?.capaTemEditorData ? "editor" : "ia_ou_upload";

  // D2-05: freemium (ou qualquer artefato retornado 402) SUBSTITUI trilhas +
  // aprovação pela tela de conversão. Book3D/abas permanecem — o autor vê
  // o livro dele como parte da celebração.
  const mostrarConversao = plano === "freemium" || gateAtivo;

  // D2-07: upgrade Essencial→Pro pela DIFERENÇA (sempre calculado de lib/planos).
  const precoUpgradePro = `R$ ${((PLANO_PRECO_CENTAVOS.pro - PLANO_PRECO_CENTAVOS.essencial) / 100).toLocaleString("pt-BR")}`;

  return (
    <div>
      <EtapasProgress currentStep={6} projectId={id} />
      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Etapa final
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">Prova</h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed max-w-xl">
            Confira o livro pronto para publicação. Ao aprovar, você assina a versão final e libera a distribuição.
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

            {/* Bloco de visualização — INTOCADO */}
            {bookData && (
              <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                <div className="flex border-b border-zinc-100">
                  {!isFrentePura && (
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
                  )}
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

                {activeTab === "capa" && !isFrentePura ? (
                  <div className="p-8"><Book3D book={bookData} /></div>
                ) : activeTab === "capa_aberta" ? (
                  <CapaAberta bookData={bookData} isFrentePura={isFrentePura} />
                ) : (
                  <PdfFolheador projectId={projectIdStr} />
                )}
              </div>
            )}

            {/* D2-05: tela de conversão substitui trilhas/aprovação para
                freemium (ou gate 402 no meio da sessão). */}
            {mostrarConversao && (
              <TelaConversaoPlano />
            )}

            {/* Preparando artefatos derivados em background */}
            {preparandoArtefatos && !mostrarConversao && (
              <div className="bg-brand-gold/5 border border-brand-gold/20 rounded-xl p-4 flex items-center gap-3">
                <span className="w-5 h-5 rounded-full border-2 border-brand-gold border-t-transparent animate-spin shrink-0" />
                <div>
                  <p className="text-sm text-brand-primary font-medium">Preparando arquivos finais…</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Estamos gerando os PDFs de publicação. Pode levar até um minuto.
                  </p>
                </div>
              </div>
            )}

            {/* Estado silencioso: artefato derivado ainda ausente entre ciclos.
                Autor não vê erro nem CTA — só a mensagem calma de que a
                plataforma está finalizando por ele. */}
            {finalizandoArtefatos && !mostrarConversao && (
              <div className="bg-brand-gold/5 border border-brand-gold/20 rounded-xl p-4 flex items-center gap-3">
                <span className="w-5 h-5 rounded-full border-2 border-brand-gold border-t-transparent animate-spin shrink-0" />
                <div>
                  <p className="text-sm text-brand-primary font-medium">Estamos finalizando os arquivos, aguarde…</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Se demorar mais que alguns minutos, recarregue a página.</p>
                </div>
              </div>
            )}

            {/* Trilhas de prontidão */}
            {result && !mostrarConversao && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TrilhaCard
                  icone="tablet"
                  titulo="Publicação digital"
                  subtitulo="EPUB para Amazon, Apple, Kobo, Google Play"
                  aprovado={digitalAprovado}
                  pendencias={digitalPendencias}
                  avisos={[]}
                  onNavigate={handleNavigateToEtapa}
                  ctaLabel={null}
                  ctaBusy={false}
                  ctaError={null}
                  avisoInfo={!hasCreditos ? "Livro gerado sem página de créditos, conforme sua escolha. Adequado para plataformas digitais e distribuição gratuita." : undefined}
                />
                <TrilhaCard
                  icone="livro"
                  titulo="Publicação impressa"
                  subtitulo="PDF com sangria e marcas de corte para gráfica"
                  aprovado={impressaAprovado}
                  pendencias={impressaPendencias}
                  avisos={impressaAvisos}
                  onNavigate={handleNavigateToEtapa}
                  ctaLabel={null}
                  ctaBusy={false}
                  ctaError={null}
                  modoPrevia={plano !== null && plano !== "pro"}
                />

                {/* D2-07: upgrade Essencial→Pro pela diferença (sempre
                    calculado de lib/planos). CTA → /dashboard/planos até o D.4. */}
                {plano === "essencial" && (
                  <div className="md:col-span-2 bg-white rounded-2xl border border-brand-gold/40 p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-brand-primary">
                        Libere seus arquivos de impressão
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Upgrade para Pro por {precoUpgradePro} e baixe o PDF de impressão
                        sem marca d'água, com capa completa e impressão via Autoria.
                      </p>
                    </div>
                    <button
                      onClick={() => router.push("/dashboard/planos")}
                      className="px-5 py-2.5 rounded-xl bg-brand-primary text-brand-gold text-sm font-medium hover:bg-brand-primary/90 transition-colors"
                    >
                      Fazer upgrade →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Card de aprovação */}
            {result && !mostrarConversao && (
              <div className="bg-white rounded-2xl border-2 border-brand-gold/40 p-6">
                <div className="flex items-start gap-3 mb-3">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                    <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/>
                    <path d="m9 15 2 2 4-4"/>
                  </svg>
                  <div>
                    <p className="font-medium text-brand-primary text-base">Aprovar e publicar</p>
                    <p className="text-sm text-zinc-500 mt-1 leading-relaxed">
                      Ao aprovar, você confirma que o livro está pronto para publicação e segue para enviar às plataformas de distribuição.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    onClick={handleAprovarEPublicar}
                    disabled={!digitalAprovado || approvingPub || preparandoArtefatos || finalizandoArtefatos}
                    className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {approvingPub
                      ? "Aprovando…"
                      : finalizandoArtefatos
                        ? "Aguarde…"
                        : "Aprovar e publicar →"}
                  </button>
                  <button
                    onClick={handleAnalisar}
                    disabled={analyzing || preparandoArtefatos || finalizandoArtefatos}
                    className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-brand-gold/30 transition-colors disabled:opacity-50"
                  >
                    {analyzing ? "Reanalisando…" : "Reanalisar"}
                  </button>
                </div>
                {!digitalAprovado && (
                  <p className="mt-3 text-xs text-zinc-400">
                    Resolva as pendências da trilha digital para aprovar. A trilha impressa é opcional — você pode preparar depois.
                  </p>
                )}
              </div>
            )}

            {/* Estado inicial: sem análise ainda */}
            {!result && !loading && !mostrarConversao && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
                <h3 className="font-heading text-xl text-brand-primary mb-2">Conferir o livro</h3>
                <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
                  Vamos verificar o que está pronto para publicação e o que ainda falta.
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

            {/* Detalhes técnicos — colapsável */}
            {result && bookData && (
              <details
                className="bg-white rounded-2xl border border-zinc-100"
                open={detailsOpen}
                onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-zinc-600 hover:text-zinc-800 transition-colors flex items-center justify-between">
                  Detalhes técnicos da obra
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${detailsOpen ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </summary>
                <div className="px-6 pb-5 pt-1 text-sm text-zinc-600 border-t border-zinc-50 grid grid-cols-2 gap-x-6 gap-y-2">
                  <div><span className="text-zinc-400">Título:</span> {bookData.titulo}</div>
                  <div><span className="text-zinc-400">Autor:</span> {bookData.autor}</div>
                  <div><span className="text-zinc-400">Formato:</span> {result.detalhes.formato ?? "—"}</div>
                  <div><span className="text-zinc-400">Páginas:</span> {result.detalhes.paginas ?? "—"}</div>
                  <div><span className="text-zinc-400">Lombada capa:</span> {result.detalhes.lombada_capa_mm?.toFixed(1) ?? "—"} mm</div>
                  <div><span className="text-zinc-400">Lombada miolo:</span> {result.detalhes.lombada_miolo_mm?.toFixed(1) ?? "—"} mm</div>
                </div>
              </details>
            )}

          </div>
        )}
      </main>
    </div>
  );
}

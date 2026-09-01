"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Worker do PDF.js servido localmente a partir de /public.
// Veja o script `postinstall` em package.json que mantém esse arquivo
// sincronizado com a versão instalada de pdfjs-dist.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export default function PdfFolheador({ projectId, pdfUrl: pdfUrlProp }: { projectId: string; pdfUrl?: string }) {
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

  const pdfUrl = pdfUrlProp ?? `/api/agentes/prova/preview-pdf?project_id=${projectId}`;

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

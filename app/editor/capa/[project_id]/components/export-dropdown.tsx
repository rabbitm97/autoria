"use client";

import { useState, useRef, useEffect } from "react";
import { useEditorStore } from "../lib/editor-store";
import { serializeEditorState } from "../lib/editor-serializer";
import { FORMATS, SANGRIA_MM, ORELHA_MM, calcularLombada, MM_TO_PX } from "../lib/dimensions";

const CLIENT_PDF_TIMEOUT_MS = 50_000;

type ExportState =
  | { kind: "idle" }
  | { kind: "exporting-png" }
  | { kind: "exporting-pdf"; step: string }
  | { kind: "pdf-done"; url: string; filename: string }
  | { kind: "error"; message: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40) || "capa";
}

interface ExportDropdownProps {
  projectId: string;
  projectTitle: string;
}

export function ExportDropdown({ projectId, projectTitle }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { elements, fills, isbn, autosaveCount, format, pages, comOrelhas, stageInstance } =
    useEditorStore();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function validateBeforeExport(): string | null {
    if (elements.length === 0) return "Adicione pelo menos um elemento antes de exportar.";
    const hasBarcode = elements.some((e) => e.type === "barcode");
    const hasIsbn = elements.some(
      (e) => e.type === "barcode" && (e as any).isbn?.length >= 10,
    );
    if (hasBarcode && !hasIsbn) {
      return "Há um código de barras sem ISBN válido. Adicione o ISBN ou remova o código de barras.";
    }
    return null;
  }

  async function handleExportPng() {
    const warning = validateBeforeExport();
    if (warning) { alert(warning); return; }
    if (!stageInstance) { alert("Canvas não pronto. Tente novamente."); return; }

    setExportState({ kind: "exporting-png" });
    setOpen(false);

    try {
      const f = FORMATS[format];
      const lombadaMm = calcularLombada(pages);
      const orelhaMm = comOrelhas ? ORELHA_MM : 0;
      const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
      const physicalWidthPx = totalWMm * (300 / 25.4);
      const stageWidthPx = stageInstance.width() / stageInstance.scaleX();
      const pixelRatio = physicalWidthPx / stageWidthPx;

      // Hide UI-only layers before export
      const layers = stageInstance.getLayers();
      const guideLayer = layers[layers.length - 1];   // guides are last
      const labelLayer = layers[layers.length - 2];
      const wasGuideVisible = guideLayer?.visible();
      const wasLabelVisible = labelLayer?.visible();
      guideLayer?.visible(false);
      labelLayer?.visible(false);

      // Hide transformer
      const transformer = stageInstance.findOne("Transformer");
      const wasTransformerVisible = transformer?.visible();
      transformer?.visible(false);

      stageInstance.batchDraw();

      const dataUrl = stageInstance.toDataURL({ mimeType: "image/png", pixelRatio, quality: 1 });

      // Restore
      guideLayer?.visible(wasGuideVisible ?? true);
      labelLayer?.visible(wasLabelVisible ?? true);
      transformer?.visible(wasTransformerVisible ?? true);
      stageInstance.batchDraw();

      const link = document.createElement("a");
      link.download = `${slugify(projectTitle)}-capa-300dpi.png`;
      link.href = dataUrl;
      link.click();

      setExportState({ kind: "idle" });
    } catch (err) {
      setExportState({ kind: "error", message: String(err) });
    }
  }

  async function handleExportPdf() {
    const warning = validateBeforeExport();
    if (warning) { alert(warning); return; }

    setExportState({ kind: "exporting-pdf", step: "Renderizando capa…" });
    setOpen(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_PDF_TIMEOUT_MS);

    try {
      setExportState({ kind: "exporting-pdf", step: "Gerando PDF…" });

      const res = await fetch(`/api/projects/${projectId}/cover-editor/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        throw new Error(data.error ?? "Falha ao gerar PDF");
      }

      const data = await res.json();
      if (!data.url) throw new Error("URL de download não retornada.");

      setExportState({ kind: "pdf-done", url: data.url, filename: data.filename });

      // Auto-download
      const link = document.createElement("a");
      link.href = data.url;
      link.download = data.filename;
      link.click();
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        setExportState({
          kind: "error",
          message: "PDF demorou demais (>50s). Tente exportar PNG 300dpi enquanto investigamos.",
        });
      } else {
        setExportState({ kind: "error", message: String(err.message ?? err) });
      }
    }
  }

  const isExporting =
    exportState.kind === "exporting-png" || exportState.kind === "exporting-pdf";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !isExporting && setOpen(!open)}
        disabled={isExporting}
        className="flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-[#c9a84c] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isExporting ? (
          <>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {exportState.kind === "exporting-pdf"
              ? exportState.step
              : "Exportando…"}
          </>
        ) : (
          <>
            Exportar capa
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </>
        )}
      </button>

      {open && !isExporting && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-[#e0ddd2] bg-[#fdfcf9] py-1 shadow-lg">
          <button
            onClick={handleExportPng}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" className="mt-0.5 shrink-0">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            <div>
              <p className="text-xs font-medium text-[#1a1a2e]">PNG 300dpi</p>
              <p className="text-[10px] text-zinc-400">Rápido · client-side</p>
            </div>
          </button>
          <div className="mx-4 border-t border-[#e0ddd2]" />
          <button
            onClick={handleExportPdf}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <div>
              <p className="text-xs font-medium text-[#1a1a2e]">PDF gráfica-pronto</p>
              <p className="text-[10px] text-zinc-400">Server-side · alguns segundos</p>
            </div>
          </button>
        </div>
      )}

      {/* Error / done toasts */}
      {exportState.kind === "error" && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-red-200 bg-white p-4 shadow-lg">
          <p className="mb-1 text-sm font-medium text-red-600">Falha na exportação</p>
          <p className="text-xs text-zinc-500">{exportState.message}</p>
          <button
            onClick={() => setExportState({ kind: "idle" })}
            className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-600"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

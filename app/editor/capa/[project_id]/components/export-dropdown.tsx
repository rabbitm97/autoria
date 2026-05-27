"use client";

import { useState, useRef, useEffect } from "react";
import { useEditorStore } from "../lib/editor-store";
import { captureStageAsDataUrl, captureStageAsBlob, dataUrlToBlob } from "../lib/png-export";
import { hashElements, hashFills } from "../lib/state-hash";

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
      const dataUrl = await captureStageAsDataUrl(stageInstance, format, pages, comOrelhas);

      // Download locally
      const link = document.createElement("a");
      link.download = `${slugify(projectTitle)}-capa-300dpi.png`;
      link.href = dataUrl;
      link.click();

      setExportState({ kind: "idle" });

      // Fire-and-forget confirm (saves PNG to storage and updates dados_capa)
      const blob = dataUrlToBlob(dataUrl);
      const form = new FormData();
      form.append("png", blob, "cover.png");
      fetch(`/api/projects/${projectId}/cover-editor/confirm`, {
        method: "POST",
        body: form,
      }).then(async (res) => {
        if (res.ok || res.status === 207) {
          const data = await res.json() as { confirmed_at: string };
          const { elements: els, fills: fls, setConfirmedSnapshot } = useEditorStore.getState();
          setConfirmedSnapshot({
            elementsHash: hashElements(els),
            fillsHash: hashFills(fls),
            confirmedAt: data.confirmed_at,
          });
        }
      }).catch(() => {});
    } catch (err) {
      setExportState({ kind: "error", message: String(err) });
    }
  }

  async function handleExportPdf() {
    const warning = validateBeforeExport();
    if (warning) { alert(warning); return; }
    if (!stageInstance) { alert("Canvas não pronto. Tente novamente."); return; }

    setExportState({ kind: "exporting-pdf", step: "Capturando capa…" });
    setOpen(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_PDF_TIMEOUT_MS);

    try {
      const blob = await captureStageAsBlob(stageInstance, format, pages, comOrelhas);

      setExportState({ kind: "exporting-pdf", step: "Gerando PDF…" });

      const form = new FormData();
      form.append("png", blob, "cover.png");
      form.append("download_format", "pdf");

      const res = await fetch(`/api/projects/${projectId}/cover-editor/confirm`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json() as {
        imagem_url: string | null;
        pdf_url: string | null;
        confirmed_at: string;
        warning?: string;
      };

      if (!res.ok && res.status !== 207) {
        throw new Error((data as any).error ?? "Falha ao gerar PDF");
      }

      // Update confirmed snapshot
      const { elements: els, fills: fls, setConfirmedSnapshot } = useEditorStore.getState();
      setConfirmedSnapshot({
        elementsHash: hashElements(els),
        fillsHash: hashFills(fls),
        confirmedAt: data.confirmed_at,
      });

      if (!data.pdf_url) {
        throw new Error(data.warning ?? "PDF não gerado. Tente novamente ou use PNG 300dpi.");
      }

      const filename = `${slugify(projectTitle)}-capa-300dpi.pdf`;
      setExportState({ kind: "pdf-done", url: data.pdf_url, filename });

      const link = document.createElement("a");
      link.href = data.pdf_url;
      link.download = filename;
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
        className="flex items-center gap-1.5 rounded-lg border border-[#e0ddd2] px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 disabled:opacity-60"
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
            Exportar
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

"use client";

import { useState, useRef, useEffect } from "react";
import { useEditorStore } from "../lib/editor-store";
import { captureStageAsDataUrl, dataUrlToBlob } from "../lib/png-export";

const CLIENT_PDF_TIMEOUT_MS = 55_000;

type ExportState =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "error"; message: string };

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40) || "capa"
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ExportDropdownProps {
  projectId: string;
  projectTitle: string;
}

export function ExportDropdown({ projectId, projectTitle }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { elements, isbn, format, pages, comOrelhas, stageInstance } = useEditorStore();

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

    setExportState({ kind: "busy", label: "Exportando PNG…" });
    setOpen(false);

    try {
      const dataUrl = await captureStageAsDataUrl(stageInstance, format, pages, comOrelhas);
      const blob = dataUrlToBlob(dataUrl);
      downloadBlob(blob, `${slugify(projectTitle)}-capa-300dpi.png`);
      setExportState({ kind: "idle" });
    } catch (err) {
      setExportState({ kind: "error", message: String(err) });
    }
  }

  async function handleExportPdf(versao: "digital" | "grafica") {
    const warning = validateBeforeExport();
    if (warning) { alert(warning); return; }

    const label = versao === "digital" ? "Gerando PDF digital…" : "Gerando PDF gráfica…";
    setExportState({ kind: "busy", label });
    setOpen(false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_PDF_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/projects/${projectId}/cover-editor/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versao }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json() as { url?: string | null; filename?: string; error?: string; dev?: boolean };

      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar PDF");

      if (data.dev) {
        // Dev mode — no real PDF
        setExportState({ kind: "idle" });
        return;
      }

      if (!data.url) throw new Error("URL do PDF não retornada.");

      // Fetch the PDF as a blob so it downloads directly instead of opening a new tab
      const pdfRes = await fetch(data.url);
      if (!pdfRes.ok) throw new Error("Falha ao baixar o PDF do storage.");
      const pdfBlob = await pdfRes.blob();
      const filename = data.filename ?? `capa-${versao}.pdf`;
      downloadBlob(pdfBlob, filename);

      setExportState({ kind: "idle" });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        setExportState({
          kind: "error",
          message: "PDF demorou demais (>55s). Tente exportar PNG 300dpi enquanto investigamos.",
        });
      } else {
        setExportState({ kind: "error", message: String(err.message ?? err) });
      }
    }
  }

  const isBusy = exportState.kind === "busy";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => !isBusy && setOpen(!open)}
        disabled={isBusy}
        className="flex items-center gap-1.5 rounded-lg border border-[#e0ddd2] px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800 disabled:opacity-60"
      >
        {isBusy ? (
          <>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            {exportState.label}
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

      {open && !isBusy && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-xl border border-[#e0ddd2] bg-[#fdfcf9] py-1 shadow-lg">
          <button
            onClick={handleExportPng}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" className="mt-0.5 shrink-0">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
            <div>
              <p className="text-xs font-medium text-[#1a1a2e]">Baixar PNG (capa final)</p>
              <p className="text-[10px] text-zinc-400">300 dpi · client-side · rápido</p>
            </div>
          </button>

          <div className="mx-4 border-t border-[#e0ddd2]" />

          <button
            onClick={() => handleExportPdf("digital")}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <div>
              <p className="text-xs font-medium text-[#1a1a2e]">Baixar PDF digital</p>
              <p className="text-[10px] text-zinc-400">Sem sangria · eBook / prévia</p>
            </div>
          </button>

          <div className="mx-4 border-t border-[#e0ddd2]" />

          <button
            onClick={() => handleExportPdf("grafica")}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            <div>
              <p className="text-xs font-medium text-[#1a1a2e]">Baixar PDF gráfica</p>
              <p className="text-[10px] text-zinc-400">Com sangria e marcas de corte</p>
            </div>
          </button>
        </div>
      )}

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

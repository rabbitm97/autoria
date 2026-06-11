"use client";

import { useState, useRef, useEffect } from "react";
import { useCoverExport } from "../lib/use-cover-export";
import { CmykDisclaimerModal } from "./cmyk-disclaimer-modal";

interface ExportDropdownProps {
  projectId: string;
  projectTitle: string;
}

export function ExportDropdown({ projectId, projectTitle }: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { states, isBusy, exportPng, exportPdf, clearErrors, cmykDisclaimer, confirmDisclaimer, cancelDisclaimer } = useCoverExport(projectId, projectTitle);

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

  // Derive a single label for the busy button (whichever item is exporting)
  const busyLabel =
    states["png"].status === "busy" ? "Exportando PNG…" :
    states["pdf-digital"].status === "busy" ? "Gerando PDF digital…" :
    states["pdf-grafica"].status === "busy" ? "Gerando PDF gráfica…" :
    states["pdf-grafica-rgb"].status === "busy" ? "Gerando PDF gráfica RGB…" :
    "Exportando…";

  // First error across all items (shown in toast)
  const firstError = Object.values(states).find((s) => s.status === "error");
  const errorMessage = firstError?.status === "error" ? firstError.message : null;

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
            {busyLabel}
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
            onClick={() => { exportPng(); setOpen(false); }}
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
            onClick={() => { exportPdf("digital"); setOpen(false); }}
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
            onClick={() => { exportPdf("grafica"); setOpen(false); }}
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

          <div className="mx-4 border-t border-[#e0ddd2]" />

          <button
            onClick={() => { exportPdf("grafica_rgb"); setOpen(false); }}
            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              <circle cx="9" cy="13" r="1.5" fill="#1a1a2e" /><circle cx="13" cy="13" r="1.5" fill="#1a1a2e" /><circle cx="17" cy="13" r="1.5" fill="#1a1a2e" />
            </svg>
            <div>
              <p className="text-xs font-medium text-[#1a1a2e]">Baixar PDF gráfica RGB</p>
              <p className="text-[10px] text-zinc-400">Sem conversão CMYK · gráfica digital</p>
            </div>
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-red-200 bg-white p-4 shadow-lg">
          <p className="mb-1 text-sm font-medium text-red-600">Falha na exportação</p>
          <p className="text-xs text-zinc-500">{errorMessage}</p>
          <button
            onClick={clearErrors}
            className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-600"
          >
            Fechar
          </button>
        </div>
      )}

      <CmykDisclaimerModal
        open={cmykDisclaimer.open}
        onConfirm={confirmDisclaimer}
        onCancel={cancelDisclaimer}
      />
    </div>
  );
}

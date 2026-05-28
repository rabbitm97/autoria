"use client";

import { useState } from "react";

interface CmykDisclaimerModalProps {
  open: boolean;
  onConfirm: (remember: boolean) => void;
  onCancel: () => void;
}

export function CmykDisclaimerModal({ open, onConfirm, onCancel }: CmykDisclaimerModalProps) {
  const [remember, setRemember] = useState(false);

  if (!open) return null;

  function handleCancel() {
    setRemember(false);
    onCancel();
  }

  function handleConfirm() {
    onConfirm(remember);
    setRemember(false);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl bg-[#fdfcf9] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-7 py-7">
          <div className="mb-4 flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-heading text-base font-semibold text-[#1a1a2e]">Cores em CMYK</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                Este PDF está em CMYK (cor de impressão). As cores aparecem mais sutis em tela do que no editor — isso é normal e fiel ao que será impresso.
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="-mt-0.5 shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="Fechar"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <label className="mb-5 flex cursor-pointer items-center gap-2.5 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-[#c9a84c]"
            />
            <span className="text-xs text-zinc-500">Não mostrar mais</span>
          </label>

          <div className="flex gap-2.5">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-[#e0ddd2] px-4 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              className="flex-1 rounded-xl bg-[#1a1a2e] px-4 py-2.5 text-sm font-medium text-[#c9a84c] transition-opacity hover:opacity-90"
            >
              Entendi, baixar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

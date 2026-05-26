"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (dontShowAgain: boolean) => void;
}

export function DocxDisclaimer({ open, onClose, onConfirm }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 z-10">
        <h2 className="font-heading text-lg text-brand-primary mb-4">
          Sobre o arquivo .docx
        </h2>

        <div className="text-sm text-zinc-600 leading-relaxed space-y-3 mb-5">
          <p>
            O DOCX é a versão <strong>editável</strong> do seu livro. Use para fazer ajustes finos no Word.
          </p>
          <p>
            A formatação espelha o PDF (tamanho de página, margens, hierarquia, sumário automático,
            ornamentos), com uma única diferença:{" "}
            <strong>as fontes editoriais do PDF são adaptadas para fontes universais do Word</strong>{" "}
            (Cambria, Georgia, Verdana, Times New Roman), garantindo que o arquivo abra igual em
            qualquer computador.
          </p>
          <p>
            <strong>Para a versão final de impressão profissional</strong>, re-importe o DOCX editado
            pela plataforma — assim geramos um novo PDF com as fontes editoriais originais e as marcas
            de corte para a gráfica.
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer mb-6 text-sm text-zinc-500">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={e => setDontShowAgain(e.target.checked)}
            className="rounded border-zinc-300"
          />
          Não mostrar novamente
        </label>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-zinc-200 text-zinc-600 py-2.5 rounded-xl text-sm font-medium hover:border-zinc-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(dontShowAgain)}
            className="flex-1 bg-brand-primary text-brand-surface py-2.5 rounded-xl text-sm font-semibold hover:bg-[#2a2a4e] transition-colors"
          >
            Baixar DOCX
          </button>
        </div>
      </div>
    </div>
  );
}

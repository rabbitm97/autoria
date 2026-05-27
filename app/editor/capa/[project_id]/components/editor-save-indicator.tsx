"use client";

import { useMemo } from "react";
import { useEditorStore } from "../lib/editor-store";
import { hashElements, hashFills } from "../lib/state-hash";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface EditorSaveIndicatorProps {
  onRetry: () => void;
}

export function EditorSaveIndicator({ onRetry }: EditorSaveIndicatorProps) {
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const confirmedSnapshot = useEditorStore((s) => s.confirmedSnapshot);
  const elements = useEditorStore((s) => s.elements);
  const fills = useEditorStore((s) => s.fills);

  const hasUnconfirmedChanges = useMemo(() => {
    if (!confirmedSnapshot) return false;
    return (
      hashElements(elements) !== confirmedSnapshot.elementsHash ||
      hashFills(fills) !== confirmedSnapshot.fillsHash
    );
  }, [confirmedSnapshot, elements, fills]);

  if (saveStatus.kind === "idle") {
    return (
      <span className="select-none text-xs text-zinc-300">
        Pronto pra começar
      </span>
    );
  }

  if (saveStatus.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-zinc-400">
        <svg
          className="animate-spin"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Salvando…
      </span>
    );
  }

  if (saveStatus.kind === "saved") {
    if (hasUnconfirmedChanges) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-500">
          <span className="text-amber-500">●</span>
          Edições não publicadas
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Salvo às {formatTime(saveStatus.at)}
      </span>
    );
  }

  if (saveStatus.kind === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-red-500">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Erro ao salvar
        <button
          onClick={onRetry}
          className="underline underline-offset-2 hover:text-red-700"
        >
          Tentar novamente
        </button>
      </span>
    );
  }

  return null;
}

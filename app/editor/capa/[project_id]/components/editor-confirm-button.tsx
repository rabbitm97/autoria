"use client";

import { useState } from "react";
import { useEditorStore } from "../lib/editor-store";
import { captureStageAsBlob } from "../lib/png-export";
import { serializeEditorState } from "../lib/editor-serializer";
import { hashElements, hashFills } from "../lib/state-hash";

interface EditorConfirmButtonProps {
  projectId: string;
  onConfirmed?: (confirmedAt: string) => void;
}

type ConfirmState = "idle" | "confirming" | "error";

export function EditorConfirmButton({ projectId, onConfirmed }: EditorConfirmButtonProps) {
  const [state, setState] = useState<ConfirmState>("idle");

  async function handleConfirm() {
    // Read imperatively to guarantee we have the current store value at click time,
    // not a stale value from a previous render's closure
    const { stageInstance, format, pages, orelhaMm } = useEditorStore.getState();
    if (!stageInstance) {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
      return;
    }
    setState("confirming");

    try {
      // Ensure editor_data (including orelhaMm) is saved before confirming
      const currentState = useEditorStore.getState();
      const snapshot = serializeEditorState(currentState);
      await fetch(`/api/projects/${projectId}/cover-editor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      const blob = await captureStageAsBlob(stageInstance, format, pages, orelhaMm);
      const form = new FormData();
      form.append("png", blob, "cover.png");

      const res = await fetch(`/api/projects/${projectId}/cover-editor/confirm`, {
        method: "POST",
        body: form,
      });

      if (!res.ok && res.status !== 207) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error ?? "Erro ao confirmar");
      }

      const data = await res.json() as { confirmed_at: string };
      const { elements, fills, setConfirmedSnapshot } = useEditorStore.getState();
      setConfirmedSnapshot({
        elementsHash: hashElements(elements),
        fillsHash: hashFills(fills),
        confirmedAt: data.confirmed_at,
      });

      setState("idle");
      onConfirmed?.(data.confirmed_at);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  if (state === "confirming") {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-[#c9a84c] opacity-70"
      >
        <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        Confirmando…
      </button>
    );
  }

  if (state === "error") {
    return (
      <button
        onClick={handleConfirm}
        className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
      >
        Erro — Tentar novamente
      </button>
    );
  }

  return (
    <button
      onClick={handleConfirm}
      className="flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 py-1.5 text-xs font-medium text-[#c9a84c] transition-opacity hover:opacity-90"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      Confirmar capa
    </button>
  );
}

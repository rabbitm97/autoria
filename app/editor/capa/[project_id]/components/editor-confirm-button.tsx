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
    console.log("[CONFIRM] 1. clicou");
    const storeState = useEditorStore.getState();
    console.log("[CONFIRM] 2. store completo:", {
      hasStage: !!storeState.stageInstance,
      stageType: storeState.stageInstance?.constructor?.name,
      stageDestroyed: (storeState.stageInstance as unknown as { _isDestroyed?: boolean })?._isDestroyed,
      format: storeState.format,
      pages: storeState.pages,
      comOrelhas: storeState.comOrelhas,
    });

    // Espera o stage estar disponível — em caso raro de clique muito rápido
    // logo após mount, o setStageInstance pode ainda não ter rodado
    let attempts = 0;
    let stage = storeState.stageInstance;
    while (!stage && attempts < 10) {
      console.log(`[CONFIRM] 3. stage null, tentativa ${attempts + 1}/10, aguardando 50ms…`);
      await new Promise((r) => setTimeout(r, 50));
      stage = useEditorStore.getState().stageInstance;
      attempts++;
    }

    if (!stage) {
      console.error(
        "[CONFIRM] 4. EARLY RETURN — stageInstance permanece null após 500ms. " +
        "O EditorCanvas pode não ter montado corretamente."
      );
      setState("error");
      setTimeout(() => setState("idle"), 3000);
      return;
    }

    console.log("[CONFIRM] 4. stage ok, tipo:", stage.constructor?.name);
    const { format, pages, comOrelhas } = useEditorStore.getState();
    setState("confirming");

    try {
      console.log("[CONFIRM] 5. serializando estado…");
      const currentState = useEditorStore.getState();
      const snapshot = serializeEditorState(currentState);

      console.log("[CONFIRM] 6. PUT cover-editor…");
      const saveRes = await fetch(`/api/projects/${projectId}/cover-editor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      console.log("[CONFIRM] 7. PUT respondeu:", saveRes.status, saveRes.ok);
      if (!saveRes.ok) {
        const errData = await saveRes.json().catch(() => ({}));
        console.error("[CONFIRM] 7a. Falha no PUT cover-editor:", saveRes.status, errData);
        throw new Error("Falha ao salvar antes de confirmar");
      }

      console.log("[CONFIRM] 8. captureStageAsBlob…");
      const blob = await captureStageAsBlob(stage, format, pages, comOrelhas);
      console.log("[CONFIRM] 9. blob pronto, size:", blob.size, "type:", blob.type);
      const form = new FormData();
      form.append("png", blob, "cover.png");

      console.log("[CONFIRM] 10. POST confirm…");
      const res = await fetch(`/api/projects/${projectId}/cover-editor/confirm`, {
        method: "POST",
        body: form,
      });
      console.log("[CONFIRM] 11. POST respondeu:", res.status, res.ok);

      if (!res.ok && res.status !== 207) {
        const data = await res.json().catch(() => ({}));
        console.error("[CONFIRM] 11a. Falha no POST confirm:", res.status, data);
        throw new Error((data as { error?: string }).error ?? "Erro ao confirmar");
      }

      console.log("[CONFIRM] 12. lendo confirmed_at…");
      const data = (await res.json()) as { confirmed_at: string };
      console.log("[CONFIRM] 13. confirmed_at:", data.confirmed_at);
      const { elements, fills, setConfirmedSnapshot } = useEditorStore.getState();
      setConfirmedSnapshot({
        elementsHash: hashElements(elements),
        fillsHash: hashFills(fills),
        confirmedAt: data.confirmed_at,
      });

      console.log("[CONFIRM] 14. concluído com sucesso");
      setState("idle");
      onConfirmed?.(data.confirmed_at);
    } catch (err) {
      console.error("[CONFIRM] CATCH — Erro ao confirmar capa:", err);
      if (err instanceof Error) {
        console.error("[CONFIRM] message:", err.message);
        console.error("[CONFIRM] stack:", err.stack);
      }
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

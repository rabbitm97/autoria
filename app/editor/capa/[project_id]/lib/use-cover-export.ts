"use client";

import { useState } from "react";
import { useEditorStore } from "./editor-store";
import { captureStageAsDataUrl, captureStageAsJpegDataUrl, dataUrlToBlob } from "./png-export";
import { serializeEditorState } from "./editor-serializer";

export type ExportItemKey = "png" | "pdf-digital" | "pdf-grafica";
type ItemState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string };

const IDLE: ItemState = { status: "idle" };
const TIMEOUT_MS = 55_000;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 40) || "capa";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useCoverExport(projectId: string, projectTitle: string) {
  const [states, setStates] = useState<Record<ExportItemKey, ItemState>>({
    "png": IDLE,
    "pdf-digital": IDLE,
    "pdf-grafica": IDLE,
  });

  function setItem(key: ExportItemKey, next: ItemState) {
    setStates((prev) => ({ ...prev, [key]: next }));
  }

  function validate(): string | null {
    const { elements } = useEditorStore.getState();
    if (elements.length === 0) return "Adicione pelo menos um elemento antes de exportar.";
    const hasBarcode = elements.some((e) => e.type === "barcode");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasIsbn = elements.some((e) => e.type === "barcode" && (e as any).isbn?.length >= 10);
    if (hasBarcode && !hasIsbn) {
      return "Há um código de barras sem ISBN válido. Adicione o ISBN ou remova o código de barras.";
    }
    return null;
  }

  async function exportPng() {
    const warning = validate();
    if (warning) { alert(warning); return; }

    const { stageInstance, format, pages, comOrelhas } = useEditorStore.getState();
    if (!stageInstance) { alert("Canvas não pronto. Tente novamente."); return; }

    setItem("png", { status: "busy" });
    try {
      const dataUrl = await captureStageAsDataUrl(stageInstance, format, pages, comOrelhas);
      downloadBlob(dataUrlToBlob(dataUrl), `${slugify(projectTitle)}-capa-300dpi.png`);
      setItem("png", IDLE);
    } catch (err) {
      setItem("png", { status: "error", message: String(err) });
    }
  }

  async function exportPdf(versao: "digital" | "grafica") {
    const warning = validate();
    if (warning) { alert(warning); return; }

    const key: ExportItemKey = versao === "digital" ? "pdf-digital" : "pdf-grafica";
    setItem(key, { status: "busy" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const storeState = useEditorStore.getState();
      const { stageInstance, format, pages, comOrelhas } = storeState;
      if (!stageInstance) throw new Error("Canvas não pronto. Tente novamente.");

      const editorData = serializeEditorState(storeState);

      // Step 1: capture cover JPEG at 300 DPI and upload to temp storage path
      const jpegDataUrl = await captureStageAsJpegDataUrl(stageInstance, format, pages, comOrelhas);
      const jpegBlob = dataUrlToBlob(jpegDataUrl);

      const uploadRes = await fetch(`/api/projects/${projectId}/cover-editor/upload-cover-image`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: jpegBlob,
        signal: controller.signal,
      });
      if (!uploadRes.ok) {
        const d = await uploadRes.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Falha ao enviar imagem da capa.");
      }
      const { path: coverImagePath } = await uploadRes.json() as { path: string };

      // Step 2: generate PDF from the uploaded image
      const res = await fetch(`/api/projects/${projectId}/cover-editor/export-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versao, editorData, coverImagePath, format: storeState.format, pages: storeState.pages }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json() as { url?: string | null; filename?: string; error?: string; dev?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar PDF");
      if (data.dev) { setItem(key, IDLE); return; }
      if (!data.url) throw new Error("URL do PDF não retornada.");

      const pdfRes = await fetch(data.url);
      if (!pdfRes.ok) throw new Error("Falha ao baixar o PDF do storage.");
      downloadBlob(await pdfRes.blob(), data.filename ?? `capa-${versao}.pdf`);
      setItem(key, IDLE);
    } catch (err: unknown) {
      clearTimeout(timeout);
      const e = err as { name?: string; message?: string };
      const message = e.name === "AbortError"
        ? "PDF demorou demais (>55s). Tente exportar PNG 300dpi."
        : String(e.message ?? err);
      setItem(key, { status: "error", message });
    }
  }

  function clearErrors() {
    setStates((prev) => {
      const next = { ...prev } as Record<ExportItemKey, ItemState>;
      for (const k of Object.keys(next) as ExportItemKey[]) {
        if (next[k].status === "error") next[k] = IDLE;
      }
      return next;
    });
  }

  const isBusy = Object.values(states).some((s) => s.status === "busy");

  return { states, isBusy, exportPng, exportPdf, clearErrors };
}

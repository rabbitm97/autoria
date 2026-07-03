"use client";

import { useState } from "react";
import { useEditorStore } from "./editor-store";
import { captureStageAsJpegDataUrl, captureFrontAsJpegDataUrl, dataUrlToBlob } from "./png-export";
import { serializeEditorState } from "./editor-serializer";

export type ExportItemKey = "jpeg-ebook" | "jpeg-completa" | "pdf-grafica-cmyk" | "pdf-grafica-rgb";
type ItemState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string };

const IDLE: ItemState = { status: "idle" };
const TIMEOUT_MS = 55_000;
const CMYK_DISCLAIMER_KEY = "autoria:cmyk-disclaimer-seen";

export interface CmykDisclaimerState {
  open: boolean;
  pending: (() => void) | null;
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

function downloadDataUrl(dataUrl: string, filename: string) {
  downloadBlob(dataUrlToBlob(dataUrl), filename);
}

export function useCoverExport(projectId: string) {
  const [states, setStates] = useState<Record<ExportItemKey, ItemState>>({
    "jpeg-ebook": IDLE,
    "jpeg-completa": IDLE,
    "pdf-grafica-cmyk": IDLE,
    "pdf-grafica-rgb": IDLE,
  });

  const [cmykDisclaimer, setCmykDisclaimer] = useState<CmykDisclaimerState>({
    open: false,
    pending: null,
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

  async function exportJpegCompleta() {
    const warning = validate();
    if (warning) { alert(warning); return; }

    const { stageInstance, format, pages, orelhaMm } = useEditorStore.getState();
    if (!stageInstance) { alert("Canvas não pronto. Tente novamente."); return; }

    setItem("jpeg-completa", { status: "busy" });
    try {
      const dataUrl = await captureStageAsJpegDataUrl(stageInstance, format, pages, orelhaMm);
      downloadDataUrl(dataUrl, "capa-completa-300dpi.jpg");
      setItem("jpeg-completa", IDLE);
    } catch (err) {
      setItem("jpeg-completa", { status: "error", message: String(err) });
    }
  }

  async function exportJpegEbook() {
    const warning = validate();
    if (warning) { alert(warning); return; }

    const { stageInstance, format, pages, orelhaMm } = useEditorStore.getState();
    if (!stageInstance) { alert("Canvas não pronto. Tente novamente."); return; }

    setItem("jpeg-ebook", { status: "busy" });
    try {
      // Extração 100% client-side da região da frente. Nenhuma chamada de rede.
      const dataUrl = await captureFrontAsJpegDataUrl(stageInstance, format, pages, orelhaMm);
      downloadDataUrl(dataUrl, "capa-ebook.jpg");
      setItem("jpeg-ebook", IDLE);
    } catch (err) {
      setItem("jpeg-ebook", { status: "error", message: String(err) });
    }
  }

  async function runExportPdf(versao: "grafica" | "grafica_rgb") {
    const key: ExportItemKey = versao === "grafica" ? "pdf-grafica-cmyk" : "pdf-grafica-rgb";
    setItem(key, { status: "busy" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const storeState = useEditorStore.getState();
      const { stageInstance, format, pages, orelhaMm } = storeState;
      if (!stageInstance) throw new Error("Canvas não pronto. Tente novamente.");

      const editorData = serializeEditorState(storeState);

      const jpegDataUrl = await captureStageAsJpegDataUrl(stageInstance, format, pages, orelhaMm);
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
        ? "PDF demorou demais (>55s). Tente exportar JPEG capa completa."
        : String(e.message ?? err);
      setItem(key, { status: "error", message });
    }
  }

  async function exportPdf(versao: "grafica" | "grafica_rgb") {
    const warning = validate();
    if (warning) { alert(warning); return; }

    if (versao === "grafica") {
      // Disclaimer CMYK apenas para versão CMYK — RGB não converte cor, sem aviso
      const seen = localStorage.getItem(CMYK_DISCLAIMER_KEY) === "true";
      if (seen) {
        runExportPdf("grafica");
      } else {
        setCmykDisclaimer({ open: true, pending: () => runExportPdf("grafica") });
      }
      return;
    }

    // "grafica_rgb" vai direto, sem disclaimer
    runExportPdf(versao);
  }

  function confirmDisclaimer(remember: boolean) {
    if (remember) localStorage.setItem(CMYK_DISCLAIMER_KEY, "true");
    const pending = cmykDisclaimer.pending;
    setCmykDisclaimer({ open: false, pending: null });
    pending?.();
  }

  function cancelDisclaimer() {
    setCmykDisclaimer({ open: false, pending: null });
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

  return {
    states,
    isBusy,
    exportJpegCompleta,
    exportJpegEbook,
    exportPdf,
    clearErrors,
    cmykDisclaimer,
    confirmDisclaimer,
    cancelDisclaimer,
  };
}

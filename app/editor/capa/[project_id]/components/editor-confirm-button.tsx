"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useEditorStore } from "../lib/editor-store";
import {
  captureStageAsBlob,
  captureFrontAsJpegDataUrl,
  captureStageAsJpegDataUrl,
  dataUrlToBlob,
} from "../lib/png-export";
import { serializeEditorState } from "../lib/editor-serializer";
import { hashElements, hashFills } from "../lib/state-hash";
import { calcularLombada } from "../lib/dimensions";

interface EditorConfirmButtonProps {
  projectId: string;
  avulsoJob: string | null;
  onConfirmed?: (confirmedAt: string) => void;
}

// FERR-3.4g: no fluxo avulso, capturamos JPGs 300 DPI (frente + completa)
// depois do confirm bem-sucedido, subimos por signed URL e registramos os
// paths em ferramenta_jobs.entrada.exports_jpeg via PATCH. A rota de
// "capa-avulsa/concluir" usa esses paths para montar 2 dos 4 entregáveis.
// Falha aqui é não-bloqueante — o autor pode reconfirmar depois; se nunca
// vier, a concluir cai no fallback (extractFrontCover / download da url).
async function subirExportsAvulso(params: {
  projectId: string;
  avulsoJob: string;
}): Promise<void> {
  const { projectId, avulsoJob } = params;
  const { stageInstance, format, pages, orelhaMm, layout } = useEditorStore.getState();
  if (!stageInstance) return;

  const frenteUrl = await captureFrontAsJpegDataUrl(stageInstance, format, pages, orelhaMm, 0.92, layout);
  const completaUrl = await captureStageAsJpegDataUrl(stageInstance, format, pages, orelhaMm, 0.92, layout);
  const frenteBlob = dataUrlToBlob(frenteUrl);
  const completaBlob = dataUrlToBlob(completaUrl);

  async function upload(target: "export-frente-avulso" | "export-completa-avulso", blob: Blob): Promise<string | null> {
    const res = await fetch(`/api/projects/${projectId}/cover-editor/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    if (!res.ok) return null;
    const { path, signed_url, token } = (await res.json()) as {
      path: string;
      signed_url: string | null;
      token: string | null;
    };
    if (signed_url && token) {
      const { error } = await supabase.storage
        .from("editor-assets")
        .uploadToSignedUrl(path, token, blob, { contentType: "image/jpeg" });
      if (error) return null;
    }
    return path;
  }

  const [frentePath, completaPath] = await Promise.all([
    upload("export-frente-avulso", frenteBlob),
    upload("export-completa-avulso", completaBlob),
  ]);

  const exportsJpeg: { frente?: string; completa?: string } = {};
  if (frentePath) exportsJpeg.frente = frentePath;
  if (completaPath) exportsJpeg.completa = completaPath;
  if (Object.keys(exportsJpeg).length === 0) return;

  await fetch(`/api/ferramentas/jobs/${avulsoJob}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exports_jpeg: exportsJpeg }),
  }).catch(() => {});
}

type ConfirmState = "idle" | "confirming" | "error";

export function EditorConfirmButton({ projectId, avulsoJob, onConfirmed }: EditorConfirmButtonProps) {
  const [state, setState] = useState<ConfirmState>("idle");

  async function handleConfirm() {
    // Read imperatively to guarantee we have the current store value at click time,
    // not a stale value from a previous render's closure
    const { stageInstance, format, pages, orelhaMm, layout } = useEditorStore.getState();
    if (!stageInstance) {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
      return;
    }
    setState("confirming");

    try {
      // 1) autosave editor_data (inclui layout/orelhaMm) para não perder rascunho
      const currentState = useEditorStore.getState();
      const snapshot = serializeEditorState(currentState);
      await fetch(`/api/projects/${projectId}/cover-editor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      // 2) captura PNG panorâmico do canvas (layout-aware)
      const blob = await captureStageAsBlob(stageInstance, format, pages, orelhaMm, layout);

      // 3) pega signed upload URL — PNG 4K pode passar de 4.5 MB (limite
      // multipart do Vercel), então sobe direto ao storage.
      const presignRes = await fetch(`/api/projects/${projectId}/cover-editor/upload-url`, {
        method: "POST",
      });
      if (!presignRes.ok) {
        const j = await presignRes.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Falha ao obter URL de upload.");
      }
      const {
        path,
        signed_url: signedUrl,
        token,
      } = (await presignRes.json()) as {
        path: string;
        signed_url: string | null;
        token: string | null;
      };

      // 4) upload direto (skip em dev — signed_url null)
      if (signedUrl && token) {
        const { error: uploadErr } = await supabase.storage
          .from("editor-assets")
          .uploadToSignedUrl(path, token, blob, { contentType: "image/png" });
        if (uploadErr) {
          throw new Error(`Falha no upload: ${uploadErr.message}`);
        }
      }

      // 5) confirma com JSON compacto — { path, layout, lombada_mm }.
      // `lombada_mm` é a "assinatura" que atesta a lombada com que a capa foi
      // desenhada no instante do export (mesmo `pages` que alimentou o
      // captureStageAsBlob). Persistida em editor_data.lombada_mm_confirm.
      const lombadaMm = layout === "frente" ? 0 : calcularLombada(pages);
      const res = await fetch(`/api/projects/${projectId}/cover-editor/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, layout, lombada_mm: lombadaMm }),
      });

      if (!res.ok && res.status !== 207) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Erro ao confirmar");
      }

      const data = (await res.json()) as { confirmed_at: string };
      const { elements, fills, setConfirmedSnapshot } = useEditorStore.getState();
      setConfirmedSnapshot({
        elementsHash: hashElements(elements),
        fillsHash: hashFills(fills),
        confirmedAt: data.confirmed_at,
      });

      // FERR-3.4g: no fluxo avulso, exporta JPGs 300 DPI para virarem
      // entregáveis. Falha aqui é silenciosa — reconfirmar recompleta.
      if (avulsoJob) {
        try {
          await subirExportsAvulso({ projectId, avulsoJob });
        } catch (err) {
          console.warn("[capa-avulsa] exports_jpeg falhou:", err);
        }
      }

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

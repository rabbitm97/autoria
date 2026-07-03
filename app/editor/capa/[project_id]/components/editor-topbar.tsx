"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "../lib/editor-store";
import { captureStageAsDataUrl } from "../lib/png-export";
import { EditorSaveIndicator } from "./editor-save-indicator";
import { ExportDropdown } from "./export-dropdown";
import { EditorConfirmButton } from "./editor-confirm-button";
import { EditorConfirmSuccessModal } from "./editor-confirm-success-modal";
import type { ProjectData } from "../types";

interface EditorTopbarProps {
  projectData: ProjectData;
  onSaveRetry: () => void;
}

export function EditorTopbar({ projectData, onSaveRetry }: EditorTopbarProps) {
  const router = useRouter();
  const { legendasAtivas, toggleLegendas, stageInstance, format, pages, orelhaMm } = useEditorStore();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<"live" | "confirmed">("live");
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<{ open: boolean; confirmedAt: string }>({
    open: false,
    confirmedAt: "",
  });

  // If the page is restored from Next.js router cache with the modal open
  // (e.g. user clicked "Próximo passo" and came back), close it on mount
  useEffect(() => {
    setSuccessModal({ open: false, confirmedAt: "" });
  }, []);

  async function handleOpenPreview() {
    setPreviewOpen(true);
    setPreviewTab("live");
    setLivePreviewUrl(null);
    if (stageInstance) {
      try {
        const url = await captureStageAsDataUrl(stageInstance, format, pages, orelhaMm);
        setLivePreviewUrl(url);
      } catch {
        // ignore capture errors
      }
    }
  }

  function handleClosePreview() {
    setPreviewOpen(false);
    setLivePreviewUrl(null);
  }

  return (
    <>
      <div
        className="flex shrink-0 items-center gap-3 border-b border-[#e0ddd2] bg-[#fdfcf9] px-5"
        style={{ height: 56 }}
      >
        {/* Back button */}
        <button
          onClick={() => router.push(`/dashboard/capa/${projectData.projectId}`)}
          className="flex items-center gap-1.5 text-sm text-[#1a1a2e] transition-colors hover:text-zinc-400"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Voltar
        </button>

        <div className="h-4 w-px bg-[#e0ddd2]" />

        {/* Project title */}
        <p className="max-w-[180px] truncate text-sm text-zinc-400">
          {projectData.title || "Sem título"}
        </p>

        <div className="flex-1" />

        {/* Legendas toggle */}
        <button
          onClick={toggleLegendas}
          title="Mostrar legendas de cada região da capa — útil para identificar áreas enquanto projeta"
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            legendasAtivas
              ? "border-[#c9a84c] bg-[#c9a84c]/10 text-[#1a1a2e]"
              : "border-[#e0ddd2] text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
          }`}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Legendas
        </button>

        {/* Preview button */}
        <button
          onClick={handleOpenPreview}
          className="flex items-center gap-1.5 rounded-lg border border-[#e0ddd2] px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Pré-visualizar
        </button>

        <EditorSaveIndicator onRetry={onSaveRetry} />

        <EditorConfirmButton
          projectId={projectData.projectId}
          onConfirmed={(confirmedAt) => setSuccessModal({ open: true, confirmedAt })}
        />

        <ExportDropdown projectId={projectData.projectId} />
      </div>

      {successModal.open && (
        <EditorConfirmSuccessModal
          onClose={() => setSuccessModal((s) => ({ ...s, open: false }))}
          projectId={projectData.projectId}
          confirmedAt={successModal.confirmedAt}
        />
      )}

      {/* Preview modal — 2 tabs: live capture vs confirmed image */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={handleClosePreview}
        >
          <div
            className="mx-4 w-full max-w-2xl rounded-2xl bg-[#fdfcf9] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#e0ddd2] px-5 py-4">
              <p className="text-sm font-semibold text-[#1a1a2e]">Pré-visualização</p>
              <button
                onClick={handleClosePreview}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#e0ddd2]">
              <button
                onClick={() => setPreviewTab("live")}
                className={`px-5 py-2.5 text-xs font-medium transition-colors ${
                  previewTab === "live"
                    ? "border-b-2 border-[#c9a84c] text-[#1a1a2e]"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Ao vivo
              </button>
              <button
                onClick={() => setPreviewTab("confirmed")}
                className={`px-5 py-2.5 text-xs font-medium transition-colors ${
                  previewTab === "confirmed"
                    ? "border-b-2 border-[#c9a84c] text-[#1a1a2e]"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                Confirmado
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              {previewTab === "live" ? (
                livePreviewUrl ? (
                  <img
                    src={livePreviewUrl}
                    alt="Preview atual da capa"
                    className="w-full rounded-lg border border-[#e0ddd2]"
                  />
                ) : (
                  <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
                    <svg className="mr-2 animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Capturando canvas…
                  </div>
                )
              ) : projectData.confirmedImageUrl ? (
                <div className="space-y-3">
                  <img
                    src={projectData.confirmedImageUrl}
                    alt="Capa confirmada"
                    className="w-full rounded-lg border border-[#e0ddd2]"
                  />
                  {projectData.confirmedAt && (
                    <p className="text-center text-xs text-zinc-400">
                      Confirmado em{" "}
                      {new Date(projectData.confirmedAt).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex h-40 flex-col items-center justify-center gap-2">
                  <p className="text-sm text-zinc-500">Nenhuma confirmação registrada</p>
                  <p className="text-xs text-zinc-400">
                    Use "Confirmar capa" para publicar uma versão oficial.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

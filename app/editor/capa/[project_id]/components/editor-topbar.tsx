"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditorStore } from "../lib/editor-store";
import { EditorSaveIndicator } from "./editor-save-indicator";
import { ExportDropdown } from "./export-dropdown";
import type { ProjectData } from "../types";

interface EditorTopbarProps {
  projectData: ProjectData;
  onSaveRetry: () => void;
}

export function EditorTopbar({ projectData, onSaveRetry }: EditorTopbarProps) {
  const router = useRouter();
  const { legendasAtivas, toggleLegendas } = useEditorStore();
  const [previewOpen, setPreviewOpen] = useState(false);

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
          title="Ativar legendas: passe o mouse sobre cada região da capa para ver descrições"
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
          onClick={() => setPreviewOpen(true)}
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

        <ExportDropdown projectId={projectData.projectId} projectTitle={projectData.title} />
      </div>

      {/* Preview modal placeholder */}
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-[#fdfcf9] p-8 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9a9a9a"
                  strokeWidth="2"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
            </div>
            <p className="mb-1 text-base font-medium text-[#1a1a2e]">
              Pré-visualização
            </p>
            <p className="mb-6 text-sm text-zinc-400">
              A pré-visualização da capa completa estará disponível em breve.
            </p>
            <button
              onClick={() => setPreviewOpen(false)}
              className="rounded-xl border border-zinc-200 px-6 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-300"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

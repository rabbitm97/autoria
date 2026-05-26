"use client";

import dynamic from "next/dynamic";
import { useRef, useEffect } from "react";
import { EditorTopbar } from "./components/editor-topbar";
import { EditorSidebar } from "./components/editor-sidebar";
import { useEditorStore } from "./lib/editor-store";
import type { ProjectData } from "./types";

const EditorCanvas = dynamic(
  () => import("./components/editor-canvas").then((m) => ({ default: m.EditorCanvas })),
  { ssr: false },
);

export function EditorClient({ projectData }: { projectData: ProjectData }) {
  const initialized = useRef(false);
  if (!initialized.current) {
    useEditorStore.setState({
      format: projectData.format,
      pages: projectData.pages,
      isbn: projectData.isbn,
    });
    initialized.current = true;
  }

  const { reset, setIsbn } = useEditorStore();

  // Reset element state when project changes; keeps viewport settings
  useEffect(() => {
    reset();
    if (projectData.isbn) setIsbn(projectData.isbn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectData.projectId]);

  // Keyboard shortcuts
  useEffect(() => {
    const { deleteElement, selectedId, duplicateElement, moveElementZ } =
      useEditorStore.getState();

    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement;
      if (isInput) return;

      const state = useEditorStore.getState();

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        deleteElement(state.selectedId);
      }
      if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey) && state.selectedId) {
        e.preventDefault();
        duplicateElement(state.selectedId);
      }
      if (e.key === "]" && state.selectedId) {
        moveElementZ(state.selectedId, 1);
      }
      if (e.key === "[" && state.selectedId) {
        moveElementZ(state.selectedId, -1);
      }
      if (e.key === "Escape") {
        useEditorStore.setState({ selectedId: null });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <EditorTopbar projectData={projectData} />
      <div className="flex min-h-0 flex-1">
        <EditorSidebar projectData={projectData} />
        <div className="relative min-w-0 flex-1">
          <EditorCanvas format={projectData.format} pages={projectData.pages} />
        </div>
      </div>
    </div>
  );
}

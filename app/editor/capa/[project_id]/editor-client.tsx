"use client";

import dynamic from "next/dynamic";
import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import debounce from "lodash.debounce";
import { EditorTopbar } from "./components/editor-topbar";
import { EditorSidebar } from "./components/editor-sidebar";
import { useEditorStore } from "./lib/editor-store";
import { serializeEditorState } from "./lib/editor-serializer";
import { isEditableTarget } from "./lib/keyboard-utils";
import { hashElements, hashFills } from "./lib/state-hash";
import type { ProjectData } from "./types";

const EditorCanvas = dynamic(
  () => import("./components/editor-canvas").then((m) => ({ default: m.EditorCanvas })),
  { ssr: false },
);

export function EditorClient({ projectData }: { projectData: ProjectData }) {
  const [copiedToast, setCopiedToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable ref so the keyboard handler can call the latest showToast without re-registering
  const showCopiedToastRef = useRef<() => void>(() => {});
  showCopiedToastRef.current = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCopiedToast(true);
    toastTimerRef.current = setTimeout(() => setCopiedToast(false), 1500);
  };

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

  const saveNow = useCallback(async () => {
    const state = useEditorStore.getState();
    const snapshot = serializeEditorState(state);
    useEditorStore.getState().setSaveStatus({ kind: "saving" });
    try {
      const res = await fetch(`/api/projects/${projectData.projectId}/cover-editor`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      useEditorStore.getState().setSaveStatus({ kind: "saved", at: data.saved_at });
      useEditorStore.setState((s) => ({ autosaveCount: s.autosaveCount + 1 }));
    } catch {
      useEditorStore.getState().setSaveStatus({ kind: "error", error: "Falha ao salvar" });
    }
  }, [projectData.projectId]);

  const debouncedSave = useMemo(() => debounce(saveNow, 1000), [saveNow]);

  useEffect(() => {
    return () => { debouncedSave.cancel(); };
  }, [debouncedSave]);

  // Reset element state when project changes; hydrate from saved data if available
  useEffect(() => {
    reset();
    if (projectData.isbn) setIsbn(projectData.isbn);
    if (projectData.initialEditorData) {
      useEditorStore.getState().hydrate({
        comOrelhas: projectData.initialEditorData.comOrelhas,
        elements: projectData.initialEditorData.elements,
        fills: projectData.initialEditorData.fills,
        isbn: projectData.initialEditorData.isbn,
      });
    }
    // Hydrate confirmed snapshot: the loaded editor_data IS the confirmed baseline
    if (projectData.confirmedAt) {
      const state = useEditorStore.getState();
      useEditorStore.getState().setConfirmedSnapshot({
        elementsHash: hashElements(state.elements),
        fillsHash: hashFills(state.fills),
        confirmedAt: projectData.confirmedAt,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectData.projectId]);

  // Hydrate clipboard from localStorage on mount (SSR-safe — runs only in browser)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("autoria:clipboard:v1");
      if (raw) {
        const parsed = JSON.parse(raw) as { version?: number; element?: unknown };
        if (parsed?.version === 1 && parsed.element) {
          useEditorStore.getState().hydrateClipboard(parsed.element as import("./lib/elements").AnyElement);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on elements/fills/isbn change
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (
        state.comOrelhas !== prev.comOrelhas ||
        state.elements !== prev.elements ||
        state.fills !== prev.fills ||
        state.isbn !== prev.isbn
      ) {
        debouncedSave();
      }
    });
    return unsubscribe;
  }, [debouncedSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+S — force save (works even when typing)
      if ((e.key === "s" || e.key === "S") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        debouncedSave.cancel();
        saveNow();
        return;
      }

      if (isEditableTarget(e)) return;

      const state = useEditorStore.getState();

      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedId) {
        state.deleteElement(state.selectedId);
      }
      if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey) && state.selectedId) {
        e.preventDefault();
        state.duplicateElement(state.selectedId);
      }
      if (e.key === "]" && state.selectedId) {
        state.moveElementZ(state.selectedId, 1);
      }
      if (e.key === "[" && state.selectedId) {
        state.moveElementZ(state.selectedId, -1);
      }
      if (e.key === "Escape") {
        useEditorStore.setState({ selectedId: null });
      }

      if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey)) {
        const { selectedId, elements } = useEditorStore.getState();
        if (!selectedId) return;
        const el = elements.find((elem) => elem.id === selectedId);
        if (!el) return;
        e.preventDefault();
        useEditorStore.getState().copyElement(el);
        showCopiedToastRef.current();
      }

      if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey)) {
        const newEl = useEditorStore.getState().pasteElement();
        if (!newEl) return;
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [debouncedSave, saveNow]);

  return (
    <div className="flex h-full w-full flex-col">
      <EditorTopbar projectData={projectData} onSaveRetry={saveNow} />
      <div className="flex min-h-0 flex-1">
        <EditorSidebar projectData={projectData} />
        <div className="relative min-w-0 flex-1">
          <EditorCanvas format={projectData.format} pages={projectData.pages} />
        </div>
      </div>
      {copiedToast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#1a1a2e]/90 px-4 py-2 text-xs text-[#c9a84c] shadow-lg backdrop-blur-sm">
          Elemento copiado
        </div>
      )}
    </div>
  );
}

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
import { createSmartFieldElement, type SmartFieldContentMap } from "./lib/smart-field-layout";
import type { AnyElement } from "./lib/elements";
import type { ProjectData } from "./types";

const EditorCanvas = dynamic(
  () => import("./components/editor-canvas").then((m) => ({ default: m.EditorCanvas })),
  { ssr: false },
);

export function EditorClient({ projectData }: { projectData: ProjectData }) {
  const [copiedCount, setCopiedCount] = useState<number | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showCopiedToastRef = useRef<(count: number) => void>(() => {});
  showCopiedToastRef.current = (count: number) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCopiedCount(count);
    toastTimerRef.current = setTimeout(() => setCopiedCount(null), 1500);
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
    let snapshot: ReturnType<typeof serializeEditorState>;
    try {
      snapshot = serializeEditorState(state);
    } catch (serErr) {
      console.error("[editor-client] Erro ao serializar estado:", serErr);
      useEditorStore.getState().setSaveStatus({ kind: "error", error: "Falha ao serializar" });
      return;
    }
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
    } catch (err) {
      console.error("[editor-client] saveNow falhou:", err);
      if (err instanceof Error) {
        console.error("[editor-client] message:", err.message);
        console.error("[editor-client] stack:", err.stack);
      }
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
        orelhaMm: projectData.initialEditorData.orelhaMm,
        elements: projectData.initialEditorData.elements,
        fills: projectData.initialEditorData.fills,
        isbn: projectData.initialEditorData.isbn,
        backgroundUrl: projectData.initialEditorData.backgroundUrl,
      });
    } else {
      // Primeira vez abrindo o editor para este projeto (sem editor_data
      // prévio no banco). Popular o backgroundUrl (se veio de upload) e
      // pre-popular smart fields de título/subtítulo com o que o autor já
      // definiu em Elementos Editoriais. Autor pode mover, editar ou
      // deletar livremente — se voltar depois, o autosave terá persistido
      // a decisão dele e caímos no ramo `if` acima (que não recria nada).
      if (projectData.backgroundUrl) {
        useEditorStore.getState().setBackgroundUrl(projectData.backgroundUrl);
      }

      // Só cria smart field quando manuscripts.titulo/subtitulo tem conteúdo.
      // Se autor pulou Elementos Editoriais ou deixou campos vazios, deixa
      // o canvas limpo — evita TextElement órfão com content = "".
      const contentMap: SmartFieldContentMap = {
        titulo: projectData.title,
        subtitulo: projectData.subtitle,
      };
      const elementosIniciais: AnyElement[] = [];
      if (projectData.title.trim()) {
        elementosIniciais.push(
          createSmartFieldElement(
            "titulo",
            projectData.format,
            projectData.pages,
            0, // orelhaMm default no primeiro load (store inicia com 0)
            {}, // fills vazios: contraste com fundo branco padrão
            contentMap,
            elementosIniciais.length,
          ),
        );
      }
      if (projectData.subtitle.trim()) {
        elementosIniciais.push(
          createSmartFieldElement(
            "subtitulo",
            projectData.format,
            projectData.pages,
            0,
            {},
            contentMap,
            elementosIniciais.length,
          ),
        );
      }
      // addElement do store cuida de reatribuir zIndex sequencial.
      elementosIniciais.forEach((el) => {
        useEditorStore.getState().addElement(el);
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
      const raw2 = localStorage.getItem("autoria:clipboard:v2");
      if (raw2) {
        const p = JSON.parse(raw2) as { version?: number; elements?: import("./lib/elements").AnyElement[] };
        if (p?.version === 2 && Array.isArray(p.elements) && p.elements.length > 0) {
          useEditorStore.getState().hydrateClipboard(p.elements);
          return;
        }
      }
      const raw1 = localStorage.getItem("autoria:clipboard:v1");
      if (raw1) {
        const p = JSON.parse(raw1) as { version?: number; element?: import("./lib/elements").AnyElement };
        if (p?.version === 1 && p.element) {
          useEditorStore.getState().hydrateClipboard([p.element]);
        }
      }
    } catch (clipErr) {
      console.warn("[editor-client] Erro ao hidratar clipboard:", clipErr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave on elements/fills/isbn change
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (
        state.orelhaMm !== prev.orelhaMm ||
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
      const { selectedIds } = state;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0) {
        selectedIds.forEach((id) => state.deleteElement(id));
      }
      if ((e.key === "d" || e.key === "D") && (e.ctrlKey || e.metaKey) && selectedIds.length > 0) {
        e.preventDefault();
        state.duplicateSelected(selectedIds);
      }
      if (e.key === "]" && selectedIds.length === 1) {
        state.moveElementZ(selectedIds[0], 1);
      }
      if (e.key === "[" && selectedIds.length === 1) {
        state.moveElementZ(selectedIds[0], -1);
      }
      if (e.key === "Escape") {
        state.clearSelection();
      }

      // Arrow keys — 1mm, Shift+arrow 10mm
      const isArrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key);
      if (isArrow && selectedIds.length > 0) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        state.moveSelectedElements(selectedIds, dx, dy);
      }

      if ((e.key === "c" || e.key === "C") && (e.ctrlKey || e.metaKey)) {
        if (selectedIds.length === 0) return;
        const { elements } = useEditorStore.getState();
        const els = selectedIds.map((id) => elements.find((el) => el.id === id)).filter(Boolean) as import("./lib/elements").AnyElement[];
        if (els.length === 0) return;
        e.preventDefault();
        useEditorStore.getState().copyElement(els);
        showCopiedToastRef.current(els.length);
      }

      if ((e.key === "v" || e.key === "V") && (e.ctrlKey || e.metaKey)) {
        const newEls = useEditorStore.getState().pasteElement();
        if (!newEls) return;
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
      {copiedCount !== null && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#1a1a2e]/90 px-4 py-2 text-xs text-[#c9a84c] shadow-lg backdrop-blur-sm">
          {copiedCount === 1 ? "Elemento copiado" : `${copiedCount} elementos copiados`}
        </div>
      )}
    </div>
  );
}

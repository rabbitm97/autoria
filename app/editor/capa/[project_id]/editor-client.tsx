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
import { createImageElement, type AnyElement } from "./lib/elements";
import { FORMATS, SANGRIA_MM } from "./lib/dimensions";
import { getFillRect } from "./lib/region-rects";
import type { ProjectData } from "./types";

const CAPA_IA_FRENTE_ID = "capa-ia-frente";

/**
 * Injeta a arte da IA como ImageElement TRAVADO no rect da frente do livro.
 * Zerado zIndex + locked=true garantem que o elemento fica atrás de tudo e
 * não é acidentalmente arrastado/editado. Id determinístico permite trocar
 * a arte por outra opção da galeria no futuro sem duplicar.
 *
 * Em `layout="frente"` a arte ocupa o papel inteiro (bleed em todos os lados).
 * Em `layout="panoramica"` a arte é posicionada no rect canônico da região
 * "capa" com `orelhaMm=0`, que já se estende à borda direita do sangria.
 */
function injectCapaIaFrente(
  url: string,
  format: import("./types").FormatKey,
  layout: import("./types").EditorLayout,
) {
  const f = FORMATS[format];
  let x_mm: number;
  let y_mm: number;
  let width_mm: number;
  let height_mm: number;
  if (layout === "frente") {
    x_mm = 0;
    y_mm = 0;
    width_mm = f.width_mm + SANGRIA_MM * 2;
    height_mm = f.height_mm + SANGRIA_MM * 2;
  } else {
    const rect = getFillRect("capa", format, 200, 0);
    if (!rect) return;
    x_mm = rect.x;
    y_mm = rect.y;
    width_mm = rect.width;
    height_mm = rect.height;
  }
  const iaEl = createImageElement({
    id: CAPA_IA_FRENTE_ID,
    src: url,
    x_mm,
    y_mm,
    width_mm,
    height_mm,
    objectFit: "cover",
    locked: true,
    zIndex: 0,
  });
  // Bypassa addElement (que sempre reatribui zIndex = maxZ+1) — a IA precisa
  // ficar embaixo de tudo. Empurra os demais elementos +1 e insere a IA em 0.
  useEditorStore.setState((s) => ({
    elements: [
      iaEl,
      ...s.elements.map((e) => ({ ...e, zIndex: e.zIndex + 1 })),
    ],
  }));
}

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
      layout: projectData.layout,
      isbn: projectData.isbn,
    });
    initialized.current = true;
  }

  const { reset, setIsbn } = useEditorStore();

  const saveNow = useCallback(async () => {
    const state = useEditorStore.getState();
    let snapshot: ReturnType<typeof serializeEditorState>;
    try {
      snapshot = serializeEditorState({
        orelhaMm: state.orelhaMm,
        layout: state.layout,
        elements: state.elements,
        fills: state.fills,
        isbn: state.isbn,
        backgroundUrl: state.backgroundUrl,
        autosaveCount: state.autosaveCount,
      });
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
    useEditorStore.getState().setLayout(projectData.layout);
    if (projectData.isbn) setIsbn(projectData.isbn);
    if (projectData.initialEditorData) {
      useEditorStore.getState().hydrate({
        orelhaMm: projectData.initialEditorData.orelhaMm,
        layout: projectData.initialEditorData.layout ?? projectData.layout,
        elements: projectData.initialEditorData.elements,
        fills: projectData.initialEditorData.fills,
        isbn: projectData.initialEditorData.isbn,
        backgroundUrl: projectData.initialEditorData.backgroundUrl,
      });

      // Re-injeta capa-ia-frente se o editor_data salvo perdeu esse elemento
      // (autor deletou por engano) mas dados_capa ainda aponta pra IA.
      if (
        projectData.capaIaHandoff &&
        !projectData.initialEditorData.elements.some((el) => el.id === CAPA_IA_FRENTE_ID)
      ) {
        injectCapaIaFrente(
          projectData.capaIaHandoff.url,
          projectData.format,
          projectData.layout,
        );
      }
    } else {
      // Primeira vez abrindo o editor para este projeto (sem editor_data
      // prévio no banco). Popular background (upload), injetar a arte da
      // IA como ImageElement travado quando aplicável e pré-popular smart
      // fields de título/subtítulo com o que o autor já definiu em
      // Elementos Editoriais. Autor pode mover, editar ou deletar livremente —
      // se voltar depois, o autosave terá persistido a decisão dele e
      // caímos no ramo `if` acima (que não recria nada).
      if (projectData.backgroundUrl) {
        useEditorStore.getState().setBackgroundUrl(projectData.backgroundUrl);
      }

      // IA (B2-04c): injeta a arte da IA no rect da frente e pinta lombada/
      // contracapa com a cor predominante do briefing. Elemento com id
      // determinístico para futura troca por outra opção da galeria.
      if (projectData.capaIaHandoff) {
        injectCapaIaFrente(
          projectData.capaIaHandoff.url,
          projectData.format,
          projectData.layout,
        );
        const hex = projectData.capaIaHandoff.corPredominanteHex;
        if (hex && projectData.layout === "panoramica") {
          useEditorStore.getState().setFill("lombada", hex);
          useEditorStore.getState().setFill("contracapa", hex);
        }
      }

      // Só cria smart field quando manuscripts.titulo/subtitulo tem conteúdo.
      // Se autor pulou Elementos Editoriais ou deixou campos vazios, deixa
      // o canvas limpo — evita TextElement órfão com content = "".
      const contentMap: SmartFieldContentMap = {
        titulo: projectData.title,
        subtitulo: projectData.subtitle,
      };
      const elementosIniciais: AnyElement[] = [];
      const posicao = projectData.capaIaHandoff?.posicaoTitulo ?? "sem_preferencia";
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
            { layout: projectData.layout, posicaoTitulo: posicao },
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
            { layout: projectData.layout, posicaoTitulo: posicao },
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

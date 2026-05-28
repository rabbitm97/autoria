import { create } from "zustand";
import type { FormatKey } from "../types";

export interface ConfirmedSnapshot {
  elementsHash: string;
  fillsHash: string;
  confirmedAt: string;
}
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_FIT_MARGIN,
} from "./constants";
import { FORMATS, SANGRIA_MM, ORELHA_MM, MM_TO_PX, calcularLombada } from "./dimensions";
import type { AnyElement, RegionFills, Region } from "./elements";
import type { SaveStatus, EditorData } from "./editor-serializer";
import { nanoid } from "nanoid";
import type Konva from "konva";

interface EditorState {
  // Viewport
  format: FormatKey;
  pages: number;
  comOrelhas: boolean;
  zoom: number;
  panX: number;
  panY: number;
  legendasAtivas: boolean;
  snapEnabled: boolean;
  snapThreshold: number;

  // Elements
  elements: AnyElement[];
  selectedId: string | null;

  // Region fills
  fills: RegionFills;

  // Project
  isbn: string | null;

  // Persistence
  saveStatus: SaveStatus;
  autosaveCount: number;

  // Confirmed snapshot (for tracking unpublished changes)
  confirmedSnapshot: ConfirmedSnapshot | null;

  // Konva stage reference (set by canvas on mount)
  stageInstance: Konva.Stage | null;

  // Viewport actions
  setComOrelhas: (v: boolean) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: (containerW: number, containerH: number) => void;
  toggleLegendas: () => void;
  toggleSnap: () => void;

  // Element CRUD
  addElement: (el: AnyElement) => void;
  updateElement: (id: string, patch: Partial<AnyElement>) => void;
  deleteElement: (id: string) => void;
  duplicateElement: (id: string) => void;
  moveElementZ: (id: string, delta: 1 | -1) => void;
  setSelectedId: (id: string | null) => void;

  // Clipboard (internal — persisted in localStorage)
  clipboard: AnyElement | null;
  copyElement: (el: AnyElement) => void;
  pasteElement: () => AnyElement | null;
  hydrateClipboard: (el: AnyElement | null) => void;

  // Fills
  setFill: (region: Region, color: string | null) => void;

  // Project
  setIsbn: (isbn: string | null) => void;

  // Persistence
  setSaveStatus: (status: SaveStatus) => void;
  setStageInstance: (stage: Konva.Stage | null) => void;
  setConfirmedSnapshot: (snap: ConfirmedSnapshot | null) => void;
  hydrate: (data: Pick<EditorData, "comOrelhas" | "elements" | "fills" | "isbn">) => void;

  // Reset — call on mount to prevent state leaking between projects
  reset: () => void;
}

const DEFAULT_STATE = {
  format: "16x23" as FormatKey,
  pages: 200,
  comOrelhas: false,
  zoom: 0.5,
  panX: 0,
  panY: 0,
  legendasAtivas: false,
  snapEnabled: true,
  snapThreshold: 8,
  elements: [] as AnyElement[],
  selectedId: null as string | null,
  clipboard: null as AnyElement | null,
  fills: {} as RegionFills,
  isbn: null as string | null,
  saveStatus: { kind: "idle" } as SaveStatus,
  autosaveCount: 0,
  confirmedSnapshot: null as ConfirmedSnapshot | null,
  stageInstance: null as Konva.Stage | null,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...DEFAULT_STATE,

  setComOrelhas: (v) => set({ comOrelhas: v }),
  setZoom: (z) => set({ zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  zoomIn: () => {
    const { zoom } = get();
    set({ zoom: Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100) });
  },
  zoomOut: () => {
    const { zoom } = get();
    set({ zoom: Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100) });
  },

  fitToScreen: (containerW, containerH) => {
    const { format, pages, comOrelhas } = get();
    const f = FORMATS[format];
    const lombada = calcularLombada(pages);
    const orelhas = comOrelhas ? ORELHA_MM * 2 : 0;
    const totalWMm = f.width_mm * 2 + lombada + orelhas + SANGRIA_MM * 2;
    const totalHMm = f.height_mm + SANGRIA_MM * 2;
    const totalWPx = totalWMm * MM_TO_PX;
    const totalHPx = totalHMm * MM_TO_PX;

    const margin = ZOOM_FIT_MARGIN * 2;
    const zoom = Math.min(
      (containerW - margin) / totalWPx,
      (containerH - margin) / totalHPx,
    );
    const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
    const panX = (containerW - totalWPx * clampedZoom) / 2;
    const panY = (containerH - totalHPx * clampedZoom) / 2;
    set({ zoom: clampedZoom, panX, panY });
  },

  toggleLegendas: () => set((s) => ({ legendasAtivas: !s.legendasAtivas })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  addElement: (el) =>
    set((s) => {
      const maxZ = s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
      return { elements: [...s.elements, { ...el, zIndex: maxZ + 1 }] };
    }),

  updateElement: (id, patch) =>
    set((s) => ({
      elements: s.elements.map((e) =>
        e.id === id ? ({ ...e, ...patch } as AnyElement) : e,
      ),
    })),

  deleteElement: (id) =>
    set((s) => ({
      elements: s.elements.filter((e) => e.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  duplicateElement: (id) =>
    set((s) => {
      const el = s.elements.find((e) => e.id === id);
      if (!el) return s;
      const maxZ = s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
      const copy: AnyElement = {
        ...el,
        id: nanoid(),
        x_mm: el.x_mm + 5,
        y_mm: el.y_mm + 5,
        zIndex: maxZ + 1,
      };
      return { elements: [...s.elements, copy], selectedId: copy.id };
    }),

  moveElementZ: (id, delta) =>
    set((s) => {
      const el = s.elements.find((e) => e.id === id);
      if (!el) return s;
      const sorted = [...s.elements].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      const swapIdx = idx + delta;
      if (swapIdx < 0 || swapIdx >= sorted.length) return s;
      const swapZ = sorted[swapIdx].zIndex;
      const elZ = el.zIndex;
      return {
        elements: s.elements.map((e) => {
          if (e.id === id) return { ...e, zIndex: swapZ } as AnyElement;
          if (e.id === sorted[swapIdx].id) return { ...e, zIndex: elZ } as AnyElement;
          return e;
        }),
      };
    }),

  setSelectedId: (id) => set({ selectedId: id }),

  copyElement: (el) => {
    try {
      localStorage.setItem(
        "autoria:clipboard:v1",
        JSON.stringify({ version: 1, element: el }),
      );
    } catch {}
    set({ clipboard: el });
  },

  pasteElement: () => {
    const { elements } = get();
    let source = get().clipboard;

    if (!source) {
      try {
        const raw = localStorage.getItem("autoria:clipboard:v1");
        if (raw) {
          const parsed = JSON.parse(raw) as { version?: number; element?: AnyElement };
          if (parsed?.version === 1 && parsed.element) source = parsed.element;
        }
      } catch {}
    }

    if (!source) return null;

    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const base = { id: nanoid(), x_mm: source.x_mm + 10, y_mm: source.y_mm + 10, zIndex: maxZ + 1 };
    const newEl: AnyElement = source.type === "barcode"
      ? { ...source, ...base, cachedDataUrl: null }
      : { ...source, ...base };

    set((s) => ({ elements: [...s.elements, newEl], selectedId: newEl.id }));
    return newEl;
  },

  hydrateClipboard: (el) => set({ clipboard: el }),

  setFill: (region, color) =>
    set((s) => {
      const fills = { ...s.fills };
      if (color === null) {
        delete fills[region];
      } else {
        fills[region] = color;
      }
      return { fills };
    }),

  setIsbn: (isbn) => set({ isbn }),

  setSaveStatus: (status) => set({ saveStatus: status }),

  setStageInstance: (stage) => set({ stageInstance: stage }),

  setConfirmedSnapshot: (snap) => set({ confirmedSnapshot: snap }),

  hydrate: (data) =>
    set({
      comOrelhas: data.comOrelhas ?? false,
      elements: data.elements ?? [],
      fills: data.fills ?? {},
      isbn: data.isbn ?? null,
    }),

  reset: () =>
    set({
      comOrelhas: false,
      elements: [],
      selectedId: null,
      fills: {},
      isbn: null,
      legendasAtivas: false,
      saveStatus: { kind: "idle" },
      autosaveCount: 0,
      confirmedSnapshot: null,
      stageInstance: null,
    }),
}));

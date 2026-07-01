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
import { FORMATS, SANGRIA_MM, MM_TO_PX, calcularLombada, clampOrelhaMm } from "./dimensions";
import type { AnyElement, RegionFills, Region } from "./elements";
import type { SaveStatus, EditorData } from "./editor-serializer";
import { nanoid } from "nanoid";
import type Konva from "konva";

const CLIPBOARD_KEY_V2 = "autoria:clipboard:v2";
const CLIPBOARD_KEY_V1 = "autoria:clipboard:v1"; // back-compat read

interface EditorState {
  // Viewport
  format: FormatKey;
  pages: number;
  orelhaMm: number;
  zoom: number;
  panX: number;
  panY: number;
  legendasAtivas: boolean;
  snapEnabled: boolean;
  snapThreshold: number;

  // Elements
  elements: AnyElement[];
  selectedIds: string[];

  // Region fills
  fills: RegionFills;

  // Project
  isbn: string | null;

  // Background — imagem de upload renderizada travada atrás dos elementos.
  // Só é populado quando o projeto entra no editor com uma capa de upload
  // panorâmica. Nunca é editável, só descartável (usuário pode remover).
  backgroundUrl: string | null;

  // Persistence
  saveStatus: SaveStatus;
  autosaveCount: number;

  // Confirmed snapshot (for tracking unpublished changes)
  confirmedSnapshot: ConfirmedSnapshot | null;

  // Konva stage reference (set by canvas on mount)
  stageInstance: Konva.Stage | null;

  // Viewport actions
  setOrelhaMm: (v: number) => void;
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
  duplicateSelected: (ids: string[]) => void;
  moveElementZ: (id: string, delta: 1 | -1) => void;
  moveSelectedElements: (ids: string[], dx_mm: number, dy_mm: number) => void;
  bringSelectionToFront: (ids: string[]) => void;
  sendSelectionToBack: (ids: string[]) => void;

  // Selection
  selectElement: (id: string) => void;
  toggleElementInSelection: (id: string) => void;
  selectElements: (ids: string[]) => void;
  clearSelection: () => void;

  // Fills
  setFill: (region: Region, color: string | null) => void;

  // Project
  setIsbn: (isbn: string | null) => void;
  setBackgroundUrl: (url: string | null) => void;

  // Persistence
  setSaveStatus: (status: SaveStatus) => void;
  setStageInstance: (stage: Konva.Stage | null) => void;
  setConfirmedSnapshot: (snap: ConfirmedSnapshot | null) => void;
  hydrate: (data: Pick<EditorData, "orelhaMm" | "elements" | "fills" | "isbn" | "backgroundUrl">) => void;

  // Clipboard (internal — persisted in localStorage v2)
  clipboard: AnyElement[] | null;
  copyElement: (els: AnyElement[]) => void;
  pasteElement: () => AnyElement[] | null;
  hydrateClipboard: (els: AnyElement[] | null) => void;

  // Reset — call on mount to prevent state leaking between projects
  reset: () => void;
}

const DEFAULT_STATE = {
  format: "padrao_br" as FormatKey,
  pages: 200,
  orelhaMm: 0,
  zoom: 0.5,
  panX: 0,
  panY: 0,
  legendasAtivas: false,
  snapEnabled: true,
  snapThreshold: 8,
  elements: [] as AnyElement[],
  selectedIds: [] as string[],
  fills: {} as RegionFills,
  isbn: null as string | null,
  backgroundUrl: null as string | null,
  saveStatus: { kind: "idle" } as SaveStatus,
  autosaveCount: 0,
  confirmedSnapshot: null as ConfirmedSnapshot | null,
  stageInstance: null as Konva.Stage | null,
  clipboard: null as AnyElement[] | null,
};

export const useEditorStore = create<EditorState>((set, get) => ({
  ...DEFAULT_STATE,

  setOrelhaMm: (v) => set((s) => ({ orelhaMm: clampOrelhaMm(s.format, v) })),
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
    const { format, pages, orelhaMm } = get();
    const f = FORMATS[format];
    const lombada = calcularLombada(pages);
    const orelhas = orelhaMm > 0 ? orelhaMm * 2 : 0;
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
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),

  duplicateElement: (id) =>
    set((s) => {
      const el = s.elements.find((e) => e.id === id);
      if (!el) return s;
      const maxZ = s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
      const copy: AnyElement = { ...el, id: nanoid(), x_mm: el.x_mm + 5, y_mm: el.y_mm + 5, zIndex: maxZ + 1 };
      return { elements: [...s.elements, copy], selectedIds: [copy.id] };
    }),

  duplicateSelected: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const maxZ = s.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
      const copies: AnyElement[] = [];
      ids.forEach((id, i) => {
        const el = s.elements.find((e) => e.id === id);
        if (!el) return;
        copies.push({ ...el, id: nanoid(), x_mm: el.x_mm + 5, y_mm: el.y_mm + 5, zIndex: maxZ + 1 + i } as AnyElement);
      });
      if (copies.length === 0) return s;
      return { elements: [...s.elements, ...copies], selectedIds: copies.map((c) => c.id) };
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

  moveSelectedElements: (ids, dx_mm, dy_mm) =>
    set((s) => ({
      elements: s.elements.map((e) =>
        ids.includes(e.id)
          ? ({ ...e, x_mm: e.x_mm + dx_mm, y_mm: e.y_mm + dy_mm } as AnyElement)
          : e,
      ),
    })),

  bringSelectionToFront: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const idSet = new Set(ids);
      const selected = [...s.elements].filter((e) => idSet.has(e.id)).sort((a, b) => a.zIndex - b.zIndex);
      const unselected = [...s.elements].filter((e) => !idSet.has(e.id)).sort((a, b) => a.zIndex - b.zIndex);
      const combined = [
        ...unselected.map((e, i) => ({ ...e, zIndex: i + 1 })),
        ...selected.map((e, i) => ({ ...e, zIndex: unselected.length + 1 + i })),
      ];
      return { elements: combined as AnyElement[] };
    }),

  sendSelectionToBack: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const idSet = new Set(ids);
      const selected = [...s.elements].filter((e) => idSet.has(e.id)).sort((a, b) => a.zIndex - b.zIndex);
      const unselected = [...s.elements].filter((e) => !idSet.has(e.id)).sort((a, b) => a.zIndex - b.zIndex);
      const combined = [
        ...selected.map((e, i) => ({ ...e, zIndex: i + 1 })),
        ...unselected.map((e, i) => ({ ...e, zIndex: selected.length + 1 + i })),
      ];
      return { elements: combined as AnyElement[] };
    }),

  selectElement: (id) => set({ selectedIds: [id] }),

  toggleElementInSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((sid) => sid !== id)
        : [...s.selectedIds, id],
    })),

  selectElements: (ids) => set({ selectedIds: ids }),

  clearSelection: () => set({ selectedIds: [] }),

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

  setBackgroundUrl: (url) => set({ backgroundUrl: url }),

  setSaveStatus: (status) => set({ saveStatus: status }),

  setStageInstance: (stage) => set({ stageInstance: stage }),

  setConfirmedSnapshot: (snap) => set({ confirmedSnapshot: snap }),

  hydrate: (data) =>
    set((s) => ({
      orelhaMm: clampOrelhaMm(s.format, typeof data.orelhaMm === "number" ? data.orelhaMm : 0),
      elements: data.elements ?? [],
      fills: data.fills ?? {},
      isbn: data.isbn ?? null,
      backgroundUrl: data.backgroundUrl ?? null,
    })),

  copyElement: (els) => {
    try {
      localStorage.setItem(CLIPBOARD_KEY_V2, JSON.stringify({ version: 2, elements: els }));
    } catch {}
    set({ clipboard: els });
  },

  pasteElement: () => {
    const { elements } = get();
    let sources: AnyElement[] | null = get().clipboard;

    if (!sources || sources.length === 0) {
      try {
        // Try v2
        const raw2 = localStorage.getItem(CLIPBOARD_KEY_V2);
        if (raw2) {
          const p = JSON.parse(raw2) as { version?: number; elements?: AnyElement[] };
          if (p?.version === 2 && Array.isArray(p.elements) && p.elements.length > 0) {
            sources = p.elements;
          }
        }
        // Back-compat: v1 had a single element
        if (!sources) {
          const raw1 = localStorage.getItem(CLIPBOARD_KEY_V1);
          if (raw1) {
            const p = JSON.parse(raw1) as { version?: number; element?: AnyElement };
            if (p?.version === 1 && p.element) sources = [p.element];
          }
        }
      } catch {}
    }

    if (!sources || sources.length === 0) return null;

    const maxZ = elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
    const newEls: AnyElement[] = sources.map((src, i) => {
      const base = { id: nanoid(), x_mm: src.x_mm + 10, y_mm: src.y_mm + 10, zIndex: maxZ + 1 + i };
      return src.type === "barcode"
        ? { ...src, ...base, cachedDataUrl: null }
        : { ...src, ...base };
    });

    set((s) => ({ elements: [...s.elements, ...newEls], selectedIds: newEls.map((e) => e.id) }));
    return newEls;
  },

  hydrateClipboard: (els) => set({ clipboard: els }),

  reset: () =>
    set({
      orelhaMm: 0,
      elements: [],
      selectedIds: [],
      fills: {},
      isbn: null,
      backgroundUrl: null,
      legendasAtivas: false,
      saveStatus: { kind: "idle" },
      autosaveCount: 0,
      confirmedSnapshot: null,
      stageInstance: null,
    }),
}));

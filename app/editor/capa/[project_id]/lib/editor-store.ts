import { create } from "zustand";
import type { FormatKey } from "../types";
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_FIT_MARGIN,
} from "./constants";
import { FORMATS, SANGRIA_MM, ORELHA_MM, MM_TO_PX, calcularLombada } from "./dimensions";

interface EditorState {
  format: FormatKey;
  pages: number;
  comOrelhas: boolean;
  zoom: number;
  panX: number;
  panY: number;
  legendasAtivas: boolean;

  setComOrelhas: (v: boolean) => void;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: (containerW: number, containerH: number) => void;
  toggleLegendas: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  format: "16x23",
  pages: 200,
  comOrelhas: false,
  zoom: 0.5,
  panX: 0,
  panY: 0,
  legendasAtivas: false,

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
}));

// Mapping between capa UI format IDs and miolo-builder format IDs.
// Capa uses "16x23", miolo uses "padrao_br" — same dimension, different IDs.

import type { FormatoId as MioloFormatoId } from "@/lib/miolo-builder";

export type CapaFormatoId = "16x23" | "14x21" | "11x18" | "20x20" | "a4";

export const CAPA_TO_MIOLO: Record<CapaFormatoId, MioloFormatoId> = {
  "16x23": "padrao_br",
  "14x21": "a5",
  "11x18": "bolso",
  "20x20": "quadrado",
  "a4":    "a4",
};

export const MIOLO_TO_CAPA: Record<MioloFormatoId, CapaFormatoId> = {
  padrao_br: "16x23",
  a5:        "14x21",
  bolso:     "11x18",
  quadrado:  "20x20",
  a4:        "a4",
};

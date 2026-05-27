import { FORMATS, SANGRIA_MM, ORELHA_MM, calcularLombada } from "./dimensions";
import type { Region } from "./elements";
import type { FormatKey } from "../types";

export interface RegionRect {
  x: number;      // mm from left edge of full paper (sangria included)
  y: number;      // mm from top edge of full paper
  width: number;  // mm
  height: number; // mm
}

/**
 * Returns the bleed-aware fill rectangle for a region.
 *
 * Regions on the outer physical edge (contracapa left, capa right, orelhas)
 * extend 3mm into the bleed so no white stripe appears after trimming.
 * Inner fold edges never extend — the fold itself is the boundary.
 *
 * Y always spans the full paper height (0 → height_mm + 2×sangria) so the
 * top and bottom bleeds are always covered.
 */
export function getFillRect(
  region: Region,
  format: FormatKey,
  pages: number,
  comOrelhas: boolean,
): RegionRect | null {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const alturaTotal = f.height_mm + 2 * SANGRIA_MM;
  const orelha = comOrelhas ? ORELHA_MM : 0;

  let x_start: number;
  let x_end: number;

  if (region === "orelha_verso") {
    if (!comOrelhas) return null;
    // Left-most region — extends into left bleed (outer edge)
    x_start = 0;
    x_end = SANGRIA_MM + ORELHA_MM;
  } else if (region === "contracapa") {
    if (comOrelhas) {
      // Bounded by orelha_verso fold (left) and lombada fold (right) — no extension
      x_start = SANGRIA_MM + ORELHA_MM;
      x_end = x_start + f.width_mm;
    } else {
      // Left-most region without flaps — extends into left bleed (outer edge)
      x_start = 0;
      x_end = SANGRIA_MM + f.width_mm;
    }
  } else if (region === "lombada") {
    // Bounded by folds on both sides — no lateral extension
    x_start = SANGRIA_MM + orelha + f.width_mm;
    x_end = x_start + lombada;
  } else if (region === "capa") {
    if (comOrelhas) {
      // Bounded by lombada fold (left) and orelha_frente fold (right) — no extension
      x_start = SANGRIA_MM + ORELHA_MM + f.width_mm + lombada;
      x_end = x_start + f.width_mm;
    } else {
      // Right-most region without flaps — extends into right bleed (outer edge)
      x_start = SANGRIA_MM + f.width_mm + lombada;
      x_end = x_start + f.width_mm + SANGRIA_MM;
    }
  } else if (region === "orelha_frente") {
    if (!comOrelhas) return null;
    // Right-most region — extends into right bleed (outer edge)
    x_start = SANGRIA_MM + ORELHA_MM + 2 * f.width_mm + lombada;
    x_end = x_start + ORELHA_MM + SANGRIA_MM;
  } else {
    return null;
  }

  return {
    x: x_start,
    y: 0,
    width: x_end - x_start,
    height: alturaTotal,
  };
}

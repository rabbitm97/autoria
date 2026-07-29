import { FORMATS, SANGRIA_MM, calcularLombada } from "./dimensions";
import { CAPA_IA_ASPECT_H, CAPA_IA_ASPECT_W } from "./constants";
import type { Region } from "./elements";
import type { EditorLayout, FormatKey } from "../types";

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
  orelhaMm: number,
): RegionRect | null {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const alturaTotal = f.height_mm + 2 * SANGRIA_MM;
  const temOrelhas = orelhaMm > 0;
  const orelha = temOrelhas ? orelhaMm : 0;

  let x_start: number;
  let x_end: number;

  if (region === "orelha_verso") {
    if (!temOrelhas) return null;
    // Left-most region — extends into left bleed (outer edge)
    x_start = 0;
    x_end = SANGRIA_MM + orelha;
  } else if (region === "contracapa") {
    if (temOrelhas) {
      // Bounded by orelha_verso fold (left) and lombada fold (right) — no extension
      x_start = SANGRIA_MM + orelha;
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
    if (temOrelhas) {
      // Bounded by lombada fold (left) and orelha_frente fold (right) — no extension
      x_start = SANGRIA_MM + orelha + f.width_mm + lombada;
      x_end = x_start + f.width_mm;
    } else {
      // Right-most region without flaps — extends into right bleed (outer edge)
      x_start = SANGRIA_MM + f.width_mm + lombada;
      x_end = x_start + f.width_mm + SANGRIA_MM;
    }
  } else if (region === "orelha_frente") {
    if (!temOrelhas) return null;
    // Right-most region — extends into right bleed (outer edge)
    x_start = SANGRIA_MM + orelha + 2 * f.width_mm + lombada;
    x_end = x_start + orelha + SANGRIA_MM;
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

/**
 * Rect da região onde a arte da IA deve ser posicionada com FIT COVER
 * centralizado sobre a frente:
 *  - `layout="frente"`: papel inteiro (frente + sangria em todos os lados);
 *  - `layout="panoramica"`: rect canônico da região "capa" (frente + sangria
 *    externa quando não há orelhas).
 * O excedente do cover em relação ao aspecto 2:3 é distribuído igual em
 * ambos os lados (metade cruza a lombada / metade a sangria externa; ou
 * metade acima / metade abaixo). No export a área fora do papel é clipada.
 */
export function getCapaIaAnchoredRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect {
  const f = FORMATS[format];
  let rect: RegionRect;
  if (layout === "frente") {
    rect = {
      x: 0,
      y: 0,
      width: f.width_mm + SANGRIA_MM * 2,
      height: f.height_mm + SANGRIA_MM * 2,
    };
  } else {
    // Em panorâmica, a arte cobre a região "capa" no rect canônico
    // (largura depende de orelhas: com orelhas, entre folds; sem, frente + sangria).
    const canonical = getFillRect("capa", format, pages, orelhaMm);
    // "capa" sempre existe (independente de orelhas) — mas o TS não sabe.
    rect = canonical ?? {
      x: SANGRIA_MM + f.width_mm + calcularLombada(pages),
      y: 0,
      width: f.width_mm + SANGRIA_MM,
      height: f.height_mm + SANGRIA_MM * 2,
    };
  }
  const imgAspect = CAPA_IA_ASPECT_W / CAPA_IA_ASPECT_H;
  const rectAspect = rect.width / rect.height;
  let coverW: number;
  let coverH: number;
  if (imgAspect > rectAspect) {
    // Imagem é mais larga que o rect: fixar altura, excedente horizontal.
    coverH = rect.height;
    coverW = coverH * imgAspect;
  } else {
    // Imagem é mais estreita que o rect: fixar largura, excedente vertical.
    coverW = rect.width;
    coverH = coverW / imgAspect;
  }
  return {
    x: rect.x - (coverW - rect.width) / 2,
    y: rect.y - (coverH - rect.height) / 2,
    width: coverW,
    height: coverH,
  };
}

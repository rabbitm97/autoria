import { estimarLombadaCapaMm } from "@/lib/formatos";

// 300 DPI: 1mm = DPI/25.4 px ≈ 11.811 px
export const DPI = 300;
export const MM_TO_PX = DPI / 25.4;

// Format IDs use canonical slugs from lib/formatos.ts
export const FORMATS = {
  "padrao_br": { width_mm: 160, height_mm: 230 },
  "compacto":  { width_mm: 140, height_mm: 210 },
  "bolso":     { width_mm: 110, height_mm: 180 },
  "quadrado":  { width_mm: 200, height_mm: 200 },
  "a4":        { width_mm: 210, height_mm: 297 },
} as const;

export type FormatKey = keyof typeof FORMATS;

export const SANGRIA_MM = 3;

// Orelhas configuráveis por formato. 0 = sem orelhas.
// bolso aceita até 90mm (capa menor); demais formatos aceitam até 100mm.
export const ORELHA_MIN_MM = 60;

export function getOrelhaDefault(format: FormatKey): number {
  return format === "bolso" ? 60 : 80;
}

export function getOrelhaMax(format: FormatKey): number {
  return format === "bolso" ? 90 : 100;
}

export function clampOrelhaMm(format: FormatKey, orelhaMm: number): number {
  if (!Number.isFinite(orelhaMm) || orelhaMm <= 0) return 0;
  const max = getOrelhaMax(format);
  if (orelhaMm < ORELHA_MIN_MM) return ORELHA_MIN_MM;
  if (orelhaMm > max) return max;
  return orelhaMm;
}

export function calcularLombada(pages: number): number {
  return estimarLombadaCapaMm(pages);
}

export function calcularLarguraTotal(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
): number {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const orelhas = orelhaMm > 0 ? orelhaMm * 2 : 0;
  return f.width_mm * 2 + lombada + orelhas + SANGRIA_MM * 2;
}

export function calcularAlturaTotal(format: FormatKey): number {
  return FORMATS[format].height_mm + SANGRIA_MM * 2;
}

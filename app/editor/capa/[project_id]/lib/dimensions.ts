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

export const SANGRIA_MM = 3;
export const ORELHA_MM = 80;

export function calcularLombada(pages: number): number {
  return estimarLombadaCapaMm(pages);
}

export function calcularLarguraTotal(
  format: keyof typeof FORMATS,
  pages: number,
  comOrelhas: boolean,
): number {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const orelhas = comOrelhas ? ORELHA_MM * 2 : 0;
  return f.width_mm * 2 + lombada + orelhas + SANGRIA_MM * 2;
}

export function calcularAlturaTotal(format: keyof typeof FORMATS): number {
  return FORMATS[format].height_mm + SANGRIA_MM * 2;
}

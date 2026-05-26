// 300 DPI: 1mm = DPI/25.4 px ≈ 11.811 px
export const DPI = 300;
export const MM_TO_PX = DPI / 25.4;

// Format IDs match existing dashboard constants (lowercase "a4")
export const FORMATS = {
  "16x23": { width_mm: 160, height_mm: 230 },
  "14x21": { width_mm: 140, height_mm: 210 },
  "11x18": { width_mm: 110, height_mm: 180 },
  "20x20": { width_mm: 200, height_mm: 200 },
  "a4":    { width_mm: 210, height_mm: 297 },
} as const;

export const SANGRIA_MM = 3;
export const ORELHA_MM = 80;

// Calibrated against existing calcLombadaMm in dashboard/capa/[id]/page.tsx
// and MM_PER_PAGE = 0.07 in montar-capa/route.ts
export function calcularLombada(pages: number): number {
  return Math.max(2, Math.round(pages * 0.07 * 10) / 10);
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

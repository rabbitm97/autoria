import { FORMATS, SANGRIA_MM, ORELHA_MM, MM_TO_PX, calcularLombada } from "./dimensions";
import type { FormatKey } from "../types";

export interface SnapGuides {
  x: number[];
  y: number[];
}

export interface SnapResult {
  x: number;
  y: number;
  activeX: number | null;
  activeY: number | null;
}

export function getStructuralGuides(
  format: FormatKey,
  pages: number,
  comOrelhas: boolean,
): SnapGuides {
  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;

  const sangriaPx = SANGRIA_MM * MM_TO_PX;
  const orelhaPx = orelhaMm * MM_TO_PX;
  const lombadaPx = lombadaMm * MM_TO_PX;
  const frontePx = f.width_mm * MM_TO_PX;
  const totalWPx = f.width_mm * 2 * MM_TO_PX + lombadaPx + orelhaPx * 2 + sangriaPx * 2;
  const totalHPx = f.height_mm * MM_TO_PX + sangriaPx * 2;

  const xOrelhaVersoEnd = sangriaPx + orelhaPx;
  const xContraEnd = xOrelhaVersoEnd + frontePx;
  const xLombadaEnd = xContraEnd + lombadaPx;
  const xFrenteEnd = xLombadaEnd + frontePx;
  const xLombadaCenter = (xContraEnd + xLombadaEnd) / 2;

  const xs: number[] = [
    sangriaPx,
    totalWPx - sangriaPx,
    xOrelhaVersoEnd,
    xContraEnd,
    xLombadaCenter,
    xLombadaEnd,
    xFrenteEnd,
    totalWPx / 2,
  ];

  if (comOrelhas) {
    xs.push(xFrenteEnd + orelhaPx);
  }

  const ys: number[] = [
    sangriaPx,
    totalHPx - sangriaPx,
    totalHPx / 2,
    totalHPx / 3,
    (totalHPx * 2) / 3,
  ];

  return { x: xs, y: ys };
}

export function snapToGuides(
  bounds: { x: number; y: number; width: number; height: number },
  guides: SnapGuides,
  threshold: number,
): SnapResult {
  const { x, y, width, height } = bounds;
  const cx = x + width / 2;
  const rx = x + width;
  const cy = y + height / 2;
  const by = y + height;

  let bestX: number | null = null;
  let bestXDist = threshold;
  let snapX = x;

  for (const gx of guides.x) {
    const dLeft = Math.abs(x - gx);
    const dCenter = Math.abs(cx - gx);
    const dRight = Math.abs(rx - gx);

    if (dLeft < bestXDist) { bestXDist = dLeft; bestX = gx; snapX = gx; }
    if (dCenter < bestXDist) { bestXDist = dCenter; bestX = gx; snapX = gx - width / 2; }
    if (dRight < bestXDist) { bestXDist = dRight; bestX = gx; snapX = gx - width; }
  }

  let bestY: number | null = null;
  let bestYDist = threshold;
  let snapY = y;

  for (const gy of guides.y) {
    const dTop = Math.abs(y - gy);
    const dCenter = Math.abs(cy - gy);
    const dBottom = Math.abs(by - gy);

    if (dTop < bestYDist) { bestYDist = dTop; bestY = gy; snapY = gy; }
    if (dCenter < bestYDist) { bestYDist = dCenter; bestY = gy; snapY = gy - height / 2; }
    if (dBottom < bestYDist) { bestYDist = dBottom; bestY = gy; snapY = gy - height; }
  }

  return { x: snapX, y: snapY, activeX: bestX, activeY: bestY };
}

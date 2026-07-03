import { FORMATS, SANGRIA_MM, calcularLombada } from "./dimensions";
import type { FormatKey } from "../types";

const MARKS_MM = 10;
const CROP_GAP = 3;
const CROP_LEN = 5;

export interface CoverImageMeta {
  format: FormatKey;
  pages: number;
  orelhaMm: number;
  projectName?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function line(x1: number, y1: number, x2: number, y2: number, dash = false): string {
  const dashAttr = dash ? ' stroke-dasharray="1.5,1.5"' : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="0.25"${dashAttr}/>`;
}

function regMark(cx: number, cy: number): string {
  const r = 2.5;
  return `
<g transform="translate(${cx},${cy})">
  <path d="M0,0 L${r},0 A${r},${r} 0 0,1 0,${r} Z" fill="#00FFFF"/>
  <path d="M0,0 L0,${r} A${r},${r} 0 0,1 ${-r},0 Z" fill="#FF00FF"/>
  <path d="M0,0 L${-r},0 A${r},${r} 0 0,1 0,${-r} Z" fill="#FFFF00"/>
  <path d="M0,0 L0,${-r} A${r},${r} 0 0,1 ${r},0 Z" fill="#000000"/>
  <circle r="${r}" fill="none" stroke="#000" stroke-width="0.25"/>
  <line x1="${-(r + 1)}" y1="0" x2="${r + 1}" y2="0" stroke="#000" stroke-width="0.25"/>
  <line x1="0" y1="${-(r + 1)}" x2="0" y2="${r + 1}" stroke="#000" stroke-width="0.25"/>
</g>`.trim();
}

export function buildMarksSvg(
  totalWMm: number,
  totalHMm: number,
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  projectName: string,
): string {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const temOrelhas = orelhaMm > 0;
  const orelha = temOrelhas ? orelhaMm : 0;
  const graficaW = totalWMm + MARKS_MM * 2;
  const graficaH = totalHMm + MARKS_MM * 2;
  const trimW = totalWMm - SANGRIA_MM * 2;
  const trimH = totalHMm - SANGRIA_MM * 2;
  const trimX = MARKS_MM + SANGRIA_MM;
  const trimY = MARKS_MM + SANGRIA_MM;
  const trimX2 = trimX + trimW;
  const trimY2 = trimY + trimH;

  const cropLines = [
    line(trimX - CROP_GAP - CROP_LEN, trimY, trimX - CROP_GAP, trimY),
    line(trimX, trimY - CROP_GAP - CROP_LEN, trimX, trimY - CROP_GAP),
    line(trimX2 + CROP_GAP, trimY, trimX2 + CROP_GAP + CROP_LEN, trimY),
    line(trimX2, trimY - CROP_GAP - CROP_LEN, trimX2, trimY - CROP_GAP),
    line(trimX - CROP_GAP - CROP_LEN, trimY2, trimX - CROP_GAP, trimY2),
    line(trimX, trimY2 + CROP_GAP, trimX, trimY2 + CROP_GAP + CROP_LEN),
    line(trimX2 + CROP_GAP, trimY2, trimX2 + CROP_GAP + CROP_LEN, trimY2),
    line(trimX2, trimY2 + CROP_GAP, trimX2, trimY2 + CROP_GAP + CROP_LEN),
  ].join("\n");

  const foldXsMm: number[] = [];
  if (temOrelhas) foldXsMm.push(SANGRIA_MM + orelha);
  foldXsMm.push(SANGRIA_MM + orelha + f.width_mm);
  foldXsMm.push(SANGRIA_MM + orelha + f.width_mm + lombada);
  if (temOrelhas) foldXsMm.push(SANGRIA_MM + orelha + f.width_mm + lombada + f.width_mm);

  const foldLines = foldXsMm.map((xPaper) => {
    const xG = MARKS_MM + xPaper;
    return [
      line(xG, trimY - CROP_GAP - CROP_LEN, xG, trimY - CROP_GAP, true),
      line(xG, trimY2 + CROP_GAP, xG, trimY2 + CROP_GAP + CROP_LEN, true),
    ].join("\n");
  }).join("\n");

  const regMarks = [
    regMark(graficaW / 2, MARKS_MM / 2),
    regMark(graficaW / 2, graficaH - MARKS_MM / 2),
    regMark(MARKS_MM / 2, graficaH / 2),
    regMark(graficaW - MARKS_MM / 2, graficaH / 2),
  ].join("\n");

  const swatchColors = [
    "#00FFFF", "#FF00FF", "#FFFF00", "#000000", "#808080",
    "#0000FF", "#FF0000", "#00FF00",
    "#BFBFBF", "#808080", "#404040",
  ];
  const barX = trimX;
  const barY = trimY2 + CROP_GAP + CROP_LEN + 1;
  const barH = 4;
  const swW = trimW / swatchColors.length;
  const swatches = swatchColors
    .map((c, i) => `<rect x="${barX + i * swW}" y="${barY}" width="${swW}" height="${barH}" fill="${c}"/>`)
    .join("\n");
  const barOutline = `<rect x="${barX}" y="${barY}" width="${trimW}" height="${barH}" fill="none" stroke="#000" stroke-width="0.15"/>`;

  const date = new Date().toISOString().slice(0, 10);
  const textY = barY + barH + 1.5;
  const techText = `<text x="${barX}" y="${textY}" font-family="monospace" font-size="2.5" fill="#000">Autoria · ${escapeHtml(projectName)} · ${trimW.toFixed(1)}×${trimH.toFixed(1)}mm · ${date}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;" viewBox="0 0 ${graficaW} ${graficaH}" width="${graficaW}mm" height="${graficaH}mm">
${cropLines}
${foldLines}
${regMarks}
${swatches}
${barOutline}
${techText}
</svg>`;
}

/**
 * Build a minimal HTML page wrapping a pre-rendered cover image for the
 * "gráfica" pipeline (CMYK / RGB). coverImageSrc is the full image (sangria
 * included). @page = paper + marks band; image positioned at (MARKS_MM,
 * MARKS_MM); vector marks composited on top.
 *
 * A versão "digital" (eBook panorâmico) foi descontinuada no 14.M.5 —
 * o download de eBook agora sai como JPEG da frente extraído client-side
 * pelo Konva (ver `captureFrontAsJpegDataUrl` em `png-export.ts`).
 */
export function renderCoverFromImage(
  coverImageSrc: string,
  meta: CoverImageMeta,
): string {
  const f = FORMATS[meta.format];
  const lombadaMm = calcularLombada(meta.pages);
  const orelhas = meta.orelhaMm > 0 ? meta.orelhaMm * 2 : 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhas + SANGRIA_MM * 2;
  const totalHMm = f.height_mm + SANGRIA_MM * 2;

  const printCss = `* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;

  const graficaWMm = totalWMm + MARKS_MM * 2;
  const graficaHMm = totalHMm + MARKS_MM * 2;
  const marksSvg = buildMarksSvg(
    totalWMm,
    totalHMm,
    meta.format,
    meta.pages,
    meta.orelhaMm,
    meta.projectName ?? "",
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${printCss}
  @page { size: ${graficaWMm}mm ${graficaHMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${graficaWMm}mm; height: ${graficaHMm}mm; overflow: hidden; }
  .wrap { position: relative; width: ${graficaWMm}mm; height: ${graficaHMm}mm; }
  .paper { position: absolute; left: ${MARKS_MM}mm; top: ${MARKS_MM}mm; width: ${totalWMm}mm; height: ${totalHMm}mm; overflow: hidden; }
  .paper img { display: block; width: 100%; height: 100%; object-fit: fill; }
</style>
</head>
<body>
<div class="wrap">
  <div class="paper">
    <img src="${coverImageSrc}" alt="">
  </div>
  ${marksSvg}
</div>
</body>
</html>`;
}

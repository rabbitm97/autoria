import { FORMATS, SANGRIA_MM, ORELHA_MM, MM_TO_PX, calcularLombada } from "./dimensions";
import { FONT_CATALOG_BY_ID } from "./fonts";
import { getFillRect } from "./region-rects";
import type { AnyElement, TextElement, ImageElement, LogoElement, BarcodeElement, ShapeElement, RegionFills, Region } from "./elements";
import type { FormatKey } from "../types";

const PT_TO_MM = 25.4 / 72;
const MARKS_MM = 10; // marks band width on each side for "grafica"
const CROP_GAP = 3;  // gap between trim and crop mark start (mm)
const CROP_LEN = 5;  // crop mark length (mm)

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Syne:wght@400..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..900;1,9..40,100..900&family=Inter:wght@100..900&family=Bebas+Neue&family=Archivo+Black&display=block";

export interface CoverMeta {
  format: FormatKey;
  pages: number;
  comOrelhas: boolean;
  logoDouradoBase64: string | null;
  logoAzulBase64: string | null;
  versao?: "digital" | "grafica";
  projectName?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function elementStyle(el: AnyElement, offsetXMm = 0, offsetYMm = 0): string {
  return `
    position: absolute;
    left: ${el.x_mm + offsetXMm}mm;
    top: ${el.y_mm + offsetYMm}mm;
    width: ${el.width_mm}mm;
    height: ${el.height_mm}mm;
    transform: rotate(${el.rotation_deg}deg);
    transform-origin: top left;
    opacity: ${el.opacity};
    ${el.visible ? "" : "display: none;"}
  `.trim();
}

function renderTextElement(el: TextElement, offsetXMm = 0, offsetYMm = 0): string {
  const font = FONT_CATALOG_BY_ID[el.fontId];
  const fontFamily = font ? `'${font.family}'` : "sans-serif";
  const fontSizeMm = el.fontSize_pt * PT_TO_MM;
  const style = `
    ${elementStyle(el, offsetXMm, offsetYMm)}
    font-family: ${fontFamily};
    font-size: ${fontSizeMm}mm;
    font-weight: ${el.fontWeight === "700" ? "bold" : "normal"};
    font-style: ${el.fontStyle};
    text-align: ${el.textAlign};
    color: ${el.color};
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: visible;
  `;
  return `<div style="${style.replace(/\n\s*/g, " ")}">${escapeHtml(el.content).replace(/\n/g, "<br>")}</div>`;
}

function renderImageElement(el: ImageElement, offsetXMm = 0, offsetYMm = 0): string {
  const style = `${elementStyle(el, offsetXMm, offsetYMm)} object-fit: ${el.objectFit};`;
  return `<img src="${el.src}" style="${style.replace(/\n\s*/g, " ")}" alt="">`;
}

function renderLogoElement(el: LogoElement, meta: CoverMeta, offsetXMm = 0, offsetYMm = 0): string {
  const base64 = el.variant === "dourado" ? meta.logoDouradoBase64 : meta.logoAzulBase64;
  if (!base64) return "";
  const src = `data:image/png;base64,${base64}`;
  const style = `${elementStyle(el, offsetXMm, offsetYMm)} object-fit: contain;`;
  return `<img src="${src}" style="${style.replace(/\n\s*/g, " ")}" alt="Logo Autoria">`;
}

function renderBarcodeElement(el: BarcodeElement, offsetXMm = 0, offsetYMm = 0): string {
  if (!el.cachedDataUrl) return "";
  const style = `${elementStyle(el, offsetXMm, offsetYMm)} object-fit: contain;`;
  return `<img src="${el.cachedDataUrl}" style="${style.replace(/\n\s*/g, " ")}" alt="Código de barras">`;
}

function renderShapeElement(el: ShapeElement, offsetXMm = 0, offsetYMm = 0): string {
  const style = elementStyle(el, offsetXMm, offsetYMm);
  const swMm = el.strokeWidth_pt * PT_TO_MM;
  const fill = el.fill ?? "none";
  const stroke = el.stroke ?? "none";
  const attrs = `fill="${fill}" stroke="${stroke}" stroke-width="${swMm}"`;
  const w = el.width_mm;
  const h = el.height_mm;

  let inner: string;
  if (el.shape === "rect") {
    inner = `<rect x="0" y="0" width="${w}" height="${h}" ${attrs}/>`;
  } else if (el.shape === "ellipse") {
    inner = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
  } else if (el.shape === "triangle") {
    inner = `<polygon points="${w / 2},0 ${w},${h} 0,${h}" ${attrs}/>`;
  } else {
    // line: solid rectangle filled with the line color
    inner = `<rect x="0" y="0" width="${w}" height="${h}" fill="${el.fill ?? "#000"}" stroke="none"/>`;
  }

  return `<div style="${style.replace(/\n\s*/g, " ")}"><svg width="100%" height="100%" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;">${inner}</svg></div>`;
}

const ALL_REGIONS: Region[] = ["orelha_verso", "contracapa", "lombada", "capa", "orelha_frente"];

function renderFills(fills: RegionFills, meta: CoverMeta, offsetXMm = 0, offsetYMm = 0): string {
  return ALL_REGIONS.map((key) => {
    const color = fills[key];
    if (!color) return "";
    const rect = getFillRect(key, meta.format, meta.pages, meta.comOrelhas);
    if (!rect) return "";
    return `<div style="position:absolute;left:${rect.x + offsetXMm}mm;top:${rect.y + offsetYMm}mm;width:${rect.width}mm;height:${rect.height}mm;background:${color};"></div>`;
  }).join("\n");
}

function renderElements(elements: AnyElement[], meta: CoverMeta, offsetXMm = 0, offsetYMm = 0): string {
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  return sorted.map((el) => {
    if (el.type === "text") return renderTextElement(el as TextElement, offsetXMm, offsetYMm);
    if (el.type === "image") return renderImageElement(el as ImageElement, offsetXMm, offsetYMm);
    if (el.type === "logo") return renderLogoElement(el as LogoElement, meta, offsetXMm, offsetYMm);
    if (el.type === "barcode") return renderBarcodeElement(el as BarcodeElement, offsetXMm, offsetYMm);
    if (el.type === "shape") return renderShapeElement(el as ShapeElement, offsetXMm, offsetYMm);
    return "";
  }).join("\n");
}

// ── SVG marks for "grafica" ───────────────────────────────────────────────────

function line(x1: number, y1: number, x2: number, y2: number, dash = false): string {
  const dashAttr = dash ? ' stroke-dasharray="1.5,1.5"' : "";
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-width="0.25"${dashAttr}/>`;
}

function regMark(cx: number, cy: number): string {
  const r = 2.5;
  // 4 quadrants (CMYK), circle outline, crosshair
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

function buildMarksSvg(
  totalWMm: number,
  totalHMm: number,
  format: FormatKey,
  pages: number,
  comOrelhas: boolean,
  projectName: string,
): string {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const orelha = comOrelhas ? ORELHA_MM : 0;
  const graficaW = totalWMm + MARKS_MM * 2;
  const graficaH = totalHMm + MARKS_MM * 2;
  const trimW = totalWMm - SANGRIA_MM * 2;
  const trimH = totalHMm - SANGRIA_MM * 2;
  const trimX = MARKS_MM + SANGRIA_MM; // 13
  const trimY = MARKS_MM + SANGRIA_MM; // 13
  const trimX2 = trimX + trimW;
  const trimY2 = trimY + trimH;

  // ── Crop marks ──
  const cropLines = [
    // top-left
    line(trimX - CROP_GAP - CROP_LEN, trimY, trimX - CROP_GAP, trimY),
    line(trimX, trimY - CROP_GAP - CROP_LEN, trimX, trimY - CROP_GAP),
    // top-right
    line(trimX2 + CROP_GAP, trimY, trimX2 + CROP_GAP + CROP_LEN, trimY),
    line(trimX2, trimY - CROP_GAP - CROP_LEN, trimX2, trimY - CROP_GAP),
    // bottom-left
    line(trimX - CROP_GAP - CROP_LEN, trimY2, trimX - CROP_GAP, trimY2),
    line(trimX, trimY2 + CROP_GAP, trimX, trimY2 + CROP_GAP + CROP_LEN),
    // bottom-right
    line(trimX2 + CROP_GAP, trimY2, trimX2 + CROP_GAP + CROP_LEN, trimY2),
    line(trimX2, trimY2 + CROP_GAP, trimX2, trimY2 + CROP_GAP + CROP_LEN),
  ].join("\n");

  // ── Fold marks (dashed, at top+bottom of marks band) ──
  const foldXsMm: number[] = [];
  if (comOrelhas) foldXsMm.push(SANGRIA_MM + orelha);
  foldXsMm.push(SANGRIA_MM + orelha + f.width_mm);
  foldXsMm.push(SANGRIA_MM + orelha + f.width_mm + lombada);
  if (comOrelhas) foldXsMm.push(SANGRIA_MM + orelha + f.width_mm + lombada + f.width_mm);

  const foldLines = foldXsMm.map((xPaper) => {
    const xG = MARKS_MM + xPaper;
    return [
      line(xG, trimY - CROP_GAP - CROP_LEN, xG, trimY - CROP_GAP, true),
      line(xG, trimY2 + CROP_GAP, xG, trimY2 + CROP_GAP + CROP_LEN, true),
    ].join("\n");
  }).join("\n");

  // ── Registration marks (4 sides, centered) ──
  const regMarks = [
    regMark(graficaW / 2, MARKS_MM / 2),
    regMark(graficaW / 2, graficaH - MARKS_MM / 2),
    regMark(MARKS_MM / 2, graficaH / 2),
    regMark(graficaW - MARKS_MM / 2, graficaH / 2),
  ].join("\n");

  // ── Color bar (11 swatches, below trim in marks band) ──
  const swatchColors = [
    "#00FFFF", "#FF00FF", "#FFFF00", "#000000", "#808080",
    "#0000FF", "#FF0000", "#00FF00",
    "#BFBFBF", "#808080", "#404040",
  ];
  const barX = trimX;
  const barY = trimY2 + CROP_GAP + CROP_LEN + 1; // 1mm below fold mark bottom
  const barH = 4;
  const swW = trimW / swatchColors.length;
  const swatches = swatchColors
    .map((c, i) => `<rect x="${barX + i * swW}" y="${barY}" width="${swW}" height="${barH}" fill="${c}"/>`)
    .join("\n");
  const barOutline = `<rect x="${barX}" y="${barY}" width="${trimW}" height="${barH}" fill="none" stroke="#000" stroke-width="0.15"/>`;

  // ── Technical text ──
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

// ── Main render function ──────────────────────────────────────────────────────

export function renderCoverAsHtml(
  elements: AnyElement[],
  fills: RegionFills,
  meta: CoverMeta,
): string {
  const versao = meta.versao ?? "digital";
  const f = FORMATS[meta.format];
  const lombadaMm = calcularLombada(meta.pages);
  const orelhaMm = meta.comOrelhas ? ORELHA_MM : 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
  const totalHMm = f.height_mm + SANGRIA_MM * 2;

  const printCss = `* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;

  if (versao === "digital") {
    // Trim-only: clip to book dimensions (no bleed visible, no marks)
    const trimWMm = totalWMm - SANGRIA_MM * 2;
    const trimHMm = totalHMm - SANGRIA_MM * 2;
    // Shift content so trim starts at (0,0)
    const offsetX = -SANGRIA_MM;
    const offsetY = -SANGRIA_MM;
    const fillsHtml = renderFills(fills, meta, offsetX, offsetY);
    const elementsHtml = renderElements(elements, meta, offsetX, offsetY);
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
  ${printCss}
  @page { size: ${trimWMm}mm ${trimHMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${trimWMm}mm; height: ${trimHMm}mm; overflow: hidden; background: white; }
  .paper { position: relative; width: ${trimWMm}mm; height: ${trimHMm}mm; overflow: hidden; background: white; }
</style>
</head>
<body>
<div class="paper">
${fillsHtml}
${elementsHtml}
</div>
</body>
</html>`;
  }

  // versao === "grafica"
  const graficaWMm = totalWMm + MARKS_MM * 2;
  const graficaHMm = totalHMm + MARKS_MM * 2;
  // Paper (with bleed) positioned via CSS at (MARKS_MM, MARKS_MM);
  // fills/elements are relative to paper top-left — no offset needed here.
  const fillsHtml = renderFills(fills, meta);
  const elementsHtml = renderElements(elements, meta);
  const marksSvg = buildMarksSvg(
    totalWMm,
    totalHMm,
    meta.format,
    meta.pages,
    meta.comOrelhas,
    meta.projectName ?? "",
  );

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
  ${printCss}
  @page { size: ${graficaWMm}mm ${graficaHMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; width: ${graficaWMm}mm; height: ${graficaHMm}mm; overflow: hidden; background: white; }
  .paper { position: absolute; left: ${MARKS_MM}mm; top: ${MARKS_MM}mm; width: ${totalWMm}mm; height: ${totalHMm}mm; overflow: hidden; background: white; }
  .wrap { position: relative; width: ${graficaWMm}mm; height: ${graficaHMm}mm; }
</style>
</head>
<body>
<div class="wrap">
<div class="paper">
${fillsHtml}
${elementsHtml}
</div>
${marksSvg}
</div>
</body>
</html>`;
}

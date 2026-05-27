import { FORMATS, SANGRIA_MM, ORELHA_MM, MM_TO_PX, calcularLombada } from "./dimensions";
import { FONT_CATALOG_BY_ID } from "./fonts";
import { getFillRect } from "./region-rects";
import type { AnyElement, TextElement, ImageElement, LogoElement, BarcodeElement, RegionFills, Region } from "./elements";
import type { FormatKey } from "../types";

const PT_TO_MM = 25.4 / 72;

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600;1,700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Syne:wght@400..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..900;1,9..40,100..900&family=Inter:wght@100..900&family=Bebas+Neue&family=Archivo+Black&display=block";

export interface CoverMeta {
  format: FormatKey;
  pages: number;
  comOrelhas: boolean;
  logoDouradoBase64: string | null;
  logoAzulBase64: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function elementStyle(el: AnyElement): string {
  return `
    position: absolute;
    left: ${el.x_mm}mm;
    top: ${el.y_mm}mm;
    width: ${el.width_mm}mm;
    height: ${el.height_mm}mm;
    transform: rotate(${el.rotation_deg}deg);
    transform-origin: top left;
    opacity: ${el.opacity};
    ${el.visible ? "" : "display: none;"}
  `.trim();
}

function renderTextElement(el: TextElement): string {
  const font = FONT_CATALOG_BY_ID[el.fontId];
  const fontFamily = font ? `'${font.family}'` : "sans-serif";
  const fontSizeMm = el.fontSize_pt * PT_TO_MM;
  const style = `
    ${elementStyle(el)}
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

function renderImageElement(el: ImageElement): string {
  const style = `${elementStyle(el)} object-fit: ${el.objectFit};`;
  return `<img src="${el.src}" style="${style.replace(/\n\s*/g, " ")}" alt="">`;
}

function renderLogoElement(el: LogoElement, meta: CoverMeta): string {
  const base64 = el.variant === "dourado" ? meta.logoDouradoBase64 : meta.logoAzulBase64;
  if (!base64) return "";
  const src = `data:image/png;base64,${base64}`;
  const style = `${elementStyle(el)} object-fit: contain;`;
  return `<img src="${src}" style="${style.replace(/\n\s*/g, " ")}" alt="Logo Autoria">`;
}

function renderBarcodeElement(el: BarcodeElement): string {
  if (!el.cachedDataUrl) return "";
  const style = `${elementStyle(el)} object-fit: contain;`;
  return `<img src="${el.cachedDataUrl}" style="${style.replace(/\n\s*/g, " ")}" alt="Código de barras">`;
}

const ALL_REGIONS: Region[] = ["orelha_verso", "contracapa", "lombada", "capa", "orelha_frente"];

function renderFills(fills: RegionFills, meta: CoverMeta): string {
  return ALL_REGIONS.map((key) => {
    const color = fills[key];
    if (!color) return "";
    const rect = getFillRect(key, meta.format, meta.pages, meta.comOrelhas);
    if (!rect) return "";
    return `<div style="position:absolute;left:${rect.x}mm;top:${rect.y}mm;width:${rect.width}mm;height:${rect.height}mm;background:${color};"></div>`;
  }).join("\n");
}

export function renderCoverAsHtml(
  elements: AnyElement[],
  fills: RegionFills,
  meta: CoverMeta,
): string {
  const f = FORMATS[meta.format];
  const lombadaMm = calcularLombada(meta.pages);
  const orelhaMm = meta.comOrelhas ? ORELHA_MM : 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
  const totalHMm = f.height_mm + SANGRIA_MM * 2;

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  const elementsHtml = sorted
    .map((el) => {
      if (el.type === "text") return renderTextElement(el as TextElement);
      if (el.type === "image") return renderImageElement(el as ImageElement);
      if (el.type === "logo") return renderLogoElement(el as LogoElement, meta);
      if (el.type === "barcode") return renderBarcodeElement(el as BarcodeElement);
      return "";
    })
    .join("\n");

  const fillsHtml = renderFills(fills, meta);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
  @page { size: ${totalWMm}mm ${totalHMm}mm; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${totalWMm}mm;
    height: ${totalHMm}mm;
    background: white;
    overflow: hidden;
  }
  .paper {
    position: relative;
    width: ${totalWMm}mm;
    height: ${totalHMm}mm;
    overflow: hidden;
    background: white;
  }
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

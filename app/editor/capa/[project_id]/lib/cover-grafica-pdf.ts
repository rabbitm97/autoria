/**
 * Build the "gráfica" PDF using pdf-lib (not Puppeteer).
 * The input must be a CMYK JPEG buffer (converted by Sharp + ICC profile).
 * All marks are drawn in CMYK with pdf-lib's native drawing API.
 *
 * Coordinate system: pdf-lib uses Y-up (origin at bottom-left).
 * All internal geometry is first computed in mm from the top-left (CSS/SVG convention),
 * then converted via mmToPt / yPt helpers.
 */

import { PDFDocument, cmyk, StandardFonts } from "pdf-lib";
import { join } from "path";
import { FORMATS, SANGRIA_MM, calcularLombada } from "./dimensions";
import type { FormatKey } from "../types";

const MARKS_MM = 10;
const CROP_GAP = 3;
const CROP_LEN = 5;
const REG_R_MM = 2.5;
const COLOR_BAR_H_MM = 4;
const STROKE_MM = 0.25;

// Path to the CMYK ICC profile used for Sharp conversion.
// Replace with the real CoatedFOGRA39.icc from eci.org if available.
export const ICC_PROFILE_PATH = join(process.cwd(), "public", "icc", "CoatedFOGRA39.icc");

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

// Convert a Y coordinate from CSS/SVG Y-down (mm from page top)
// to pdf-lib Y-up (pt from page bottom).
function yPt(y_mm: number, pageH_mm: number): number {
  return mmToPt(pageH_mm - y_mm);
}

export interface GraficaMeta {
  format: FormatKey;
  pages: number;
  orelhaMm: number;
  projectName: string;
  /**
   * Quando `true`, desenha guias exclusivamente CMYK:
   *  - Registration marks (círculos C/M/Y/K nas 4 bordas)
   *  - Color bar (faixa de 11 swatches CMYK)
   *
   * Deve ser `true` apenas na versão CMYK (impressão offset).
   * Em RGB (impressão digital POD), esses guias são ruído inútil —
   * a gráfica digital não usa chapas separadas.
   *
   * Crop marks, fold marks e texto técnico são desenhados
   * independente deste flag.
   */
  withCmykGuides: boolean;
}

export async function buildGraficaPdf(
  cmykJpegBuffer: Buffer,
  meta: GraficaMeta,
): Promise<Uint8Array> {
  const f = FORMATS[meta.format];
  const lombadaMm = calcularLombada(meta.pages);
  const orelhaMm = meta.orelhaMm > 0 ? meta.orelhaMm : 0;
  const temOrelhas = orelhaMm > 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
  const totalHMm = f.height_mm + SANGRIA_MM * 2;
  const graficaW = totalWMm + MARKS_MM * 2;
  const graficaH = totalHMm + MARKS_MM * 2;

  const trimW = totalWMm - SANGRIA_MM * 2;
  const trimH = totalHMm - SANGRIA_MM * 2;
  const trimX = MARKS_MM + SANGRIA_MM;
  const trimY = MARKS_MM + SANGRIA_MM;
  const trimX2 = trimX + trimW;
  const trimY2 = trimY + trimH;

  const doc = await PDFDocument.create();
  const page = doc.addPage([mmToPt(graficaW), mmToPt(graficaH)]);

  // ── Cover image (CMYK JPEG) ──────────────────────────────────────────────
  const img = await doc.embedJpg(cmykJpegBuffer);
  page.drawImage(img, {
    x: mmToPt(MARKS_MM),
    y: mmToPt(MARKS_MM),
    width: mmToPt(totalWMm),
    height: mmToPt(totalHMm),
  });

  // ── PDF page boxes (semantic PDF for professional print) ─────────────────
  // Sem essas chamadas, pdf-lib deixa BleedBox/TrimBox/CropBox iguais ao
  // MediaBox por default. Isso quebra detecção declarativa em qualquer
  // ferramenta que use as boxes semânticas (nosso próprio `capa-analyzer.ts`,
  // Adobe Acrobat, softwares de imposição gráfica, RIPs de impressora).
  //
  // Convenção pdf-lib: setBleedBox(x, y, width, height) em pontos, origem
  // bottom-left. Como todo o resto do arquivo raciocina em mm top-left,
  // a geometria em mm é a mesma dos foldXsMm/crop marks — o Y-flip é
  // absorvido pelo próprio pdf-lib para essas chamadas.
  //
  //   MediaBox  = arquivo inteiro (papel de impressão)         → default
  //   BleedBox  = área que sai da impressora (com sangria)     → MediaBox − marks
  //   TrimBox   = área do livro final após corte               → BleedBox − sangria
  page.setBleedBox(
    mmToPt(MARKS_MM),
    mmToPt(MARKS_MM),
    mmToPt(totalWMm),
    mmToPt(totalHMm),
  );
  page.setTrimBox(
    mmToPt(MARKS_MM + SANGRIA_MM),
    mmToPt(MARKS_MM + SANGRIA_MM),
    mmToPt(totalWMm - 2 * SANGRIA_MM),
    mmToPt(totalHMm - 2 * SANGRIA_MM),
  );

  // ── Mark helpers ─────────────────────────────────────────────────────────

  const K = cmyk(0, 0, 0, 1);
  const REG = cmyk(1, 1, 1, 1);

  function drawLine(
    x1: number, y1: number,
    x2: number, y2: number,
    dash = false,
    color: ReturnType<typeof cmyk> = K,
  ) {
    page.drawLine({
      start: { x: mmToPt(x1), y: yPt(y1, graficaH) },
      end:   { x: mmToPt(x2), y: yPt(y2, graficaH) },
      thickness: mmToPt(STROKE_MM),
      color,
      ...(dash ? { dashArray: [mmToPt(1.5), mmToPt(1.5)], dashPhase: 0 } : {}),
    });
  }

  // ── Crop marks ───────────────────────────────────────────────────────────
  // top-left
  drawLine(trimX - CROP_GAP - CROP_LEN, trimY, trimX - CROP_GAP, trimY);
  drawLine(trimX, trimY - CROP_GAP - CROP_LEN, trimX, trimY - CROP_GAP);
  // top-right
  drawLine(trimX2 + CROP_GAP, trimY, trimX2 + CROP_GAP + CROP_LEN, trimY);
  drawLine(trimX2, trimY - CROP_GAP - CROP_LEN, trimX2, trimY - CROP_GAP);
  // bottom-left
  drawLine(trimX - CROP_GAP - CROP_LEN, trimY2, trimX - CROP_GAP, trimY2);
  drawLine(trimX, trimY2 + CROP_GAP, trimX, trimY2 + CROP_GAP + CROP_LEN);
  // bottom-right
  drawLine(trimX2 + CROP_GAP, trimY2, trimX2 + CROP_GAP + CROP_LEN, trimY2);
  drawLine(trimX2, trimY2 + CROP_GAP, trimX2, trimY2 + CROP_GAP + CROP_LEN);

  // ── Fold marks (dashed) ──────────────────────────────────────────────────
  const foldXsMm: number[] = [];
  if (temOrelhas) foldXsMm.push(SANGRIA_MM + orelhaMm);
  foldXsMm.push(SANGRIA_MM + orelhaMm + f.width_mm);
  foldXsMm.push(SANGRIA_MM + orelhaMm + f.width_mm + lombadaMm);
  if (temOrelhas) foldXsMm.push(SANGRIA_MM + orelhaMm + f.width_mm + lombadaMm + f.width_mm);

  for (const xPaper of foldXsMm) {
    const xG = MARKS_MM + xPaper;
    drawLine(xG, trimY - CROP_GAP - CROP_LEN, xG, trimY - CROP_GAP, true);
    drawLine(xG, trimY2 + CROP_GAP, xG, trimY2 + CROP_GAP + CROP_LEN, true);
  }

  // ── Registration marks (só em versão CMYK) ──────────────────────────────
  // Círculos C/M/Y/K nas 4 bordas servem para alinhar chapas offset.
  // Em RGB (POD digital) são ruído — a impressão não usa chapas separadas.
  if (meta.withCmykGuides) {
    const regPositions: [number, number][] = [
      [graficaW / 2, MARKS_MM / 2],
      [graficaW / 2, graficaH - MARKS_MM / 2],
      [MARKS_MM / 2, graficaH / 2],
      [graficaW - MARKS_MM / 2, graficaH / 2],
    ];

    for (const [cx, cy] of regPositions) {
      const cxPt = mmToPt(cx);
      const cyPt = yPt(cy, graficaH);
      const r = mmToPt(REG_R_MM);

      // Pie sectors drawn as SVG arcs in pdf-lib Y-up coordinate space.
      // Conversion from Y-down SVG: negate Y values, flip arc sweep (1→0).
      // Each sector: C/M/Y/K placed in SE/SW/NW/NE visual quadrants respectively.
      const sectors: Array<[string, ReturnType<typeof cmyk>]> = [
        [`M 0 0 L ${r} 0 A ${r} ${r} 0 0 0 0 ${-r} Z`,   cmyk(1, 0, 0, 0)], // Cyan  (SE)
        [`M 0 0 L 0 ${-r} A ${r} ${r} 0 0 0 ${-r} 0 Z`,  cmyk(0, 1, 0, 0)], // Magenta (SW)
        [`M 0 0 L ${-r} 0 A ${r} ${r} 0 0 0 0 ${r} Z`,   cmyk(0, 0, 1, 0)], // Yellow (NW)
        [`M 0 0 L 0 ${r} A ${r} ${r} 0 0 0 ${r} 0 Z`,    cmyk(0, 0, 0, 1)], // Black (NE)
      ];

      for (const [path, color] of sectors) {
        page.drawSvgPath(path, { x: cxPt, y: cyPt, color });
      }

      // Circle outline in registration (all plates)
      page.drawEllipse({
        x: cxPt,
        y: cyPt,
        xScale: r,
        yScale: r,
        borderColor: REG,
        borderWidth: mmToPt(STROKE_MM),
      });

      // Crosshair in registration
      const ext = mmToPt(REG_R_MM + 1);
      page.drawLine({ start: { x: cxPt - ext, y: cyPt }, end: { x: cxPt + ext, y: cyPt }, thickness: mmToPt(STROKE_MM), color: REG });
      page.drawLine({ start: { x: cxPt, y: cyPt - ext }, end: { x: cxPt, y: cyPt + ext }, thickness: mmToPt(STROKE_MM), color: REG });
    }
  }

  // Base X e Y para color bar + texto técnico. Y calculado uma vez porque
  // o texto técnico usa referência mesmo quando color bar não é desenhado.
  const barX = trimX;
  const barY = trimY2 + CROP_GAP + CROP_LEN + 1;

  // ── Color bar (só em versão CMYK) ───────────────────────────────────────
  // 11 swatches CMYK servem para calibrar a impressão offset.
  // Em RGB (POD digital) são ruído — a gráfica digital não usa esta calibração.
  if (meta.withCmykGuides) {
    const barColors = [
      cmyk(1, 0, 0, 0),       // C
      cmyk(0, 1, 0, 0),       // M
      cmyk(0, 0, 1, 0),       // Y
      cmyk(0, 0, 0, 1),       // K
      cmyk(1, 1, 0, 0),       // C+M
      cmyk(1, 0, 1, 0),       // C+Y
      cmyk(0, 1, 1, 0),       // M+Y
      cmyk(1, 1, 1, 1),       // Registration
      cmyk(0, 0, 0, 0.25),
      cmyk(0, 0, 0, 0.50),
      cmyk(0, 0, 0, 0.75),
    ];
    const swW = trimW / barColors.length;

    for (let i = 0; i < barColors.length; i++) {
      page.drawRectangle({
        x: mmToPt(barX + i * swW),
        y: yPt(barY + COLOR_BAR_H_MM, graficaH),
        width: mmToPt(swW),
        height: mmToPt(COLOR_BAR_H_MM),
        color: barColors[i],
      });
    }

    // Bar outline
    page.drawRectangle({
      x: mmToPt(barX),
      y: yPt(barY + COLOR_BAR_H_MM, graficaH),
      width: mmToPt(trimW),
      height: mmToPt(COLOR_BAR_H_MM),
      borderColor: K,
      borderWidth: mmToPt(0.15),
    });
  }

  // ── Technical text ───────────────────────────────────────────────────────
  // Mantido em ambas as versões (útil para rastreamento).
  // Quando color bar é omitido em RGB, o texto ainda aparece logo abaixo
  // das crop marks — só que sem a faixa colorida acima dele.
  const font = await doc.embedFont(StandardFonts.Courier);
  const date = new Date().toISOString().slice(0, 10);
  // Avoid "·" since Courier may not have it; use ASCII separator instead
  const textContent = `Autoria  ${meta.projectName}  ${trimW.toFixed(1)}x${trimH.toFixed(1)}mm  ${date}`;
  const textY = barY + (meta.withCmykGuides ? COLOR_BAR_H_MM : 0) + 1.5;
  page.drawText(textContent, {
    x: mmToPt(barX),
    y: yPt(textY, graficaH),
    font,
    size: mmToPt(2.5),
    color: K,
  });

  return doc.save();
}

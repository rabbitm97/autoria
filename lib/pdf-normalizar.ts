import { PDFDocument } from "pdf-lib";
import type { FormatoSpecs } from "@/lib/formatos";

const MM_PT = 72 / 25.4;

/**
 * NORMALIZA-PDF-01 (11/ago/2026): Chromium arredonda mm→pt na geração
 * (ex.: 230mm → 230,4mm), o que reprova em validadores de canal
 * (Clube de Autores: "formato divergente"). Este pós-processo garante
 * medidas exatas e declara boxes semânticas.
 *
 * variante "digital": MediaBox = corte exato; TrimBox = MediaBox.
 * variante "grafica": MediaBox = corte + 2×bleed exato;
 *                     BleedBox = MediaBox; TrimBox = inset de bleed.
 *
 * Ganho colateral: nossos PDFs passam a entrar pela porta semântica em
 * toda a esteira (verificador, Express, capa-analyzer) — detecção
 * visual vira fallback pra arquivos de terceiros.
 */
export async function normalizarPdfMiolo(
  pdfBuffer: Buffer,
  specs: FormatoSpecs,
  variante: "digital" | "grafica",
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  const trimW = specs.width_mm * MM_PT;
  const trimH = specs.height_mm * MM_PT;
  const bleed = specs.bleed_mm * MM_PT;
  const mediaW = variante === "grafica" ? trimW + 2 * bleed : trimW;
  const mediaH = variante === "grafica" ? trimH + 2 * bleed : trimH;

  for (const page of doc.getPages()) {
    page.setMediaBox(0, 0, mediaW, mediaH);
    page.setCropBox(0, 0, mediaW, mediaH);
    if (variante === "grafica") {
      page.setBleedBox(0, 0, mediaW, mediaH);
      page.setTrimBox(bleed, bleed, trimW, trimH);
    } else {
      page.setTrimBox(0, 0, trimW, trimH);
    }
  }

  return Buffer.from(await doc.save());
}

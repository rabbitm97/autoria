import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

/**
 * Marca d'água de prévia (D2-03/D2-07). Pós-processamento pdf-lib sobre o
 * buffer FINAL do Puppeteer — NUNCA CSS no builder, NUNCA entre os dois
 * page.pdf() do bloco [toc-medido] (FIX-12).
 * 2 call sites: gerar-pdf-digital (freemium) e gerar-pdf (essencial).
 */
export async function aplicarMarcaPrevia(pdfBuffer: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText("PRÉVIA - useautoria.com", {
      x: width * 0.12,
      y: height * 0.42,
      size: Math.min(width, height) * 0.09,
      font,
      color: rgb(0.55, 0.55, 0.55),
      opacity: 0.22,
      rotate: degrees(35),
    });
  }
  return Buffer.from(await doc.save());
}

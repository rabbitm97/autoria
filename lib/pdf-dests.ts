// Extrai o mapa âncora→página física do dicionário /Dests que o Chromium
// grava ao imprimir HTML com links internos (BLOCO-FIX-12).
// Retorna páginas 1-based. Mapa vazio = chamador usa fallback (estimativas).
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRef } from "pdf-lib";

export async function extrairDestinosCapitulos(
  pdfBytes: Uint8Array | Buffer
): Promise<Record<string, number>> {
  const mapa: Record<string, number> = {};
  try {
    const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
    const destsObj = doc.catalog.lookupMaybe(PDFName.of("Dests"), PDFDict);
    if (!destsObj) return mapa;
    const pageRefs = doc.getPages().map(p => p.ref.toString());
    for (const [key, value] of destsObj.entries()) {
      const nome = key.decodeText().replace(/^\//, "");
      const resolved = doc.context.lookup(value);
      let arr: PDFArray | undefined;
      if (resolved instanceof PDFArray) arr = resolved;
      else if (resolved instanceof PDFDict) {
        const d = resolved.lookupMaybe(PDFName.of("D"), PDFArray);
        if (d) arr = d;
      }
      if (!arr || arr.size() === 0) continue;
      const first = arr.get(0);
      if (!(first instanceof PDFRef)) continue;
      const idx = pageRefs.indexOf(first.toString());
      if (idx >= 0) mapa[nome] = idx + 1;
    }
  } catch (e) {
    console.error("[pdf-dests] extração falhou:", (e as Error).message);
  }
  return mapa;
}

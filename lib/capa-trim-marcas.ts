// ─────────────────────────────────────────────────────────────────────────────
// lib/capa-trim-marcas.ts
//
// Detecta marcas de corte via BleedBox de PDF e recorta a versão PNG/JPG
// correspondente, removendo as bordas de marcas. Resultado: imagem com sangria
// mas sem marcas, adequada para consumo por EPUB, Prova 3D e extractor de frente.
//
// SEMÂNTICA: transforma um upload em Configuração A (marcas + sangria) em
// artefato equivalente à Configuração B (sangria sem marcas). O arquivo
// original permanece intacto no storage — necessário pra análise técnica
// detectar corretamente a Config A via TrimBox/BleedBox.
//
// COBERTURA: PDFs com BleedBox declarado explicitamente. Retorna null quando:
//   - BleedBox === MediaBox (sem marcas — Config B ou C)
//   - PDF sem TrimBox declarado (não distingue marcas de sangria)
//   - Erro no parsing ou no Sharp
//
// Uso: ver integração no `app/api/agentes/upload-capa/route.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";

const PT_TO_MM = 25.4 / 72;

export interface TrimarMarcasInput {
  /** PDF cru — usado apenas para ler BleedBox e detectar marcas. */
  pdfBuffer: Buffer;
  /** Imagem convertida do PDF (o que efetivamente será recortada). */
  imageBuffer: Buffer;
  /** Dimensões atuais do PNG/JPG em pixels. */
  imageWidthPx: number;
  imageHeightPx: number;
  /** DPI da imagem — usado para converter marcas em mm para pixels. */
  imageDpi: number;
}

export interface TrimarMarcasResult {
  /** JPEG resultante, com sangria mas sem marcas. */
  buffer: Buffer;
  /** Dimensões em pixels após o crop. */
  widthPx: number;
  heightPx: number;
  /** Dimensões físicas em mm — equivalem ao BleedBox do PDF original. */
  widthMm: number;
  heightMm: number;
  /** Espessura das marcas removidas de cada borda (em mm). Diagnóstico. */
  marksTrimmedMm: number;
}

/**
 * Recorta a borda de marcas de corte de uma imagem, usando o PDF
 * original como fonte declarativa das dimensões do BleedBox.
 *
 * Nunca lança. Retorna `null` em qualquer falha (parsing, dimensões
 * inconsistentes, marcas não detectadas). Callers devem tratar `null`
 * como "sem trim" e seguir com a imagem original.
 */
export async function trimarMarcasDeCapa(
  input: TrimarMarcasInput,
): Promise<TrimarMarcasResult | null> {
  const { pdfBuffer, imageBuffer, imageWidthPx, imageHeightPx, imageDpi } = input;

  if (imageDpi <= 0 || imageWidthPx <= 0 || imageHeightPx <= 0) {
    return null;
  }

  // ── Detecta marcas via BleedBox ────────────────────────────────────────
  let marksMm: number;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const page = doc.getPage(0);
    const mediaBox = page.getMediaBox();
    const bleedBox = page.getBleedBox();
    const trimBox = page.getTrimBox();

    // Se TrimBox == MediaBox, PDF não declara boxes semânticos — não sabemos
    // se as marcas existem. Melhor não trimar do que trimar errado.
    const trimIgualMedia =
      Math.abs(mediaBox.width - trimBox.width) < 0.5 &&
      Math.abs(mediaBox.height - trimBox.height) < 0.5;
    if (trimIgualMedia) return null;

    const bleedIgualMedia =
      Math.abs(mediaBox.width - bleedBox.width) < 0.5 &&
      Math.abs(mediaBox.height - bleedBox.height) < 0.5;

    // Sem marcas: BleedBox coincide com MediaBox. É Config B (sangria sem
    // marcas) — nada a trimar.
    if (bleedIgualMedia) return null;

    // Marcas = (MediaBox - BleedBox) / 2 em cada lado. Assumimos marcas
    // simétricas (padrão universal). Toma o menor entre W e H por segurança.
    const marksWPt = (mediaBox.width - bleedBox.width) / 2;
    const marksHPt = (mediaBox.height - bleedBox.height) / 2;
    marksMm = Math.min(marksWPt, marksHPt) * PT_TO_MM;

    if (marksMm <= 0.5) return null; // marcas insignificantes — ignora
  } catch (err) {
    console.warn(
      `[capa-trim-marcas] falha ao ler PDF boxes: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }

  // ── Recorta a imagem ───────────────────────────────────────────────────
  const marksPx = Math.round((marksMm * imageDpi) / 25.4);

  const newWidthPx = imageWidthPx - 2 * marksPx;
  const newHeightPx = imageHeightPx - 2 * marksPx;

  if (newWidthPx <= 0 || newHeightPx <= 0) {
    console.warn(
      `[capa-trim-marcas] dimensões inválidas após crop: ${newWidthPx}x${newHeightPx}`,
    );
    return null;
  }

  try {
    const buffer = await sharp(imageBuffer)
      .extract({
        left: marksPx,
        top: marksPx,
        width: newWidthPx,
        height: newHeightPx,
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    const widthMm = Math.round(((newWidthPx / imageDpi) * 25.4) * 10) / 10;
    const heightMm = Math.round(((newHeightPx / imageDpi) * 25.4) * 10) / 10;

    return {
      buffer,
      widthPx: newWidthPx,
      heightPx: newHeightPx,
      widthMm,
      heightMm,
      marksTrimmedMm: Math.round(marksMm * 10) / 10,
    };
  } catch (err) {
    console.warn(
      `[capa-trim-marcas] falha no Sharp: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

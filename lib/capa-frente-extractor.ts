// ─────────────────────────────────────────────────────────────────────────────
// lib/capa-frente-extractor.ts
//
// Recorta a região da frente de uma capa panorâmica do Editor visual.
//
// O Editor exporta a capa completa como PNG panorâmico com layout:
//   [sangria 3mm] [orelha_verso 80mm?] [contracapa W] [lombada L] [frente W] [orelha_frente 80mm?] [sangria 3mm]
//
// Para EPUB (e thumbnails de catálogo), precisamos apenas da frente.
// Esta função baixa o PNG, recorta a frente com Sharp e devolve JPEG otimizado
// (1600px de largura — sweet spot para EPUB sem inflar o arquivo).
//
// Retorna null se qualquer etapa falhar — caller deve ter fallback.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";

const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const SANGRIA_MM = 3;
const ORELHA_MM = 80;

const FORMATS = {
  padrao_br: { width_mm: 160, height_mm: 230 },
  compacto:  { width_mm: 140, height_mm: 210 },
  bolso:     { width_mm: 110, height_mm: 180 },
  quadrado:  { width_mm: 200, height_mm: 200 },
  a4:        { width_mm: 210, height_mm: 297 },
} as const;

export type FormatoCapa = keyof typeof FORMATS;

function calcularLombadaMm(paginas: number): number {
  return Math.max(2, Math.round(paginas * 0.07 * 10) / 10);
}

export interface ExtractFrontInput {
  url: string;
  formato: FormatoCapa;
  paginas: number;
  comOrelhas: boolean;
}

export interface ExtractFrontResult {
  buffer: Buffer;
  ext: "jpg";
  widthPx: number;
  heightPx: number;
}

/**
 * Baixa a capa panorâmica, recorta a frente sem sangria e devolve JPEG otimizado.
 * Retorna null em qualquer falha (download, parse, dimensões inválidas).
 */
export async function extractFrontCover(
  input: ExtractFrontInput,
): Promise<ExtractFrontResult | null> {
  const { url, formato, paginas, comOrelhas } = input;

  if (!FORMATS[formato]) {
    console.warn(`[capa-frente-extractor] formato desconhecido: ${formato}`);
    return null;
  }

  if (!Number.isFinite(paginas) || paginas < 1) {
    console.warn(`[capa-frente-extractor] páginas inválidas: ${paginas}`);
    return null;
  }

  // Download da imagem panorâmica
  let panoramicBuffer: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[capa-frente-extractor] download falhou: ${res.status}`);
      return null;
    }
    panoramicBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn("[capa-frente-extractor] erro no download:", err);
    return null;
  }

  // Calcular região da frente
  const f = FORMATS[formato];
  const lombadaMm = calcularLombadaMm(paginas);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;

  const xMm = SANGRIA_MM + orelhaMm + f.width_mm + lombadaMm;
  const yMm = SANGRIA_MM;
  const widthMm = f.width_mm;
  const heightMm = f.height_mm;

  const left = Math.round(xMm * MM_TO_PX);
  const top = Math.round(yMm * MM_TO_PX);
  const width = Math.round(widthMm * MM_TO_PX);
  const height = Math.round(heightMm * MM_TO_PX);

  // Validar contra dimensões reais da imagem (defesa)
  try {
    const meta = await sharp(panoramicBuffer).metadata();
    if (!meta.width || !meta.height) {
      console.warn("[capa-frente-extractor] metadata inválida");
      return null;
    }
    if (left + width > meta.width || top + height > meta.height) {
      console.warn(
        `[capa-frente-extractor] região fora dos limites: ` +
        `crop=${left},${top},${width},${height} imagem=${meta.width}x${meta.height}`,
      );
      return null;
    }
  } catch (err) {
    console.warn("[capa-frente-extractor] erro ao ler metadata:", err);
    return null;
  }

  // Recortar, redimensionar e converter para JPEG
  try {
    const buffer = await sharp(panoramicBuffer)
      .extract({ left, top, width, height })
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const out = await sharp(buffer).metadata();

    return {
      buffer,
      ext: "jpg",
      widthPx: out.width ?? 1600,
      heightPx: out.height ?? Math.round((1600 * heightMm) / widthMm),
    };
  } catch (err) {
    console.warn("[capa-frente-extractor] erro no Sharp:", err);
    return null;
  }
}

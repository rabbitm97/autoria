// ─────────────────────────────────────────────────────────────────────────────
// lib/capa-frente-extractor.ts
//
// Recorta a região da frente de uma capa panorâmica do Editor visual.
//
// O Editor exporta a capa completa como PNG panorâmico com layout:
//   [sangria 3mm] [orelha_verso 80mm?] [contracapa W] [lombada L] [frente W] [orelha_frente 80mm?] [sangria 3mm]
//
// IMPORTANTE: a geometria (lombada e orelhas) é INFERIDA das dimensões reais
// da imagem, não dos campos `dados_miolo.paginas_reais` e `editor_data.comOrelhas`
// que podem estar dessincronizados (autor mudou páginas depois de exportar,
// ou flag comOrelhas mudou sem reexport).
//
// Fallback: se a inferência falhar (imagem corrompida, formato desconhecido),
// usa o cálculo antigo via `paginas` declaradas.
//
// Retorna null se nenhuma das estratégias funcionar — caller deve ter fallback.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { estimarLombadaMm } from "./formatos";

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

// Tolerâncias
const TOL_MM = 1.0;          // 1mm de tolerância para validar altura
const LOMBADA_MIN_MM = 1;    // lombada mínima plausível
const LOMBADA_MAX_MM = 100;  // lombada máxima plausível (~1400 páginas)

function calcularLombadaMm(paginas: number): number {
  return Math.max(2, estimarLombadaMm(paginas));
}

export interface ExtractFrontInput {
  url: string;
  formato: FormatoCapa;
  paginas: number;          // usado só como fallback se a inferência falhar
  comOrelhas: boolean;       // declarado — pode estar dessincronizado
}

export interface ExtractFrontResult {
  buffer: Buffer;
  ext: "jpg";
  widthPx: number;
  heightPx: number;
}

interface GeometriaInferida {
  lombadaMm: number;
  comOrelhas: boolean;
  fonte: "imagem" | "imagem-invertendo-orelhas" | "fallback-paginas";
}

/**
 * Infere lombada (e revalida comOrelhas) a partir das dimensões reais da imagem.
 * Estratégia em camadas:
 *   1. Tenta com comOrelhas declarado → verifica se lombada sai sensata
 *   2. Se não, tenta com comOrelhas invertido → mesma validação
 *   3. Se nem isso, fallback para cálculo via paginas declaradas
 */
function inferirGeometria(params: {
  widthPx: number;
  heightPx: number;
  formato: FormatoCapa;
  comOrelhasDeclarado: boolean;
  paginasDeclaradas: number;
}): GeometriaInferida | null {
  const { widthPx, heightPx, formato, comOrelhasDeclarado, paginasDeclaradas } = params;
  const f = FORMATS[formato];

  // 1. Valida altura primeiro — deve bater com height_mm + 2*sangria (independente da lombada/orelhas)
  const expectedHeightMm = f.height_mm + 2 * SANGRIA_MM;
  const actualHeightMm = heightPx / MM_TO_PX;
  if (Math.abs(actualHeightMm - expectedHeightMm) > TOL_MM) {
    console.warn(
      `[capa-frente-extractor] altura da imagem (${actualHeightMm.toFixed(1)}mm) ` +
      `diverge do formato ${formato} (esperado ${expectedHeightMm}mm). ` +
      `Inferência abortada — usando fallback via paginas.`,
    );
    return {
      lombadaMm: calcularLombadaMm(paginasDeclaradas),
      comOrelhas: comOrelhasDeclarado,
      fonte: "fallback-paginas",
    };
  }

  // 2. Tenta com comOrelhas declarado
  const actualWidthMm = widthPx / MM_TO_PX;
  const fixedDeclarado =
    2 * SANGRIA_MM + 2 * f.width_mm + (comOrelhasDeclarado ? 2 * ORELHA_MM : 0);
  const lombadaDeclarado = actualWidthMm - fixedDeclarado;

  if (lombadaDeclarado >= LOMBADA_MIN_MM && lombadaDeclarado <= LOMBADA_MAX_MM) {
    return {
      lombadaMm: Math.round(lombadaDeclarado * 10) / 10,
      comOrelhas: comOrelhasDeclarado,
      fonte: "imagem",
    };
  }

  // 3. Lombada absurda — testa hipótese inversa de comOrelhas
  const fixedInvertido =
    2 * SANGRIA_MM + 2 * f.width_mm + (!comOrelhasDeclarado ? 2 * ORELHA_MM : 0);
  const lombadaInvertido = actualWidthMm - fixedInvertido;

  if (lombadaInvertido >= LOMBADA_MIN_MM && lombadaInvertido <= LOMBADA_MAX_MM) {
    console.warn(
      `[capa-frente-extractor] comOrelhas declarado (${comOrelhasDeclarado}) parece ` +
      `dessincronizado da imagem real. Usando comOrelhas=${!comOrelhasDeclarado}.`,
    );
    return {
      lombadaMm: Math.round(lombadaInvertido * 10) / 10,
      comOrelhas: !comOrelhasDeclarado,
      fonte: "imagem-invertendo-orelhas",
    };
  }

  // 4. Nada bate — fallback final
  console.warn(
    `[capa-frente-extractor] não consegui inferir geometria. ` +
    `largura=${actualWidthMm.toFixed(1)}mm, lombada-declarado=${lombadaDeclarado.toFixed(1)}mm, ` +
    `lombada-invertido=${lombadaInvertido.toFixed(1)}mm. Usando fallback via paginas.`,
  );
  return {
    lombadaMm: calcularLombadaMm(paginasDeclaradas),
    comOrelhas: comOrelhasDeclarado,
    fonte: "fallback-paginas",
  };
}

/**
 * Baixa a capa panorâmica, recorta a frente sem sangria e devolve JPEG otimizado.
 * Retorna null em qualquer falha grave (download, parse).
 */
export async function extractFrontCover(
  input: ExtractFrontInput,
): Promise<ExtractFrontResult | null> {
  const { url, formato, paginas, comOrelhas } = input;

  if (!FORMATS[formato]) {
    console.warn(`[capa-frente-extractor] formato desconhecido: ${formato}`);
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

  // Lê metadata real
  let widthPx: number;
  let heightPx: number;
  try {
    const meta = await sharp(panoramicBuffer).metadata();
    if (!meta.width || !meta.height) {
      console.warn("[capa-frente-extractor] metadata inválida");
      return null;
    }
    widthPx = meta.width;
    heightPx = meta.height;
  } catch (err) {
    console.warn("[capa-frente-extractor] erro ao ler metadata:", err);
    return null;
  }

  // Infere geometria real da imagem
  const geom = inferirGeometria({
    widthPx,
    heightPx,
    formato,
    comOrelhasDeclarado: comOrelhas,
    paginasDeclaradas: paginas,
  });
  if (!geom) return null;

  console.log(
    `[capa-frente-extractor] geometria: lombada=${geom.lombadaMm}mm ` +
    `comOrelhas=${geom.comOrelhas} fonte=${geom.fonte} ` +
    `(declarado: paginas=${paginas} comOrelhas=${comOrelhas})`,
  );

  // Calcula região da frente usando a geometria inferida
  const f = FORMATS[formato];
  const orelhaMm = geom.comOrelhas ? ORELHA_MM : 0;
  const xMm = SANGRIA_MM + orelhaMm + f.width_mm + geom.lombadaMm;
  const yMm = SANGRIA_MM;
  const widthMm = f.width_mm;
  const heightMm = f.height_mm;

  const left = Math.round(xMm * MM_TO_PX);
  const top = Math.round(yMm * MM_TO_PX);
  const width = Math.round(widthMm * MM_TO_PX);
  const height = Math.round(heightMm * MM_TO_PX);

  // Validação defensiva: região cabe dentro da imagem real
  if (left < 0 || top < 0 || left + width > widthPx || top + height > heightPx) {
    console.warn(
      `[capa-frente-extractor] região calculada fora dos limites: ` +
      `crop=${left},${top},${width},${height} imagem=${widthPx}x${heightPx}`,
    );
    return null;
  }

  // Recorta, redimensiona e converte para JPEG
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

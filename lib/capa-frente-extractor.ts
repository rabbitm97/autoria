// ─────────────────────────────────────────────────────────────────────────────
// lib/capa-frente-extractor.ts
//
// Recorta a região da frente de uma capa panorâmica do Editor visual.
//
// O Editor exporta a capa completa como PNG panorâmico com layout:
//   [sangria 3mm] [orelha_verso Xmm?] [contracapa W] [lombada L] [frente W] [orelha_frente Xmm?] [sangria 3mm]
//
// IMPORTANTE: a lombada é INFERIDA das dimensões reais da imagem, não do
// campo `dados_miolo.paginas_reais` que pode estar dessincronizado (autor
// mudou páginas depois de exportar a capa).
//
// Fallback: se a inferência falhar (imagem corrompida, formato desconhecido),
// usa o cálculo antigo via `paginas` declaradas.
//
// Retorna null se nenhuma das estratégias funcionar — caller deve ter fallback.
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { estimarLombadaCapaMm, getFormatoDef, type FormatoLivro } from "./formatos";

const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const SANGRIA_MM = 3;

// Tipo re-exportado para compatibilidade com callers existentes.
export type FormatoCapa = FormatoLivro;

// Tolerâncias
const TOL_MM = 1.0;          // 1mm de tolerância para validar altura
const LOMBADA_MIN_MM = 1;    // lombada mínima plausível
const LOMBADA_MAX_MM = 100;  // lombada máxima plausível (~1400 páginas)

export interface ExtractFrontInput {
  url: string;
  formato: FormatoCapa;
  paginas: number;          // usado só como fallback se a inferência falhar
  orelhaMm: number;          // declarado — pode estar dessincronizado (0 = sem orelhas)
}

export interface ExtractFrontResult {
  buffer: Buffer;
  ext: "jpg";
  widthPx: number;
  heightPx: number;
}

interface GeometriaInferida {
  lombadaMm: number;
  orelhaMm: number;
  fonte: "imagem" | "imagem-testando-alternativas" | "fallback-paginas";
}

/**
 * Infere lombada a partir das dimensões reais da imagem. Testa múltiplos
 * candidatos de orelha (declarado + 0 + padrões editoriais BR) porque o valor
 * declarado pode estar dessincronizado da imagem exportada (autor mudou
 * orelha_mm depois de exportar; upload + editor híbrido). Fallback via
 * paginas quando nenhum candidato bate.
 */
function inferirGeometria(params: {
  widthPx: number;
  heightPx: number;
  formato: FormatoCapa;
  orelhaMmDeclarado: number;
  paginasDeclaradas: number;
}): GeometriaInferida | null {
  const { widthPx, heightPx, formato, orelhaMmDeclarado, paginasDeclaradas } = params;
  const specs = getFormatoDef(formato).specs;

  // 1. Valida altura primeiro — deve bater com height_mm + 2*sangria
  //    (independente da lombada/orelhas).
  const expectedHeightMm = specs.height_mm + 2 * SANGRIA_MM;
  const actualHeightMm = heightPx / MM_TO_PX;
  if (Math.abs(actualHeightMm - expectedHeightMm) > TOL_MM) {
    console.warn(
      `[capa-frente-extractor] altura da imagem (${actualHeightMm.toFixed(1)}mm) ` +
      `diverge do formato ${formato} (esperado ${expectedHeightMm}mm). ` +
      `Inferência abortada — usando fallback via paginas.`,
    );
    return {
      lombadaMm: estimarLombadaCapaMm(paginasDeclaradas),
      orelhaMm: orelhaMmDeclarado,
      fonte: "fallback-paginas",
    };
  }

  const actualWidthMm = widthPx / MM_TO_PX;

  // 2. Testa candidatos de orelha em ordem de plausibilidade:
  //    (a) valor declarado (do resolver / editor / upload)
  //    (b) 0 mm (caso o autor tenha marcado com orelhas mas a imagem não tem)
  //    (c) 60, 70, 80, 90, 100 mm (varredura por padrões editoriais BR)
  const candidatos = new Set<number>([
    Math.max(0, orelhaMmDeclarado),
    0,
    60, 70, 80, 90, 100,
  ]);

  for (const orelhaCandidato of candidatos) {
    const fixedMm = 2 * SANGRIA_MM + 2 * specs.width_mm + 2 * orelhaCandidato;
    const lombadaCandidata = actualWidthMm - fixedMm;

    if (lombadaCandidata >= LOMBADA_MIN_MM && lombadaCandidata <= LOMBADA_MAX_MM) {
      const fonte: GeometriaInferida["fonte"] =
        orelhaCandidato === orelhaMmDeclarado ? "imagem" : "imagem-testando-alternativas";

      if (fonte === "imagem-testando-alternativas") {
        console.warn(
          `[capa-frente-extractor] orelhaMm declarado (${orelhaMmDeclarado}) parece ` +
          `dessincronizado da imagem real. Usando orelhaMm=${orelhaCandidato}.`,
        );
      }

      return {
        lombadaMm: Math.round(lombadaCandidata * 10) / 10,
        orelhaMm: orelhaCandidato,
        fonte,
      };
    }
  }

  // 3. Nenhum candidato bateu — fallback final via páginas
  console.warn(
    `[capa-frente-extractor] não consegui inferir geometria. ` +
    `largura=${actualWidthMm.toFixed(1)}mm, orelhaMm-declarado=${orelhaMmDeclarado}mm. ` +
    `Usando fallback via paginas.`,
  );
  return {
    lombadaMm: estimarLombadaCapaMm(paginasDeclaradas),
    orelhaMm: orelhaMmDeclarado,
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
  const { url, formato, paginas, orelhaMm } = input;

  let specs: ReturnType<typeof getFormatoDef>["specs"];
  try {
    specs = getFormatoDef(formato).specs;
  } catch {
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
    orelhaMmDeclarado: orelhaMm,
    paginasDeclaradas: paginas,
  });
  if (!geom) return null;

  console.log(
    `[capa-frente-extractor] geometria: lombada=${geom.lombadaMm}mm ` +
    `orelhaMm=${geom.orelhaMm} fonte=${geom.fonte} ` +
    `(declarado: paginas=${paginas} orelhaMm=${orelhaMm})`,
  );

  // Calcula região da frente usando a geometria inferida
  const xMm = SANGRIA_MM + geom.orelhaMm + specs.width_mm + geom.lombadaMm;
  const yMm = SANGRIA_MM;
  const widthMm = specs.width_mm;
  const heightMm = specs.height_mm;

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

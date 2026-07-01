/**
 * Análise técnica não-destrutiva da capa do autor.
 *
 * Detecta atributos que afetam a viabilidade de impressão profissional:
 *  - Colorspace (RGB vs CMYK)
 *  - Presença de sangria de 3mm
 *  - DPI (≥ 300 para gráfica)
 *  - Presença de marcas de corte
 *
 * Este módulo apenas ANALISA — não converte, não modifica, não bloqueia.
 * Correção automática vive no `preparar-capa-grafica` (14.M.2).
 * Gate de publicação física vive na etapa de publicação (14.M.3).
 */

import sharp from "sharp";
import { getFormatoDef, estimarLombadaCapaMm, type FormatoLivro } from "@/lib/formatos";

const DPI = 300;
const MM_TO_PX = DPI / 25.4;
const SANGRIA_ESPERADA_MM = 3;
const TOL_MM = 1.5;
const DPI_MINIMO_GRAFICA = 300;

// Análise de marcas de corte examina uma região de 12×12mm no canto
// superior esquerdo e superior direito. Cada canto: se a soma de pixels
// escuros (< 30 em L do LAB) em pequenas linhas isoladas exceder o
// threshold, considera "possível marca de corte detectada".
const CORNER_ANALISE_MM = 12;
const CORNER_DARK_THRESHOLD = 50; // pixels escuros mínimos por canto
const CORNER_DARK_MAX = 400;      // ruído natural do design excede isso

export type Colorspace = "srgb" | "cmyk" | "rgb16" | "other";
export type SangriaStatus = "presente" | "ausente" | "parcial" | "desconhecido";
export type MarcasCorte = "detectadas" | "ausentes" | "desconhecido";

export interface AnaliseTecnica {
  analisado_em: string;
  url_analisada: string;
  largura_mm: number;
  altura_mm: number;
  largura_esperada_mm: number;
  altura_esperada_mm: number;
  colorspace: Colorspace;
  dpi: number;
  sangria: SangriaStatus;
  marcas_corte: MarcasCorte;
  ok_grafica: boolean;
  ok_ebook: boolean;
  avisos: string[];
  debug?: {
    darkPixelsTopLeft: number;
    darkPixelsTopRight: number;
  };
}

export interface AnalisarInput {
  url: string;
  formato: FormatoLivro;
  paginas: number;
  orelhaMm: number;
  /**
   * Se `true`, esperamos capa panorâmica (frente + lombada + contracapa
   * + orelhas + sangria). Se `false`, esperamos só a frente + sangria.
   * Uploads são sempre panorâmicos (decisão 14.H).
   */
  panoramica: boolean;
}

export async function analisarCapa(input: AnalisarInput): Promise<AnaliseTecnica> {
  const { url, formato, paginas, orelhaMm, panoramica } = input;
  const analisado_em = new Date().toISOString();

  const specs = getFormatoDef(formato).specs;
  const lombadaMm = panoramica ? estimarLombadaCapaMm(paginas) : 0;
  const largura_esperada_mm = panoramica
    ? 2 * SANGRIA_ESPERADA_MM + 2 * specs.width_mm + lombadaMm + 2 * orelhaMm
    : 2 * SANGRIA_ESPERADA_MM + specs.width_mm;
  const altura_esperada_mm = 2 * SANGRIA_ESPERADA_MM + specs.height_mm;

  // ── Download ────────────────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return {
      analisado_em,
      url_analisada: url,
      largura_mm: 0,
      altura_mm: 0,
      largura_esperada_mm,
      altura_esperada_mm,
      colorspace: "other",
      dpi: 0,
      sangria: "desconhecido",
      marcas_corte: "desconhecido",
      ok_grafica: false,
      ok_ebook: false,
      avisos: [
        `Não foi possível analisar a capa: ${err instanceof Error ? err.message : "erro de rede"}.`,
      ],
    };
  }

  // ── Metadata ────────────────────────────────────────────────────────────
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch (err) {
    return {
      analisado_em,
      url_analisada: url,
      largura_mm: 0,
      altura_mm: 0,
      largura_esperada_mm,
      altura_esperada_mm,
      colorspace: "other",
      dpi: 0,
      sangria: "desconhecido",
      marcas_corte: "desconhecido",
      ok_grafica: false,
      ok_ebook: false,
      avisos: [`Arquivo inválido ou corrompido: ${err instanceof Error ? err.message : "erro"}.`],
    };
  }

  const widthPx = meta.width ?? 0;
  const heightPx = meta.height ?? 0;
  if (widthPx === 0 || heightPx === 0) {
    return {
      analisado_em,
      url_analisada: url,
      largura_mm: 0,
      altura_mm: 0,
      largura_esperada_mm,
      altura_esperada_mm,
      colorspace: "other",
      dpi: 0,
      sangria: "desconhecido",
      marcas_corte: "desconhecido",
      ok_grafica: false,
      ok_ebook: false,
      avisos: ["Não foi possível ler dimensões da imagem."],
    };
  }

  // ── Colorspace ──────────────────────────────────────────────────────────
  const colorspace: Colorspace =
    meta.space === "cmyk" ? "cmyk"
    : meta.space === "srgb" || meta.space === "rgb" ? "srgb"
    : meta.space === "rgb16" ? "rgb16"
    : "other";

  // ── DPI ─────────────────────────────────────────────────────────────────
  // sharp reporta density em DPI para PNG/JPG quando o arquivo declara.
  // Quando não declara, inferimos assumindo que largura_esperada_mm @ 300dpi
  // deveria bater com widthPx.
  let dpi = 0;
  if (typeof meta.density === "number" && meta.density > 0) {
    dpi = Math.round(meta.density);
  } else {
    const esperadoPx300 = largura_esperada_mm * MM_TO_PX;
    if (Math.abs(widthPx - esperadoPx300) / esperadoPx300 < 0.05) {
      dpi = 300;
    } else {
      dpi = Math.round((widthPx / largura_esperada_mm) * 25.4);
    }
  }

  // ── Dimensões em mm ─────────────────────────────────────────────────────
  const largura_mm = Math.round((widthPx / (dpi > 0 ? dpi : 300)) * 25.4 * 10) / 10;
  const altura_mm = Math.round((heightPx / (dpi > 0 ? dpi : 300)) * 25.4 * 10) / 10;

  // ── Sangria ─────────────────────────────────────────────────────────────
  const larguraOkComSangria = Math.abs(largura_mm - largura_esperada_mm) <= TOL_MM;
  const alturaOkComSangria = Math.abs(altura_mm - altura_esperada_mm) <= TOL_MM;
  const larguraOkSemSangria = Math.abs(largura_mm - (largura_esperada_mm - 2 * SANGRIA_ESPERADA_MM)) <= TOL_MM;
  const alturaOkSemSangria = Math.abs(altura_mm - (altura_esperada_mm - 2 * SANGRIA_ESPERADA_MM)) <= TOL_MM;

  let sangria: SangriaStatus;
  if (larguraOkComSangria && alturaOkComSangria) sangria = "presente";
  else if (larguraOkSemSangria && alturaOkSemSangria) sangria = "ausente";
  else if (larguraOkComSangria || alturaOkComSangria) sangria = "parcial";
  else sangria = "desconhecido";

  // ── Marcas de corte ────────────────────────────────────────────────────
  // Heurística: converte para LAB, extrai cantos superiores, conta pixels
  // com L < 30 (muito escuros). Design normal preenche os cantos ou deixa
  // brancos. Marcas de corte deixam poucos pixels escuros isolados.
  let marcas_corte: MarcasCorte = "desconhecido";
  let darkTL = 0;
  let darkTR = 0;
  try {
    const cornerPx = Math.round(CORNER_ANALISE_MM * MM_TO_PX);
    const cornerPxSafe = Math.min(cornerPx, Math.floor(widthPx / 3), Math.floor(heightPx / 3));

    const tlBuf = await sharp(buffer)
      .extract({ left: 0, top: 0, width: cornerPxSafe, height: cornerPxSafe })
      .toColourspace("lab")
      .raw()
      .toBuffer();

    for (let i = 0; i < tlBuf.length; i += 3) {
      if (tlBuf[i] < 30) darkTL++;
    }

    const trBuf = await sharp(buffer)
      .extract({ left: widthPx - cornerPxSafe, top: 0, width: cornerPxSafe, height: cornerPxSafe })
      .toColourspace("lab")
      .raw()
      .toBuffer();

    for (let i = 0; i < trBuf.length; i += 3) {
      if (trBuf[i] < 30) darkTR++;
    }

    const tlHasMarks = darkTL >= CORNER_DARK_THRESHOLD && darkTL <= CORNER_DARK_MAX;
    const trHasMarks = darkTR >= CORNER_DARK_THRESHOLD && darkTR <= CORNER_DARK_MAX;

    if (tlHasMarks && trHasMarks) marcas_corte = "detectadas";
    else if (!tlHasMarks && !trHasMarks) marcas_corte = "ausentes";
    else marcas_corte = "desconhecido";
  } catch (err) {
    console.warn(`[capa-analyzer] falha ao analisar marcas de corte: ${err instanceof Error ? err.message : err}`);
    marcas_corte = "desconhecido";
  }

  // ── Verdicts ────────────────────────────────────────────────────────────
  const dpiOk = dpi >= DPI_MINIMO_GRAFICA;
  const ok_grafica = colorspace === "cmyk" && sangria === "presente" && dpiOk;
  const ok_ebook = colorspace !== "other";

  // ── Avisos amigáveis ──────────────────────────────────────────────────
  const avisos: string[] = [];
  if (colorspace === "srgb" || colorspace === "rgb16") {
    avisos.push("Capa em RGB. Para gráfica, será convertida automaticamente para CMYK com perfil FOGRA39.");
  } else if (colorspace === "other") {
    avisos.push("Espaço de cor desconhecido. Recomendamos exportar como JPG ou PNG padrão.");
  }
  if (sangria === "ausente") {
    avisos.push("Capa sem sangria de 3mm. Para gráfica, será adicionada automaticamente.");
  } else if (sangria === "parcial") {
    avisos.push("Sangria detectada apenas em um eixo. Para gráfica, revise o arquivo original.");
  } else if (sangria === "desconhecido") {
    avisos.push("Dimensões não batem com o formato + orelhas + lombada declarados. Confira se o formato do livro está correto.");
  }
  if (!dpiOk && dpi > 0) {
    avisos.push(`Resolução ${dpi} DPI. Para gráfica, o mínimo recomendado é 300 DPI.`);
  }

  return {
    analisado_em,
    url_analisada: url,
    largura_mm,
    altura_mm,
    largura_esperada_mm: Math.round(largura_esperada_mm * 10) / 10,
    altura_esperada_mm: Math.round(altura_esperada_mm * 10) / 10,
    colorspace,
    dpi,
    sangria,
    marcas_corte,
    ok_grafica,
    ok_ebook,
    avisos,
    debug: { darkPixelsTopLeft: darkTL, darkPixelsTopRight: darkTR },
  };
}

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
  /**
   * Lombada esperada em mm com base no número de páginas informado
   * (calculada via `estimarLombadaCapaMm(paginas)`). 0 quando não panorâmica.
   */
  lombada_esperada_mm: number;
  /**
   * Orelha esperada em mm (o valor que o autor declarou no formulário
   * antes de subir a capa). 0 = sem orelhas.
   */
  orelha_esperada_mm: number;
  /**
   * Lombada deduzida a partir das dimensões reais da imagem, assumindo
   * as orelhas declaradas. Fórmula:
   *   lombada_deduzida = largura_real - 2*sangria - 2*frente - 2*orelha_declarada
   * `null` quando não panorâmica ou dedução impossível (dimensões atípicas).
   */
  lombada_deduzida_mm: number | null;
  /**
   * Orelha deduzida a partir das dimensões, testando primeiro sem orelhas
   * e depois com orelhas nos padrões editoriais BR (60-100mm em passos de 10).
   * `null` quando não panorâmica ou nenhum candidato bater.
   */
  orelha_deduzida_mm: number | null;
  colorspace: Colorspace;
  dpi: number;
  sangria: SangriaStatus;
  marcas_corte: MarcasCorte;
  ok_grafica: boolean;
  ok_ebook: boolean;
  avisos: string[];
  /**
   * Fonte da detecção de colorspace. "pdf" quando o autor enviou PDF e nós
   * conseguimos analisar o PDF cru (mais confiável para colorspace nativo);
   * "png" quando análise rodou apenas no PNG (rasterização perde informação
   * de colorspace CMYK original).
   */
  colorspace_source: "pdf" | "png";
  /**
   * Dimensões do PDF original em mm (via pdf-lib), quando disponível.
   * `null` quando fonte é PNG.
   */
  pdf_dimensoes_mm?: { largura: number; altura: number } | null;
  debug?: {
    darkPixelsTopLeft: number;
    darkPixelsTopRight: number;
    pdfDetectionError?: string;
  };
}

export interface AnalisarInput {
  url: string;
  /**
   * URL pública do PDF original quando o autor enviou PDF e nós preservamos
   * o arquivo cru. Quando presente, o analyzer usa o PDF para detectar
   * colorspace (mais confiável) e ignora o resultado do PNG.
   */
  pdfOriginalUrl?: string;
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

/**
 * Analisa o PDF original quando disponível. Retorna:
 *  - colorspace: detectado via search bruto no buffer descomprimido
 *    (`/DeviceCMYK` vs `/DeviceRGB`). Heurística ~90% precisa: PDFs com
 *    zlib streams podem esconder markers, mas cobre a maioria dos casos
 *    profissionais (InDesign, Illustrator, Photoshop export).
 *  - dimensões: extraídas via pdf-lib (primeira página).
 *
 * Nunca lança — retorna `null` em qualquer falha, com o erro registrado
 * no `debug.pdfDetectionError` do output principal.
 */
async function detectPdfOriginal(pdfUrl: string): Promise<{
  colorspace: Colorspace;
  largura_mm: number;
  altura_mm: number;
} | { error: string }> {
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return { error: `HTTP ${res.status} ao baixar PDF` };
    const buffer = Buffer.from(await res.arrayBuffer());

    // Colorspace: busca por markers padrão no PDF. Aceita false positives
    // pequenos (ex: comentários de metadados com "CMYK") em troca de
    // pegar CMYK real que estaria escondido em streams zlib caso
    // fôssemos parsear estruturalmente.
    const text = buffer.toString("latin1"); // preserva bytes brutos
    const hasCmyk = /\/DeviceCMYK|\/DefaultCMYK|\/CMYK\b/i.test(text);
    const hasRgb = /\/DeviceRGB|\/DefaultRGB|\/RGB\b/i.test(text);
    let colorspace: Colorspace;
    if (hasCmyk) {
      // Quando ambos aparecem (comum em PDFs mistos), CMYK vence porque
      // representa a intenção do designer para gráfica.
      colorspace = "cmyk";
    } else if (hasRgb) {
      colorspace = "srgb";
    } else {
      colorspace = "other";
    }

    // Dimensões via pdf-lib (primeira página).
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const page = doc.getPage(0);
    const { width: widthPt, height: heightPt } = page.getSize();
    // Convert pontos → mm (1 pt = 25.4/72 mm)
    const largura_mm = Math.round((widthPt * 25.4) / 72 * 10) / 10;
    const altura_mm = Math.round((heightPt * 25.4) / 72 * 10) / 10;

    return { colorspace, largura_mm, altura_mm };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function analisarCapa(input: AnalisarInput): Promise<AnaliseTecnica> {
  const { url, pdfOriginalUrl, formato, paginas, orelhaMm, panoramica } = input;
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
      lombada_esperada_mm: 0,
      orelha_esperada_mm: 0,
      lombada_deduzida_mm: null,
      orelha_deduzida_mm: null,
      colorspace: "other",
      dpi: 0,
      sangria: "desconhecido",
      marcas_corte: "desconhecido",
      ok_grafica: false,
      ok_ebook: false,
      avisos: [
        `Não foi possível analisar a capa: ${err instanceof Error ? err.message : "erro de rede"}.`,
      ],
      colorspace_source: "png" as const,
      pdf_dimensoes_mm: null,
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
      lombada_esperada_mm: 0,
      orelha_esperada_mm: 0,
      lombada_deduzida_mm: null,
      orelha_deduzida_mm: null,
      colorspace: "other",
      dpi: 0,
      sangria: "desconhecido",
      marcas_corte: "desconhecido",
      ok_grafica: false,
      ok_ebook: false,
      avisos: [`Arquivo inválido ou corrompido: ${err instanceof Error ? err.message : "erro"}.`],
      colorspace_source: "png" as const,
      pdf_dimensoes_mm: null,
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
      lombada_esperada_mm: 0,
      orelha_esperada_mm: 0,
      lombada_deduzida_mm: null,
      orelha_deduzida_mm: null,
      colorspace: "other",
      dpi: 0,
      sangria: "desconhecido",
      marcas_corte: "desconhecido",
      ok_grafica: false,
      ok_ebook: false,
      avisos: ["Não foi possível ler dimensões da imagem."],
      colorspace_source: "png" as const,
      pdf_dimensoes_mm: null,
    };
  }

  // ── Colorspace ──────────────────────────────────────────────────────────
  // Sempre analisamos o PNG primeiro (fonte de dados garantida). Se PDF
  // original está disponível, sobrescrevemos com o resultado do PDF —
  // mais confiável, especialmente para autores que exportaram CMYK do
  // InDesign/Illustrator.
  let colorspace: Colorspace =
    meta.space === "cmyk" ? "cmyk"
    : meta.space === "srgb" || meta.space === "rgb" ? "srgb"
    : meta.space === "rgb16" ? "rgb16"
    : "other";
  let colorspace_source: "pdf" | "png" = "png";
  let pdf_dimensoes_mm: { largura: number; altura: number } | null = null;
  let pdfDetectionError: string | undefined;

  if (pdfOriginalUrl) {
    const pdfResult = await detectPdfOriginal(pdfOriginalUrl);
    if ("error" in pdfResult) {
      pdfDetectionError = pdfResult.error;
      console.warn(`[capa-analyzer] falha na análise do PDF original: ${pdfResult.error}`);
    } else {
      colorspace = pdfResult.colorspace;
      colorspace_source = "pdf";
      pdf_dimensoes_mm = { largura: pdfResult.largura_mm, altura: pdfResult.altura_mm };
    }
  }

  // ── DPI ─────────────────────────────────────────────────────────────────
  // Prioridade:
  //   1. metadata.density (arquivo declara — mais confiável)
  //   2. Testa se widthPx bate esperado panorâmico @ 300 DPI
  //   3. Testa se widthPx bate esperado só-frente @ 300 DPI (autor pode
  //      ter subido só a frente por engano — vamos reportar sangria/
  //      dimensão errada, mas evitamos falso DPI baixo)
  //   4. Inferência final: assume 300 DPI e deixa dimensões falarem
  let dpi = 0;
  if (typeof meta.density === "number" && meta.density > 0) {
    dpi = Math.round(meta.density);
  } else {
    const esperadoPx300Panoramica = largura_esperada_mm * MM_TO_PX;
    const larguraSoFrente_mm = specs.width_mm + 2 * SANGRIA_ESPERADA_MM;
    const esperadoPx300Frente = larguraSoFrente_mm * MM_TO_PX;

    if (Math.abs(widthPx - esperadoPx300Panoramica) / esperadoPx300Panoramica < 0.05) {
      dpi = 300;
    } else if (Math.abs(widthPx - esperadoPx300Frente) / esperadoPx300Frente < 0.05) {
      dpi = 300;
    } else {
      // Última tentativa: assume 300 DPI e reporta as dimensões que sairem.
      // Se autor tiver de fato baixa resolução, largura_mm resultante vai
      // ficar aberrante e a validação de sangria vai reportar "desconhecido".
      dpi = 300;
    }
  }

  // ── Dimensões em mm ─────────────────────────────────────────────────────
  const largura_mm = Math.round((widthPx / (dpi > 0 ? dpi : 300)) * 25.4 * 10) / 10;
  const altura_mm = Math.round((heightPx / (dpi > 0 ? dpi : 300)) * 25.4 * 10) / 10;

  // ── Dedução de lombada e orelha a partir das dimensões reais ────────────
  // Só faz sentido em capa panorâmica. Fórmula:
  //   largura_real = 2*sangria + 2*orelha + 2*frente + lombada
  //   → lombada = largura_real - 2*sangria - 2*orelha - 2*frente
  //
  // Testamos primeiro com a orelha declarada. Se lombada resultante for
  // absurda (< 0 ou > 100mm), tentamos outros candidatos de orelha nos
  // padrões editoriais BR: 0, 60, 70, 80, 90, 100.
  let lombada_deduzida_mm: number | null = null;
  let orelha_deduzida_mm: number | null = null;

  if (panoramica) {
    const larguraDisponivel_mm = largura_mm - 2 * SANGRIA_ESPERADA_MM - 2 * specs.width_mm;
    const candidatos = [orelhaMm, 0, 60, 70, 80, 90, 100];
    for (const orelhaCandidato of candidatos) {
      const lombadaCandidata = larguraDisponivel_mm - 2 * orelhaCandidato;
      if (lombadaCandidata >= 1 && lombadaCandidata <= 100) {
        lombada_deduzida_mm = Math.round(lombadaCandidata * 10) / 10;
        orelha_deduzida_mm = orelhaCandidato;
        break;
      }
    }
  }

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
    lombada_esperada_mm: Math.round(lombadaMm * 10) / 10,
    orelha_esperada_mm: orelhaMm,
    lombada_deduzida_mm,
    orelha_deduzida_mm,
    colorspace,
    dpi,
    sangria,
    marcas_corte,
    ok_grafica,
    ok_ebook,
    avisos,
    colorspace_source,
    pdf_dimensoes_mm,
    debug: {
      darkPixelsTopLeft: darkTL,
      darkPixelsTopRight: darkTR,
      pdfDetectionError,
    },
  };
}

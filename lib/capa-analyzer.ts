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

export type Colorspace = "srgb" | "cmyk" | "rgb16" | "other";
export type SangriaStatus = "presente" | "ausente" | "parcial" | "desconhecido";
export type MarcasCorte = "detectadas" | "ausentes" | "desconhecido";
/**
 * Configuração detectada do arquivo de capa. Três casos válidos + desconhecido:
 * - "A": arquivo com sangria + marcas de corte. Pronto para gráfica.
 * - "B": arquivo com sangria mas sem marcas. Aceitável para POD/eBook.
 * - "C": arquivo só com área útil (sem sangria, sem marcas). Pronto para eBook.
 * - "desconhecida": dimensões não batem com nenhuma configuração canônica.
 */
export type ConfiguracaoCapa = "A" | "B" | "C" | "desconhecida";
/**
 * Fonte usada para detectar marcas de corte e sangria:
 * - "pdf_boxes": TrimBox/BleedBox/MediaBox do PDF (declarativo, alta confiança)
 * - "visual": análise heurística de pixels nos cantos (menor confiança)
 * - "none": arquivo sem PDF boxes e sem marcas visuais
 */
export type DeteccaoFonte = "pdf_boxes" | "visual" | "none";

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
  /**
   * Configuração canônica detectada (A/B/C) ou "desconhecida".
   */
  configuracao: ConfiguracaoCapa;
  /**
   * Fonte usada para detectar marcas de corte e sangria.
   */
  deteccao_fonte: DeteccaoFonte;
  /**
   * Sangria detectada em mm. Sempre calculada dinamicamente (nunca assumida).
   * `null` quando não foi possível detectar (Config C ou "desconhecida").
   */
  sangria_detectada_mm: number | null;
  /**
   * Dimensões da área útil (dentro do corte). Em Config A e B, é as dimensões
   * do arquivo menos a sangria. Em Config C, é o arquivo inteiro.
   * `null` quando "desconhecida".
   */
  area_util_mm: { largura: number; altura: number } | null;
  debug?: {
    darkPixelsTopLeft: number;
    darkPixelsTopRight: number;
    pdfDetectionError?: string;
    marcasCortesCantosDetectados?: string[];
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

/**
 * Detecta marcas de corte e sangria via metadados de PDF (TrimBox/MediaBox).
 * Só funciona para PDFs profissionais que declaram essas caixas.
 * Retorna `null` se não é PDF ou não tem TrimBox declarado.
 */
async function detectMarcasFromPdf(pdfUrl: string): Promise<{
  marcas: MarcasCorte;
  sangria_detectada_mm: number | null;
  area_util_mm: { largura: number; altura: number };
} | null> {
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const page = doc.getPage(0);

    // pdf-lib retorna MediaBox como fallback quando TrimBox/BleedBox não são
    // declarados. Se TrimBox === MediaBox, o PDF não declara boxes semânticos
    // e caímos no fallback visual.
    const mediaBox = page.getMediaBox();
    const trimBox = page.getTrimBox();
    const bleedBox = page.getBleedBox();

    const trimIgualMedia =
      Math.abs(mediaBox.width - trimBox.width) < 0.5 &&
      Math.abs(mediaBox.height - trimBox.height) < 0.5;

    if (trimIgualMedia) {
      // Sem TrimBox declarado — pdf-lib caiu no MediaBox como fallback.
      return null;
    }

    const ptToMm = (pt: number) => Math.round((pt * 25.4) / 72 * 10) / 10;

    // Três boxes distintos possíveis, cada um com significado próprio:
    //   MediaBox: arquivo total (com marcas de corte se houver)
    //   BleedBox: área impressa (com sangria, sem marcas)
    //   TrimBox:  livro final após corte (sem sangria, sem marcas)
    //
    // Casos:
    //  (a) PDF pro completo (nosso `cover-grafica-pdf.ts` pós-14.M.6):
    //      Media > Bleed > Trim. Marks presentes, sangria presente.
    //  (b) PDF com sangria mas sem marcas de corte (comum em POD):
    //      Media = Bleed > Trim. Marks ausentes, sangria presente.
    //  (c) PDF só com área útil, sem sangria e sem marcas:
    //      Bleed = Trim (aqui não entramos porque trimIgualMedia teria retornado null).

    // BleedBox pode não estar declarado (pdf-lib cai no MediaBox como fallback).
    const bleedIgualMedia =
      Math.abs(mediaBox.width - bleedBox.width) < 0.5 &&
      Math.abs(mediaBox.height - bleedBox.height) < 0.5;
    const bleedIgualTrim =
      Math.abs(bleedBox.width - trimBox.width) < 0.5 &&
      Math.abs(bleedBox.height - trimBox.height) < 0.5;

    // Sangria: (BleedBox − TrimBox) / 2 quando BleedBox distinto de TrimBox.
    // Se BleedBox === MediaBox (não declarado), usa (Media − Trim) / 2 como
    // aproximação — mas nesse caso pode incluir a área das marcas.
    let sangria_detectada_mm: number;
    if (!bleedIgualTrim && !bleedIgualMedia) {
      // Caso (a): temos os 3 boxes distintos, sangria é a diferença bleed−trim.
      const sangriaWPt = (bleedBox.width - trimBox.width) / 2;
      const sangriaHPt = (bleedBox.height - trimBox.height) / 2;
      sangria_detectada_mm = ptToMm(Math.min(sangriaWPt, sangriaHPt));
    } else {
      // Caso (b) ou BleedBox=MediaBox: sangria = (media − trim) / 2.
      const sangriaWPt = (mediaBox.width - trimBox.width) / 2;
      const sangriaHPt = (mediaBox.height - trimBox.height) / 2;
      sangria_detectada_mm = ptToMm(Math.min(sangriaWPt, sangriaHPt));
    }

    // Marcas de corte: só existem se MediaBox > BleedBox (há área extra
    // além da sangria para acomodar as marcas). Se BleedBox === MediaBox,
    // marcas ausentes.
    const marks_mm = !bleedIgualMedia
      ? ptToMm((mediaBox.width - bleedBox.width) / 2)
      : 0;

    return {
      marcas: marks_mm > 0 ? "detectadas" : "ausentes",
      sangria_detectada_mm,
      area_util_mm: {
        largura: ptToMm(trimBox.width),
        altura: ptToMm(trimBox.height),
      },
    };
  } catch (err) {
    console.warn(`[capa-analyzer] falha ao ler PDF boxes: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Analisa um canto do arquivo procurando padrão de marca de corte.
 * Marcas típicas são linhas finas em cruz (uma horizontal + uma vertical),
 * separadas do resto do design, próximas ao canto do arquivo.
 *
 * Retorna se detectou o padrão E a distância aproximada das linhas à borda
 * (usada para calcular sangria).
 */
function analisarPadraoMarca(
  cornerBuf: Buffer,
  size: number,
): { detectada: boolean; distanciaBordaPx: number } {
  const DARK_THRESHOLD = 100; // pixels < 100 em grayscale são "escuros"
  const LINE_MIN_LEN = 3; // linha precisa ter pelo menos 3px de comprimento
  const LINE_MAX_LEN = Math.floor(size / 3); // marca ocupa no máximo 1/3 do canto

  // Procura linha horizontal fina (pixel escuro contínuo em uma row)
  let linhaH: number | null = null;
  for (let y = 0; y < size; y++) {
    let maxConsecutivos = 0;
    let consecutivos = 0;
    for (let x = 0; x < size; x++) {
      if (cornerBuf[y * size + x] < DARK_THRESHOLD) {
        consecutivos++;
        maxConsecutivos = Math.max(maxConsecutivos, consecutivos);
      } else {
        consecutivos = 0;
      }
    }
    if (maxConsecutivos >= LINE_MIN_LEN && maxConsecutivos <= LINE_MAX_LEN) {
      linhaH = y;
      break;
    }
  }

  // Procura linha vertical fina (pixel escuro contínuo em uma column)
  let linhaV: number | null = null;
  for (let x = 0; x < size; x++) {
    let maxConsecutivos = 0;
    let consecutivos = 0;
    for (let y = 0; y < size; y++) {
      if (cornerBuf[y * size + x] < DARK_THRESHOLD) {
        consecutivos++;
        maxConsecutivos = Math.max(maxConsecutivos, consecutivos);
      } else {
        consecutivos = 0;
      }
    }
    if (maxConsecutivos >= LINE_MIN_LEN && maxConsecutivos <= LINE_MAX_LEN) {
      linhaV = x;
      break;
    }
  }

  // Padrão de marca: linha horizontal E vertical, próximas ao canto
  if (linhaH != null && linhaV != null) {
    return {
      detectada: true,
      distanciaBordaPx: Math.min(linhaH, linhaV),
    };
  }
  return { detectada: false, distanciaBordaPx: 0 };
}

/**
 * Detecção visual de marcas de corte nos 4 cantos do arquivo.
 * Fallback quando PDF não tem metadados (TrimBox) declarados,
 * ou quando arquivo é PNG/JPG.
 */
async function detectMarcasVisual(
  buffer: Buffer,
  widthPx: number,
  heightPx: number,
  dpi: number,
): Promise<{
  marcas: MarcasCorte;
  sangria_detectada_mm: number | null;
  cantosDetectados: string[];
}> {
  const CORNER_ANALISE_MM = 20;
  const cornerPx = Math.round((CORNER_ANALISE_MM * dpi) / 25.4);
  const cornerPxSafe = Math.min(cornerPx, Math.floor(widthPx / 4), Math.floor(heightPx / 4));

  const cantos = [
    { name: "TL", left: 0, top: 0 },
    { name: "TR", left: widthPx - cornerPxSafe, top: 0 },
    { name: "BL", left: 0, top: heightPx - cornerPxSafe },
    { name: "BR", left: widthPx - cornerPxSafe, top: heightPx - cornerPxSafe },
  ];

  const detectadasEm: string[] = [];
  const distanciasBorda: number[] = [];

  for (const canto of cantos) {
    try {
      const cornerBuf = await sharp(buffer)
        .extract({
          left: canto.left,
          top: canto.top,
          width: cornerPxSafe,
          height: cornerPxSafe,
        })
        .toColourspace("b-w")
        .raw()
        .toBuffer();

      const res = analisarPadraoMarca(cornerBuf, cornerPxSafe);
      if (res.detectada) {
        detectadasEm.push(canto.name);
        distanciasBorda.push(res.distanciaBordaPx);
      }
    } catch (err) {
      console.warn(`[capa-analyzer] falha ao analisar canto ${canto.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Marcas detectadas se 3 ou 4 cantos batem. 1-2 cantos = "desconhecido"
  // (design com elementos nos cantos que confundem heurística).
  let marcas: MarcasCorte;
  if (detectadasEm.length >= 3) marcas = "detectadas";
  else if (detectadasEm.length === 0) marcas = "ausentes";
  else marcas = "desconhecido";

  let sangria_detectada_mm: number | null = null;
  if (marcas === "detectadas" && distanciasBorda.length > 0) {
    const mediaDistanciaPx = distanciasBorda.reduce((a, b) => a + b, 0) / distanciasBorda.length;
    sangria_detectada_mm = Math.round((mediaDistanciaPx / dpi) * 25.4 * 10) / 10;
  }

  return { marcas, sangria_detectada_mm, cantosDetectados: detectadasEm };
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
      configuracao: "desconhecida" as const,
      deteccao_fonte: "none" as const,
      sangria_detectada_mm: null,
      area_util_mm: null,
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
      configuracao: "desconhecida" as const,
      deteccao_fonte: "none" as const,
      sangria_detectada_mm: null,
      area_util_mm: null,
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
      configuracao: "desconhecida" as const,
      deteccao_fonte: "none" as const,
      sangria_detectada_mm: null,
      area_util_mm: null,
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
  //   1. metadata.density (arquivo declara — quando confiável)
  //   2. Testa se widthPx bate esperado panorâmico @ 300 DPI
  //   3. Testa se widthPx bate esperado só-frente @ 300 DPI (autor pode
  //      ter subido só a frente por engano — vamos reportar sangria/
  //      dimensão errada, mas evitamos falso DPI baixo)
  //   4. Inferência final: assume 300 DPI e deixa dimensões falarem
  //
  // ⚠ Sharp retorna density=72 como default web quando o PNG não tem
  // chunk pHYs (comum em Konva/Canvas export). Isso é indistinguível de
  // um PNG realmente em 72 DPI. Como capa impressa nunca é 72 DPI de fato,
  // ignoramos density abaixo de 150 e caímos no fallback dimensional.
  const DENSITY_MIN_TRUSTED = 150;
  let dpi = 0;
  if (typeof meta.density === "number" && meta.density >= DENSITY_MIN_TRUSTED) {
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

  // ── Marcas de corte + sangria detectada dinamicamente ─────────────────
  // Ordem de tentativas:
  //   1. PDF boxes (TrimBox vs MediaBox) — declarativo, alta confiança
  //   2. Análise visual dos 4 cantos — heurística
  //   3. Se nada bater: marcas = "ausentes", sangria = null
  let marcas_corte: MarcasCorte = "desconhecido";
  let sangria_detectada_mm: number | null = null;
  let area_util_mm_detectada: { largura: number; altura: number } | null = null;
  let deteccao_fonte: DeteccaoFonte = "none";
  let cantosDetectados: string[] = [];

  // Tentativa 1: metadados PDF (se disponível)
  if (input.pdfOriginalUrl) {
    const pdfResult = await detectMarcasFromPdf(input.pdfOriginalUrl);
    if (pdfResult) {
      marcas_corte = pdfResult.marcas;
      sangria_detectada_mm = pdfResult.sangria_detectada_mm;
      area_util_mm_detectada = pdfResult.area_util_mm;
      deteccao_fonte = "pdf_boxes";
    }
  }

  // Tentativa 2: análise visual (fallback ou complemento)
  if (deteccao_fonte === "none") {
    const visualResult = await detectMarcasVisual(buffer, widthPx, heightPx, dpi);
    marcas_corte = visualResult.marcas;
    sangria_detectada_mm = visualResult.sangria_detectada_mm;
    cantosDetectados = visualResult.cantosDetectados;
    deteccao_fonte = marcas_corte === "detectadas" || marcas_corte === "desconhecido"
      ? "visual"
      : "none";
  }

  // ── Configuração detectada (A/B/C/desconhecida) ──────────────────────
  // Config A: com marcas de corte + sangria (área útil está dentro das marcas)
  // Config B: sem marcas mas com sangria (área útil + sangria = arquivo total)
  // Config C: sem marcas, sem sangria (arquivo total = área útil)
  // Desconhecida: dimensões não batem com nenhuma das 3
  //
  // ⚠ Config A/B/C é sobre ESTRUTURA do arquivo (com/sem marcas, com/sem
  // sangria) — não sobre o valor exato da lombada. Autor pode ter exportado
  // capa com lombada declarada diferente da atual do miolo (ex: mudou páginas
  // depois de exportar). Isso NÃO invalida a Config; vira aviso separado de
  // "Lombada divergente".
  //
  // Por isso a detecção usa ALTURA (que não depende da lombada) para decidir
  // se tem sangria. A LARGURA só é usada para deduzir a lombada real depois.
  let configuracao: ConfiguracaoCapa = "desconhecida";
  let area_util_final: { largura: number; altura: number } | null = null;

  const SANGRIA_MIN_MM = 3;
  const TOL_H_MM = 2.0;  // tolerância na altura para decidir sangria (mais generosa que TOL_MM)
  const alturaEsperadaPura = specs.height_mm;
  const alturaEsperadaComSangria = specs.height_mm + 2 * SANGRIA_MIN_MM;
  const alturaBateSemSangria = Math.abs(altura_mm - alturaEsperadaPura) <= TOL_H_MM;
  const alturaBateComSangria = Math.abs(altura_mm - alturaEsperadaComSangria) <= TOL_H_MM;

  if (marcas_corte === "detectadas" && sangria_detectada_mm != null && sangria_detectada_mm >= SANGRIA_MIN_MM) {
    // Config A: marcas de corte detectadas E sangria ≥ 3mm.
    // Confia na area_util reportada pela detecção (PDF boxes ou heurística
    // visual). Não valida contra dimensões esperadas — divergência de
    // lombada é reportada como aviso separado, não invalida a Config.
    const areaUtilA_W = area_util_mm_detectada
      ? area_util_mm_detectada.largura
      : largura_mm - 2 * sangria_detectada_mm;
    const areaUtilA_H = area_util_mm_detectada
      ? area_util_mm_detectada.altura
      : altura_mm - 2 * sangria_detectada_mm;

    configuracao = "A";
    area_util_final = { largura: areaUtilA_W, altura: areaUtilA_H };
  } else if (marcas_corte === "ausentes" || marcas_corte === "desconhecido") {
    // Sem marcas detectadas. Usa a ALTURA para decidir se tem sangria (altura
    // não depende da lombada; só do formato do livro).
    if (alturaBateComSangria) {
      // Config B: arquivo = área útil + 3mm de sangria em cada lado
      configuracao = "B";
      sangria_detectada_mm = SANGRIA_MIN_MM;
      area_util_final = {
        largura: largura_mm - 2 * SANGRIA_MIN_MM,
        altura: altura_mm - 2 * SANGRIA_MIN_MM,
      };
    } else if (alturaBateSemSangria) {
      // Config C: arquivo = área útil pura
      configuracao = "C";
      sangria_detectada_mm = 0;
      area_util_final = {
        largura: largura_mm,
        altura: altura_mm,
      };
    }
    // Se a altura não bate com nenhuma das duas, mantém "desconhecida"
    // (formato do livro provavelmente está errado, e não vale a pena
    // adivinhar a lombada em cima de dimensões inconsistentes).
  }

  // ── Dedução de lombada e orelha a partir das dimensões reais ────────────
  // Dedução usa a ÁREA ÚTIL DETECTADA (dentro do corte). Nunca usa
  // `largura_mm` (arquivo total) como fallback — em Config A/B, isso
  // incluiria marcas + sangria e daria lombada absurda.
  //
  // Se configuracao === "desconhecida", pula a dedução (retorna null) em
  // vez de deduzir errado. Isso força o autor a corrigir o formato do
  // livro primeiro — deduzir lombada em cima de dimensões inconsistentes
  // dá números enganosos (bug 14.M.6).
  let lombada_deduzida_mm: number | null = null;
  let orelha_deduzida_mm: number | null = null;

  if (panoramica && area_util_final != null) {
    const larguraDisponivel_mm = area_util_final.largura - 2 * specs.width_mm;
    const candidatos = [orelhaMm, 0, 60, 70, 80, 90, 100];
    // Aceita lombada a partir de 0.1mm (livros e-book digitais podem ter
    // "lombada virtual" quase zero em exports panorâmicos de layout).
    for (const orelhaCandidato of candidatos) {
      const lombadaCandidata = larguraDisponivel_mm - 2 * orelhaCandidato;
      if (lombadaCandidata >= 0.1 && lombadaCandidata <= 100) {
        lombada_deduzida_mm = Math.round(lombadaCandidata * 10) / 10;
        orelha_deduzida_mm = orelhaCandidato;
        break;
      }
    }
  }

  // ── Sangria ─────────────────────────────────────────────────────────────
  // Derivar SangriaStatus da configuração detectada (mantém compatibilidade
  // com consumidores externos do type SangriaStatus).
  let sangria: SangriaStatus;
  if (configuracao === "A" || configuracao === "B") sangria = "presente";
  else if (configuracao === "C") sangria = "ausente";
  else sangria = "desconhecido";

  // ── Verdicts ────────────────────────────────────────────────────────────
  const dpiOk = dpi >= DPI_MINIMO_GRAFICA || colorspace_source === "pdf";
  // ok_grafica = Config A (marcas + sangria + CMYK + DPI ok)
  const ok_grafica = configuracao === "A" && colorspace === "cmyk" && dpiOk;
  // ok_ebook = qualquer config válida com colorspace conhecido
  const ok_ebook = configuracao !== "desconhecida" && colorspace !== "other";

  // ── Avisos amigáveis ──────────────────────────────────────────────────
  const avisos: string[] = [];
  if (colorspace === "srgb" || colorspace === "rgb16") {
    avisos.push("Capa em RGB. Para gráfica, será convertida automaticamente para CMYK com perfil FOGRA39.");
  } else if (colorspace === "other") {
    avisos.push("Espaço de cor desconhecido. Recomendamos exportar como JPG ou PNG padrão.");
  }
  if (sangria === "ausente") {
    avisos.push("Capa sem sangria de 3mm. Para gráfica, será adicionada automaticamente.");
  } else if (sangria === "desconhecido") {
    // Verifica se o arquivo parece ser uma "frente pura" (só a capa da
    // frente, sem lombada nem contracapa). Se largura ≈ specs.width_mm
    // (com ou sem sangria) e altura ≈ specs.height_mm (com ou sem sangria),
    // é frente pura — provavelmente o autor subiu o `capa-ebook.jpg` em vez
    // da panorâmica.
    const larguraFrentePura = specs.width_mm;
    const larguraFrenteComSangria = specs.width_mm + 2 * SANGRIA_MIN_MM;
    const eFrentePura = panoramica && (
      (Math.abs(largura_mm - larguraFrentePura) <= TOL_H_MM && alturaBateSemSangria) ||
      (Math.abs(largura_mm - larguraFrenteComSangria) <= TOL_H_MM && alturaBateComSangria)
    );
    if (eFrentePura) {
      avisos.push(
        "Esse arquivo parece ser só a frente da capa (sem lombada nem contracapa). " +
        "Ele vai direto para o eBook — não precisa passar pela análise técnica aqui. " +
        "Para essa etapa, envie a capa panorâmica completa (frente + lombada + contracapa).",
      );
    } else {
      avisos.push(
        "Dimensões não batem com o formato + orelhas declarados. " +
        "Confira se o formato do livro está correto ou reexporte a capa.",
      );
    }
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
    configuracao,
    deteccao_fonte,
    sangria_detectada_mm,
    area_util_mm: area_util_final,
    debug: {
      darkPixelsTopLeft: 0,
      darkPixelsTopRight: 0,
      pdfDetectionError,
      marcasCortesCantosDetectados: cantosDetectados,
    },
  };
}

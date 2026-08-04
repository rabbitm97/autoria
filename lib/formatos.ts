/**
 * Fonte única de verdade dos 5 formatos físicos de livro suportados.
 *
 * Slug canônico é o único valor aceito em toda a stack (agentes, DB, UI).
 * Nunca usar IDs de capa legados ("16x23", "14x21" etc.) fora do editor canvas.
 */

export type FormatoLivro = "padrao_br" | "compacto" | "bolso" | "quadrado" | "a4";

export interface FormatoSpecs {
  width_cm: number;
  height_cm: number;
  width_mm: number;
  height_mm: number;
  margens: {
    top_mm: number;
    outer_mm: number;
    bottom_mm: number;
    inner_mm: number;
  };
  /**
   * Caracteres por página (estimativa empírica), calibrado para o corpo_pt
   * declarado em `cpp_base_corpo_pt`. Conta TODOS os caracteres do texto
   * (letras, espaços, pontuação, quebras). A função `cppEfetivo` em
   * `lib/miolo-builder.ts` escala matematicamente para outros corpos.
   *
   * Valores foram calibrados a partir de 5 livros reais (Skia/PDF), página
   * cheia (≥85% da mediana provisória), erro < 2% vs páginas reais.
   */
  cpp: number;
  /**
   * Corpo de texto (em pt) usado como base de calibração do `cpp`.
   *   padrao_br, compacto → 11pt (sweet spot editorial)
   *   bolso               → 10pt (mass-market paperback)
   *   quadrado            → 13pt (uso predominante: infantil)
   *   a4                  → 12pt (NBR 14724, acadêmico)
   */
  cpp_base_corpo_pt: number;
  bleed_mm: number;
}

export interface FormatoDef {
  value: FormatoLivro;
  label: string;           // ex: "Padrão editorial"
  descricao_curta: string; // ex: "16 × 23 cm"
  dimensoes: string;       // ex: "16×23 cm" (usado em tabelas/tooltips)
  width_cm: number;
  height_cm: number;
  specs: FormatoSpecs;
}

export const FORMATOS_LIVRO: readonly FormatoDef[] = [
  {
    value: "padrao_br",
    label: "Padrão editorial",
    descricao_curta: "16 × 23 cm",
    dimensoes: "16×23 cm",
    width_cm: 16,
    height_cm: 23,
    specs: {
      width_cm: 16, height_cm: 23,
      width_mm: 160, height_mm: 230,
      margens: { top_mm: 20, outer_mm: 15, bottom_mm: 24, inner_mm: 18 },
      cpp: 1763,
      cpp_base_corpo_pt: 11,
      bleed_mm: 3,
    },
  },
  {
    value: "compacto",
    label: "Formato compacto",
    descricao_curta: "14 × 21 cm",
    dimensoes: "14×21 cm",
    width_cm: 14,
    height_cm: 21,
    specs: {
      width_cm: 14, height_cm: 21,
      width_mm: 140, height_mm: 210,
      margens: { top_mm: 18, outer_mm: 13, bottom_mm: 22, inner_mm: 17 },
      cpp: 1384,
      cpp_base_corpo_pt: 11,
      bleed_mm: 3,
    },
  },
  {
    value: "bolso",
    label: "Bolso",
    descricao_curta: "11 × 18 cm",
    dimensoes: "11×18 cm",
    width_cm: 11,
    height_cm: 18,
    specs: {
      width_cm: 11, height_cm: 18,
      width_mm: 110, height_mm: 180,
      margens: { top_mm: 15, outer_mm: 11, bottom_mm: 18, inner_mm: 14 },
      cpp: 1134,
      cpp_base_corpo_pt: 10,
      bleed_mm: 3,
    },
  },
  {
    value: "quadrado",
    label: "Quadrado",
    descricao_curta: "20 × 20 cm",
    dimensoes: "20×20 cm",
    width_cm: 20,
    height_cm: 20,
    specs: {
      width_cm: 20, height_cm: 20,
      width_mm: 200, height_mm: 200,
      margens: { top_mm: 22, outer_mm: 18, bottom_mm: 25, inner_mm: 22 },
      cpp: 1289,
      cpp_base_corpo_pt: 13,
      bleed_mm: 3,
    },
  },
  {
    value: "a4",
    label: "A4",
    descricao_curta: "21 × 29,7 cm",
    dimensoes: "21×29,7 cm",
    width_cm: 21,
    height_cm: 29.7,
    specs: {
      width_cm: 21, height_cm: 29.7,
      width_mm: 210, height_mm: 297,
      margens: { top_mm: 30, outer_mm: 20, bottom_mm: 30, inner_mm: 25 },
      cpp: 2360,
      cpp_base_corpo_pt: 12,
      bleed_mm: 3,
    },
  },
] as const;

export const FORMATOS_VALORES = FORMATOS_LIVRO.map(f => f.value) as readonly FormatoLivro[];

export function isFormatoValido(v: unknown): v is FormatoLivro {
  return typeof v === "string" && (FORMATOS_VALORES as readonly string[]).includes(v);
}

export function getFormatoDef(value: FormatoLivro): FormatoDef {
  const def = FORMATOS_LIVRO.find(f => f.value === value);
  if (!def) throw new Error(`Formato desconhecido: ${value}`);
  return def;
}

// ─── Estimativa de páginas (única fonte de verdade) ──────────────────────────
//
// Toda a stack (frontend, backend, agentes) usa `estimarPaginas` para inferir
// quantas páginas o livro vai ter antes do PDF ser gerado. Após o PDF, o valor
// real vem de `dados_miolo.paginas_reais` (populado pelo `gerar-pdf`).
//
// Métrica: caracteres por página (cpp). Conta tudo: letras, espaços, pontuação,
// caracteres especiais. É a unidade física real da densidade tipográfica e não
// depende de comprimento médio de palavra.

/**
 * Páginas pré-textuais que o builder do miolo sempre inclui:
 * half-title (1) + verso branco (1) + folha de rosto (1) + créditos (1) +
 * sumário (~1-2). Dedicatória, epígrafe e biografia adicionam mais quando
 * presentes — o builder do miolo trata esses casos com mais detalhe.
 *
 * Para estimativa fora do builder (frontend, créditos, diagnóstico), 6 é
 * média razoável que cobre o caso comum.
 */
export const EXTRAS_PADRAO = 6;

/**
 * Threshold de divergência de lombada (em mm) entre a capa já gerada e o
 * miolo final do PDF. Se a divergência for maior que este valor, o autor é
 * avisado e pode disparar `ajustar-lombada` automaticamente (capa IA) ou
 * precisa refazer upload (capa manual).
 *
 * Vivia hardcoded em 3 lugares (miolo page, capa page, prova route).
 * Centralizado aqui para que ajustes futuros sejam decisão única.
 */
export const LIMITE_DIVERGENCIA_LOMBADA_MM = 2;

/**
 * Calcula cpp ajustado para o corpo_pt efetivamente usado no livro.
 * Se corpoPt for undefined ou fora da faixa válida (9–14), assume a base
 * declarada em spec.cpp_base_corpo_pt.
 *
 * Fórmula: cpp_efetivo = spec.cpp × (spec.cpp_base_corpo_pt / corpoPt)²
 */
export function cppEfetivo(spec: FormatoSpecs, corpoPt: number | undefined): number {
  const base = spec.cpp_base_corpo_pt;
  const corpo = (typeof corpoPt === "number" && corpoPt >= 9 && corpoPt <= 14)
    ? corpoPt
    : base;
  const fator = (base / corpo) ** 2;
  return Math.max(1, Math.round(spec.cpp * fator));
}

/**
 * Estimativa de páginas do livro completo. Soma páginas de texto corrido
 * + EXTRAS_PADRAO (pré-textuais comuns).
 *
 * Use SEMPRE esta função para estimar páginas em qualquer lugar da stack
 * (frontend, backend, agentes). Garante consistência entre tela, banco,
 * ficha CIP, cascade do diagnóstico, etc.
 *
 * Para o cálculo detalhado do builder do miolo (que conhece dedicatória,
 * epígrafe, sumário etc.), use `buildBookHtml` em vez desta função.
 */
export function estimarPaginas(
  spec: FormatoSpecs,
  corpoPt: number | undefined,
  numCaracteres: number,
): number {
  const cpp = cppEfetivo(spec, corpoPt);
  const paginasCorpo = Math.ceil(Math.max(1, numCaracteres) / cpp);
  return paginasCorpo + EXTRAS_PADRAO;
}

// ─── Cálculo de lombada ──────────────────────────────────────────────────────
// Fórmula gráfica brasileira para papéis lisos (offset, avena):
//   lombada_mm = (gramatura_gsm × paginas) / 14400 × 10
// Resultado em mm, arredondado para 1 casa decimal.
//
// Default 75g/m² cobre offset 75g (econômico) e aproxima avena 80g (premium).

export const PAPEL_GRAMATURA_PADRAO_GSM = 75;

/**
 * Lombada mínima visível em uma capa montada. Abaixo desse valor (livros
 * de ~40 páginas ou menos) a lombada colapsa graficamente — texto fica
 * ilegível e o miolo "engasga" no design.
 *
 * Vivia hardcoded como `Math.max(2, ...)` em 3 funções locais de lombada
 * no pipeline de capa (`lib/capa-frente-extractor.ts`,
 * `app/editor/capa/[project_id]/lib/dimensions.ts`,
 * `app/dashboard/capa/[id]/page.tsx`). Centralizado aqui.
 */
export const LOMBADA_MIN_CAPA_MM = 2;

/**
 * Fórmula gráfica brasileira para papéis lisos (offset 75 g/m², avena 80 g/m²
 * aproximado): lombada (cm) = (gramatura_gsm × paginas) / 14400.
 * Equivalente algébrico: lombada (mm) = paginas × gramatura_gsm / 1440.
 *
 * Resultado em mm, arredondado para 1 casa decimal.
 * NÃO aplica mínimo. Para miolo, gerar-pdf, estimativa, ficha CIP.
 */
export function estimarLombadaMm(
  paginas: number,
  gramaturaGsm: number = PAPEL_GRAMATURA_PADRAO_GSM
): number {
  if (paginas <= 0) return 0;
  return Math.round((gramaturaGsm * paginas / 14400) * 100) / 10;
}

/**
 * Lombada para o pipeline de capa: usa `estimarLombadaMm` e aplica clamp
 * de `LOMBADA_MIN_CAPA_MM` para garantir que a capa nunca tente renderizar
 * uma lombada degenerada em livros pequenos.
 *
 * USE em: gerar-capa, upload-capa, gerar-elemento-capa, editor visual,
 * capa-frente-extractor, dashboard de capa.
 *
 * NÃO USE em: miolo, gerar-pdf, ficha CIP (esses querem o valor matemático,
 * sem clamp).
 */
export function estimarLombadaCapaMm(
  paginas: number,
  gramaturaGsm: number = PAPEL_GRAMATURA_PADRAO_GSM
): number {
  return Math.max(LOMBADA_MIN_CAPA_MM, estimarLombadaMm(paginas, gramaturaGsm));
}

// ─── Arte única (panorâmica sem lombada visual dividindo) ────────────────────
//
// A arte única é UMA imagem landscape que cobre verso + lombada + frente do
// livro. O terço direito da imagem VIRA a frente (o pipeline do editor recorta
// visualmente). O modelo de imagem exige um aspectRatio válido; buscamos o
// mais próximo do (largura_panoramica / altura) real do livro. Os supported
// aspect ratios do Gemini Image são: "1:1", "3:2", "16:9", "4:3", etc. Aqui
// usamos "3:2" e "16:9" (landscape) como candidatos — sempre landscape porque
// a peça é panorâmica. O excedente horizontal é cortado nas laterais durante
// o render (nunca no topo/base, para não amputar título).

export const ARTE_UNICA_ASPECT_RATIOS = ["3:2", "16:9"] as const;
export type ArteUnicaAspectRatio = (typeof ARTE_UNICA_ASPECT_RATIOS)[number];

/**
 * Razão da arte única (largura/altura) real do livro considerando frente +
 * lombada + verso (sem orelhas e sem sangria — a IA gera puro; o editor
 * completa com fills nas orelhas/sangria).
 */
function calcRatioArteUnicaReal(spec: FormatoSpecs, lombadaMm: number): number {
  const largura = spec.width_mm * 2 + lombadaMm;
  return largura / spec.height_mm;
}

/**
 * Escolhe o aspectRatio suportado pelo modelo mais próximo do ratio real do
 * livro. O modelo só aceita a lista `ARTE_UNICA_ASPECT_RATIOS`; quando o real
 * cai entre dois, prefere o MAIS LARGO — o crop lateral é preferível ao
 * vertical (preserva altura/título).
 */
export function getRatioArteUnica(
  format: FormatoLivro,
  paginas: number,
): ArteUnicaAspectRatio {
  const spec = getFormatoDef(format).specs;
  const lombada = estimarLombadaCapaMm(paginas);
  const real = calcRatioArteUnicaReal(spec, lombada);
  let melhor: ArteUnicaAspectRatio = ARTE_UNICA_ASPECT_RATIOS[0];
  let melhorDist = Infinity;
  for (const ar of ARTE_UNICA_ASPECT_RATIOS) {
    const [w, h] = ar.split(":").map(Number);
    const ratio = w / h;
    const dist = Math.abs(ratio - real);
    if (dist < melhorDist || (dist === melhorDist && ratio > (Number(melhor.split(":")[0]) / Number(melhor.split(":")[1])))) {
      melhorDist = dist;
      melhor = ar;
    }
  }
  return melhor;
}

/**
 * Formatos onde a arte única é fortemente desencorajada porque o ratio real
 * fica muito distante dos aspectRatios suportados — o crop lateral perde
 * demais da imagem ou ela fica esticada. Hoje: `quadrado` (ratio real ~2:1
 * na maioria dos livros) e `a4` (ratio real ~1.5:1 mas altura extrema deixa
 * o crop feio). Continua PERMITIDO — só mostramos aviso na UI.
 */
export function isFormatoRuimParaUnica(format: FormatoLivro): boolean {
  return format === "quadrado" || format === "a4";
}

// ─── Papéis da calculadora de lombada (FERR-1B, 03/ago/2026) ─────────────────
// Fonte dos valores empíricos: planilha Papel_1.xlsx (Graphium), aba
// "Cálculo Lombada", colunas G ("Papel") e I ("Média de Média por Caderno",
// mm por caderno de 32 páginas), lida em 03/ago/2026.
//
// Dois métodos:
//   "gramatura": papéis lisos — delega para estimarLombadaMm (fórmula única
//                da verdade 16: gramatura × páginas / 1440, em mm).
//   "caderno":   papéis porosos/couché — empírico da gráfica:
//                páginas × mm_por_caderno_32 / 32.
//
// ESCOPO: calculadora de ferramentas apenas. O pipeline (miolo, capa, ficha)
// segue PAPEL_GRAMATURA_PADRAO_GSM fixo até o item 5 do backlog (papel por
// escolha do autor na esteira).

export interface PapelCalculadora {
  id: string;
  label: string;
  metodo: "gramatura" | "caderno";
  /** metodo === "gramatura" */
  gramatura_gsm?: number;
  /** metodo === "caderno": mm por caderno de 32 páginas (Papel_1.xlsx col. I) */
  mm_por_caderno_32?: number;
}

export const PAPEIS_CALCULADORA: readonly PapelCalculadora[] = [
  { id: "offset_75",        label: "Offset 75 g/m²",        metodo: "gramatura", gramatura_gsm: 75 },
  { id: "offset_70",        label: "Offset 70 g/m²",        metodo: "gramatura", gramatura_gsm: 70 },
  { id: "offset_90",        label: "Offset 90 g/m²",        metodo: "gramatura", gramatura_gsm: 90 },
  { id: "avena_80",         label: "Avena 80 g/m²",         metodo: "gramatura", gramatura_gsm: 80 },
  { id: "polen_natural_80", label: "Pólen Natural 80 g/m²", metodo: "gramatura", gramatura_gsm: 80 },
  { id: "luxcream_70",      label: "Lux Cream 70 g/m²",     metodo: "caderno",   mm_por_caderno_32: 1.8583 },
  { id: "polen_bold_90",    label: "Pólen Bold 90 g/m²",    metodo: "caderno",   mm_por_caderno_32: 2.4667 },
  { id: "couche_90",        label: "Couché 90 g/m²",        metodo: "caderno",   mm_por_caderno_32: 1.4 },
  { id: "ivory_65",         label: "Ivory 65 g/m²",         metodo: "caderno",   mm_por_caderno_32: 2.0 },
] as const;

/**
 * Lombada em mm por papel, para a calculadora de ferramentas.
 * Papéis "gramatura" delegam para estimarLombadaMm (fórmula única).
 * Papéis "caderno" usam a média empírica da Graphium.
 * Resultado com 1 casa decimal, sem clamp (valor matemático).
 */
export function estimarLombadaPapelMm(
  paginas: number,
  papel: PapelCalculadora,
): number {
  if (paginas <= 0) return 0;
  if (papel.metodo === "gramatura") {
    return estimarLombadaMm(paginas, papel.gramatura_gsm);
  }
  return Math.round((paginas * (papel.mm_por_caderno_32 ?? 0) / 32) * 10) / 10;
}

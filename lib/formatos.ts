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
   * Palavras por página (estimativa empírica), calibrado para o corpo_pt
   * declarado em `wpp_base_corpo_pt`. A função `wppEfetivo` em
   * `lib/miolo-builder.ts` escala matematicamente para outros corpos.
   */
  wpp: number;
  /**
   * Corpo de texto (em pt) usado como base de calibração do `wpp`.
   * Bolso é calibrado em 10pt (default de mass-market paperback);
   * demais formatos em 11pt (sweet spot editorial).
   */
  wpp_base_corpo_pt: number;
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
      wpp: 220,
      wpp_base_corpo_pt: 11,
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
      wpp: 180,
      wpp_base_corpo_pt: 11,
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
      wpp: 190,
      wpp_base_corpo_pt: 10,
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
      wpp: 300,
      wpp_base_corpo_pt: 11,
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
      wpp: 380,
      wpp_base_corpo_pt: 11,
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

// ─── Cálculo de lombada ──────────────────────────────────────────────────────
// Fórmula gráfica brasileira para papéis lisos (offset, avena):
//   lombada_mm = (gramatura_gsm × paginas) / 14400 × 10
// Resultado em mm, arredondado para 1 casa decimal.
//
// Default 75g/m² cobre offset 75g (econômico) e aproxima avena 80g (premium).

export const PAPEL_GRAMATURA_PADRAO_GSM = 75;

export function estimarLombadaMm(
  paginas: number,
  gramaturaGsm: number = PAPEL_GRAMATURA_PADRAO_GSM
): number {
  if (paginas <= 0) return 0;
  return Math.round((gramaturaGsm * paginas / 14400) * 100) / 10;
}

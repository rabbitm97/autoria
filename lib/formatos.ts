/**
 * Fonte única de verdade dos 5 formatos físicos de livro suportados pela Autoria.
 *
 * Os slugs (`value`) são os ÚNICOS valores aceitos pelos agentes de backend
 * (creditos, capa, miolo, gerar-pdf, gerar-epub). Não inventar variações
 * em componentes individuais — sempre importar deste arquivo.
 */

export type FormatoLivro = "bolso" | "a5" | "padrao_br" | "quadrado" | "a4";

export interface FormatoDef {
  value: FormatoLivro;
  label: string;        // Nome curto (ex: "Padrão editorial")
  dimensoes: string;    // String mostrada ao usuário (ex: "16×23 cm")
  width_cm: number;     // Largura em cm (para cálculos)
  height_cm: number;    // Altura em cm (para cálculos)
}

export const FORMATOS_LIVRO: readonly FormatoDef[] = [
  { value: "padrao_br", label: "Padrão editorial", dimensoes: "16×23 cm",   width_cm: 16,   height_cm: 23   },
  { value: "a5",        label: "Formato compacto", dimensoes: "14×21 cm",   width_cm: 14,   height_cm: 21   },
  { value: "bolso",     label: "Bolso",            dimensoes: "11×18 cm",   width_cm: 11,   height_cm: 18   },
  { value: "quadrado",  label: "Quadrado",         dimensoes: "20×20 cm",   width_cm: 20,   height_cm: 20   },
  { value: "a4",        label: "A4",               dimensoes: "21×29,7 cm", width_cm: 21,   height_cm: 29.7 },
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

import { type FormatoLivro, type FormatoSpecs, getFormatoDef } from "./formatos";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateId =
  | "literario"
  | "literario_moderno"
  | "memorial"
  | "nao_ficcao"
  | "academico"
  | "abnt"
  | "poesia"
  | "teatro"
  | "infantil"
  | "juvenil"
  | "religioso";
export type { FormatoLivro };

export interface MioloConfig {
  template: TemplateId;
  formato: FormatoLivro;
  /**
   * Tamanho do corpo de texto em pontos. Opcional: se ausente, o builder
   * aplica o default do template via getDefaultCorpoPt(template).
   * Faixa válida: 9.0 a 14.0, step de 0.5.
   */
  corpo_pt?: number;
  /**
   * Indica se o livro tem separação em capítulos. Quando `false`, o pipeline
   * pula a aprovação de capítulos e o miolo é gerado como texto único.
   * Default implícito: `true` (compatibilidade retroativa com configs antigas).
   */
  tem_capitulos?: boolean;
  sumario: boolean;
  dedicatoria: string;
  epigrafe_texto: string;
  epigrafe_autor: string;
  bio_autor: string;
}

export interface CapituloInfo {
  id: string;
  titulo: string;
  palavras: number;
}

// ─── Tamanho de corpo default por template ───────────────────────────────────
// Cada template publica um default editorialmente ajustado à sua categoria.
// Quando o formato é informado, regras específicas têm prioridade:
//   - ABNT  → 12pt sempre (NBR 14724, não negociável)
//   - Infantil → 13pt sempre (leitor iniciante)
//   - bolso → 10pt (mass-market paperback exige fonte menor)
// Demais combinações usam o default do template.
// O autor pode sobrescrever via UI (faixa 9.0–14.0pt, step 0.5).
// Se o autor trocar de template ou formato, a UI deve resetar para o default novo.

const TEMPLATE_DEFAULT_CORPO_PT: Record<TemplateId, number> = {
  literario:         11,
  literario_moderno: 11,
  memorial:          11,
  nao_ficcao:        11,
  academico:         11,
  abnt:              12,   // NBR 14724 exige 12pt no corpo
  poesia:            11,
  teatro:            11,
  infantil:          13,   // leitor iniciante (4–9 anos)
  juvenil:           11,
  religioso:         11,
};

export function getDefaultCorpoPt(template: TemplateId, formato?: FormatoLivro): number {
  // Regras editoriais não negociáveis (têm prioridade sobre o formato)
  if (template === "abnt") return 12;
  if (template === "infantil") return 13;

  // Mass-market paperback exige fonte menor
  if (formato === "bolso") return 10;

  // Default por template
  return TEMPLATE_DEFAULT_CORPO_PT[template] ?? 11;
}

// O wpp em formatos.ts é calibrado empiricamente para um corpo_pt específico
// por formato (declarado em spec.wpp_base_corpo_pt). Quando o autor escolhe
// corpo_pt diferente da base, a quantidade de texto por página varia
// quadraticamente: linhas por página escalam linearmente com font, e
// chars por linha também — área ocupada por char é quadrática.
//
// Para corpo_pt = X, wpp_efetivo = spec.wpp × (spec.wpp_base_corpo_pt / X)².
//
// Calibração de referência:
//   padrao_br, compacto, quadrado, a4 → base 11pt
//   bolso → base 10pt (mass-market paperback)

/**
 * Calcula wpp ajustado para o corpo_pt efetivamente usado no livro.
 * Use sempre que for estimar páginas a partir do spec do formato.
 * Se corpoPt for undefined ou fora da faixa válida (9–14), assume a base
 * declarada em spec.wpp_base_corpo_pt.
 */
export function wppEfetivo(spec: FormatoSpecs, corpoPt: number | undefined): number {
  const base = spec.wpp_base_corpo_pt;
  const corpo = (typeof corpoPt === "number" && corpoPt >= 9 && corpoPt <= 14)
    ? corpoPt
    : base;
  const fator = (base / corpo) ** 2;
  return Math.max(1, Math.round(spec.wpp * fator));
}

const TEMPLATE_DEFAULT_SUMARIO: Record<TemplateId, boolean> = {
  literario:         false,
  literario_moderno: false,
  memorial:          true,
  nao_ficcao:        true,
  academico:         true,
  abnt:              true,
  poesia:            true,
  teatro:            true,
  infantil:          false,
  juvenil:           true,
  religioso:         true,
};

export function getDefaultSumario(template: TemplateId): boolean {
  return TEMPLATE_DEFAULT_SUMARIO[template] ?? false;
}

export function clampCorpoPt(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  if (value < 9 || value > 14) return undefined;
  // Snap para o múltiplo de 0.5 mais próximo
  return Math.round(value * 2) / 2;
}

// ─── Lista pública de templates para a UI ────────────────────────────────────
// Fonte única para popular o seletor de template no dashboard.

export interface TemplateOption {
  value: TemplateId;
  label: string;
  descricao: string;
  familia: "literaria" | "nao_ficcao" | "poesia_teatro" | "infantil_juvenil" | "espiritual";
}

export const TEMPLATE_OPTIONS: readonly TemplateOption[] = [
  { value: "literario",         label: "Literário Clássico",        descricao: "Romance e conto adulto. Capitular grande, título de capítulo em versalete.", familia: "literaria" },
  { value: "literario_moderno", label: "Literário Contemporâneo",   descricao: "Literatura contemporânea, autoficção, novela. Sem capitular, título à esquerda.", familia: "literaria" },
  { value: "memorial",          label: "Memórias e Biografia",      descricao: "Memórias, autobiografia, biografia. Capitular sutil, espaço para data/local.", familia: "literaria" },
  { value: "nao_ficcao",        label: "Não-Ficção Moderna",        descricao: "Ensaio, negócios, autoajuda, divulgação. Subdivisões, citações destacadas.", familia: "nao_ficcao" },
  { value: "academico",         label: "Acadêmico Humanidades",     descricao: "Livro acadêmico não-ABNT (Filosofia, História, Letras). Sumário numerado.", familia: "nao_ficcao" },
  { value: "abnt",              label: "Técnico ABNT",              descricao: "TCC, dissertação, tese. Segue NBR 14724 (Times 12pt, margens 3-2-3-2cm).", familia: "nao_ficcao" },
  { value: "poesia",            label: "Poesia",                    descricao: "Poesia, prosa poética, haiku. Coluna estreita, sem hifenização, estrofes preservadas.", familia: "poesia_teatro" },
  { value: "teatro",            label: "Teatro e Dramaturgia",      descricao: "Peças teatrais e roteiros. Personagem em versalete, didascália em itálico recuado.", familia: "poesia_teatro" },
  { value: "infantil",          label: "Infantil Ilustrado",        descricao: "Idades 4 a 9 anos. Fonte humanista grande, sem hifenização, espaço para ilustração.", familia: "infantil_juvenil" },
  { value: "juvenil",           label: "Juvenil / Young Adult",     descricao: "Idades 10 a 17 anos. Tipografia entre o infantil e o literário, com sumário.", familia: "infantil_juvenil" },
  { value: "religioso",         label: "Religioso Devocional",      descricao: "Bíblia, devocional, liturgia. Suporta versículos numerados automaticamente.", familia: "espiritual" },
] as const;

// ─── Regra de negócio: quando renderizar sumário ─────────────────────────────

/** @deprecated Sempre vazio — use getDefaultSumario(template) para defaults. */
export const TEMPLATES_SEM_SUMARIO_PUBLIC: readonly TemplateId[] = [];

export function deveExibirSumario(config: MioloConfig): boolean {
  if (config.tem_capitulos === false) return false;
  return config.sumario === true;
}


const BLEED_MM = 3; // universal bleed for print — all formats use 3mm

// ─── Marcas de corte como SVG por canto ──────────────────────────────────────
// Cada canto recebe um SVG de 5×5mm com duas linhas formando um L.
// O Chromium renderiza esses SVGs nos margin boxes do @page e repete em todas
// as folhas automaticamente.

function cornerSvgUrl(corner: "tl" | "tr" | "bl" | "br"): string {
  const size = 5;        // tamanho do SVG em mm
  const stroke = 0.2;    // espessura da linha em mm
  const gap = 1;         // gap entre a linha e o ponto de corte em mm
  const b = BLEED_MM;

  let cropX: number, cropY: number;
  const lines: string[] = [];

  if (corner === "tl") {
    cropX = b; cropY = b;
    lines.push(`<line x1="0" y1="${cropY}" x2="${cropX - gap}" y2="${cropY}" />`);
    lines.push(`<line x1="${cropX}" y1="0" x2="${cropX}" y2="${cropY - gap}" />`);
  } else if (corner === "tr") {
    cropX = size - b; cropY = b;
    lines.push(`<line x1="${cropX + gap}" y1="${cropY}" x2="${size}" y2="${cropY}" />`);
    lines.push(`<line x1="${cropX}" y1="0" x2="${cropX}" y2="${cropY - gap}" />`);
  } else if (corner === "bl") {
    cropX = b; cropY = size - b;
    lines.push(`<line x1="0" y1="${cropY}" x2="${cropX - gap}" y2="${cropY}" />`);
    lines.push(`<line x1="${cropX}" y1="${cropY + gap}" x2="${cropX}" y2="${size}" />`);
  } else {
    cropX = size - b; cropY = size - b;
    lines.push(`<line x1="${cropX + gap}" y1="${cropY}" x2="${size}" y2="${cropY}" />`);
    lines.push(`<line x1="${cropX}" y1="${cropY + gap}" x2="${cropX}" y2="${size}" />`);
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}"><g stroke="#000" stroke-width="${stroke}" fill="none">${lines.join("")}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

// ─── CSS de @page para um formato ────────────────────────────────────────────
// Gera o bloco @page completo: tamanho da folha (com sangria), margens
// editoriais (sangria + margem), marcas de corte nos 4 cantos, numeração no
// rodapé. Inclui também o @page no-num para o front matter.

function buildPageCss(spec: FormatoSpecs, includeMarks: boolean): string {
  const B = spec.bleed_mm;
  const W = spec.width_mm + 2 * B;
  const H = spec.height_mm + 2 * B;
  // Margens da @page = sangria + margem editorial. Isso garante que a área
  // útil (mancha gráfica) tenha exatamente as margens editoriais especificadas
  // medidas a partir da linha de corte.
  const mT = spec.margens.top_mm + B;
  const mO = spec.margens.outer_mm + B;
  const mB = spec.margens.bottom_mm + B;
  const mI = spec.margens.inner_mm + B;

  const marksBlock = includeMarks ? `
  @top-left-corner    { content: ""; background-image: ${cornerSvgUrl("tl")}; background-repeat: no-repeat; background-position: top left; }
  @top-right-corner   { content: ""; background-image: ${cornerSvgUrl("tr")}; background-repeat: no-repeat; background-position: top right; }
  @bottom-left-corner { content: ""; background-image: ${cornerSvgUrl("bl")}; background-repeat: no-repeat; background-position: bottom left; }
  @bottom-right-corner{ content: ""; background-image: ${cornerSvgUrl("br")}; background-repeat: no-repeat; background-position: bottom right; }` : "";

  return `
@page {
  size: ${W}mm ${H}mm;
  margin: ${mT}mm ${mO}mm ${mB}mm ${mI}mm;${marksBlock}
  @bottom-center {
    content: counter(page);
    font-family: inherit;
    font-size: 9pt;
    color: #555;
    margin-bottom: 12mm;
  }
}

@page no-num {
  @bottom-center { content: ""; }
}

@page :first {
  @bottom-center { content: ""; }
}
`;
}

// ─── CSS base compartilhado por todos os templates ───────────────────────────

function buildBaseCss(corpo_pt: number): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html {
  font-size: ${corpo_pt}pt;
  overflow-x: hidden;
  max-width: 100%;
}
body {
  font-size: ${corpo_pt}pt;
  line-height: 1.6;
  color: #1a1a1a;
  overflow-x: hidden;
  max-width: 100%;
}
@media print {
  html, body {
    overflow-x: hidden !important;
    max-width: 100% !important;
  }
}

/* Front matter — cada peça é uma página inteira sem numeração */
.front-page {
  page: no-num;
  break-after: page;
  page-break-after: always;
}
.blank-page {
  page: no-num;
  break-after: page;
  page-break-after: always;
}

/* Half-title e folha de rosto */
.half-title { padding-top: 60mm; text-align: center; }
.title-page { padding-top: 45mm; text-align: center; }

/* Half-title: reset agressivo do <p> para impedir que regras de capítulo
   (drop cap, recuo, hanging indent) vazem para o subtítulo via cascade. */
.half-title p, .half-title p.subtitle {
  display: block;
  margin: 0.8em auto 0;
  padding: 0;
  text-indent: 0;
  max-width: 80%;
  font-size: 1em;
  color: #444;
  font-style: italic;
}
.half-title p::first-letter,
.half-title p.subtitle::first-letter {
  font-size: inherit;
  line-height: inherit;
  float: none;
  padding: 0;
  margin: 0;
  font-weight: inherit;
  color: inherit;
}

/* Folha de rosto: subtítulo com estilo mais destacado que o half-title. */
.title-page .subtitle {
  display: block;
  font-size: 1.15em;
  font-style: italic;
  color: #555;
  margin: 0.8em auto 2em;
  padding: 0;
  text-indent: 0;
  max-width: 80%;
}
.title-page .subtitle::first-letter,
.title-page .author::first-letter {
  font-size: inherit;
  line-height: inherit;
  float: none;
  padding: 0;
  margin: 0;
  font-weight: inherit;
  color: inherit;
}
.title-page .author { font-size: 1.25em; color: #444; margin-top: 5em; text-indent: 0; }

/* Dedicatória — terço inferior, alinhada à direita, itálica */
.dedicatoria {
  padding-top: 90mm;
  text-align: right;
}
.dedicatoria p {
  font-style: italic;
  font-size: 1em;
  color: #555;
  max-width: 65%;
  margin-left: auto;
}

/* Epígrafe — meio-baixo, alinhada à direita */
.epigrafe {
  padding-top: 70mm;
  text-align: right;
}
.epigrafe .epigrafe-text {
  font-style: italic;
  font-size: 1em;
  max-width: 65%;
  margin-left: auto;
}
.epigrafe .epigrafe-autor {
  font-size: 0.85em;
  color: #777;
  margin-top: 0.5em;
}

/* Sumário */
.toc { padding-top: 15mm; }
.toc h2 {
  font-size: 1.3em;
  font-weight: 600;
  text-align: center;
  margin-bottom: 2.5em;
  letter-spacing: 0.05em;
}
.toc ol { list-style: none; }
.toc ol li {
  display: flex;
  align-items: baseline;
  margin-bottom: 0.9em;
  font-size: 0.98em;
}
.toc ol li .toc-title { white-space: nowrap; }
.toc ol li .toc-dots { flex: 1; border-bottom: 1px dotted #999; margin: 0 0.5em 0.2em; min-width: 1em; }
.toc ol li .toc-pg { color: #555; font-size: 0.9em; white-space: nowrap; }

/* Links sem formatação visual — preserva navegação em PDF digital,
   mas no impresso e em qualquer leitor o texto sai como prosa normal,
   sem azul, sem sublinhado. */
.toc a, .toc a:visited, .toc a:hover, .toc a:active {
  color: inherit;
  text-decoration: none;
}
.chapter a, .chapter a:visited, .chapter a:hover, .chapter a:active {
  color: inherit;
  text-decoration: none;
}

/* Capítulos — filhos diretos do body, sem wrapper */
.chapter {
  break-before: right;
  page-break-before: right;
  break-inside: auto;
}

.chapter-title {
  margin-bottom: 2em;
  margin-top: 1em;
  line-height: 1.25;
  break-after: avoid;
  page-break-after: avoid;
}

.chapter p {
  orphans: 2;
  widows: 2;
}

/* Bio do autor */
.author-bio {
  margin-top: 3em;
  padding-top: 2em;
  border-top: 1px solid #ddd;
  font-size: 0.9em;
  color: #444;
}
`;
}

// ─── CSS específico de cada template ─────────────────────────────────────────

const TEMPLATE_SPECIFIC_CSS: Record<TemplateId, string> = {

  // ─── 1. Literário Clássico ─────────────────────────────────────────────────
  literario: `
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');
body {
  font-family: 'EB Garamond', Georgia, 'Times New Roman', serif;
  line-height: 1.65;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.7em; font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em; line-height: 1.3; }
.title-page h1 { font-size: 2em; font-weight: 400; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2; margin-bottom: 0.6em; }
.chapter-title {
  font-size: 1.25em;
  font-weight: 400;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: 3em;
  margin-top: 2em;
}
.chapter p { margin: 0; text-indent: 1.5em; }
.chapter p.first-para { text-indent: 0; }
.chapter p.first-para::first-letter {
  font-size: 3.2em;
  line-height: 0.85;
  float: left;
  padding: 0.05em 0.1em 0 0;
  font-weight: 400;
}
.chapter p.dialogo { text-indent: 0; }
.chapter p.first-para.dialogo::first-letter {
  font-size: 3.2em;
  line-height: 0.85;
  float: left;
  padding: 0.05em 0.1em 0 0;
  font-weight: 400;
}
`,

  // ─── 2. Literário Contemporâneo ────────────────────────────────────────────
  literario_moderno: `
@import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap');
body {
  font-family: 'Spectral', Georgia, serif;
  line-height: 1.55;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.9em; font-weight: 500; line-height: 1.2; }
.title-page h1 { font-size: 2.2em; font-weight: 500; line-height: 1.15; margin-bottom: 0.5em; }
.chapter-title {
  font-size: 1.6em;
  font-weight: 600;
  text-align: left;
  line-height: 1.2;
  margin-bottom: 2em;
  margin-top: 1em;
}
.chapter p { margin: 0; text-indent: 1.5em; }
.chapter p.first-para { text-indent: 0; }
/* Sem capitular */
.chapter p.dialogo { text-indent: 0; }
`,

  // ─── 3. Memórias e Biografia ───────────────────────────────────────────────
  memorial: `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,500;1,400&display=swap');
body {
  font-family: 'Source Serif 4', Georgia, serif;
  line-height: 1.6;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.9em; font-weight: 500; line-height: 1.2; }
.title-page h1 { font-size: 2.1em; font-weight: 500; line-height: 1.15; margin-bottom: 0.5em; }
.chapter-title {
  font-size: 1.4em;
  font-weight: 500;
  text-align: center;
  margin: 2em 0 1.5em;
  line-height: 1.3;
}
/* Subtítulo de capítulo (data/local) — autor coloca em h3 logo após o título */
.chapter h3 {
  font-size: 0.85em;
  font-style: italic;
  font-weight: 400;
  text-align: center;
  color: #666;
  margin: -1em 0 2.5em;
  letter-spacing: 0.02em;
}
.chapter p { margin: 0; text-indent: 1.5em; }
.chapter p.first-para { text-indent: 0; }
.chapter p.first-para::first-letter {
  font-size: 2.8em;
  line-height: 0.85;
  float: left;
  padding: 0.05em 0.08em 0 0;
  font-weight: 400;
}
.chapter p.dialogo { text-indent: 0; }
.chapter blockquote { margin: 1.5em 2em; font-style: italic; color: #555; border-left: 2px solid #ddd; padding-left: 1em; }
`,

  // ─── 4. Não-Ficção Moderna ─────────────────────────────────────────────────
  nao_ficcao: `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,400&display=swap');
body {
  font-family: 'Source Serif 4', Georgia, serif;
  line-height: 1.6;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.9em; font-weight: 400; line-height: 1.2; letter-spacing: 0.02em; }
.title-page h1 { font-size: 2.2em; font-weight: 600; line-height: 1.15; margin-bottom: 0.4em; }
.chapter-title {
  font-size: 1.55em;
  font-weight: 600;
  line-height: 1.2;
  margin-bottom: 2em;
  margin-top: 1em;
  text-align: left;
}
.chapter p { margin: 0 0 0.8em; }
.chapter p.first-para { text-indent: 0; }
.chapter p.first-para::first-letter {
  font-size: 3.2em;
  line-height: 0.85;
  float: left;
  padding: 0.05em 0.08em 0 0;
  font-weight: 600;
}
.chapter h3 { font-size: 1.1em; font-weight: 600; margin: 1.8em 0 0.5em; break-after: avoid; page-break-after: avoid; }
.chapter h4 { font-size: 1em; font-weight: 600; margin: 1.4em 0 0.3em; break-after: avoid; page-break-after: avoid; }
.chapter blockquote { margin: 1.5em 2em; padding: 0.8em 1.5em; border-left: 3px solid #ddd; font-style: italic; color: #555; }
`,

  // ─── 5. Acadêmico Humanidades ──────────────────────────────────────────────
  academico: `
@import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,500;0,600;1,400&display=swap');
body {
  font-family: 'Crimson Pro', Georgia, serif;
  line-height: 1.55;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.8em; font-weight: 500; line-height: 1.2; }
.title-page h1 { font-size: 2em; font-weight: 600; line-height: 1.15; margin-bottom: 0.5em; }
.chapter-title {
  font-size: 1.4em;
  font-weight: 600;
  line-height: 1.25;
  margin-bottom: 1.8em;
  margin-top: 1em;
  text-align: left;
}
.chapter p { margin: 0; text-indent: 1.5em; }
.chapter p.first-para { text-indent: 0; }
.chapter h3 { font-size: 1.05em; font-weight: 600; margin: 1.6em 0 0.4em; break-after: avoid; page-break-after: avoid; }
.chapter h4 { font-size: 1em; font-weight: 600; font-style: italic; margin: 1.3em 0 0.3em; break-after: avoid; page-break-after: avoid; }
.chapter blockquote { margin: 1.2em 3em; font-size: 0.95em; text-indent: 0; }
.chapter .nota-rodape { font-size: 0.85em; color: #555; }
`,

  // ─── 6. Técnico ABNT ───────────────────────────────────────────────────────
  abnt: `
body {
  font-family: 'Times New Roman', Times, serif;
  line-height: 1.5;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.5em; font-weight: bold; text-align: center; }
.title-page h1 { font-size: 1.6em; font-weight: bold; text-align: center; }
.chapter-title {
  font-size: 1em;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 1.5em;
  text-align: left;
  /* Set named string para uso no cabeçalho */
  string-set: chapter-title content();
}
.chapter p { margin: 0; text-indent: 1.25cm; }
.chapter p.first-para { text-indent: 0; }
.chapter h3 { font-size: 1em; font-weight: bold; margin: 1.5em 0 0.5em; }
.chapter h4 { font-size: 1em; font-weight: bold; font-style: italic; margin: 1em 0 0.3em; }
.chapter blockquote { margin-left: 4cm; font-size: 0.9em; text-indent: 0; line-height: 1.2; }
`,

  // ─── 7. Poesia ─────────────────────────────────────────────────────────────
  poesia: `
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
body {
  font-family: 'Crimson Text', Georgia, serif;
  line-height: 1.7;
  text-align: left;
  hyphens: none;
  -webkit-hyphens: none;
}
.half-title h1 { font-size: 1.85em; font-weight: 400; font-style: italic; line-height: 1.2; text-align: center; }
.title-page h1 { font-size: 2em; font-weight: 400; font-style: italic; line-height: 1.2; margin-bottom: 0.6em; text-align: center; }
.chapter {
  break-before: page;
  page-break-before: page;
  padding-top: 12mm;
}
.chapter-title {
  font-size: 1.15em;
  font-weight: 400;
  font-style: italic;
  text-align: center;
  margin-bottom: 3em;
  letter-spacing: 0.03em;
}
.chapter .corpo-poema { max-width: 22em; margin: 0 auto; }
.chapter .estrofe { margin-bottom: 1.6em; break-inside: avoid; page-break-inside: avoid; }
.chapter .verso {
  display: block;
  text-align: left;
  padding-left: 2em;
  text-indent: -2em;
  line-height: 1.55;
}
/* Fallback: parágrafos isolados ainda renderizam, mas alinhados à esquerda */
.chapter p { margin: 0 0 0.8em; text-align: left; text-indent: 0; }
`,

  // ─── 8. Teatro / Dramaturgia ───────────────────────────────────────────────
  teatro: `
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
body {
  font-family: 'Crimson Text', Georgia, serif;
  line-height: 1.55;
  text-align: left;
  hyphens: none;
  -webkit-hyphens: none;
}
.half-title h1 { font-size: 1.85em; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2; text-align: center; }
.title-page h1 { font-size: 2em; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; line-height: 1.2; margin-bottom: 0.6em; text-align: center; }
.chapter-title {
  font-size: 1.4em;
  font-weight: 500;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 2em 0 2.5em;
}
/* Subtítulo do ato (Cena) — autor coloca em h3 dentro do capítulo */
.chapter h3 {
  font-size: 1.05em;
  font-style: italic;
  text-align: center;
  font-weight: 400;
  margin: 2em 0 1.5em;
}
.chapter p { margin: 0 0 0.4em; text-indent: 0; }
.chapter p.fala { text-indent: 0; margin-bottom: 0.4em; }
.chapter p.fala .personagem {
  font-variant: small-caps;
  font-feature-settings: "smcp" 1;
  letter-spacing: 0.05em;
  font-weight: 500;
  margin-right: 0.4em;
}
.chapter p.didascalia {
  font-style: italic;
  margin: 0.3em 0 0.3em 2em;
  color: #555;
  text-indent: 0;
}
`,

  // ─── 9. Infantil Ilustrado ─────────────────────────────────────────────────
  infantil: `
@import url('https://fonts.googleapis.com/css2?family=Andika:ital,wght@0,400;0,700;1,400&display=swap');
body {
  font-family: 'Andika', 'Lora', Georgia, sans-serif;
  line-height: 1.85;
  color: #1a1a1a;
  text-align: left;
  hyphens: none;
  -webkit-hyphens: none;
}
.half-title h1 { font-size: 2em; font-weight: 700; color: #1a1a1a; line-height: 1.2; }
.title-page h1 { font-size: 2.4em; font-weight: 700; color: #1a1a1a; margin-bottom: 0.4em; line-height: 1.15; }
.chapter {
  break-before: page;
  page-break-before: page;
}
.chapter-title {
  font-size: 1.6em;
  font-weight: 700;
  color: #1a1a1a;
  text-align: center;
  margin: 60mm 0 2em;
  line-height: 1.25;
}
.chapter p { margin: 0 0 1em; text-indent: 0; }
/* Sem capitular em infantil */
.chapter p.first-para::first-letter {
  font-size: inherit;
  line-height: inherit;
  float: none;
  padding: 0;
  font-weight: inherit;
}
`,

  // ─── 10. Juvenil / Young Adult ─────────────────────────────────────────────
  juvenil: `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&display=swap');
body {
  font-family: 'Lora', Georgia, serif;
  line-height: 1.7;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 2em; font-weight: 500; line-height: 1.2; }
.title-page h1 { font-size: 2.3em; font-weight: 500; line-height: 1.15; margin-bottom: 0.5em; }
.chapter-title {
  font-size: 1.7em;
  font-weight: 500;
  text-align: center;
  margin: 2em 0 2em;
  line-height: 1.25;
}
.chapter p { margin: 0; text-indent: 1.5em; }
.chapter p.first-para { text-indent: 0; }
/* Sem capitular em juvenil — fica jovem demais com drop cap clássico */
.chapter p.dialogo { text-indent: 0; }
`,

  // ─── 11. Religioso Devocional ──────────────────────────────────────────────
  religioso: `
@import url('https://fonts.googleapis.com/css2?family=Gentium+Book+Plus:ital,wght@0,400;0,700;1,400&display=swap');
body {
  font-family: 'Gentium Book Plus', Georgia, serif;
  line-height: 1.6;
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
}
.half-title h1 { font-size: 1.85em; font-weight: 700; line-height: 1.2; letter-spacing: 0.02em; }
.title-page h1 { font-size: 2.1em; font-weight: 700; margin-bottom: 0.5em; line-height: 1.15; }
.chapter-title {
  font-size: 1.3em;
  font-weight: 700;
  text-align: center;
  margin: 1em 0 2.5em;
  line-height: 1.3;
}
.chapter p { margin: 0 0 0.6em; text-indent: 1.2em; }
.chapter p.first-para { text-indent: 0; }
.chapter p.first-para::first-letter {
  font-size: 2.8em;
  line-height: 0.85;
  float: left;
  padding: 0.05em 0.08em 0 0;
  font-weight: 700;
}
/* Versículos numerados (Bíblia, devocional) — gerados pelo parser */
.chapter p.versiculo {
  text-indent: 0;
  margin: 0 0 0.5em;
  padding-left: 1.5em;
  text-indent: -1.5em;
}
.chapter p.versiculo .num {
  font-size: 0.7em;
  font-weight: 700;
  vertical-align: super;
  margin-right: 0.4em;
  color: #5a4a2a;
}
`,

};

// ─── HTML helpers ─────────────────────────────────────────────────────────────

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function fixTypography(text: string): string {
  return text
    .replace(/--/g, "—")
    .replace(/\.\.\./g, "…")
    .replace(/" /g, "“ ")
    .replace(/ "/g, " ”")
    .replace(/^"/gm, "“")
    .replace(/"$/gm, "”");
}

/**
 * Sanitização defensiva para textos curtos de front matter (título, subtítulo,
 * autor, dedicatória, epígrafe). Remove caracteres invisíveis Unicode que
 * podem estar persistidos no manuscrito e que distorcem a renderização:
 *   U+FEFF BOM, U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ,
 *   U+00AD soft hyphen, U+202A-U+202E bidi overrides.
 */
export function cleanFrontMatterText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/[\uFEFF\u200B\u200C\u200D\u00AD\u202A-\u202E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildParagraphsForChapter(text: string, config: MioloConfig): string {
  console.log("[buildParagraphsForChapter] tamanho:", text.length);

  // Normaliza quebras de linha (Windows/Mac → Unix)
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Parágrafos reais são blocos separados por linha em branco (\n\n+).
  // Dentro de cada bloco, \n simples são hardwraps (quebras forçadas de TXT
  // monoespaçado) e viram espaço — JUNTANDO as linhas num único parágrafo.
  // Exceção: linhas iniciadas por travessão de diálogo (—, –, -) abrem
  // parágrafo novo, porque diálogos são sempre parágrafos próprios.

  const blocos = normalized.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

  // Fallback defensivo: se não há separação por linha em branco (texto colado
  // como uma corrida só), trata o texto inteiro como um bloco. A lógica de
  // diálogo abaixo ainda separa o que for diálogo.
  const blocosEffective = blocos.length >= 2
    ? blocos
    : [normalized.trim()];

  const paragraphs: string[] = [];

  for (const bloco of blocosEffective) {
    const linhas = bloco.split("\n").map(l => l.trim()).filter(Boolean);
    if (linhas.length === 0) continue;

    let buffer: string[] = [];
    const flush = () => {
      if (buffer.length > 0) {
        paragraphs.push(buffer.join(" "));
        buffer = [];
      }
    };

    for (const linha of linhas) {
      // Diálogo com travessão inicial: "— Fala..."
      const isDialogueTravessao = /^[—–-]\s/.test(linha);
      // Diálogo formal com locutor antes do travessão: "A. K. — Fala...", "V. — ..."
      const isDialogueFormal = /^[A-ZÁÉÍÓÚÂÊÔÃÕÇÑÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑÜa-záéíóúâêôãõçñü.\s]{0,24}[.\s]+[—–]\s/.test(linha);
      const isDialogue = isDialogueTravessao || isDialogueFormal;
      if (isDialogue) {
        flush();
        paragraphs.push(linha);   // diálogo é parágrafo próprio
      } else {
        buffer.push(linha);
      }
    }
    flush();
  }

  // Renderiza cada parágrafo final como <p>, aplicando tipografia,
  // classe `first-para` no primeiro parágrafo do capítulo, e
  // classe `dialogo` para linhas iniciadas por travessão.
  return paragraphs.map((para, idx) => {
    const p = fixTypography(para.trim());
    const isFirst = idx === 0;
    const isDialogue = /^[—–-]\s/.test(p) ||
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇÑÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑÜa-záéíóúâêôãõçñü.\s]{0,24}[.\s]+[—–]\s/.test(p);

    const classes: string[] = [];
    if (isFirst) classes.push("first-para");
    if (isDialogue) classes.push("dialogo");
    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
    return `<p${classAttr}>${escHtml(p)}</p>`;
  }).join("\n");
}

/**
 * Heurística para decidir se um trecho de texto tem estrutura de poesia.
 *
 * Critérios (todos precisam ser verdade):
 *   - Pelo menos 60% dos versos (linhas não vazias) têm 70 caracteres ou menos
 *   - Existe pelo menos 1 quebra de estrofe (linha em branco entre versos)
 *     OU todas as linhas têm 50 caracteres ou menos (poesia em estrofe única)
 *
 * Prosa típica com hard wrap de 80 colunas falha no primeiro critério: a
 * maioria das linhas tem entre 70 e 80 caracteres. Poesia tem linhas muito
 * mais curtas.
 */
function looksLikePoetry(text: string): boolean {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return false;

  const linhas = normalized.split("\n").map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) return false;

  const versosCurtos = linhas.filter(l => l.length <= 70).length;
  const ratioCurtos = versosCurtos / linhas.length;
  if (ratioCurtos < 0.6) return false;

  const temEstrofes = /\n\s*\n/.test(normalized);
  const todasMuitoCurtas = linhas.every(l => l.length <= 50);

  return temEstrofes || todasMuitoCurtas;
}

// ─── Parser de poesia: estrofes (blocos separados por linha em branco)
//     e versos (cada linha de uma estrofe) ────────────────────────────────────

function buildParagraphsForPoesia(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const estrofes = normalized.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);

  if (estrofes.length === 0) return "";

  const estrofesHtml = estrofes.map(estrofe => {
    const versos = estrofe.split("\n").map(v => v.trim()).filter(Boolean);
    const versosHtml = versos.map(v =>
      `<span class="verso">${escHtml(fixTypography(v))}</span>`
    ).join("\n");
    return `<div class="estrofe">\n${versosHtml}\n</div>`;
  }).join("\n");

  return `<div class="corpo-poema">\n${estrofesHtml}\n</div>`;
}

// ─── Parser de teatro: nome do personagem + fala + didascália ────────────────
// Convenção aceita:
//   PERSONAGEM: fala aqui...      → versalete + travessão + fala
//   PERSONAGEM. fala aqui...      → variante com ponto
//   (didascália em parênteses)    → linha inteira entre parênteses
//   linha simples sem padrão      → continuação da fala anterior

function buildParagraphsForTeatro(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const linhas = normalized.split("\n").map(l => l.trim());

  const out: string[] = [];
  let buffer: string[] = [];
  let personagem: string | null = null;

  const flushFala = () => {
    if (personagem !== null) {
      const falaTexto = buffer.length > 0
        ? escHtml(fixTypography(buffer.join(" ")))
        : "";
      out.push(`<p class="fala"><span class="personagem">${escHtml(personagem)}</span>${falaTexto ? ` — ${falaTexto}` : ""}</p>`);
    } else if (buffer.length > 0) {
      // Texto solto sem personagem — provável bloco de cena/prólogo
      out.push(`<p>${escHtml(fixTypography(buffer.join(" ")))}</p>`);
    }
    buffer = [];
    personagem = null;
  };

  for (const linha of linhas) {
    if (!linha) {
      flushFala();
      continue;
    }

    // Didascália: linha inteiramente entre parênteses
    const didMatch = linha.match(/^\((.+)\)$/);
    if (didMatch) {
      flushFala();
      out.push(`<p class="didascalia">${escHtml(fixTypography(didMatch[1]))}</p>`);
      continue;
    }

    // Nome de personagem: caixa alta (com acentos) seguida de . ou :
    const persMatch = linha.match(/^([A-ZÁÉÍÓÚÂÊÔÃÕÇÑÜ][A-ZÁÉÍÓÚÂÊÔÃÕÇÑÜ \-]{1,40})[\.\:]\s*(.*)$/);
    if (persMatch) {
      flushFala();
      personagem = persMatch[1].trim();
      const restante = persMatch[2]?.trim();
      if (restante) buffer.push(restante);
      continue;
    }

    // Continuação de fala ou texto livre
    buffer.push(linha);
  }
  flushFala();

  return out.join("\n");
}

// ─── Parser de versículo (religioso) ─────────────────────────────────────────
// Detecta texto bíblico/devocional onde cada parágrafo começa com numeração
// "1 texto..." ou "1. texto..." ou "1) texto...".
// Retorna string vazia se não detectar o padrão — caller usa parser default.

function buildParagraphsForReligiosoVersiculo(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";

  // Heurística: precisa haver pelo menos 3 padrões "<número> " no texto para
  // ativar o modo versículo. Evita falsos positivos em prosa que apenas
  // começa com data ou número.
  const versiculoPattern = /(^|\n)\s*\d{1,3}[\s.\)]/g;
  const matches = normalized.match(versiculoPattern) ?? [];
  if (matches.length < 3) return "";

  // Quebra por número no início de linha (mantém o número no segmento)
  const versiculos = normalized
    .split(/(?=(?:^|\n)\s*\d{1,3}[\s.\)])/)
    .map(v => v.replace(/^\n+/, "").trim())
    .filter(Boolean);

  return versiculos.map(v => {
    const m = v.match(/^(\d{1,3})[\s.\)]\s*([\s\S]+)$/);
    if (!m) return `<p>${escHtml(fixTypography(v))}</p>`;
    const num = m[1];
    const texto = m[2].replace(/\s+/g, " ").trim();
    return `<p class="versiculo"><span class="num">${num}</span> ${escHtml(fixTypography(texto))}</p>`;
  }).join("\n");
}

// ─── Book HTML builder ────────────────────────────────────────────────────────

export function buildBookHtml(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  texto: string;
  capitulos: { titulo: string; pos: number }[];
  config: MioloConfig;
  creditosInnerHtml: string;
  chapterStartPagesOverride?: number[];
}): { html: string; capitulosInfo: CapituloInfo[]; paginasReais: number; chapterStartPages: number[] } {
  const { titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml, chapterStartPagesOverride } = params;

  const spec = getFormatoDef(config.formato).specs;

  // Tamanho de corpo: usa override do autor se vier, senão default do template.
  const corpoPt = clampCorpoPt(config.corpo_pt) ?? getDefaultCorpoPt(config.template, config.formato);

  // wpp ajustado pelo corpo_pt efetivo — calculado uma vez e reutilizado
  // nos cálculos de paginação do TOC e dos capítulos.
  const wppAjustado = wppEfetivo(spec, corpoPt);

  // Marcas de corte são sempre aplicadas no builder de gráfica.
  // O builder digital (lib/miolo-builder-digital.ts) reescreve o @page
  // posteriormente para remover sangria e marcas.
  const css =
    buildPageCss(spec, true) +
    buildBaseCss(corpoPt) +
    TEMPLATE_SPECIFIC_CSS[config.template];

  console.log("[buildBookHtml] template:", config.template, "formato:", config.formato);
  console.log("[buildBookHtml] capítulos detectados:", capitulos.length);

  // Normalizar texto e recalcular posições dos capítulos contra texto normalizado
  const textoNormalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const capitulosNorm = capitulos.map(c => {
    const novaPos = textoNormalizado.indexOf(c.titulo);
    return { ...c, pos: novaPos >= 0 ? novaPos : c.pos };
  });

  // Dividir manuscrito em segmentos por capítulo
  const segments: { titulo: string; texto: string }[] = [];
  if (capitulosNorm.length === 0) {
    segments.push({ titulo: titulo || "Capítulo 1", texto: textoNormalizado });
  } else {
    for (let i = 0; i < capitulosNorm.length; i++) {
      const start = capitulosNorm[i].pos;
      const end = i < capitulosNorm.length - 1 ? capitulosNorm[i + 1].pos : textoNormalizado.length;
      let segTexto = textoNormalizado.slice(start, end).trim();
      // Remove a primeira linha (que contém o título do capítulo)
      const markerEnd = segTexto.indexOf("\n");
      segTexto = markerEnd > -1 ? segTexto.slice(markerEnd).trim() : segTexto;
      segments.push({ titulo: capitulosNorm[i].titulo, texto: segTexto });
    }
  }

  const capitulosInfo: CapituloInfo[] = segments.map((seg, i) => ({
    id: `cap-${i}`,
    titulo: seg.titulo,
    palavras: seg.texto.split(/\s+/).filter(Boolean).length,
  }));

  const sections: string[] = [];

  const tituloClean    = cleanFrontMatterText(titulo);
  const subtituloClean = cleanFrontMatterText(subtitulo);
  const autorClean     = cleanFrontMatterText(autor);

  // ── 1. Half-title (recto) ──────────────────────────────────────────────────
  sections.push(`<section class="front-page half-title">
  <h1>${escHtml(tituloClean)}</h1>
${subtituloClean ? `  <p class="subtitle" style="font-size:1em;margin-top:0.8em">${escHtml(subtituloClean)}</p>\n` : ""}</section>`);

  // ── 2. Verso branco ────────────────────────────────────────────────────────
  sections.push(`<section class="blank-page"></section>`);

  // ── 3. Folha de rosto (recto) ──────────────────────────────────────────────
  sections.push(`<section class="front-page title-page">
  <h1>${escHtml(tituloClean)}</h1>
${subtituloClean ? `  <p class="subtitle">${escHtml(subtituloClean)}</p>\n` : ""}  <p class="author">${escHtml(autorClean)}</p>
</section>`);

  // ── 4. Créditos + ficha catalográfica ──────────────────────────────────────
  if (!creditosInnerHtml || !creditosInnerHtml.trim()) {
    throw new Error(
      "[miolo-builder] creditosInnerHtml ausente. " +
      "A página de créditos aprovada é obrigatória — não existe fallback."
    );
  }
  sections.push(`<section class="front-page">
${creditosInnerHtml}
</section>`);

  // ── 5. Dedicatória (opcional) ──────────────────────────────────────────────
  if (config.dedicatoria?.trim()) {
    sections.push(`<section class="front-page dedicatoria">
  <p>${escHtml(cleanFrontMatterText(config.dedicatoria))}</p>
</section>`);
    // Verso branco depois da dedicatória
    sections.push(`<section class="blank-page"></section>`);
  }

  // ── 6. Epígrafe (opcional) ─────────────────────────────────────────────────
  if (config.epigrafe_texto?.trim()) {
    sections.push(`<section class="front-page epigrafe">
  <p class="epigrafe-text">${escHtml(cleanFrontMatterText(config.epigrafe_texto))}</p>
${config.epigrafe_autor ? `  <p class="epigrafe-autor">— ${escHtml(cleanFrontMatterText(config.epigrafe_autor))}</p>\n` : ""}</section>`);
    sections.push(`<section class="blank-page"></section>`);
  }

  // ── 7. Sumário (apenas em templates que comportam) ─────────────────────────
  const realChapterStartPages: number[] = [];
  if (deveExibirSumario(config) && segments.length > 1) {
    // Estimativa de páginas iniciais por capítulo, ou override de uma 2ª passada
    const startPages = chapterStartPagesOverride ?? (() => {
      const pages: number[] = [];
      let running = 1;
      for (const info of capitulosInfo) {
        pages.push(running);
        const pagesInChapter = Math.max(1, Math.ceil(info.palavras / wppAjustado));
        running += pagesInChapter;
        if (running % 2 === 0) running++;
      }
      return pages;
    })();

    const tocItems = capitulosInfo.map((c, i) =>
      `      <li><a href="#${c.id}"><span class="toc-title">${escHtml(c.titulo)}</span></a><span class="toc-dots"></span><span class="toc-pg">${startPages[i]}</span></li>`
    ).join("\n");

    sections.push(`<section class="front-page">
  <div class="toc">
    <h2>Sumário</h2>
    <ol>
${tocItems}
    </ol>
  </div>
</section>`);
  }

  // ── 8. Capítulos ───────────────────────────────────────────────────────────
  let numberedPagesEstimate = 0;
  segments.forEach((seg, i) => {
    const info = capitulosInfo[i];
    realChapterStartPages.push(numberedPagesEstimate + 1);
    numberedPagesEstimate += Math.max(1, Math.ceil(info.palavras / wppAjustado));

    // Roteador de parser por template. Cada parser sabe gerar o HTML interno
    // do capítulo respeitando convenções do gênero.
    let paragrafosHtml: string;
    if (config.template === "poesia" && looksLikePoetry(seg.texto)) {
      paragrafosHtml = buildParagraphsForPoesia(seg.texto);
    } else if (config.template === "poesia") {
      // Texto não tem estrutura de poesia (ex.: prosa com hard-wrap de 80 colunas).
      // Usa parser de prosa para evitar que cada linha vire um verso independente.
      paragrafosHtml = buildParagraphsForChapter(seg.texto, config);
    } else if (config.template === "teatro") {
      paragrafosHtml = buildParagraphsForTeatro(seg.texto);
    } else if (config.template === "religioso") {
      const versHtml = buildParagraphsForReligiosoVersiculo(seg.texto);
      paragrafosHtml = versHtml || buildParagraphsForChapter(seg.texto, config);
    } else {
      paragrafosHtml = buildParagraphsForChapter(seg.texto, config);
    }

    sections.push(`<section class="chapter" id="${info.id}">
  <h2 class="chapter-title">${escHtml(info.titulo)}</h2>
${paragrafosHtml}
</section>`);
  });

  // ── 9. Bio do autor (opcional, sem break-before: right) ────────────────────
  if (config.bio_autor?.trim()) {
    sections.push(`<section class="chapter" style="break-before: page; page-break-before: page">
  <div class="author-bio">
    <h3 style="font-size:1em;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1em">Sobre o autor</h3>
    <p style="text-indent:0">${escHtml(cleanFrontMatterText(config.bio_autor))}</p>
  </div>
</section>`);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(tituloClean)}</title>
<style>
${css}
</style>
</head>
<body>
${sections.join("\n\n")}
</body>
</html>`;

  // paginasReais é uma estimativa (não vem do PDF aqui — vem da rota gerar-pdf
  // que conta páginas reais do PDF gerado e atualiza o registro do projeto).
  // Mantemos o cálculo para preview e sumário.
  const paginasReais = numberedPagesEstimate + 4
    + (config.dedicatoria?.trim() ? 2 : 0)
    + (config.epigrafe_texto?.trim() ? 2 : 0)
    + (deveExibirSumario(config) && segments.length > 1 ? 1 : 0);

  return {
    html,
    capitulosInfo,
    paginasReais,
    chapterStartPages: realChapterStartPages,
  };
}

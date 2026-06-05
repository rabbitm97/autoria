// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateId = "literario" | "nao_ficcao" | "abnt" | "infantil" | "poesia" | "religioso";
export type FormatoId  = "bolso" | "a5" | "padrao_br" | "quadrado" | "a4";

export interface MioloConfig {
  template: TemplateId;
  formato: FormatoId;
  corpo_pt: 10 | 11 | 12;
  capitular: boolean;
  ornamentos: boolean;
  sumario: boolean;
  dedicatoria: string;
  epigrafe_texto: string;
  epigrafe_autor: string;
  bio_autor: string;
  marcas_corte: boolean;
}

export interface CapituloInfo {
  id: string;
  titulo: string;
  palavras: number;
}

// ─── Regra de negócio: quando renderizar sumário ─────────────────────────────

const TEMPLATES_SEM_SUMARIO: TemplateId[] = ["literario", "poesia", "infantil"];

export function deveExibirSumario(config: MioloConfig): boolean {
  if (TEMPLATES_SEM_SUMARIO.includes(config.template)) return false;
  return config.sumario === true;
}

// ─── Dimensões e margens físicas (todas em mm) ───────────────────────────────
// Cada formato tem dimensões da página final (sem sangria) e margens editoriais
// proporcionais. A sangria de 3mm é adicionada uniformemente em torno da página
// final para chegar ao tamanho da folha física que vai pra gráfica.

const BLEED_MM = 3;

interface FormatoSpec {
  w_mm: number;      // largura da página final (sem sangria)
  h_mm: number;      // altura da página final (sem sangria)
  top_mm: number;    // margem editorial topo
  outer_mm: number;  // margem editorial externa
  bottom_mm: number; // margem editorial base
  inner_mm: number;  // margem editorial interna (lombada)
  label: string;
  wpp: number;       // palavras por página (estimativa, usada para sumário)
}

const FORMATO_SPECS: Record<FormatoId, FormatoSpec> = {
  bolso:     { w_mm: 110, h_mm: 180, top_mm: 20, outer_mm: 14, bottom_mm: 22, inner_mm: 18, label: "Bolso (11×18cm)",    wpp: 200 },
  a5:        { w_mm: 148, h_mm: 210, top_mm: 22, outer_mm: 16, bottom_mm: 25, inner_mm: 20, label: "A5 (14,8×21cm)",      wpp: 230 },
  padrao_br: { w_mm: 160, h_mm: 230, top_mm: 25, outer_mm: 18, bottom_mm: 28, inner_mm: 22, label: "Padrão BR (16×23cm)", wpp: 260 },
  quadrado:  { w_mm: 200, h_mm: 200, top_mm: 22, outer_mm: 18, bottom_mm: 25, inner_mm: 22, label: "Quadrado (20×20cm)",  wpp: 300 },
  a4:        { w_mm: 210, h_mm: 297, top_mm: 30, outer_mm: 20, bottom_mm: 30, inner_mm: 25, label: "A4 (21×29,7cm)",      wpp: 380 },
};

// Compatibilidade: FORMAT_DIMS é mantido com strings em cm para quem ainda usa
// (gerar-epub, qa, gerar-audio). Internamente o builder usa FORMATO_SPECS em mm.
export const FORMAT_DIMS: Record<FormatoId, { w: string; h: string; label: string; wpp: number }> = {
  bolso:     { w: "11cm",   h: "18cm",   label: FORMATO_SPECS.bolso.label,     wpp: FORMATO_SPECS.bolso.wpp },
  a5:        { w: "14.8cm", h: "21cm",   label: FORMATO_SPECS.a5.label,        wpp: FORMATO_SPECS.a5.wpp },
  padrao_br: { w: "16cm",   h: "23cm",   label: FORMATO_SPECS.padrao_br.label, wpp: FORMATO_SPECS.padrao_br.wpp },
  quadrado:  { w: "20cm",   h: "20cm",   label: FORMATO_SPECS.quadrado.label,  wpp: FORMATO_SPECS.quadrado.wpp },
  a4:        { w: "21cm",   h: "29.7cm", label: FORMATO_SPECS.a4.label,        wpp: FORMATO_SPECS.a4.wpp },
};

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

function buildPageCss(spec: FormatoSpec, includeMarks: boolean): string {
  const W = spec.w_mm + 2 * BLEED_MM;
  const H = spec.h_mm + 2 * BLEED_MM;
  // Margens da @page = sangria + margem editorial. Isso garante que a área
  // útil (mancha gráfica) tenha exatamente as margens editoriais especificadas
  // medidas a partir da linha de corte.
  const mT = spec.top_mm + BLEED_MM;
  const mO = spec.outer_mm + BLEED_MM;
  const mB = spec.bottom_mm + BLEED_MM;
  const mI = spec.inner_mm + BLEED_MM;

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
html { font-size: ${corpo_pt}pt; }
body {
  font-size: ${corpo_pt}pt;
  line-height: 1.6;
  color: #1a1a1a;
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
.title-page .subtitle { font-size: 1.15em; font-style: italic; color: #555; margin-bottom: 2em; max-width: 80%; margin-left: auto; margin-right: auto; }
.title-page .author { font-size: 1.25em; color: #444; margin-top: 5em; }

/* Créditos (verso da folha de rosto) */
.creditos-wrap {
  font-size: 0.85em;
  color: #444;
  line-height: 1.7;
  text-align: left;
}

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

/* Ornamento — separa seções dentro do capítulo, sem quebrar página */
.ornamento {
  text-align: center;
  color: #888;
  margin: 1.8em 0;
  letter-spacing: 0.8em;
  font-size: 1.1em;
  break-inside: avoid;
  page-break-inside: avoid;
}
.ornamento + p { text-indent: 0; }

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
`,
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
.chapter h3 { font-size: 1.1em; font-weight: 600; margin: 1.8em 0 0.5em; break-after: avoid; }
.chapter h4 { font-size: 1em; font-weight: 600; margin: 1.4em 0 0.3em; break-after: avoid; }
.chapter blockquote { margin: 1.5em 2em; padding: 0.8em 1.5em; border-left: 3px solid #ddd; font-style: italic; color: #555; }
`,
  abnt: `
body {
  font-family: 'Times New Roman', Times, serif;
  line-height: 1.5;
  text-align: justify;
}
.half-title h1 { font-size: 1.5em; font-weight: bold; text-align: center; }
.title-page h1 { font-size: 1.6em; font-weight: bold; text-align: center; }
.chapter-title {
  font-size: 1em;
  font-weight: bold;
  text-transform: uppercase;
  margin-bottom: 1.5em;
  text-align: left;
}
.chapter p { margin: 0; text-indent: 1.25cm; }
.chapter p.first-para { text-indent: 0; }
.chapter h3 { font-size: 1em; font-weight: bold; margin: 1.5em 0 0.5em; }
.chapter h4 { font-size: 1em; font-weight: bold; font-style: italic; margin: 1em 0 0.3em; }
.chapter blockquote { margin-left: 4cm; font-size: 0.9em; text-indent: 0; }
`,
  infantil: `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
body {
  font-family: 'Lora', Georgia, serif;
  line-height: 1.85;
  color: #1a1a1a;
  text-align: left;
  hyphens: none;
  -webkit-hyphens: none;
}
.half-title h1 { font-size: 2em; font-weight: 600; color: #1a1a1a; line-height: 1.2; }
.title-page h1 { font-size: 2.2em; font-weight: 600; color: #1a1a1a; margin-bottom: 0.4em; line-height: 1.15; }
.chapter {
  /* Infantil: histórias não precisam começar em página direita */
  break-before: page;
  page-break-before: page;
}
.chapter-title {
  font-size: 1.5em;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
  margin: 2em 0 2em;
  line-height: 1.25;
}
.chapter p { margin: 0 0 1em; text-indent: 0; }
/* Sem capitular em infantil mesmo se config.capitular === true */
.chapter p.first-para::first-letter {
  font-size: inherit;
  line-height: inherit;
  float: none;
  padding: 0;
  font-weight: inherit;
}
`,
  poesia: `
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
body {
  font-family: 'Crimson Text', Georgia, serif;
  line-height: 1.7;
}
.half-title h1 { font-size: 1.85em; font-weight: 400; font-style: italic; line-height: 1.2; }
.title-page h1 { font-size: 2em; font-weight: 400; font-style: italic; line-height: 1.2; margin-bottom: 0.6em; }
.chapter {
  /* Poesia: cada poema em página própria, não obrigatoriamente recto */
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
/* Corpo do poema em coluna estreita centralizada */
.chapter .corpo-poema { max-width: 22em; margin: 0 auto; }
.chapter .estrofe { margin-bottom: 1.6em; break-inside: avoid; page-break-inside: avoid; }
.chapter .verso { display: block; text-align: left; padding-left: 2em; text-indent: -2em; line-height: 1.55; }
/* Fallback para poesia sem estrofe estruturada — parágrafos viram versos */
.chapter p { margin: 0 0 0.8em; text-align: left; }
.chapter p.first-para::first-letter {
  font-size: inherit;
  line-height: inherit;
  float: none;
  padding: 0;
  font-weight: inherit;
}
`,
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
/* Versículos numerados (livro devocional) */
.chapter p.versiculo {
  text-indent: 0;
  margin: 0 0 0.8em;
  padding-left: 1.2em;
  text-indent: -1.2em;
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
      const isDialogue = /^[—–-]\s/.test(linha);
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
    const isDialogue = /^[—–-]\s/.test(p);

    if (isDialogue) return `<p class="dialogo">${escHtml(p)}</p>`;

    const classes: string[] = [];
    if (isFirst) classes.push("first-para");
    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
    return `<p${classAttr}>${escHtml(p)}</p>`;
  }).join("\n");
}

function buildOrnamento(config: MioloConfig): string {
  if (!config.ornamentos) return "";
  return `<div class="ornamento">* * *</div>`;
}

// ─── Book HTML builder ────────────────────────────────────────────────────────

export function buildBookHtml(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  texto: string;
  capitulos: { titulo: string; pos: number }[];
  config: MioloConfig;
  creditosInnerHtml?: string | null;
  chapterStartPagesOverride?: number[];
}): { html: string; capitulosInfo: CapituloInfo[]; paginasReais: number; chapterStartPages: number[] } {
  const { titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml, chapterStartPagesOverride } = params;

  const spec = FORMATO_SPECS[config.formato];

  // CSS final: @page + base + template específico
  const css =
    buildPageCss(spec, config.marcas_corte) +
    buildBaseCss(config.corpo_pt) +
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

  // ── 1. Half-title (recto) ──────────────────────────────────────────────────
  sections.push(`<section class="front-page half-title">
  <h1>${escHtml(titulo)}</h1>
${subtitulo ? `  <p class="subtitle" style="font-size:1em;margin-top:0.8em">${escHtml(subtitulo)}</p>\n` : ""}</section>`);

  // ── 2. Verso branco ────────────────────────────────────────────────────────
  sections.push(`<section class="blank-page"></section>`);

  // ── 3. Folha de rosto (recto) ──────────────────────────────────────────────
  sections.push(`<section class="front-page title-page">
  <h1>${escHtml(titulo)}</h1>
${subtitulo ? `  <p class="subtitle">${escHtml(subtitulo)}</p>\n` : ""}  <p class="author">${escHtml(autor)}</p>
</section>`);

  // ── 4. Créditos + ficha catalográfica ──────────────────────────────────────
  if (creditosInnerHtml) {
    sections.push(`<section class="front-page">
  <div class="creditos-wrap">${creditosInnerHtml}</div>
</section>`);
  } else {
    sections.push(`<section class="front-page">
  <div class="creditos-wrap" style="padding-top:40mm">
    <p>© ${new Date().getFullYear()} ${escHtml(autor)}</p>
    <p>Todos os direitos reservados.</p>
    <p>Publicado pela plataforma Autoria.</p>
  </div>
</section>`);
  }

  // ── 5. Dedicatória (opcional) ──────────────────────────────────────────────
  if (config.dedicatoria?.trim()) {
    sections.push(`<section class="front-page dedicatoria">
  <p>${escHtml(config.dedicatoria)}</p>
</section>`);
    // Verso branco depois da dedicatória
    sections.push(`<section class="blank-page"></section>`);
  }

  // ── 6. Epígrafe (opcional) ─────────────────────────────────────────────────
  if (config.epigrafe_texto?.trim()) {
    sections.push(`<section class="front-page epigrafe">
  <p class="epigrafe-text">${escHtml(config.epigrafe_texto)}</p>
${config.epigrafe_autor ? `  <p class="epigrafe-autor">— ${escHtml(config.epigrafe_autor)}</p>\n` : ""}</section>`);
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
        const pagesInChapter = Math.max(1, Math.ceil(info.palavras / spec.wpp));
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
    numberedPagesEstimate += Math.max(1, Math.ceil(info.palavras / spec.wpp));

    sections.push(`<section class="chapter" id="${info.id}">
  <h2 class="chapter-title">${escHtml(info.titulo)}</h2>
${buildParagraphsForChapter(seg.texto, config)}
${buildOrnamento(config)}
</section>`);
  });

  // ── 9. Bio do autor (opcional, sem break-before: right) ────────────────────
  if (config.bio_autor?.trim()) {
    sections.push(`<section class="chapter" style="break-before: page; page-break-before: page">
  <div class="author-bio">
    <h3 style="font-size:1em;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1em">Sobre o autor</h3>
    <p style="text-indent:0">${escHtml(config.bio_autor)}</p>
  </div>
</section>`);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(titulo)}</title>
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
  const paginasReais = numberedPagesEstimate + (creditosInnerHtml ? 4 : 4)
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

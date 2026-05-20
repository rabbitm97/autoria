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

// ─── Format dimensions (cm) ───────────────────────────────────────────────────

export const FORMAT_DIMS: Record<FormatoId, { w: string; h: string; label: string; wpp: number }> = {
  bolso:     { w: "11cm",   h: "18cm",   label: "Bolso (11×18cm)",      wpp: 200 },
  a5:        { w: "14.8cm", h: "21cm",   label: "A5 (14,8×21cm)",        wpp: 230 },
  padrao_br: { w: "16cm",   h: "23cm",   label: "Padrão BR (16×23cm)",    wpp: 260 },
  quadrado:  { w: "20cm",   h: "20cm",   label: "Quadrado (20×20cm)",     wpp: 300 },
  a4:        { w: "21cm",   h: "29.7cm", label: "A4 (21×29,7cm)",         wpp: 380 },
};

const MARGIN_BY_FORMAT: Record<FormatoId, { top: string; outer: string; bottom: string; inner: string }> = {
  bolso:     { top: "20mm", outer: "14mm", bottom: "22mm", inner: "18mm" },
  a5:        { top: "22mm", outer: "16mm", bottom: "25mm", inner: "20mm" },
  padrao_br: { top: "25mm", outer: "18mm", bottom: "28mm", inner: "22mm" },
  quadrado:  { top: "22mm", outer: "18mm", bottom: "25mm", inner: "22mm" },
  a4:        { top: "30mm", outer: "20mm", bottom: "30mm", inner: "25mm" },
};

const BLEED_MM = 3;
const BOTTOM_RESERVE_MM = 12;

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

export function buildParagraphs(text: string, config: MioloConfig, isFirstInChapter: boolean): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  let paras = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 1 && normalized.includes('\n')) {
    paras = normalized.split('\n').map(p => p.trim()).filter(Boolean);
  }

  return paras.map((para, idx) => {
    const p = fixTypography(para);
    const isFirst = isFirstInChapter && idx === 0;
    const isDialogue = p.startsWith("—") || p.startsWith("- ");

    if (isDialogue) return `<p class="dialogo">${escHtml(p)}</p>`;

    if (config.capitular && isFirst && p.length > 2) {
      const firstChar = p[0];
      const rest = escHtml(p.slice(1));
      return `<p class="first-para"><span class="drop-cap">${firstChar}</span>${rest}</p>`;
    }

    return `<p${isFirst ? ' class="first-para"' : ''}>${escHtml(p)}</p>`;
  }).join("\n");
}

// ─── No-op exports (preservados para não quebrar imports legados) ─────────────

export function buildMarksCss(_w: string, _h: string): string { return ""; }
export const MARKS_HTML = "";
export function wrapInSpread(pageHtml: string): string { return pageHtml; }
export function splitIntoChunks(text: string, _wpp: number, _firstPageWpp: number): string[] {
  return [text];
}
export function buildOrnamented(config: MioloConfig): string {
  return config.ornamentos ? `<div class="ornamento">* * *</div>` : "";
}
export const TEMPLATE_CSS = {} as Record<TemplateId, (w: string, h: string, corpo: number, fmt: FormatoId) => string>;

// ─── CSS builder (single source of truth) ────────────────────────────────────

function buildCss(config: MioloConfig): string {
  const fmt = FORMAT_DIMS[config.formato];
  const m = MARGIN_BY_FORMAT[config.formato];
  const corpo = config.corpo_pt;

  const trimWmm = parseFloat(fmt.w) * 10;
  const trimHmm = parseFloat(fmt.h) * 10;
  const sheetW = config.marcas_corte ? `${trimWmm + 2 * BLEED_MM}mm` : fmt.w;
  const sheetH = config.marcas_corte ? `${trimHmm + 2 * BLEED_MM}mm` : fmt.h;

  const pageMarginTop    = config.marcas_corte ? `calc(${m.top} + ${BLEED_MM}mm)` : m.top;
  const pageMarginOuter  = config.marcas_corte ? `calc(${m.outer} + ${BLEED_MM}mm)` : m.outer;
  const pageMarginBottom = `calc(${config.marcas_corte ? `${m.bottom} + ${BLEED_MM}mm` : m.bottom} + ${BOTTOM_RESERVE_MM}mm)`;
  const pageMarginInner  = config.marcas_corte ? `calc(${m.inner} + ${BLEED_MM}mm)` : m.inner;

  return `
${templateImports(config.template)}

@page {
  size: ${sheetW} ${sheetH};
  margin: ${pageMarginTop} ${pageMarginOuter} ${pageMarginBottom} ${pageMarginInner};
  @bottom-center {
    content: counter(page);
    font-family: ${templateFontFamily(config.template)};
    font-size: 9pt;
    color: #555;
    padding-top: 4mm;
  }
}
@page :left {
  margin: ${pageMarginTop} ${pageMarginInner} ${pageMarginBottom} ${pageMarginOuter};
}
@page :right {
  margin: ${pageMarginTop} ${pageMarginOuter} ${pageMarginBottom} ${pageMarginInner};
}
@page :first {
  @bottom-center { content: ""; }
}
@page frontmatter {
  @bottom-center { content: ""; }
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: ${corpo}pt; }
body {
  color: #1a1a1a;
  font-family: ${templateFontFamily(config.template)};
  line-height: ${templateLineHeight(config.template)};
  hyphens: auto;
  -webkit-hyphens: auto;
  text-rendering: optimizeLegibility;
}

${config.marcas_corte ? buildCropMarksCss(BLEED_MM) : ""}

.frontmatter {
  page: frontmatter;
  break-after: page;
  page-break-after: always;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.frontmatter.center-v { justify-content: center; align-items: center; text-align: center; }
.frontmatter.right-aligned { align-items: flex-end; text-align: right; }
.frontmatter.right-aligned > * { max-width: 60%; }
.frontmatter.bottom-aligned { justify-content: flex-end; }

.title-half h1, .title-full h1 { ${templateTitleStyle(config.template)} }
.title-full .subtitulo { font-size: 1.1em; color: #555; font-style: italic; margin-top: 0.4em; }
.title-full .autor { margin-top: 2em; font-size: 1.1em; color: #555; }

.dedicatoria p { font-style: italic; color: #555; font-size: 0.95em; }
.epigrafe-text { font-style: italic; font-size: 0.95em; }
.epigrafe-autor { font-size: 0.85em; color: #777; margin-top: 0.5em; }

.toc { page-break-inside: auto; }
.toc h2 { font-size: 1.2em; font-weight: 400; text-transform: uppercase; letter-spacing: 0.15em; text-align: center; margin-bottom: 2em; }
.toc ol { list-style: none; padding: 0; }
.toc li { display: flex; align-items: baseline; margin-bottom: 0.7em; font-size: 0.95em; break-inside: avoid; }
.toc li a { text-decoration: none; color: inherit; white-space: nowrap; }
.toc .toc-dots { flex: 1; border-bottom: 1px dotted #999; margin: 0 0.5em 0.15em; min-width: 1em; }
.toc .toc-pg { color: #555; font-size: 0.88em; min-width: 2em; text-align: right; }

.creditos-wrap { font-size: 0.85em; line-height: 1.6; }

.chapter {
  break-before: right;
  page-break-before: right;
  page: main;
}

.chapter-title {
  ${templateChapterTitleStyle(config.template)}
  text-align: center;
  margin-bottom: 2.5em;
  break-after: avoid;
  page-break-after: avoid;
}

.chapter h3 { font-size: 1.15em; font-weight: 600; margin: 1.5em 0 0.6em; break-after: avoid; }
.chapter h4 { font-size: 1.05em; font-weight: 600; margin: 1.2em 0 0.4em; break-after: avoid; }

p { ${templateParagraphStyle(config.template)} orphans: 3; widows: 3; }
p.first-para { text-indent: 0; }
.dialogo { text-indent: 0; }

.drop-cap {
  float: left;
  font-size: 3.2em;
  line-height: 0.85;
  padding-right: 0.08em;
  padding-top: 0.05em;
  font-weight: 600;
}

blockquote { margin: 1.5em 4em; font-size: 0.9em; font-style: italic; }

.ornamento { text-align: center; color: #888; margin: 1.8em 0; letter-spacing: 0.5em; font-size: 1.1em; }

.author-bio {
  break-before: page;
  page-break-before: always;
  margin-top: 3em;
  padding-top: 2em;
  border-top: 1px solid #ddd;
  font-size: 0.9em;
  color: #444;
}
.author-bio h3 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1em; }
.author-bio p { text-indent: 0; }

${config.template === "poesia" ? `.chapter p { text-align: left; text-indent: 0; }
.poem { margin: 0 auto 2em; max-width: 70%; }
.poem-line { display: block; }
.poem-stanza { margin-bottom: 1.5em; }` : ""}
`;
}

function buildCropMarksCss(bleed: number): string {
  const o = `${bleed}mm`;
  return `
body::before {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  z-index: 9999;
  background-image:
    linear-gradient(#111, #111), linear-gradient(#111, #111),
    linear-gradient(#111, #111), linear-gradient(#111, #111),
    linear-gradient(#111, #111), linear-gradient(#111, #111),
    linear-gradient(#111, #111), linear-gradient(#111, #111);
  background-repeat: no-repeat;
  background-size:
    4mm 0.15mm, 0.15mm 4mm,
    4mm 0.15mm, 0.15mm 4mm,
    4mm 0.15mm, 0.15mm 4mm,
    4mm 0.15mm, 0.15mm 4mm;
  background-position:
    0 ${o},           ${o} 0,
    calc(100% - 4mm) ${o},  calc(100% - ${o}) 0,
    0 calc(100% - ${o}),    ${o} calc(100% - 4mm),
    calc(100% - 4mm) calc(100% - ${o}),  calc(100% - ${o}) calc(100% - 4mm);
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}
`;
}

// ─── Template-specific style fragments ───────────────────────────────────────

function templateImports(t: TemplateId): string {
  const imports: Record<TemplateId, string> = {
    literario:  `@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');`,
    nao_ficcao: `@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,400&display=swap');`,
    abnt:       ``,
    infantil:   `@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap');`,
    poesia:     `@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');`,
    religioso:  `@import url('https://fonts.googleapis.com/css2?family=Gentium+Book+Plus:ital,wght@0,400;0,700;1,400&display=swap');`,
  };
  return imports[t] || "";
}

function templateFontFamily(t: TemplateId): string {
  const fonts: Record<TemplateId, string> = {
    literario:  `'EB Garamond', Georgia, 'Times New Roman', serif`,
    nao_ficcao: `'Source Serif 4', Georgia, serif`,
    abnt:       `'Times New Roman', Times, serif`,
    infantil:   `'Lora', Georgia, serif`,
    poesia:     `'Crimson Text', Georgia, serif`,
    religioso:  `'Gentium Book Plus', Georgia, serif`,
  };
  return fonts[t];
}

function templateLineHeight(t: TemplateId): string {
  const lh: Record<TemplateId, string> = {
    literario: "1.65", nao_ficcao: "1.65", abnt: "1.5",
    infantil: "1.9", poesia: "1.7", religioso: "1.6",
  };
  return lh[t];
}

function templateTitleStyle(t: TemplateId): string {
  const styles: Record<TemplateId, string> = {
    literario:  `font-size: 2.2em; font-weight: 400; text-transform: uppercase; letter-spacing: 0.1em;`,
    nao_ficcao: `font-size: 2.4em; font-weight: 600; line-height: 1.2;`,
    abnt:       `font-size: 1.8em; font-weight: bold;`,
    infantil:   `font-size: 2.5em; font-weight: 600; line-height: 1.2;`,
    poesia:     `font-size: 2em; font-weight: 400; font-style: italic;`,
    religioso:  `font-size: 2em; font-weight: 700;`,
  };
  return styles[t];
}

function templateChapterTitleStyle(t: TemplateId): string {
  const styles: Record<TemplateId, string> = {
    literario:  `font-size: 1.45em; font-weight: 400; text-transform: uppercase; letter-spacing: 0.12em;`,
    nao_ficcao: `font-size: 1.8em; font-weight: 600; line-height: 1.2;`,
    abnt:       `font-size: 1em; font-weight: bold; text-transform: uppercase;`,
    infantil:   `font-size: 1.8em; font-weight: 600;`,
    poesia:     `font-size: 1.2em; font-style: italic; font-weight: 400;`,
    religioso:  `font-size: 1.3em; font-weight: 700;`,
  };
  return styles[t];
}

function templateParagraphStyle(t: TemplateId): string {
  const styles: Record<TemplateId, string> = {
    literario:  `text-indent: 1.5em; text-align: justify;`,
    nao_ficcao: `margin: 0 0 0.8em; text-align: justify;`,
    abnt:       `text-indent: 1.25cm; text-align: justify;`,
    infantil:   `margin: 0 0 1em; text-align: justify;`,
    poesia:     `text-align: left; text-indent: 0; margin: 0 0 1em;`,
    religioso:  `text-indent: 1.2em; text-align: justify;`,
  };
  return styles[t];
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
  const fmt = FORMAT_DIMS[config.formato];

  const textoNormalizado = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const capitulosNorm = capitulos.map(c => {
    const novaPos = textoNormalizado.indexOf(c.titulo);
    return { ...c, pos: novaPos >= 0 ? novaPos : c.pos };
  });

  const segments: { titulo: string; texto: string }[] = [];
  if (capitulosNorm.length === 0) {
    segments.push({ titulo: titulo || "Capítulo 1", texto: textoNormalizado });
  } else {
    for (let i = 0; i < capitulosNorm.length; i++) {
      const start = capitulosNorm[i].pos;
      const end = i < capitulosNorm.length - 1 ? capitulosNorm[i + 1].pos : textoNormalizado.length;
      let segTexto = textoNormalizado.slice(start, end).trim();
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

  // ── Front matter ─────────────────────────────────────────────────────────

  const frontMatterSections: string[] = [];

  frontMatterSections.push(`
<section class="frontmatter center-v title-half">
  <h1>${escHtml(titulo)}</h1>
  ${subtitulo ? `<p class="subtitulo">${escHtml(subtitulo)}</p>` : ""}
</section>`);

  frontMatterSections.push(`<section class="frontmatter" aria-hidden="true"></section>`);

  frontMatterSections.push(`
<section class="frontmatter center-v title-full">
  <h1>${escHtml(titulo)}</h1>
  ${subtitulo ? `<p class="subtitulo">${escHtml(subtitulo)}</p>` : ""}
  <p class="autor">${escHtml(autor)}</p>
</section>`);

  if (creditosInnerHtml?.trim()) {
    frontMatterSections.push(`
<section class="frontmatter">
  <div class="creditos-wrap">${creditosInnerHtml}</div>
</section>`);
  } else {
    frontMatterSections.push(`
<section class="frontmatter bottom-aligned">
  <p style="font-size:0.8em;color:#666;line-height:1.8">
    © ${new Date().getFullYear()} ${escHtml(autor)}<br>
    Todos os direitos reservados.<br>
    Publicado pela plataforma Autoria.
  </p>
</section>`);
  }

  if (config.dedicatoria?.trim()) {
    frontMatterSections.push(`
<section class="frontmatter right-aligned bottom-aligned">
  <p>${escHtml(config.dedicatoria)}</p>
</section>`);
  }

  if (config.epigrafe_texto?.trim()) {
    frontMatterSections.push(`
<section class="frontmatter right-aligned center-v">
  <p class="epigrafe-text">${escHtml(config.epigrafe_texto)}</p>
  ${config.epigrafe_autor ? `<p class="epigrafe-autor">— ${escHtml(config.epigrafe_autor)}</p>` : ""}
</section>`);
  }

  if (config.sumario && segments.length > 1) {
    const showPages = !!chapterStartPagesOverride;
    const tocItems = capitulosInfo.map((c, i) => {
      const pgNum = showPages ? `<span class="toc-pg">${chapterStartPagesOverride![i]}</span>` : `<span class="toc-pg"></span>`;
      return `<li><a href="#${c.id}">${escHtml(c.titulo)}</a><span class="toc-dots"></span>${pgNum}</li>`;
    }).join('\n      ');

    frontMatterSections.push(`
<section class="frontmatter">
  <div class="toc">
    <h2>Sumário</h2>
    <ol>
      ${tocItems}
    </ol>
  </div>
</section>`);
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  const chaptersHtml = segments.map((seg, i) => {
    const info = capitulosInfo[i];
    return `
<section class="chapter" id="${info.id}" data-title="${escHtml(info.titulo)}">
  <h2 class="chapter-title">${escHtml(info.titulo)}</h2>
  ${buildParagraphs(seg.texto, config, true)}
  ${config.ornamentos ? '<div class="ornamento">* * *</div>' : ''}
</section>`;
  }).join('\n');

  // ── Bio ───────────────────────────────────────────────────────────────────

  const bioHtml = config.bio_autor?.trim() ? `
<section class="author-bio">
  <h3>Sobre o autor</h3>
  <p>${escHtml(config.bio_autor)}</p>
</section>` : '';

  // ── Estimativas de paginação ──────────────────────────────────────────────

  const numPalavras = textoNormalizado.split(/\s+/).filter(Boolean).length;
  const paginasReais = Math.max(1, Math.round(numPalavras / fmt.wpp) + frontMatterSections.length);

  const chapterStartPages: number[] = [];
  let runningPage = 1;
  for (const info of capitulosInfo) {
    chapterStartPages.push(runningPage);
    const pagesInChapter = Math.max(1, Math.ceil(info.palavras / fmt.wpp));
    runningPage += pagesInChapter;
    if (runningPage % 2 === 0) runningPage++;
  }

  // ── HTML final ────────────────────────────────────────────────────────────

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${buildCss(config)}
</style>
</head>
<body>
${frontMatterSections.join('\n')}
${chaptersHtml}
${bioHtml}
</body>
</html>`;

  return { html, capitulosInfo, paginasReais, chapterStartPages };
}

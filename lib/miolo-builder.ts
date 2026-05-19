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
  bolso:     { w: "11cm",   h: "18cm",   label: "Bolso (11×18cm)",        wpp: 200 },
  a5:        { w: "14.8cm", h: "21cm",   label: "A5 (14,8×21cm)",         wpp: 230 },
  padrao_br: { w: "16cm",   h: "23cm",   label: "Padrão BR (16×23cm)",     wpp: 260 },
  quadrado:  { w: "20cm",   h: "20cm",   label: "Quadrado (20×20cm)",      wpp: 300 },
  a4:        { w: "21cm",   h: "29.7cm", label: "A4 (21×29,7cm)",          wpp: 380 },
};

// ─── Proportional margins per format ─────────────────────────────────────────

const MARGIN_BY_FORMAT: Record<FormatoId, { top: string; outer: string; bottom: string; inner: string }> = {
  bolso:     { top: "20mm", outer: "14mm", bottom: "22mm", inner: "18mm" },
  a5:        { top: "22mm", outer: "16mm", bottom: "25mm", inner: "20mm" },
  padrao_br: { top: "25mm", outer: "18mm", bottom: "28mm", inner: "22mm" },
  quadrado:  { top: "22mm", outer: "18mm", bottom: "25mm", inner: "22mm" },
  a4:        { top: "30mm", outer: "20mm", bottom: "30mm", inner: "25mm" },
};

type MarginConfig = { top: string; outer: string; bottom: string; inner: string };

// ─── Template CSS ─────────────────────────────────────────────────────────────

const BASE_CSS = (w: string, h: string, corpo: number, fmt: FormatoId): string => {
  const m = MARGIN_BY_FORMAT[fmt];
  return `
@page {
  size: ${w} ${h};
  margin: ${m.top} ${m.outer} ${m.bottom} ${m.inner};
}
@page :left  { margin: ${m.top} ${m.inner} ${m.bottom} ${m.outer}; }
@page :right { margin: ${m.top} ${m.outer} ${m.bottom} ${m.inner}; }

@page main {
  @bottom-center {
    content: counter(page);
    font-size: 9pt;
    color: #555;
  }
}
@page frontmatter { /* sem número de página */ }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: ${corpo}pt; }
body { color: #1a1a1a; }

.frontmatter { page: frontmatter; break-after: page; }
.chapter { page: main; break-before: right; padding-top: 4em; }
.chapter:first-of-type { counter-reset: page 1; }

.title-page { text-align: center; padding-top: 6em; }
.dedicatoria { text-align: right; padding-top: 50%; font-style: italic; }
.epigrafe    { text-align: right; padding-top: 30%; }
.toc h2 { text-align: center; margin-bottom: 2em; }
.toc ol { list-style: none; padding: 0; }
.toc li { display:flex; align-items:baseline; margin-bottom:.6em; }
.toc .toc-dots { flex:1; border-bottom:1px dotted #999; margin:0 .5em .15em; }

.chapter-title {
  font-size: 1.6em;
  font-weight: 400;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: .1em;
  margin-bottom: 2.5em;
  break-after: avoid;
}

p {
  text-align: justify;
  text-indent: 1.2em;
  orphans: 3;
  widows: 3;
  hyphens: auto;
  -webkit-hyphens: auto;
}
p.first-para,
.chapter-title + p { text-indent: 0; }

.dialogo { text-indent: 0; }
.ornamento { text-align: center; margin: 1.5em 0; letter-spacing: .5em; }

.drop-cap {
  float: left;
  font-size: 3.2em;
  line-height: 0.85;
  padding-right: 0.08em;
  padding-top: 0.05em;
  font-weight: 600;
}

.author-bio { margin-top: 3em; padding-top: 2em; border-top: 1px solid #ddd; font-size: 0.9em; color: #444; }
.chapter-number { font-size: .75em; text-transform: uppercase; letter-spacing: .2em; color: #888; display: block; margin-bottom: .4em; }
`;
};

export const TEMPLATE_CSS: Record<TemplateId, (w: string, h: string, corpo: number, fmt: FormatoId) => string> = {
  literario: (w, h, corpo, fmt) => BASE_CSS(w, h, corpo, fmt) + `
@import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');
body { font-family: 'EB Garamond', Georgia, 'Times New Roman', serif; line-height: 1.65; }
.book-title { font-family:'EB Garamond',Georgia,serif; font-size:2.2em; font-weight:400; text-transform:uppercase; letter-spacing:.1em; margin-bottom:.6em; }
.book-subtitle { font-size:1.1em; color:#555; margin-bottom:.5em; font-style:italic; }
.author-name { font-size:1.1em; color:#555; margin-top:2em; }
.chapter { padding-top:4em; }
.chapter-number { color:#bbb; }
.chapter-title { font-size:1.45em; font-weight:400; text-align:center; text-transform:uppercase; letter-spacing:.12em; margin-bottom:2.5em; }
p { text-indent:1.5em; text-align:justify; orphans:2; widows:2; }
p.first-para, .chapter-title+p, h2+p, h3+p { text-indent:0; }
.dialogo { text-indent:0; }
blockquote { margin:1.5em 4em; font-size:.9em; font-style:italic; }
.ornamento { text-align:center; color:#888; margin:1.5em 0; letter-spacing:.5em; font-size:1.1em; }
.toc h2 { font-size:1.2em; text-transform:uppercase; letter-spacing:.15em; font-weight:400; text-align:center; }
`,
  nao_ficcao: (w, h, corpo, fmt) => BASE_CSS(w, h, corpo, fmt) + `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,300;0,400;0,600;1,400&display=swap');
body { font-family:'Source Serif 4',Georgia,serif; line-height:1.65; }
.book-title { font-size:2.4em; font-weight:600; line-height:1.2; margin-bottom:.4em; text-align:left; }
.book-subtitle { font-size:1.15em; color:#555; margin-bottom:.5em; text-align:left; }
.author-name { font-size:1.1em; color:#555; margin-top:2.5em; text-align:left; }
.title-page { align-items:flex-start; }
.chapter { padding-top:3em; }
.chapter-title { font-size:1.8em; font-weight:600; line-height:1.2; margin-bottom:1.5em; }
h3 { font-size:1.2em; font-weight:600; margin:2em 0 .5em; }
h4 { font-size:1.05em; font-weight:600; margin:1.5em 0 .3em; }
p { margin:0 0 .8em; text-align:left; text-indent:0; }
blockquote { margin:1.5em 2em; padding:.8em 1.5em; border-left:3px solid #ddd; font-style:italic; color:#555; }
.box-destaque { background:#f8f8f8; border-radius:4px; padding:.8em 1.2em; margin:1.5em 0; font-size:.95em; }
`,
  abnt: (w, h, corpo, fmt) => BASE_CSS(w, h, corpo, fmt) + `
body { font-family:'Times New Roman',Times,serif; line-height:1.5; }
.book-title { font-size:1.8em; font-weight:bold; text-align:center; }
.author-name { font-size:1em; text-align:center; margin-top:2em; }
.chapter { padding-top:3em; }
.chapter-title { font-size:1em; font-weight:bold; text-transform:uppercase; margin-bottom:1em; }
h3 { font-size:1em; font-weight:bold; margin:1.5em 0 .5em; }
h4 { font-size:1em; font-weight:bold; font-style:italic; margin:1em 0 .3em; }
p { text-indent:1.25cm; text-align:justify; }
p.first-para, h2+p, h3+p, h4+p { text-indent:0; }
blockquote { margin-left:4cm; font-size:.9em; text-indent:0; }
`,
  infantil: (w, h, corpo, fmt) => BASE_CSS(w, h, corpo, fmt) + `
@import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
body { font-family:'Lora',Georgia,serif; line-height:1.9; }
.book-title { font-size:2.5em; font-weight:600; line-height:1.2; margin-bottom:.5em; }
.author-name { font-size:1.2em; color:#555; margin-top:2em; }
.chapter { padding-top:3em; }
.chapter-title { font-size:1.8em; font-weight:600; margin-bottom:1.5em; }
p { margin:0 0 1em; text-indent:0; }
.dialogo { margin:0 0 1em; }
`,
  poesia: (w, h, corpo, fmt) => BASE_CSS(w, h, corpo, fmt) + `
@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
body { font-family:'Crimson Text',Georgia,serif; line-height:1.7; }
.book-title { font-size:2em; font-weight:400; font-style:italic; margin-bottom:.5em; text-align:center; }
.author-name { font-size:1.1em; color:#555; margin-top:2em; text-align:center; }
.chapter { padding-top:3em; }
.chapter-title { font-size:1.2em; font-style:italic; text-align:center; margin-bottom:2em; font-weight:400; }
.poem { margin:0 auto 2em; max-width:70%; }
.poem-line { display:block; }
.poem-stanza { margin-bottom:1.5em; }
p { margin:0 0 1em; text-indent:0; text-align:left; }
`,
  religioso: (w, h, corpo, fmt) => BASE_CSS(w, h, corpo, fmt) + `
@import url('https://fonts.googleapis.com/css2?family=Gentium+Book+Plus:ital,wght@0,400;0,700;1,400&display=swap');
body { font-family:'Gentium Book Plus',Georgia,serif; line-height:1.6; font-size:${corpo}pt; }
.book-title { font-size:2em; font-weight:700; text-align:center; margin-bottom:.5em; }
.author-name { font-size:1em; text-align:center; color:#555; margin-top:1.5em; }
.chapter { padding-top:3em; }
.chapter-title { font-size:1.3em; font-weight:700; text-align:center; margin-bottom:2em; }
p { text-indent:1.2em; text-align:justify; }
p.first-para, h2+p, h3+p { text-indent:0; }
blockquote { margin:1em 2em; font-size:.9em; font-style:italic; }
`,
};

// ─── Crop marks / bleed ───────────────────────────────────────────────────────

export function buildMarksCss(w: string, h: string, m: MarginConfig): string {
  const bleed = 3; // mm
  const addMm = (dim: string, add: number) => {
    const cm = parseFloat(dim);
    return `${(cm * 10 + add * 2).toFixed(1)}mm`;
  };
  const sw = addMm(w, bleed);
  const sh = addMm(h, bleed);

  return `
@page {
  size: ${sw} ${sh};
  margin:
    calc(${m.top} + ${bleed}mm)
    calc(${m.outer} + ${bleed}mm)
    calc(${m.bottom} + ${bleed}mm)
    calc(${m.inner} + ${bleed}mm);
  marks: crop;
}
@page :left {
  margin:
    calc(${m.top} + ${bleed}mm)
    calc(${m.inner} + ${bleed}mm)
    calc(${m.bottom} + ${bleed}mm)
    calc(${m.outer} + ${bleed}mm);
}
@page :right {
  margin:
    calc(${m.top} + ${bleed}mm)
    calc(${m.outer} + ${bleed}mm)
    calc(${m.bottom} + ${bleed}mm)
    calc(${m.inner} + ${bleed}mm);
}
`;
}

// Deprecated — kept for export compatibility, not called internally
export const MARKS_HTML = `<span class="cm cm-h cm-tl-h" aria-hidden="true"></span>
<span class="cm cm-v cm-tl-v" aria-hidden="true"></span>
<span class="cm cm-h cm-tr-h" aria-hidden="true"></span>
<span class="cm cm-v cm-tr-v" aria-hidden="true"></span>
<span class="cm cm-h cm-bl-h" aria-hidden="true"></span>
<span class="cm cm-v cm-bl-v" aria-hidden="true"></span>
<span class="cm cm-h cm-br-h" aria-hidden="true"></span>
<span class="cm cm-v cm-br-v" aria-hidden="true"></span>`;

export function wrapInSpread(pageHtml: string): string {
  return `<div class="spread">\n${MARKS_HTML}\n${pageHtml.trim()}\n</div>`;
}

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
  const clean = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let paras = clean.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

  // Fallback: if no blank-line separation, split by single newlines
  if (paras.length === 1 && clean.includes("\n")) {
    paras = clean.split("\n").map(p => p.trim()).filter(Boolean);
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

    return `<p${isFirst ? ' class="first-para"' : ""}>${escHtml(p)}</p>`;
  }).join("\n");
}

export function buildOrnamented(config: MioloConfig): string {
  if (!config.ornamentos) return "";
  return `<div class="ornamento">* * *</div>`;
}

// Deprecated — kept for export compatibility
export function splitIntoChunks(text: string, wpp: number, firstPageWpp: number): string[] {
  const paras = text.split(/\n{2,}/).filter(p => p.trim());
  if (paras.length === 0) return [""];

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let wordCount = 0;
  let isFirstChunk = true;

  for (const para of paras) {
    const paraWords = para.split(/\s+/).filter(Boolean).length;
    const limit = isFirstChunk ? firstPageWpp : wpp;

    if (wordCount > 0 && wordCount + paraWords > limit) {
      chunks.push(currentChunk.join("\n\n"));
      currentChunk = [];
      wordCount = 0;
      isFirstChunk = false;
    }
    currentChunk.push(para);
    wordCount += paraWords;
  }

  if (currentChunk.length > 0) chunks.push(currentChunk.join("\n\n"));
  return chunks.length > 0 ? chunks : [""];
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
}): { html: string; capitulosInfo: CapituloInfo[]; paginasReais: number; chapterStartPages: number[] } {
  const { titulo, subtitulo, autor, capitulos, config, creditosInnerHtml } = params;

  // Normalizar quebras de linha
  const texto = params.texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const fmt = FORMAT_DIMS[config.formato];
  const m = MARGIN_BY_FORMAT[config.formato];

  let css = TEMPLATE_CSS[config.template](fmt.w, fmt.h, config.corpo_pt, config.formato);
  if (config.marcas_corte) {
    css += buildMarksCss(fmt.w, fmt.h, m);
  }

  // ── Front matter ──────────────────────────────────────────────────────────

  const frontMatter: string[] = [];

  // Half-title
  frontMatter.push(`<section class="frontmatter">
  <div class="title-page">
    <p class="book-title">${escHtml(titulo)}</p>
    ${subtitulo ? `<p class="book-subtitle">${escHtml(subtitulo)}</p>` : ""}
  </div>
</section>`);

  // Folha de rosto
  frontMatter.push(`<section class="frontmatter">
  <div class="title-page">
    <p class="book-title">${escHtml(titulo)}</p>
    ${subtitulo ? `<p class="book-subtitle">${escHtml(subtitulo)}</p>` : ""}
    <p class="author-name">${escHtml(autor)}</p>
  </div>
</section>`);

  // Créditos
  if (creditosInnerHtml) {
    frontMatter.push(`<section class="frontmatter">${creditosInnerHtml}</section>`);
  } else {
    frontMatter.push(`<section class="frontmatter">
  <div style="display:flex;flex-direction:column;justify-content:flex-end;min-height:60vh">
    <p style="font-size:.8em;color:#666;line-height:1.8">
      © ${new Date().getFullYear()} ${escHtml(autor)}<br>
      Todos os direitos reservados.<br>
      Publicado pela plataforma Autoria.
    </p>
  </div>
</section>`);
  }

  // Dedicatória
  if (config.dedicatoria?.trim()) {
    frontMatter.push(`<section class="frontmatter">
  <div class="dedicatoria"><p>${escHtml(config.dedicatoria)}</p></div>
</section>`);
  }

  // Epígrafe
  if (config.epigrafe_texto?.trim()) {
    frontMatter.push(`<section class="frontmatter">
  <div class="epigrafe">
    <p>${escHtml(config.epigrafe_texto)}</p>
    ${config.epigrafe_autor ? `<p class="epigrafe-autor">— ${escHtml(config.epigrafe_autor)}</p>` : ""}
  </div>
</section>`);
  }

  // ── Segmentar capítulos ───────────────────────────────────────────────────

  const segments: { titulo: string; texto: string }[] =
    capitulos.length === 0
      ? [{ titulo: titulo || "Capítulo 1", texto }]
      : capitulos.map((cap, i) => {
          const start = cap.pos;
          const end = i < capitulos.length - 1 ? capitulos[i + 1].pos : texto.length;
          let seg = texto.slice(start, end).trim();
          const nl = seg.indexOf("\n");
          if (nl > -1) seg = seg.slice(nl).trim();
          return { titulo: cap.titulo, texto: seg };
        });

  // ── Sumário ───────────────────────────────────────────────────────────────

  if (config.sumario && segments.length > 1) {
    const tocItems = segments
      .map((s, i) => `<li><a href="#cap-${i}">${escHtml(s.titulo)}</a><span class="toc-dots"></span></li>`)
      .join("\n      ");
    frontMatter.push(`<section class="frontmatter">
  <div class="toc">
    <h2>Sumário</h2>
    <ol>
      ${tocItems}
    </ol>
  </div>
</section>`);
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  const chapterHtml = segments
    .map(
      (seg, i) => `
<section class="chapter" id="cap-${i}">
  <h2 class="chapter-title">${escHtml(seg.titulo)}</h2>
  ${buildParagraphs(seg.texto, config, true)}
  ${buildOrnamented(config)}
</section>`
    )
    .join("\n");

  // ── Bio do autor ──────────────────────────────────────────────────────────

  const bioHtml = config.bio_autor?.trim()
    ? `
<section class="chapter author-bio">
  <h3 style="font-size:1em;text-transform:uppercase;letter-spacing:.1em;margin-bottom:1em">Sobre o autor</h3>
  <p style="text-indent:0">${escHtml(config.bio_autor)}</p>
</section>`
    : "";

  // ── Resultado ─────────────────────────────────────────────────────────────

  const capitulosInfo: CapituloInfo[] = segments.map((s, i) => ({
    id: `cap-${i}`,
    titulo: s.titulo,
    palavras: s.texto.split(/\s+/).filter(Boolean).length,
  }));

  const numPalavras = texto.split(/\s+/).filter(Boolean).length;
  const paginasReais = Math.max(1, Math.round(numPalavras / fmt.wpp) + frontMatter.length);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
${css}
</style>
</head>
<body>
${frontMatter.join("\n")}
${chapterHtml}
${bioHtml}
</body>
</html>`;

  return { html, capitulosInfo, paginasReais, chapterStartPages: [] };
}

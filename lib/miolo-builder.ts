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

// ─── Template CSS ─────────────────────────────────────────────────────────────

const BASE_CSS = (w: string, h: string, corpo: number, fmt: FormatoId): string => {
  const m = MARGIN_BY_FORMAT[fmt];
  return `
@media print {
  html, body { background: #fff !important; }
  .chapter { break-before: right; }
  .book-page { margin: 0 !important; }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: ${corpo}pt; }
body { background: #888; color: #1a1a1a; counter-reset: pagenum 0; }
.book-page {
  width: ${w};
  min-height: ${h};
  margin: 18mm auto;
  padding: ${m.top} ${m.outer} ${m.bottom} ${m.inner};
  position: relative;
  counter-increment: pagenum;
  background: #fff;
}
.book-page.no-num { counter-increment: none; }
.first-chapter { counter-reset: pagenum 0; }
.book-page:not(.no-num)::after {
  content: counter(pagenum);
  position: absolute;
  bottom: 8mm;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.78em;
  color: #555;
  font-family: inherit;
}
.page-break { break-before: always; page-break-before: always; }
.title-page { display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; text-align:center; padding:4em 0; }
.dedicatoria { height:100%; display:flex; align-items:flex-end; justify-content:flex-end; }
.dedicatoria p { font-style:italic; text-align:right; max-width:60%; font-size:0.9em; color:#555; }
.epigrafe { height:100%; display:flex; flex-direction:column; justify-content:center; align-items:flex-end; padding:3em 0; }
.epigrafe .epigrafe-text { font-style:italic; text-align:right; max-width:55%; font-size:0.9em; }
.epigrafe .epigrafe-autor { font-size:0.8em; color:#777; text-align:right; margin-top:0.4em; }
.toc { padding:3em 0; }
.toc h2 { font-size:1.2em; margin-bottom:2em; }
.toc ol { list-style:none; }
.toc ol li { display:flex; align-items:baseline; margin-bottom:0.7em; font-size:0.95em; gap:0.2em; }
.toc ol li a { text-decoration:none; color:inherit; white-space:nowrap; }
.toc ol li .toc-dots { flex:1; border-bottom:1px dotted #999; margin:0 0.5em 0.15em; min-width:1em; }
.toc ol li .toc-pg { color:#555; font-size:0.88em; white-space:nowrap; min-width:2em; text-align:right; }
.chapter-number { font-size:.75em; text-transform:uppercase; letter-spacing:.2em; color:#888; display:block; margin-bottom:.4em; }
.author-bio { margin-top:3em; padding-top:2em; border-top:1px solid #ddd; font-size:0.9em; color:#444; }
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
p { margin:0 0 .8em; text-align:left; }
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
p { margin:0 0 1em; }
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
p { margin:0 0 1em; }
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

export function buildMarksCss(w: string, h: string): string {
  const addCm = (dim: string, add: number) => `${+(parseFloat(dim) + add).toFixed(1)}cm`;
  const sw = addCm(w, 2.4);
  const sh = addCm(h, 2.4);

  return `
/* ── Sangria 12 mm + Marcas de corte ─────────────────────────── */
@media print {
  @page { size: ${sw} ${sh}; }
  .spread { margin: 0 auto !important; break-before: page; page-break-before: always; }
  .spread .book-page { break-before: auto !important; page-break-before: auto !important; }
  .spread .chapter { break-before: auto !important; }
  .cm { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
.spread {
  position: relative;
  display: block;
  width: ${sw};
  height: ${sh};
  margin: 18mm auto;
  background: #fff;
}
.spread .book-page {
  position: absolute !important;
  top: 12mm;
  left: 12mm;
  margin: 0 !important;
  z-index: 1;
}
.cm { position: absolute; background: #111; z-index: 10; }
.cm-h { height: 1px; width: 7mm; }
.cm-v { width:  1px; height: 7mm; }
.cm-tl-h { top: 7mm;    left: 0;    }
.cm-tl-v { top: 0;      left: 7mm;  }
.cm-tr-h { top: 7mm;    right: 0;   }
.cm-tr-v { top: 0;      right: 7mm; }
.cm-bl-h { bottom: 7mm; left: 0;    }
.cm-bl-v { bottom: 0;   left: 7mm;  }
.cm-br-h { bottom: 7mm; right: 0;   }
.cm-br-v { bottom: 0;   right: 7mm; }
`;
}

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
  const paras = text.split(/\n{2,}/).filter(p => p.trim());
  return paras.map((para, idx) => {
    const p = fixTypography(para.trim());
    const isFirst = isFirstInChapter && idx === 0;
    const isDialogue = p.startsWith("—") || p.startsWith("- ");

    if (isDialogue) return `<p class="dialogo">${escHtml(p)}</p>`;

    const classNames = isFirst ? "first-para" : "";

    if (config.capitular && isFirst && p.length > 2) {
      const firstChar = p[0];
      const rest = escHtml(p.slice(1));
      return `<p class="${classNames}"><span style="float:left;font-size:3em;line-height:.8;padding-right:.1em;padding-top:.05em;font-weight:600">${firstChar}</span>${rest}</p>`;
    }

    return `<p${classNames ? ` class="${classNames}"` : ""}>${escHtml(p)}</p>`;
  }).join("\n");
}

export function buildOrnamented(config: MioloConfig): string {
  if (!config.ornamentos) return "";
  return `<div class="ornamento">* * *</div>`;
}

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
  chapterStartPagesOverride?: number[];
}): { html: string; capitulosInfo: CapituloInfo[]; paginasReais: number; chapterStartPages: number[] } {
  const { titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml, chapterStartPagesOverride } = params;
  const fmt = FORMAT_DIMS[config.formato];
  // When crop marks are off, inject the plain @page size rule.
  // When crop marks are on, buildMarksCss owns the @page rule (spread size).
  const pageSizeCss = config.marcas_corte
    ? ""
    : `@media print { @page { size: ${fmt.w} ${fmt.h}; } }\n`;
  const css = TEMPLATE_CSS[config.template](fmt.w, fmt.h, config.corpo_pt, config.formato)
    + pageSizeCss
    + (config.marcas_corte ? buildMarksCss(fmt.w, fmt.h) : "");

  const pg = config.marcas_corte
    ? (html: string) => wrapInSpread(html)
    : (html: string) => html;

  // Split manuscript into chapter segments
  const segments: { titulo: string; texto: string }[] = [];
  if (capitulos.length === 0) {
    segments.push({ titulo: titulo || "Capítulo 1", texto });
  } else {
    for (let i = 0; i < capitulos.length; i++) {
      const start = capitulos[i].pos;
      const end = i < capitulos.length - 1 ? capitulos[i + 1].pos : texto.length;
      let segTexto = texto.slice(start, end).trim();
      const markerEnd = segTexto.indexOf("\n");
      segTexto = markerEnd > -1 ? segTexto.slice(markerEnd).trim() : segTexto;
      segments.push({ titulo: capitulos[i].titulo, texto: segTexto });
    }
  }

  const capitulosInfo: CapituloInfo[] = segments.map((seg, i) => ({
    id: `cap-${i}`,
    titulo: seg.titulo,
    palavras: seg.texto.split(/\s+/).filter(Boolean).length,
  }));

  let pageCount = 0;
  const sections: string[] = [];

  const noNumPage = (inner: string, extraClass = ""): void => {
    pageCount++;
    const cls = ["book-page", "page-break", "no-num", extraClass].filter(Boolean).join(" ");
    sections.push(pg(`<div class="${cls}">${inner}</div>`));
  };

  const blankPage = (): void => {
    pageCount++;
    sections.push(pg(`<div class="book-page page-break no-num blank-page" aria-hidden="true"></div>`));
  };

  const ensureOddPage = (): void => {
    if (pageCount % 2 !== 0) blankPage();
  };

  // 1. Half-title (p.1 — recto)
  noNumPage(`
  <div class="title-page">
    <p class="book-title">${escHtml(titulo)}</p>
    ${subtitulo ? `<p class="book-subtitle">${escHtml(subtitulo)}</p>` : ""}
  </div>`);

  // 2. Verso da falsa folha (p.2 — branco)
  blankPage();

  // 3. Folha de rosto (p.3 — recto)
  noNumPage(`
  <div class="title-page">
    <p class="book-title">${escHtml(titulo)}</p>
    ${subtitulo ? `<p class="book-subtitle">${escHtml(subtitulo)}</p>` : ""}
    <p class="author-name">${escHtml(autor)}</p>
  </div>`);

  // 4. Verso do rosto — créditos (p.4)
  if (creditosInnerHtml) {
    noNumPage(creditosInnerHtml);
  } else {
    noNumPage(`
  <div style="display:flex;flex-direction:column;justify-content:flex-end;min-height:60vh">
    <p style="font-size:.8em;color:#666;line-height:1.8">
      © ${new Date().getFullYear()} ${escHtml(autor)}<br>
      Todos os direitos reservados.<br>
      Publicado pela plataforma Autoria.
    </p>
  </div>`);
  }

  // 5. Dedicatória
  if (config.dedicatoria?.trim()) {
    noNumPage(`
  <div class="dedicatoria">
    <p>${escHtml(config.dedicatoria)}</p>
  </div>`);
  }

  // 6. Epígrafe
  if (config.epigrafe_texto?.trim()) {
    noNumPage(`
  <div class="epigrafe">
    <p class="epigrafe-text">${escHtml(config.epigrafe_texto)}</p>
    ${config.epigrafe_autor ? `<p class="epigrafe-autor">— ${escHtml(config.epigrafe_autor)}</p>` : ""}
  </div>`);
  }

  // 7. Sumário
  if (config.sumario && segments.length > 1) {
    ensureOddPage();

    const chapterStartPages = chapterStartPagesOverride ?? (() => {
      const pages: number[] = [];
      let runningPage = 1;
      for (const info of capitulosInfo) {
        pages.push(runningPage);
        const pagesInChapter = Math.max(1, Math.ceil(info.palavras / fmt.wpp));
        runningPage += pagesInChapter;
        if (runningPage % 2 === 0) runningPage++;
      }
      return pages;
    })();

    const tocItems = capitulosInfo.map((c, i) =>
      `<li><a href="#${c.id}">${escHtml(c.titulo)}</a><span class="toc-dots"></span><span class="toc-pg">${chapterStartPages[i]}</span></li>`
    ).join("\n      ");

    noNumPage(`
  <div class="toc">
    <h2>Sumário</h2>
    <ol>
      ${tocItems}
    </ol>
  </div>`);
  }

  // 8. Chapters
  const realChapterStartPages: number[] = [];
  let numberedPagesSoFar = 0;

  segments.forEach((seg, i) => {
    const info = capitulosInfo[i];
    ensureOddPage();
    realChapterStartPages.push(numberedPagesSoFar + 1);

    const firstPageWpp = Math.floor(fmt.wpp * 0.80);
    const chunks = splitIntoChunks(seg.texto, fmt.wpp, firstPageWpp);

    chunks.forEach((chunkText, chunkIdx) => {
      pageCount++;
      numberedPagesSoFar++;
      const isFirst = chunkIdx === 0;
      const isLast  = chunkIdx === chunks.length - 1;
      const extraClass = (i === 0 && isFirst) ? " first-chapter" : "";

      if (isFirst) {
        sections.push(pg(`
<section class="book-page chapter page-break${extraClass}" id="${info.id}" data-title="${escHtml(info.titulo)}">
  <h2 class="chapter-title">${escHtml(info.titulo)}</h2>
  ${buildParagraphs(chunkText, config, true)}
  ${isLast ? buildOrnamented(config) : ""}
</section>`));
      } else {
        sections.push(pg(`
<div class="book-page page-break">
  ${buildParagraphs(chunkText, config, false)}
  ${isLast ? buildOrnamented(config) : ""}
</div>`));
      }
    });
  });

  // 9. Bio do autor
  if (config.bio_autor?.trim()) {
    pageCount++;
    sections.push(pg(`
<div class="book-page page-break">
  <div class="author-bio">
    <h3 style="font-size:1em;text-transform:uppercase;letter-spacing:.1em;margin-bottom:1em">Sobre o autor</h3>
    <p style="text-indent:0">${escHtml(config.bio_autor)}</p>
  </div>
</div>`));
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${css}
</style>
</head>
<body>
${sections.join("\n")}
</body>
</html>`;

  return { html, capitulosInfo, paginasReais: pageCount, chapterStartPages: realChapterStartPages };
}

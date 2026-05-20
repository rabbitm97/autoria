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
// Templates de prosa narrativa (romance, conto, poesia, infantil) não exibem sumário
// mesmo se o autor marcou sumário=true no config. Sumário só faz sentido em
// não-ficção, acadêmico (ABNT) e religioso.

const TEMPLATES_SEM_SUMARIO: TemplateId[] = ["literario", "poesia", "infantil"];

export function deveExibirSumario(config: MioloConfig): boolean {
  if (TEMPLATES_SEM_SUMARIO.includes(config.template)) return false;
  return config.sumario === true;
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
.page-break { break-before: always; page-break-before: always; }
@media print {
  html, body { background: #fff !important; }
  .book-page {
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
    break-inside: auto;
  }
  .book-page.no-num { break-before: page; }
  .book-page.chapter { break-before: right; }
  .book-page .toc,
  .book-page .ficha-wrap { break-inside: auto; }
}
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
p { margin:0 0 1em; text-align:justify; }
.poem p { text-align:left; }
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
  const addMm = (dim: string, bleedMm: number) => {
    const mm = parseFloat(dim) * (dim.endsWith("cm") ? 10 : 1);
    return `${(mm + bleedMm * 2).toFixed(1)}mm`;
  };
  const sw = addMm(w, 3);
  const sh = addMm(h, 3);

  return `
/* ── Sangria 3 mm + Marcas de corte ──────────────────────────── */
@media print {
  @page {
    size: ${sw} ${sh};
    margin: 0 0 12mm 0;
    @bottom-center {
      content: counter(page);
      font-family: inherit;
      font-size: 9pt;
      color: #555;
      padding-bottom: 4mm;
    }
  }
  @page :first { @bottom-center { content: ""; } }
  .spread {
    margin: 0 !important;
    page-break-after: always;
    min-height: 0 !important;
    height: auto !important;
    break-inside: auto;
  }
  .spread .book-page {
    min-height: 0 !important;
    height: auto !important;
    margin: 0 !important;
  }
  .spread .book-page.toc-page,
  .spread .book-page.creditos-wrap,
  .spread .book-page.chapter {
    break-inside: auto;
  }
  .cm { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}

.spread {
  position: relative;
  display: block;
  width: ${sw};
  min-height: ${sh};
  margin: 18mm auto;
  background: #fff;
}
.spread .book-page {
  position: relative !important;
  margin: 3mm !important;
  width: calc(100% - 6mm) !important;
  min-height: calc(${h} - 6mm);
  z-index: 1;
}
.cm { position: absolute; background: #111; z-index: 10; }
.cm-h { height: 0.4pt; }
.cm-v { width: 0.4pt; }
.cm-tl-h { top: 3mm;    left: 0;    width: 2.5mm; }
.cm-tl-v { top: 0;      left: 3mm;  height: 2.5mm; }
.cm-tr-h { top: 3mm;    right: 0;   width: 2.5mm; }
.cm-tr-v { top: 0;      right: 3mm; height: 2.5mm; }
.cm-bl-h { bottom: 3mm; left: 0;    width: 2.5mm; }
.cm-bl-v { bottom: 0;   left: 3mm;  height: 2.5mm; }
.cm-br-h { bottom: 3mm; right: 0;   width: 2.5mm; }
.cm-br-v { bottom: 0;   right: 3mm; height: 2.5mm; }
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
  return `<div class="spread">
<span class="cm cm-h cm-tl-h" aria-hidden="true"></span>
<span class="cm cm-v cm-tl-v" aria-hidden="true"></span>
<span class="cm cm-h cm-tr-h" aria-hidden="true"></span>
<span class="cm cm-v cm-tr-v" aria-hidden="true"></span>
<span class="cm cm-h cm-bl-h" aria-hidden="true"></span>
<span class="cm cm-v cm-bl-v" aria-hidden="true"></span>
<span class="cm cm-h cm-br-h" aria-hidden="true"></span>
<span class="cm cm-v cm-br-v" aria-hidden="true"></span>
${pageHtml}
</div>`;
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
  console.log("[buildParagraphs] entrada:");
  console.log("  tamanho:", text.length);
  console.log("  primeiros 500 chars:", JSON.stringify(text.slice(0, 500)));
  console.log("  tem \\n\\n?", text.includes('\n\n'));
  console.log("  tem \\r\\n\\r\\n?", text.includes('\r\n\r\n'));
  console.log("  contagem de \\n:", (text.match(/\n/g) || []).length);
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paras = normalized.split(/\n{2,}/).filter(p => p.trim());
  const finalParas = paras.length > 1
    ? paras
    : normalized.split('\n').map(p => p.trim()).filter(Boolean);
  return finalParas.map((para, idx) => {
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
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paras = normalized.split(/\n{2,}/).filter(p => p.trim());
  const finalParas = paras.length > 0 ? paras : normalized.split('\n').filter(p => p.trim());
  if (finalParas.length === 0) return [""];

  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let wordCount = 0;
  let isFirstChunk = true;

  for (const para of finalParas) {
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

  console.log("[buildBookHtml] texto recebido:");
  console.log("  tamanho:", texto.length);
  console.log("  primeiros 500 chars:", JSON.stringify(texto.slice(0, 500)));
  console.log("  capítulos detectados:", params.capitulos.length);
  console.log("  títulos:", params.capitulos.map(c => c.titulo));

  const textoNormalizado = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Recalculate chapter positions against the normalized text so CRLF->LF index shift doesn't desync
  const capitulosNorm = capitulos.map(c => {
    const novaPos = textoNormalizado.indexOf(c.titulo);
    return { ...c, pos: novaPos >= 0 ? novaPos : c.pos };
  });

  // Split manuscript into chapter segments
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
    if (creditosInnerHtml.length < 3000) {
      noNumPage(`<div class="creditos-wrap">${creditosInnerHtml}</div>`);
    } else {
      const parts = creditosInnerHtml.split(/(?=<div\s)/);
      const half = Math.ceil(parts.length / 2);
      noNumPage(`<div class="creditos-wrap">${parts.slice(0, half).join("")}</div>`);
      noNumPage(`<div class="creditos-wrap">${parts.slice(half).join("")}</div>`);
    }
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
  if (deveExibirSumario(config) && segments.length > 1) {
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

    const allTocItems = capitulosInfo.map((c, i) =>
      `<li><a href="#${c.id}">${escHtml(c.titulo)}</a><span class="toc-dots"></span><span class="toc-pg">${chapterStartPages[i]}</span></li>`
    );

    const TOC_PER_PAGE = 28;
    for (let t = 0; t < allTocItems.length; t += TOC_PER_PAGE) {
      const chunk = allTocItems.slice(t, t + TOC_PER_PAGE).join("\n      ");
      pageCount++;
      sections.push(pg(`<div class="book-page page-break no-num">
  <div class="toc">
    ${t === 0 ? "<h2>Sumário</h2>" : ""}
    <ol>
      ${chunk}
    </ol>
  </div>
</div>`));
    }
  }

  // 8. Chapters
  const realChapterStartPages: number[] = [];
  let numberedPagesSoFar = 0;

  segments.forEach((seg, i) => {
    const info = capitulosInfo[i];
    ensureOddPage();
    realChapterStartPages.push(numberedPagesSoFar + 1);

    pageCount++;
    numberedPagesSoFar++;
    const extraClass = (i === 0) ? " first-chapter" : "";

    sections.push(pg(`
<section class="book-page chapter page-break${extraClass}" id="${info.id}" data-title="${escHtml(info.titulo)}">
  <h2 class="chapter-title">${escHtml(info.titulo)}</h2>
  ${buildParagraphs(seg.texto, config, true)}
  ${buildOrnamented(config)}
</section>`));
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

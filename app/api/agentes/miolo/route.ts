export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

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
  marcas_corte: boolean;  // sangria 3 mm + marcas de corte para impressão
}

export interface CapituloInfo {
  id: string;
  titulo: string;
  palavras: number;
}

export interface MioloResult {
  config: MioloConfig;
  html_storage_path: string;
  capitulos: CapituloInfo[];
  paginas_estimadas: number;
  paginas_reais: number;       // counted from actual HTML page breaks
  lombada_mm: number;          // paginas_reais × 0.07 mm (80gsm paper)
  palavras: number;
  gerado_em: string;
}

// ─── Format dimensions (cm) ───────────────────────────────────────────────────

const FORMAT_DIMS: Record<FormatoId, { w: string; h: string; label: string; wpp: number }> = {
  bolso:     { w: "11cm",   h: "18cm",   label: "Bolso (11×18cm)",         wpp: 200 },
  a5:        { w: "14.8cm", h: "21cm",   label: "A5 (14,8×21cm)",          wpp: 230 },
  padrao_br: { w: "16cm",   h: "23cm",   label: "Padrão BR (16×23cm)",      wpp: 260 },
  quadrado:  { w: "20cm",   h: "20cm",   label: "Quadrado (20×20cm)",       wpp: 300 },
  a4:        { w: "21cm",   h: "29.7cm", label: "A4 (21×29,7cm)",           wpp: 380 },
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
  @page { size: ${w} ${h}; }
  html, body { background: #fff !important; }
  .chapter { break-before: right; }
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: ${corpo}pt; }
body { background: #fff; color: #1a1a1a; counter-reset: pagenum 0; }
.book-page {
  width: ${w};
  margin: 0 auto;
  padding: ${m.top} ${m.outer} ${m.bottom} ${m.inner};
  min-height: 100px;
  position: relative;
  counter-increment: pagenum;
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
.title-page { display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:65vh; text-align:center; padding:4em 0; }
.dedicatoria { min-height:35vh; display:flex; align-items:flex-end; justify-content:flex-end; }
.dedicatoria p { font-style:italic; text-align:right; max-width:60%; font-size:0.9em; color:#555; }
.epigrafe { min-height:25vh; display:flex; flex-direction:column; justify-content:center; align-items:flex-end; padding:3em 0; }
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

const TEMPLATE_CSS: Record<TemplateId, (w: string, h: string, corpo: number, fmt: FormatoId) => string> = {
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

/** Returns CSS for 3 mm sangria + crop marks. Injected when config.marcas_corte is true.
 *  @page size is already set by BASE_CSS; this only adds marks/bleed and spread layout. */
function buildMarksCss(w: string): string {
  // Measurements (all absolute):
  //   bleed  = 3 mm  – white bleed area beyond trim
  //   gap    = 2 mm  – silent gap between bleed edge and mark start
  //   mark   = 7 mm  – visible length of each crop line
  //   offset = bleed + gap       = 5 mm (distance from trim to mark start)
  //   total  = bleed + gap + mark = 12 mm (distance from trim to mark end)
  return `
/* ── Sangria 3 mm + Marcas de corte ──────────────────────────── */
@media print {
  @page { marks: crop; bleed: 3mm; }
  .spread { margin: 0 !important; }
  .cm { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
body.with-marks { background: #888; }
.spread {
  position: relative;
  display: block;
  width: ${w};
  margin: 18mm auto;
}
/* Sangria: 3 mm de área branca além do corte */
.spread::before {
  content: '';
  position: absolute;
  inset: -3mm;
  background: #fff;
  z-index: 0;
  pointer-events: none;
}
.spread .book-page { position: relative; z-index: 1; margin: 0 !important; }
/* Linhas de corte */
.cm { position: absolute; background: #111; z-index: 10; }
.cm-h { height: 1px; width: 7mm; }
.cm-v { width:  1px; height: 7mm; }
.cm-tl-h { top: -5mm;  left: -12mm; }
.cm-tl-v { top: -12mm; left: -5mm;  }
.cm-tr-h { top: -5mm;  right: -12mm; }
.cm-tr-v { top: -12mm; right: -5mm;  }
.cm-bl-h { bottom: -5mm;  left: -12mm; }
.cm-bl-v { bottom: -12mm; left: -5mm;  }
.cm-br-h { bottom: -5mm;  right: -12mm; }
.cm-br-v { bottom: -12mm; right: -5mm;  }
`;
}

const MARKS_HTML = `<span class="cm cm-h cm-tl-h" aria-hidden="true"></span>
<span class="cm cm-v cm-tl-v" aria-hidden="true"></span>
<span class="cm cm-h cm-tr-h" aria-hidden="true"></span>
<span class="cm cm-v cm-tr-v" aria-hidden="true"></span>
<span class="cm cm-h cm-bl-h" aria-hidden="true"></span>
<span class="cm cm-v cm-bl-v" aria-hidden="true"></span>
<span class="cm cm-h cm-br-h" aria-hidden="true"></span>
<span class="cm cm-v cm-br-v" aria-hidden="true"></span>`;

function wrapInSpread(pageHtml: string): string {
  return `<div class="spread">\n${MARKS_HTML}\n${pageHtml.trim()}\n</div>`;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fixTypography(text: string): string {
  return text
    .replace(/--/g, "\u2014")
    .replace(/\.\.\./g, "\u2026")
    .replace(/" /g, "\u201C ")
    .replace(/ "/g, " \u201D")
    .replace(/^"/gm, "\u201C")
    .replace(/"$/gm, "\u201D");
}

function buildParagraphs(text: string, config: MioloConfig, isFirstInChapter: boolean): string {
  const paras = text.split(/\n{2,}/).filter(p => p.trim());
  return paras.map((para, idx) => {
    const p = fixTypography(para.trim());
    const isFirst = isFirstInChapter && idx === 0;
    const isDialogue = p.startsWith("—") || p.startsWith("- ");

    if (isDialogue) {
      return `<p class="dialogo">${escHtml(p)}</p>`;
    }

    let classNames = isFirst ? "first-para" : "";

    // Capitular (drop cap) on first paragraph of chapter
    if (config.capitular && isFirst && p.length > 2) {
      const firstChar = p[0];
      const rest = escHtml(p.slice(1));
      return `<p class="${classNames}"><span style="float:left;font-size:3em;line-height:.8;padding-right:.1em;padding-top:.05em;font-weight:600">${firstChar}</span>${rest}</p>`;
    }

    return `<p${classNames ? ` class="${classNames}"` : ""}>${escHtml(p)}</p>`;
  }).join("\n");
}

function buildOrnamented(config: MioloConfig): string {
  if (!config.ornamentos) return "";
  return `<div class="ornamento">* * *</div>`;
}

function buildBookHtml(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  texto: string;
  capitulos: { titulo: string; pos: number }[];
  config: MioloConfig;
  creditosInnerHtml?: string | null;
}): { html: string; capitulosInfo: CapituloInfo[] } {
  const { titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml } = params;
  const fmt = FORMAT_DIMS[config.formato];
  const css = TEMPLATE_CSS[config.template](fmt.w, fmt.h, config.corpo_pt, config.formato)
    + (config.marcas_corte ? buildMarksCss(fmt.w) : "");

  // Wraps a .book-page div in .spread with 8 crop-mark elements when enabled
  const pg = config.marcas_corte
    ? (html: string) => wrapInSpread(html)
    : (html: string) => html;

  // ── Split manuscript into chapter segments ────────────────────────────────────
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

  // ── Page counter — tracks physical front-matter pages for blank-page insertion ─
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

  // After pageCount pages, next page is pageCount+1.
  // For it to be a recto (odd), pageCount must be even.
  const ensureOddPage = (): void => {
    if (pageCount % 2 !== 0) blankPage();
  };

  // ── 1. Falsa folha de rosto / half-title (p.1 — recto) ──────────────────────
  //      Apenas título e subtítulo, sem autor — padrão editorial (ABNT NBR 6029)
  noNumPage(`
  <div class="title-page">
    <p class="book-title">${escHtml(titulo)}</p>
    ${subtitulo ? `<p class="book-subtitle">${escHtml(subtitulo)}</p>` : ""}
  </div>`);

  // ── 2. Verso da falsa folha (p.2 — verso, sempre em branco) ──────────────────
  blankPage();

  // ── 3. Folha de rosto completa (p.3 — recto) ─────────────────────────────────
  //      Título, subtítulo e autor — padrão ABNT NBR 6029
  noNumPage(`
  <div class="title-page">
    <p class="book-title">${escHtml(titulo)}</p>
    ${subtitulo ? `<p class="book-subtitle">${escHtml(subtitulo)}</p>` : ""}
    <p class="author-name">${escHtml(autor)}</p>
  </div>`);

  // ── 4. Verso do rosto — créditos (p.4 — verso) ───────────────────────────────
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

  // ── 5. Dedicatória (follows créditos on p.5, already odd) ────────────────────
  if (config.dedicatoria?.trim()) {
    noNumPage(`
  <div class="dedicatoria">
    <p>${escHtml(config.dedicatoria)}</p>
  </div>`);
  }

  // ── 6. Epígrafe ───────────────────────────────────────────────────────────────
  if (config.epigrafe_texto?.trim()) {
    noNumPage(`
  <div class="epigrafe">
    <p class="epigrafe-text">${escHtml(config.epigrafe_texto)}</p>
    ${config.epigrafe_autor ? `<p class="epigrafe-autor">— ${escHtml(config.epigrafe_autor)}</p>` : ""}
  </div>`);
  }

  // ── 7. Sumário (always starts on odd/recto page) ─────────────────────────────
  if (config.sumario && segments.length > 1) {
    ensureOddPage();

    // Estimate chapter start pages (Arabic 1-indexed, first chapter = 1)
    const chapterStartPages: number[] = [];
    let runningPage = 1;
    for (const info of capitulosInfo) {
      chapterStartPages.push(runningPage);
      const pagesInChapter = Math.max(1, Math.ceil(info.palavras / fmt.wpp));
      runningPage += pagesInChapter;
      if (runningPage % 2 === 0) runningPage++; // next chapter on odd page
    }

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

  // ── 8. Chapters (each starts on odd/recto page) ───────────────────────────────
  segments.forEach((seg, i) => {
    const info = capitulosInfo[i];
    ensureOddPage();

    pageCount++; // count the chapter section
    const extraClass = i === 0 ? " first-chapter" : "";

    sections.push(pg(`
<section class="book-page chapter page-break${extraClass}" id="${info.id}" data-title="${escHtml(info.titulo)}">
  <span class="chapter-number">Capítulo ${i + 1}</span>
  <h2 class="chapter-title">${escHtml(info.titulo)}</h2>
  ${buildParagraphs(seg.texto, config, true)}
  ${buildOrnamented(config)}
</section>`));
  });

  // ── 9. Nota sobre o autor ─────────────────────────────────────────────────────
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

  const bodyClass = config.marcas_corte ? ' class="with-marks"' : "";
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
${css}
</style>
</head>
<body${bodyClass}>
${sections.join("\n")}
</body>
</html>`;

  return { html, capitulosInfo };
}

// ─── Chapter detection (Claude-assisted) ─────────────────────────────────────

const STRUCTURE_PROMPT = `\
Você analisa manuscritos em português brasileiro para detectar capítulos.

Retorne EXCLUSIVAMENTE um array JSON de capítulos encontrados.
Se não houver capítulos claros, retorne [].

Schema:
[{ "titulo": "string — título exato como aparece", "pos": number — posição aproximada de início em chars }]

Padrões de capítulo a detectar:
- "Capítulo 1", "Capítulo I", "CAPÍTULO 1", "Cap. 1"
- "Parte Um", "Parte 1", "PARTE I"
- Números isolados: "1.", "I.", "2."
- Títulos ALL CAPS isolados (< 60 chars, linha própria)
- Nomes de capítulos sem número (ex: "O Despertar") se seguirem padrão consistente`;

async function detectChaptersWithClaude(
  texto: string
): Promise<{ titulo: string; pos: number }[]> {
  // Send first 20k chars — enough to detect the chapter pattern
  const sample = texto.slice(0, 20_000);

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: STRUCTURE_PROMPT,
      messages: [{ role: "user", content: `Detecte os capítulos neste manuscrito:\n\n${sample}` }],
    });
    const chapters = parseLLMJson<{ titulo: string; pos: number }[]>(extractText(msg.content));
    if (!Array.isArray(chapters)) return [];

    // Re-anchor positions to actual text (Claude positions might be approximate)
    return chapters.map(c => {
      const realPos = texto.indexOf(c.titulo);
      return { titulo: c.titulo, pos: realPos >= 0 ? realPos : c.pos };
    }).filter(c => c.pos >= 0);
  } catch {
    return [];
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { project_id: string; config: MioloConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id, config } = body;
  if (!project_id || !config) {
    return NextResponse.json({ error: "Campos obrigatórios: project_id, config." }, { status: 400 });
  }

  // Load project data including credits for injection
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, dados_creditos, manuscripts(titulo, subtitulo, texto, texto_revisado, autor_primeiro_nome, autor_sobrenome, genero_principal)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string; subtitulo?: string; texto?: string; texto_revisado?: string;
    autor_primeiro_nome?: string; autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const subtitulo = ms?.subtitulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  // Prefer revised text if the author approved revisions
  const texto = ms?.texto_revisado ?? ms?.texto ?? "";

  if (!texto || texto.trim().length < 50) {
    return NextResponse.json(
      { error: "Texto do manuscrito não encontrado. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  // Detect chapters
  const capitulos = await detectChaptersWithClaude(texto);

  // Fetch credits HTML from Storage if available
  let creditosInnerHtml: string | null = null;
  const dadosCreditos = project.dados_creditos as { html_storage_path?: string } | null;
  if (dadosCreditos?.html_storage_path) {
    try {
      const storageClientR = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: cFile } = await storageClientR.storage
        .from("manuscripts")
        .download(dadosCreditos.html_storage_path);
      if (cFile) {
        const raw = await cFile.text();
        // Extract just the <body> content to embed inline
        const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        creditosInnerHtml = bodyMatch ? bodyMatch[1].trim() : null;
      }
    } catch {
      // Non-fatal: miolo generates without credits page
    }
  }

  // Build HTML
  const { html, capitulosInfo } = buildBookHtml({
    titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml,
  });

  const numPalavras = texto.split(/\s+/).filter(Boolean).length;
  const paginasEstimadas = Math.max(1, Math.round(numPalavras / FORMAT_DIMS[config.formato].wpp));

  // Count real pages from page-break divs/sections in the generated HTML
  const pageBreakCount = (html.match(/page-break/g) ?? []).length;
  const paginasReais = Math.max(paginasEstimadas, pageBreakCount > 0 ? pageBreakCount : paginasEstimadas);
  const lombadaMm = Math.round(paginasReais * 0.07 * 10) / 10;

  // Upload HTML to storage
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = `${user.id}/miolo_${project_id}.html`;

  const htmlBuffer = Buffer.from(html, "utf-8");
  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, htmlBuffer, {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[miolo] Erro upload:", uploadErr);
    return NextResponse.json({ error: "Erro ao salvar o miolo gerado." }, { status: 500 });
  }

  const mioloResult: MioloResult = {
    config,
    html_storage_path: storagePath,
    capitulos: capitulosInfo,
    paginas_estimadas: paginasEstimadas,
    paginas_reais: paginasReais,
    lombada_mm: lombadaMm,
    palavras: numPalavras,
    gerado_em: new Date().toISOString(),
  };

  // Save to project
  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_miolo: mioloResult, etapa_atual: "diagramacao" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[miolo] Erro ao salvar:", updateErr);
    return NextResponse.json({ error: "Miolo gerado, mas falha ao salvar no banco." }, { status: 500 });
  }

  // Return signed URL for preview (1 hour)
  const { data: signed } = await storageClient.storage
    .from("manuscripts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    ok: true,
    miolo: mioloResult,
    preview_url: signed?.signedUrl ?? null,
    html,
  });
}

// ─── GET — refresh signed URL ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const project_id = request.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project?.dados_miolo) return NextResponse.json(null);

  const miolo = project.dados_miolo as MioloResult;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const [{ data: signed }, { data: htmlBlob }] = await Promise.all([
    storageClient.storage.from("manuscripts").createSignedUrl(miolo.html_storage_path, 3600),
    storageClient.storage.from("manuscripts").download(miolo.html_storage_path),
  ]);

  const html = htmlBlob ? await htmlBlob.text() : null;

  return NextResponse.json({ miolo, preview_url: signed?.signedUrl ?? null, html });
}

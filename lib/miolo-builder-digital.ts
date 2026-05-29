// ─────────────────────────────────────────────────────────────────────────────
// miolo-builder-digital.ts
//
// Versão "digital" do builder de miolo. Idêntica em conteúdo e tipografia ao
// miolo-builder.ts (versão de gráfica), com 2 diferenças:
//
//   1. BLEED_MM = 0 (sem sangria — o PDF tem o tamanho físico exato do livro)
//   2. Marcas de corte SEMPRE desligadas (mesmo se config.marcas_corte === true)
//
// Esta versão atende às exigências de Amazon KDP, Apple Books, Google Play
// Books e Kobo, que rejeitam ou descaracterizam PDFs com sangria/marcas.
//
// IMPORTANTE: este arquivo é cópia adaptada do miolo-builder.ts. Mudanças
// estruturais (novos templates, novos formatos, ajustes tipográficos) devem
// ser feitas em AMBOS os arquivos. Em uma refatoração futura, esses dois
// builders podem ser unificados via flag — por ora estão duplicados para
// isolar risco enquanto o PDF de gráfica estabiliza em produção.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type TemplateId,
  type FormatoId,
  type MioloConfig,
  type CapituloInfo,
  FORMAT_DIMS,
  deveExibirSumario,
  escHtml,
  fixTypography,
} from "./miolo-builder";

// Re-exportar tipos para consumidores
export type { TemplateId, FormatoId, MioloConfig, CapituloInfo };
export { FORMAT_DIMS, deveExibirSumario, escHtml, fixTypography };

// ─── Dimensões e margens físicas (todas em mm) ───────────────────────────────
// IDÊNTICAS ao miolo-builder.ts EXCETO por BLEED_MM = 0.

const BLEED_MM = 0;

interface FormatoSpec {
  w_mm: number;
  h_mm: number;
  top_mm: number;
  outer_mm: number;
  bottom_mm: number;
  inner_mm: number;
  label: string;
  wpp: number;
}

const FORMATO_SPECS: Record<FormatoId, FormatoSpec> = {
  bolso:     { w_mm: 110, h_mm: 180, top_mm: 20, outer_mm: 14, bottom_mm: 22, inner_mm: 18, label: "Bolso (11×18cm)",    wpp: 200 },
  a5:        { w_mm: 148, h_mm: 210, top_mm: 22, outer_mm: 16, bottom_mm: 25, inner_mm: 20, label: "A5 (14,8×21cm)",      wpp: 230 },
  padrao_br: { w_mm: 160, h_mm: 230, top_mm: 25, outer_mm: 18, bottom_mm: 28, inner_mm: 22, label: "Padrão BR (16×23cm)", wpp: 260 },
  quadrado:  { w_mm: 200, h_mm: 200, top_mm: 22, outer_mm: 18, bottom_mm: 25, inner_mm: 22, label: "Quadrado (20×20cm)",  wpp: 300 },
  a4:        { w_mm: 210, h_mm: 297, top_mm: 30, outer_mm: 20, bottom_mm: 30, inner_mm: 25, label: "A4 (21×29,7cm)",      wpp: 380 },
};

// ─── CSS de @page principal (sem sangria, sem marcas) ────────────────────────
// Apenas o @page principal precisa ser redefinido. Os blocos @page no-num e
// @page :first herdam size/margin do @page principal — então não precisam ser
// alterados.

function buildMainPageCss(spec: FormatoSpec): string {
  return `@page {
  size: ${spec.w_mm}mm ${spec.h_mm}mm;
  margin: ${spec.top_mm}mm ${spec.outer_mm}mm ${spec.bottom_mm}mm ${spec.inner_mm}mm;
  @bottom-center {
    content: counter(page);
    font-family: inherit;
    font-size: 9pt;
    color: #555;
    margin-bottom: 12mm;
  }
}`;
}

// ─── Substituir o @page principal do HTML, contando chaves manualmente ──────
// Estratégia robusta a aninhamentos (margin boxes do CSS contam como chaves
// aninhadas dentro do @page principal).

function replaceMainPageBlock(html: string, novoBloco: string): string {
  const idx = html.indexOf("@page {");
  if (idx === -1) return html;
  let depth = 0;
  let i = idx;
  while (i < html.length) {
    const c = html[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return html.substring(0, idx) + novoBloco + html.substring(i + 1);
      }
    }
    i++;
  }
  return html;
}

// ─── A partir daqui, é IDÊNTICO ao miolo-builder.ts ──────────────────────────
// O conteúdo do livro, templates, parágrafos, capítulos, front matter, sumário
// — tudo é gerado pela mesma lógica. Importamos as funções helper do builder
// original para não duplicar código.

import {
  buildBookHtml as buildBookHtmlGrafica,
} from "./miolo-builder";

/**
 * Versão digital do `buildBookHtml`.
 *
 * Sob o capô, chama o builder de gráfica com config modificada
 * (`marcas_corte: false`) e depois substitui o bloco @page do HTML resultante
 * pelo CSS de @page sem sangria.
 *
 * Essa abordagem é um trade-off pragmático: ao invés de duplicar 500 linhas
 * de lógica de geração, reusamos o builder original e fazemos pós-processamento
 * cirúrgico do CSS de @page. Funciona porque @page é um bloco coeso e fácil de
 * identificar via regex no HTML gerado.
 */
export function buildBookHtmlDigital(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  texto: string;
  capitulos: { titulo: string; pos: number }[];
  config: MioloConfig;
  creditosInnerHtml?: string | null;
  chapterStartPagesOverride?: number[];
}): { html: string; capitulosInfo: CapituloInfo[]; paginasReais: number; chapterStartPages: number[] } {
  console.log("[buildBookHtmlDigital] gerando versão digital (sem sangria/marcas)");

  // Forçar marcas_corte: false na config — versão digital nunca tem marcas
  const configDigital: MioloConfig = {
    ...params.config,
    marcas_corte: false,
  };

  // Gerar HTML usando o builder de gráfica com marcas desligadas
  const result = buildBookHtmlGrafica({
    ...params,
    config: configDigital,
  });

  // Substituir apenas o @page principal por uma versão sem sangria e sem marcas.
  // Os blocos @page no-num e @page :first herdam size/margin do @page principal,
  // então não precisam ser tocados.
  const spec = FORMATO_SPECS[params.config.formato];
  const newMainPageCss = buildMainPageCss(spec);
  const htmlComCssDigital = replaceMainPageBlock(result.html, newMainPageCss);

  if (htmlComCssDigital === result.html) {
    console.warn("[buildBookHtmlDigital] AVISO: bloco @page principal não foi encontrado — PDF digital pode ter sangria");
  }

  return {
    ...result,
    html: htmlComCssDigital,
  };
}

/**
 * Aplica CSS de @page digital (sem sangria/marcas) num HTML já gerado pelo
 * builder de gráfica. Usado pela rota gerar-pdf-digital que baixa o HTML
 * armazenado no Storage em vez de regenerar do zero.
 */
export function applyDigitalCss(html: string, formato: FormatoId): string {
  const spec = FORMATO_SPECS[formato];
  const newMainPageCss = buildMainPageCss(spec);
  const result = replaceMainPageBlock(html, newMainPageCss);
  if (result === html) {
    console.warn("[applyDigitalCss] AVISO: bloco @page principal não foi encontrado — PDF digital pode ter sangria");
  }
  return result;
}

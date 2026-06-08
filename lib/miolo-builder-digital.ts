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
  type FormatoLivro,
  type MioloConfig,
  type CapituloInfo,
  deveExibirSumario,
  escHtml,
  fixTypography,
} from "./miolo-builder";
import { type FormatoSpecs, getFormatoDef } from "./formatos";

// Re-exportar tipos para consumidores
export type { TemplateId, FormatoLivro, MioloConfig, CapituloInfo };
export { deveExibirSumario, escHtml, fixTypography };

// ─── CSS de @page principal (sem sangria, sem marcas) ────────────────────────
// Apenas o @page principal precisa ser redefinido. Os blocos @page no-num e
// @page :first herdam size/margin do @page principal — então não precisam ser
// alterados.

function buildMainPageCss(spec: FormatoSpecs): string {
  return `@page {
  size: ${spec.width_mm}mm ${spec.height_mm}mm;
  margin: ${spec.margens.top_mm}mm ${spec.margens.outer_mm}mm ${spec.margens.bottom_mm}mm ${spec.margens.inner_mm}mm;
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
  const spec = getFormatoDef(params.config.formato).specs;
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
export function applyDigitalCss(html: string, formato: FormatoLivro): string {
  const spec = getFormatoDef(formato).specs;
  const newMainPageCss = buildMainPageCss(spec);
  const result = replaceMainPageBlock(html, newMainPageCss);
  if (result === html) {
    console.warn("[applyDigitalCss] AVISO: bloco @page principal não foi encontrado — PDF digital pode ter sangria");
  }
  return result;
}

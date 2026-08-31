// lib/relatorio-diagnostico.ts
// Gerador de HTML para o relatório de diagnóstico avulso (FERR-3.1).
// Puppeteer converte o HTML gerado aqui em PDF via A4.

import type { DiagnosticoResult, DiagnosticoState } from "./project-data";

export interface RelatorioOpts {
  titulo: string;
  modo: "expresso" | "completo";
  estado: DiagnosticoState;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lista(items: string[]): string {
  return items.map(i => `<li>${esc(i)}</li>`).join("\n");
}

function badgePotencial(valor: string): string {
  const cor: Record<string, string> = {
    alto: "#166534",
    médio: "#92400e",
    baixo: "#991b1b",
  };
  const bg: Record<string, string> = {
    alto: "#dcfce7",
    médio: "#fef3c7",
    baixo: "#fee2e2",
  };
  const k = valor.toLowerCase();
  return `<span style="background:${bg[k] ?? "#f4f4f5"};color:${cor[k] ?? "#3f3f46"};padding:2px 10px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">${esc(valor)}</span>`;
}

export function gerarRelatorioHtml(opts: RelatorioOpts): string {
  const { titulo, modo, estado } = opts;
  const r: DiagnosticoResult = estado.resultado!;
  const dataGerado = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const eAmostra = estado.amostra === true;

  const avisoAmostra = eAmostra
    ? `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:11px;color:#713f12">
        <strong>Diagnóstico Expresso:</strong> análise baseada em ${estado.amostra_fragmentos ?? "alguns"} fragmentos
        (de ${estado.total_fragmentos ?? "?"} no total). Para o diagnóstico completo capítulo a capítulo, use o
        <strong>Diagnóstico Completo</strong>.
      </div>`
    : "";

  const canais = r.canais_recomendados;
  const canaisHtml = Object.entries(canais ?? {}).map(([tipo, c]) => {
    const canal = c as { recomendado?: boolean; plataformas?: string[]; descricao?: string; duracao_estimada_horas?: number };
    if (!canal.recomendado) return "";
    const plats = canal.plataformas?.join(", ") ?? "";
    const dur = canal.duracao_estimada_horas ? ` · ~${canal.duracao_estimada_horas}h` : "";
    return `
      <div style="margin-bottom:8px">
        <strong style="text-transform:capitalize">${esc(tipo)}${dur}</strong><br>
        ${plats ? `<span style="font-size:11px;color:#6b7280">${esc(plats)}</span><br>` : ""}
        <span style="font-size:12px;color:#374151">${esc(canal.descricao ?? "")}</span>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  @page {
    size: A4;
    margin: 22mm 25mm 20mm 25mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.6;
    color: #111827;
    background: #fff;
  }
  h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; line-height: 1.2; margin-bottom: 4px; }
  h2 { font-size: 13px; font-weight: 700; color: #1a1a2e; text-transform: uppercase;
       letter-spacing: .06em; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;
       margin-top: 20px; margin-bottom: 10px; }
  ul { padding-left: 18px; }
  li { margin-bottom: 3px; }
  .meta { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
  .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
           color: #6b7280; margin-bottom: 4px; }
  .value { font-size: 13px; font-weight: 600; color: #1a1a2e; }
  .footer { margin-top: 28px; border-top: 1px solid #e5e7eb; padding-top: 10px;
            font-size: 10px; color: #9ca3af; text-align: center; }
</style>
</head>
<body>

<h1>${esc(titulo)}</h1>
<p class="meta">
  Diagnóstico ${modo === "expresso" ? "Expresso" : "Completo"} &nbsp;·&nbsp; Gerado em ${dataGerado} &nbsp;·&nbsp; Autoria
</p>

${avisoAmostra}

<div class="grid2">
  <div class="card">
    <div class="label">Gênero</div>
    <div class="value">${esc(r.genero_provavel ?? "—")}</div>
  </div>
  <div class="card">
    <div class="label">Tom narrativo</div>
    <div class="value">${esc(r.tom_narrativo ?? "—")}</div>
  </div>
  <div class="card">
    <div class="label">Complexidade</div>
    <div class="value">${esc(r.complexidade ?? "—")}</div>
  </div>
  <div class="card">
    <div class="label">Potencial comercial</div>
    <div class="value">${badgePotencial(r.potencial_comercial ?? "médio")}</div>
  </div>
</div>

<h2>Mercado-alvo</h2>
<p>${esc(r.mercado_alvo ?? "")}</p>

<h2>Pontos fortes</h2>
<ul>${lista(r.pontos_fortes ?? [])}</ul>

<h2>Pontos a melhorar</h2>
<ul>${lista(r.pontos_melhorar ?? [])}</ul>

<h2>Precificação sugerida</h2>
<div class="grid2">
  <div class="card">
    <div class="label">eBook</div>
    <div class="value">${esc(r.faixa_preco_detalhada?.ebook ?? r.faixa_preco_sugerida ?? "—")}</div>
  </div>
  <div class="card">
    <div class="label">Físico (POD)</div>
    <div class="value">${esc(r.faixa_preco_detalhada?.fisico ?? "—")}</div>
  </div>
</div>

<h2>Canais recomendados</h2>
${canaisHtml || "<p>—</p>"}

<h2>Títulos comparáveis no mercado</h2>
<ul>${lista(r.comparaveis_mercado ?? [])}</ul>

<h2>Próximos passos</h2>
<ul>${lista(r.proximos_passos ?? [])}</ul>

<div class="footer">
  Gerado pela plataforma Autoria · useautoria.com · Apenas para uso do autor
</div>

</body>
</html>`;
}

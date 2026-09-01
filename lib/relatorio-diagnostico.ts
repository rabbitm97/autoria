// lib/relatorio-diagnostico.ts — renderiza o relatório HTML do diagnóstico avulso.
// Usado pelo concluir/route.ts via Puppeteer → PDF.

import type { DiagnosticoResult } from "./project-data";
import { getFormatoDef, isFormatoValido } from "./formatos";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function secao(titulo: string, conteudo: string): string {
  if (!conteudo?.trim()) return "";
  const paras = conteudo
    .split(/\n+/)
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("\n");
  return `
<section class="section">
  <h2>${esc(titulo)}</h2>
  ${paras}
</section>`;
}

function listaSecao(titulo: string, items: string[] | null | undefined): string {
  if (!items?.length) return "";
  const lis = items.map((i) => `<li>${esc(i)}</li>`).join("\n");
  return `
<section class="section">
  <h2>${esc(titulo)}</h2>
  <ul>${lis}</ul>
</section>`;
}

export interface RelatorioDiagnosticoInput {
  titulo: string;
  autor?: string | null;
  resultado: DiagnosticoResult;
  amostra?: { fragmentos: number; total: number } | null;
  geradoEm: Date;
}

export function renderRelatorioDiagnosticoHtml(input: RelatorioDiagnosticoInput): string {
  const { titulo, autor, resultado, amostra, geradoEm } = input;

  const dataFormatada = geradoEm.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const amostraBanner = amostra
    ? `<div class="amostra-band">AMOSTRA — análise dos primeiros ${amostra.fragmentos} de ${amostra.total} trechos do manuscrito</div>`
    : "";

  const canaisHtml = (() => {
    const c = resultado.canais_recomendados;
    if (!c) return "";
    const items: string[] = [];
    if (c.ebook?.recomendado && c.ebook.plataformas?.length) {
      items.push(`E-book: ${c.ebook.plataformas.join(", ")}`);
    }
    if (c.fisico?.recomendado) items.push("Físico: impressão sob demanda ou tiragem");
    if (c.audiolivro?.recomendado) items.push("Audiolivro: narração profissional");
    return listaSecao("Canais recomendados", items);
  })();

  const precoHtml = (() => {
    const fp = resultado.faixa_preco_detalhada;
    if (!fp) return "";
    const items = [
      fp.ebook ? `E-book: ${fp.ebook}` : "",
      fp.fisico ? `Físico: ${fp.fisico}` : "",
      fp.audiolivro ? `Audiolivro: ${fp.audiolivro}` : "",
    ].filter(Boolean);
    return listaSecao("Faixa de preço sugerida", items);
  })();

  const comparaveisHtml = listaSecao("Comparáveis", resultado.comparaveis_mercado);

  const proximosPassosHtml = listaSecao("Próximos passos", resultado.proximos_passos);

  const formatoSugerido = (() => {
    const fs = resultado.formato_sugerido;
    if (!fs?.formato || !isFormatoValido(fs.formato)) return null;
    const def = getFormatoDef(fs.formato);
    return { label: `${def.label} · ${def.descricao_curta}`, motivo: fs.motivo ?? "" };
  })();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=DM+Mono&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: A4; margin: 18mm 16mm; }

body {
  font-family: 'Fraunces', serif;
  background: #FAF6EF;
  color: #1a1a2e;
  font-size: 11pt;
  line-height: 1.65;
}

.cover {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 18mm 16mm;
  page-break-after: always;
}

.cover-label {
  font-family: 'DM Mono', monospace;
  font-size: 9pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #6b6b7a;
  margin-bottom: 18mm;
}

.cover-titulo {
  font-size: 28pt;
  font-weight: 600;
  line-height: 1.2;
  color: #1a1a2e;
  margin-bottom: 4mm;
}

.cover-autor {
  font-size: 13pt;
  color: #44445a;
  margin-bottom: 10mm;
}

.cover-data {
  font-family: 'DM Mono', monospace;
  font-size: 8pt;
  color: #9999aa;
}

.amostra-band {
  margin-top: 10mm;
  background: #fef3c7;
  color: #92400e;
  font-family: 'DM Mono', monospace;
  font-size: 8.5pt;
  letter-spacing: 0.04em;
  padding: 3mm 4mm;
  border-radius: 2mm;
}

.section {
  margin-bottom: 10mm;
}

.section h2 {
  font-size: 13pt;
  font-weight: 600;
  color: #1a1a2e;
  border-bottom: 0.4mm solid #d4c9b8;
  padding-bottom: 2mm;
  margin-bottom: 4mm;
}

.section p {
  margin-bottom: 3mm;
}

.section ul {
  padding-left: 5mm;
}

.section li {
  margin-bottom: 2mm;
}

.footer {
  margin-top: 12mm;
  padding-top: 4mm;
  border-top: 0.3mm solid #d4c9b8;
  font-size: 8pt;
  color: #9999aa;
  font-family: 'DM Mono', monospace;
}

.visao-geral-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4mm 8mm;
  margin-top: 3mm;
  margin-bottom: 4mm;
}

.visao-item label {
  display: block;
  font-family: 'DM Mono', monospace;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6b6b7a;
  margin-bottom: 0.5mm;
}

.visao-item span {
  font-size: 10.5pt;
  color: #1a1a2e;
}
</style>
</head>
<body>

<div class="cover">
  <p class="cover-label">Diagnóstico editorial · Autoria</p>
  <h1 class="cover-titulo">${esc(titulo)}</h1>
  ${autor ? `<p class="cover-autor">${esc(autor)}</p>` : ""}
  <p class="cover-data">Gerado em ${dataFormatada}</p>
  ${amostraBanner}
</div>

<main>

<section class="section">
  <h2>Visão geral</h2>
  <div class="visao-geral-grid">
    ${resultado.genero_provavel ? `<div class="visao-item"><label>Gênero provável</label><span>${esc(resultado.genero_provavel)}</span></div>` : ""}
    ${resultado.tom_narrativo ? `<div class="visao-item"><label>Tom</label><span>${esc(resultado.tom_narrativo)}</span></div>` : ""}
    ${resultado.mercado_alvo ? `<div class="visao-item"><label>Mercado-alvo</label><span>${esc(resultado.mercado_alvo)}</span></div>` : ""}
    ${resultado.potencial_comercial ? `<div class="visao-item"><label>Potencial comercial</label><span>${esc(resultado.potencial_comercial)}</span></div>` : ""}
    ${resultado.complexidade ? `<div class="visao-item"><label>Complexidade</label><span>${esc(resultado.complexidade)}</span></div>` : ""}
    ${resultado.faixa_preco_sugerida ? `<div class="visao-item"><label>Faixa de preço</label><span>${esc(resultado.faixa_preco_sugerida)}</span></div>` : ""}
    ${formatoSugerido ? `<div class="visao-item"><label>Formato sugerido</label><span>${esc(formatoSugerido.label)}</span></div>` : ""}
  </div>
  ${formatoSugerido?.motivo ? `<p style="margin-top:3mm;font-size:9.5pt;color:#44445a;">${esc(formatoSugerido.motivo)}</p>` : ""}
</section>

${listaSecao("Pontos fortes", resultado.pontos_fortes)}
${listaSecao("Pontos a melhorar", resultado.pontos_melhorar)}
${secao("Mercado", resultado.mercado_alvo)}
${canaisHtml}
${precoHtml}
${comparaveisHtml}
${proximosPassosHtml}

<div class="footer">
  Análise gerada pela IA da Autoria a partir do texto enviado. Aponta tendências, não garantias.
</div>

</main>
</body>
</html>`;
}

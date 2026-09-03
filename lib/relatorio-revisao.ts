// lib/relatorio-revisao.ts — renderiza o relatório HTML da revisão avulsa.
// Usado pela rota /api/ferramentas/revisao-avulsa/concluir via Puppeteer → PDF.
// Segue o mesmo idioma editorial do relatório de diagnóstico (Fraunces,
// Inter, DM Mono, papel FAF6EF, navy 1a1a2e, ouro d4c9b8).

import type { SugestaoRevisao } from "./project-data";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TIPO_LABEL: Record<SugestaoRevisao["tipo"], string> = {
  ortografia: "Ortografia",
  gramatica: "Gramática",
  coesao: "Coesão",
  consistencia: "Consistência",
  ritmo: "Ritmo",
};

const SEVERIDADE_LABEL: Record<SugestaoRevisao["severidade"], string> = {
  critico: "Crítico",
  recomendado: "Recomendado",
  opcional: "Opcional",
};

export interface RelatorioRevisaoInput {
  titulo: string;
  autor?: string | null;
  alteracoes: SugestaoRevisao[];
  aceitas: Set<string>;
  rejeitadas: Set<string>;
  geradoEm: Date;
}

export function renderRelatorioRevisaoHtml(input: RelatorioRevisaoInput): string {
  const { titulo, autor, alteracoes, aceitas, rejeitadas, geradoEm } = input;

  const dataFormatada = geradoEm.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const totalAceitas = aceitas.size;
  const totalRejeitadas = rejeitadas.size;
  const total = alteracoes.length;

  const porCapitulo = new Map<number, SugestaoRevisao[]>();
  for (const a of alteracoes) {
    const cap = a.localizacao?.capitulo ?? 0;
    if (!porCapitulo.has(cap)) porCapitulo.set(cap, []);
    porCapitulo.get(cap)!.push(a);
  }
  const capitulosOrdenados = Array.from(porCapitulo.keys()).sort((a, b) => a - b);

  const listaHtml = capitulosOrdenados
    .map((cap) => {
      const itens = porCapitulo.get(cap)!;
      const cards = itens
        .map((a) => {
          const isAceita = aceitas.has(a.id);
          const isRejeitada = rejeitadas.has(a.id);
          const status = isAceita
            ? { texto: "Aceita", cls: "badge-aceita" }
            : isRejeitada
              ? { texto: "Rejeitada", cls: "badge-rejeitada" }
              : { texto: "Pendente", cls: "badge-pendente" };
          const localizacao = `Parágrafo ${a.localizacao?.paragrafo ?? "?"} · Linha ~${a.localizacao?.linha_aproximada ?? "?"}`;
          return `
<article class="alteracao ${isRejeitada ? "alteracao--fraca" : ""}">
  <header class="alteracao-header">
    <span class="alteracao-tipo">${esc(TIPO_LABEL[a.tipo] ?? a.tipo)}</span>
    <span class="alteracao-sev">${esc(SEVERIDADE_LABEL[a.severidade] ?? a.severidade)}</span>
    <span class="badge ${status.cls}">${status.texto}</span>
  </header>
  <p class="alteracao-loc">${esc(localizacao)}</p>
  <div class="bloco bloco--original">
    <label>Original</label>
    <p>${esc(a.trecho_original)}</p>
  </div>
  <div class="bloco bloco--sugerido">
    <label>Sugerido</label>
    <p>${esc(a.sugestao)}</p>
  </div>
  ${a.explicacao ? `<p class="alteracao-explicacao">${esc(a.explicacao)}</p>` : ""}
</article>`;
        })
        .join("\n");
      return `
<section class="capitulo">
  <h3>Capítulo ${cap || "—"}</h3>
  ${cards}
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;600&family=DM+Mono&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: A4; margin: 18mm 16mm; }

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #FAF6EF;
  color: #1a1a2e;
  font-size: 10.5pt;
  line-height: 1.6;
}

h1, .cover-titulo, .section h2, .capitulo h3 {
  font-family: 'Fraunces', serif;
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

.visao-geral-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4mm 8mm;
  margin-top: 3mm;
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
  font-size: 14pt;
  color: #1a1a2e;
  font-weight: 600;
}

.capitulo {
  margin-top: 8mm;
  page-break-inside: avoid;
}

.capitulo h3 {
  font-size: 12pt;
  font-weight: 600;
  color: #1a1a2e;
  border-bottom: 0.4mm solid #d4c9b8;
  padding-bottom: 2mm;
  margin-bottom: 4mm;
}

.alteracao {
  margin-bottom: 5mm;
  padding: 4mm;
  border: 0.2mm solid #e6dfd1;
  border-radius: 2mm;
  page-break-inside: avoid;
}

.alteracao--fraca {
  opacity: 0.55;
}

.alteracao-header {
  display: flex;
  align-items: center;
  gap: 3mm;
  margin-bottom: 2mm;
}

.alteracao-tipo {
  font-family: 'DM Mono', monospace;
  font-size: 8pt;
  color: #44445a;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.alteracao-sev {
  font-size: 8pt;
  color: #6b6b7a;
}

.badge {
  margin-left: auto;
  font-family: 'DM Mono', monospace;
  font-size: 7.5pt;
  padding: 0.5mm 2mm;
  border-radius: 1mm;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.badge-aceita {
  background: #d1fae5;
  color: #065f46;
}

.badge-rejeitada {
  background: #f3f4f6;
  color: #6b6b7a;
}

.badge-pendente {
  background: #fef3c7;
  color: #92400e;
}

.alteracao-loc {
  font-family: 'DM Mono', monospace;
  font-size: 7.5pt;
  color: #9999aa;
  margin-bottom: 2mm;
}

.bloco {
  margin: 1.5mm 0;
  padding: 2mm 3mm;
  border-radius: 1mm;
  font-size: 10pt;
  line-height: 1.5;
}

.bloco label {
  display: block;
  font-family: 'DM Mono', monospace;
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #6b6b7a;
  margin-bottom: 0.5mm;
}

.bloco--original {
  background: #fdf2f8;
  border-left: 0.5mm solid #f9a8d4;
}

.bloco--sugerido {
  background: #ecfeff;
  border-left: 0.5mm solid #67e8f9;
}

.alteracao-explicacao {
  margin-top: 2mm;
  font-size: 9.5pt;
  color: #44445a;
  font-style: italic;
}

.footer {
  margin-top: 12mm;
  padding-top: 4mm;
  border-top: 0.3mm solid #d4c9b8;
  font-size: 8pt;
  color: #9999aa;
  font-family: 'DM Mono', monospace;
}
</style>
</head>
<body>

<div class="cover">
  <p class="cover-label">Relatório de revisão · Autoria</p>
  <h1 class="cover-titulo">${esc(titulo)}</h1>
  ${autor ? `<p class="cover-autor">${esc(autor)}</p>` : ""}
  <p class="cover-data">Gerado em ${dataFormatada}</p>
</div>

<main>

<section class="section">
  <h2>Visão geral</h2>
  <div class="visao-geral-grid">
    <div class="visao-item"><label>Sugestões</label><span>${total}</span></div>
    <div class="visao-item"><label>Aceitas</label><span>${totalAceitas}</span></div>
    <div class="visao-item"><label>Rejeitadas</label><span>${totalRejeitadas}</span></div>
  </div>
</section>

<section class="section">
  <h2>Alterações por capítulo</h2>
  ${listaHtml || '<p style="color:#6b6b7a;">Nenhuma alteração sugerida.</p>'}
</section>

<div class="footer">
  Revisão gerada pela IA da Autoria. Você decidiu o que aceitar e o que rejeitar; este relatório espelha suas escolhas.
</div>

</main>
</body>
</html>`;
}

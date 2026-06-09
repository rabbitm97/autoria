import type { CreditosConfig } from "@/app/api/agentes/creditos/route";

export interface FichaCatalografica {
  numero_chamada: string;
  entrada_autor: string;
  descricao_bibliografica: string;
  extensao: string;
  isbn_formatado: string;
  assuntos: string[];
  cdd: string;
  cdu: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline style constants — every element is self-styled, zero dependency on external CSS.
const S = {
  wrap: "font-family:'Times New Roman',Times,serif;font-size:9pt;line-height:1.6;color:#1a1a1a;",
  top: "font-size:8.5pt;line-height:1.7;",
  topP: "margin:0 0 0.12em 0;",
  itl: "font-style:italic;",
  fichaWrap: "margin-top:1.2cm;margin-bottom:1.2cm;",
  ficha: "border:0.75pt solid #555;padding:0.7cm 0.9cm;font-size:8pt;line-height:1.6;width:100%;",
  fichaHeader: "text-align:center;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:0.7em;line-height:1.4;",
  fichaP: "margin:0;",
  fichaCdd: "margin:0;text-align:right;",
  publisher: "font-size:8pt;line-height:1.7;padding-top:1cm;",
  publisherP: "margin:0;",
  editoraNome: "margin:0;text-transform:uppercase;font-weight:bold;",
};

/**
 * Self-contained HTML block for the credits page.
 * All styles are inline — no external CSS dependency.
 * Single source of truth for the visual rendering of credits in any context:
 * preview standalone page, miolo injection, EPUB, etc.
 */
export function buildCreditosContentHtml(params: {
  config: CreditosConfig;
  ficha: FichaCatalografica | null;
  titulo: string;
  subtitulo: string;
  autor: string;
}): string {
  const { config, ficha, titulo, subtitulo, autor } = params;

  // ── Top block: copyright + technical team ─────────────────────────────────
  const teamFields: [string, string | undefined][] = [
    ["Título original",         config.titulo_original],
    ["Idioma original",         config.idioma_original],
    ["Tradução",                config.traducao],
    ["Revisão técnica",         config.revisao_tecnica],
    ["Revisão",                 config.revisao],
    ["Preparação de texto",     config.preparacao],
    ["Diagramação",             config.diagramacao],
    ["Projeto gráfico de capa", config.projeto_capa],
    ["Ilustração de capa",      config.ilustracao_capa],
    ["Produção editorial",      config.producao_editorial],
  ];

  const teamHtml = teamFields
    .filter(([, v]) => v?.trim())
    .map(([label, value]) =>
      `<p style="${S.topP}"><span style="${S.itl}">${esc(label)}:</span> ${esc(value!)}</p>`
    ).join("\n    ");

  const outrosHtml = config.outros_creditos?.trim()
    ? config.outros_creditos
        .split("\n")
        .filter(l => l.trim())
        .map(l => `<p style="${S.topP}">${esc(l)}</p>`)
        .join("\n    ")
    : "";

  const topHtml = `<div style="${S.top}">
    <p style="${S.topP}">Copyright &copy; ${config.ano_copyright} ${esc(config.titular_direitos)}</p>
    ${teamHtml}
    ${outrosHtml}
  </div>`;

  // ── Ficha catalográfica ───────────────────────────────────────────────────
  let fichaHtml = "";
  if (config.incluir_ficha) {
    const f = ficha;
    const isbn = config.isbn?.trim() || f?.isbn_formatado || "";
    const assuntos = config.assuntos_livres?.trim()
      ? config.assuntos_livres.split("\n").filter(l => l.trim())
      : (f?.assuntos ?? []);
    const cdd = config.cdd?.trim() || f?.cdd || "";
    const cdu = config.cdu?.trim() || f?.cdu || "";

    const fichaInner = f
      ? `<p style="${S.fichaP}">${esc(f.numero_chamada)}</p>
        <p style="${S.fichaP}">${esc(f.entrada_autor)}</p>
        <p style="${S.fichaP}">${esc(f.descricao_bibliografica)}</p>
        <p style="${S.fichaP}">${esc(f.extensao)}</p>
        <p style="${S.fichaP}">&nbsp;</p>
        ${isbn ? `<p style="${S.fichaP}">${esc(isbn)}</p><p style="${S.fichaP}">&nbsp;</p>` : ""}
        ${assuntos.map(a => `<p style="${S.fichaP}">${esc(a)}</p>`).join("\n        ")}
        ${cdd || cdu ? `<p style="${S.fichaP}">&nbsp;</p>
        <p style="${S.fichaCdd}">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`
      : `<p style="${S.fichaP}">${esc(autor)}</p>
        <p style="${S.fichaP}">${esc(titulo)}${subtitulo ? ` : ${esc(subtitulo)}` : ""}. – ${config.numero_edicao ? esc(config.numero_edicao) + " – " : ""}${esc(config.local_edicao || "São Paulo")} : ${esc(config.nome_editora || "Autoria")}, ${config.ano_edicao || config.ano_copyright}.</p>
        ${isbn ? `<p style="${S.fichaP}">&nbsp;</p><p style="${S.fichaP}">${esc(isbn)}</p>` : ""}
        ${assuntos.length ? `<p style="${S.fichaP}">&nbsp;</p>${assuntos.map(a => `<p style="${S.fichaP}">${esc(a)}</p>`).join("\n        ")}` : ""}
        ${cdd || cdu ? `<p style="${S.fichaP}">&nbsp;</p>
        <p style="${S.fichaCdd}">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`;

    fichaHtml = `<div style="${S.fichaWrap}">
    <div style="${S.ficha}">
      <div style="${S.fichaHeader}">
        CIP-BRASIL. CATALOGAÇÃO-NA-FONTE<br>
        SINDICATO NACIONAL DOS EDITORES DE LIVROS, RJ
      </div>
      <div>
        ${fichaInner}
      </div>
    </div>
  </div>`;
  }

  // ── Publisher block ───────────────────────────────────────────────────────
  const pubLines: string[] = [];
  if (config.ano_edicao || config.ano_copyright) {
    pubLines.push(`<p style="${S.publisherP}">${config.ano_edicao || config.ano_copyright}</p>`);
  }
  if (config.nome_editora?.trim()) {
    pubLines.push(`<p style="${S.publisherP}">Todos os direitos desta edição reservados à</p>`);
    pubLines.push(`<p style="${S.editoraNome}">${esc(config.nome_editora)}</p>`);
  }
  if (config.endereco_editora?.trim()) {
    pubLines.push(`<p style="${S.publisherP}">${esc(config.endereco_editora)}</p>`);
  }
  if (config.cidade_estado?.trim() || config.cep?.trim()) {
    const linha = [config.cep, config.cidade_estado].filter(Boolean).join(" — ");
    pubLines.push(`<p style="${S.publisherP}">${esc(linha)}</p>`);
  }
  if (config.site_editora?.trim()) {
    pubLines.push(`<p style="${S.publisherP}">${esc(config.site_editora)}</p>`);
  }
  if (config.email_editora?.trim()) {
    pubLines.push(`<p style="${S.publisherP}">${esc(config.email_editora)}</p>`);
  }

  const publisherHtml = pubLines.length
    ? `<div style="${S.publisher}">
    ${pubLines.join("\n    ")}
  </div>`
    : "";

  return `<div data-autoria-creditos="v3" style="${S.wrap}">
  ${topHtml}
  ${fichaHtml}
  ${publisherHtml}
</div>`;
}

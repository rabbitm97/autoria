import type { CreditosConfig, FichaOficialCRB } from "@/app/api/agentes/creditos/route";

/**
 * @deprecated Bloco 1f. Mantida apenas para retrocompat com dados_creditos
 * salvos em projetos antigos (antes de 2026-07). Não é mais renderizada.
 * Pode ser removida quando não houver mais projetos legacy em produção.
 */
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

/**
 * Self-contained HTML block for the credits page.
 * Todos os estilos são inline — zero dependência de CSS externo.
 *
 * Bloco 1f: só existe uma variante — com ficha oficial CRB (livrarias)
 * ou sem ficha (digital). O modo pessoal nem chama esta função.
 */
export function buildCreditosContentHtml(params: {
  config: CreditosConfig;
  fichaOficial?: FichaOficialCRB;
  titulo: string;
  subtitulo: string;
  autor: string;
  /** Fonte editorial do template do livro. Default: Times New Roman. */
  bodyFontFamily?: string;
}): string {
  const { config, fichaOficial } = params;
  const bodyFontFamily = params.bodyFontFamily ?? "'Times New Roman',Times,serif";

  const S = {
    wrap: `font-family:${bodyFontFamily};font-size:9pt;line-height:1.6;color:#1a1a1a;`,
    top: "font-size:8.5pt;line-height:1.7;",
    topP: "margin:0 0 0.12em 0;",
    itl: "font-style:italic;",
    fichaWrap: "margin-top:1.2cm;margin-bottom:1.2cm;",
    ficha: "border:0.75pt solid #555;padding:0.7cm 0.9cm;font-size:8pt;line-height:1.6;width:100%;",
    fichaHeader: "text-align:center;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:0.7em;line-height:1.4;",
    fichaFooterOficial: "margin-top:0.7em;padding-top:0.5em;border-top:0.5pt solid #333;font-size:7.5pt;color:#333;text-align:right;line-height:1.5;",
    fichaP: "margin:0;",
    fichaCdd: "margin:0;text-align:right;",
    publisher: "font-size:8pt;line-height:1.7;padding-top:1cm;",
    publisherP: "margin:0;",
    editoraNome: "margin:0;text-transform:uppercase;font-weight:bold;",
  };

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

  // ── Ficha oficial CRB (só quando fichaOficial está presente) ──────────────
  let fichaHtml = "";
  if (fichaOficial) {
    // Ordem ISBD: descrição → notas gerais (área 7) → ISBN (área 8) → assuntos → CDD/CDU
    const assuntosLinhas = fichaOficial.assuntos
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);
    const isbnOficial = config.isbn?.trim() || "";

    const oficialInner = `
        <p style="${S.fichaP}">${esc(fichaOficial.numero_chamada)}</p>
        <p style="${S.fichaP}">${esc(fichaOficial.entrada_autor)}</p>
        <p style="${S.fichaP}">${esc(fichaOficial.descricao_bibliografica)}</p>
        ${fichaOficial.notas_gerais ? `<p style="${S.fichaP}">${esc(fichaOficial.notas_gerais)}</p>` : ""}
        ${isbnOficial ? `<p style="${S.fichaP}">&nbsp;</p><p style="${S.fichaP}">ISBN ${esc(isbnOficial)}</p>` : ""}
        ${assuntosLinhas.length ? `<p style="${S.fichaP}">&nbsp;</p>${assuntosLinhas.map(a => `<p style="${S.fichaP}">${esc(a)}</p>`).join("\n          ")}` : ""}
        <p style="${S.fichaP}">&nbsp;</p>
        <p style="${S.fichaCdd}">CDD: ${esc(fichaOficial.cdd)}<br>CDU: ${esc(fichaOficial.cdu)}</p>`;

    fichaHtml = `<div style="${S.fichaWrap}">
    <div style="${S.ficha}">
      <div style="${S.fichaHeader}">
        CATALOGAÇÃO NA PUBLICAÇÃO
      </div>
      <div>${oficialInner}
      </div>
      <div style="${S.fichaFooterOficial}">
        Ficha catalográfica elaborada por ${esc(fichaOficial.bibliotecario_nome)}<br>
        ${esc(fichaOficial.bibliotecario_crb)}
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

  return `<div data-autoria-creditos="v4" style="${S.wrap}">
  ${topHtml}
  ${fichaHtml}
  ${publisherHtml}
</div>`;
}

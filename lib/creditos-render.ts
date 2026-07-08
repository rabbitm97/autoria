import type { CreditosConfig, FichaOficialCRB } from "@/app/api/agentes/creditos/route";

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
 * All styles are inline — no external CSS dependency.
 * Single source of truth for the visual rendering of credits in any context:
 * preview standalone page, miolo injection, EPUB, etc.
 */
export function buildCreditosContentHtml(params: {
  config: CreditosConfig;
  ficha: FichaCatalografica | null;
  fichaOficial?: FichaOficialCRB;
  titulo: string;
  subtitulo: string;
  autor: string;
  /** Fonte editorial do template do livro. Default: Times New Roman
   *  (retrocompat com preview standalone que não conhece o template). */
  bodyFontFamily?: string;
}): string {
  const { config, ficha, fichaOficial, titulo, subtitulo, autor } = params;
  const bodyFontFamily = params.bodyFontFamily ?? "'Times New Roman',Times,serif";

  // Inline style constants — every element is self-styled, zero dependency on external CSS.
  const S = {
    wrap: `font-family:${bodyFontFamily};font-size:9pt;line-height:1.6;color:#1a1a1a;`,
    top: "font-size:8.5pt;line-height:1.7;",
    topP: "margin:0 0 0.12em 0;",
    itl: "font-style:italic;",
    fichaWrap: "margin-top:1.2cm;margin-bottom:1.2cm;",
    ficha: "border:0.75pt solid #555;padding:0.7cm 0.9cm;font-size:8pt;line-height:1.6;width:100%;",
    fichaHeader: "text-align:center;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:0.7em;line-height:1.4;",
    fichaSubheader: "display:block;font-size:6.5pt;text-transform:none;letter-spacing:0;font-style:italic;color:#666;margin-top:0.3em;",
    fichaFooter: "margin-top:0.7em;padding-top:0.5em;border-top:0.5pt dotted #999;font-size:6.5pt;color:#777;font-style:italic;text-align:justify;line-height:1.5;",
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

  // ── Ficha catalográfica ───────────────────────────────────────────────────
  let fichaHtml = "";
  if (config.incluir_ficha) {
    const isOficial = config.tipo_ficha === "oficial_crb" && fichaOficial;

    if (isOficial && fichaOficial) {
      // ── Modo oficial CRB: campos estruturados + rodapé com bibliotecário ──
      const assuntosLinhas = fichaOficial.assuntos
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);

      const oficialInner = `
          <p style="${S.fichaP}">${esc(fichaOficial.numero_chamada)}</p>
          <p style="${S.fichaP}">${esc(fichaOficial.entrada_autor)}</p>
          <p style="${S.fichaP}">${esc(fichaOficial.descricao_bibliografica)}</p>
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
    } else {
      // ── Modo sugestão IA (pós-1c, comportamento default) ─────────────────
      const f = ficha;
      // ISBN: se autor não forneceu e IA não gerou, mostra placeholder para
      // sinalizar que precisa ser preenchido antes da publicação.
      const isbn = config.isbn?.trim() || f?.isbn_formatado || "ISBN XXX-XX-XXXXX-XX-X";
      const assuntos = config.assuntos_livres?.trim()
        ? config.assuntos_livres.split("\n").filter(l => l.trim())
        : (f?.assuntos ?? []);
      const cdd = config.cdd?.trim() || f?.cdd || "";
      const cdu = config.cdu?.trim() || f?.cdu || "";
      // "Edição do Autor" é a designação da CBL para autopublicação, quando
      // não há editora registrada com selo próprio.
      const editoraLabel = config.nome_editora?.trim() || "Edição do Autor";

      const fichaInner = f
        ? `<p style="${S.fichaP}">${esc(f.numero_chamada)}</p>
          <p style="${S.fichaP}">${esc(f.entrada_autor)}</p>
          <p style="${S.fichaP}">${esc(f.descricao_bibliografica)}</p>
          <p style="${S.fichaP}">${esc(f.extensao)}</p>
          <p style="${S.fichaP}">&nbsp;</p>
          <p style="${S.fichaP}">${esc(isbn)}</p>
          <p style="${S.fichaP}">&nbsp;</p>
          ${assuntos.map(a => `<p style="${S.fichaP}">${esc(a)}</p>`).join("\n        ")}
          ${cdd || cdu ? `<p style="${S.fichaP}">&nbsp;</p>
          <p style="${S.fichaCdd}">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`
        : `<p style="${S.fichaP}">${esc(autor)}</p>
          <p style="${S.fichaP}">${esc(titulo)}${subtitulo ? ` : ${esc(subtitulo)}` : ""}. – ${config.numero_edicao ? esc(config.numero_edicao) + " – " : ""}${esc(config.local_edicao || "São Paulo")} : ${esc(editoraLabel)}, ${config.ano_edicao || config.ano_copyright}.</p>
          <p style="${S.fichaP}">&nbsp;</p>
          <p style="${S.fichaP}">${esc(isbn)}</p>
          ${assuntos.length ? `<p style="${S.fichaP}">&nbsp;</p>${assuntos.map(a => `<p style="${S.fichaP}">${esc(a)}</p>`).join("\n        ")}` : ""}
          ${cdd || cdu ? `<p style="${S.fichaP}">&nbsp;</p>
          <p style="${S.fichaCdd}">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`;

      fichaHtml = `<div style="${S.fichaWrap}">
    <div style="${S.ficha}">
      <div style="${S.fichaHeader}">
        SUGESTÃO DE FICHA CATALOGRÁFICA<br>
        <span style="${S.fichaSubheader}">Gerada automaticamente — não substitui bibliotecário CRB</span>
      </div>
      <div>
        ${fichaInner}
      </div>
      <div style="${S.fichaFooter}">
        Sugestão gerada por inteligência artificial com base nos dados fornecidos pelo autor. Para validade em bibliotecas, editais e prêmios (Lei 10.753/2003 e Resolução CFB 184/2017), a ficha deve ser revisada e assinada por bibliotecário com CRB ativo. Solicite a ficha oficial em cblservicos.org.br.
      </div>
    </div>
  </div>`;
    }
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

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";
import type { CreditosConfig, CreditosFormato } from "@/app/api/agentes/creditos/route";

// ─── Re-export for page use ───────────────────────────────────────────────────

export type { CreditosConfig, CreditosFormato };

// ─── Format dimensions ────────────────────────────────────────────────────────

const FORMATO_DIMS: Record<CreditosFormato, { w: string; h: string }> = {
  bolso:     { w: "11cm",   h: "18cm"   },
  a5:        { w: "14.8cm", h: "21cm"   },
  padrao_br: { w: "16cm",   h: "23cm"   },
  quadrado:  { w: "20cm",   h: "20cm"   },
  a4:        { w: "21cm",   h: "29.7cm" },
};

// ─── Ficha catalográfica via Claude ───────────────────────────────────────────

interface FichaCatalografica {
  numero_chamada: string;
  entrada_autor: string;
  descricao_bibliografica: string;
  extensao: string;
  isbn_formatado: string;
  assuntos: string[];
  cdd: string;
  cdu: string;
}

const FICHA_PROMPT = `\
Você é um catalogador de bibliotecas brasileiro especializado em fichas catalográficas \
seguindo AACR2/RDA e ABNT NBR 6029. Retorne EXCLUSIVAMENTE um objeto JSON com exatamente:
{
  "numero_chamada": "ex: M854i",
  "entrada_autor": "SOBRENOME, Nome, XXXX-",
  "descricao_bibliografica": "Título / Autor. – X. ed. – Local : Editora, Ano.",
  "extensao": "XXXp. : XX × XX cm",
  "isbn_formatado": "ISBN XXX-XX-XXXXX-XX-X ou string vazia",
  "assuntos": ["1. Gênero. I. Título."],
  "cdd": "clasificação CDD (ex: 869.3)",
  "cdu": "classificação CDU (ex: 821.134.3-3)"
}`;

async function gerarFicha(params: {
  titulo: string; autor: string; genero: string;
  paginas: number; ano: number; editora: string;
  local: string; isbn: string; formato: CreditosFormato;
}): Promise<FichaCatalografica | null> {
  const dim = FORMATO_DIMS[params.formato];
  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: FICHA_PROMPT,
      messages: [{
        role: "user",
        content:
          `Título: ${params.titulo}\nAutor: ${params.autor}\nGênero: ${params.genero}\n` +
          `Páginas: ${params.paginas}\nAno: ${params.ano}\nEditora: ${params.editora}\n` +
          `Local: ${params.local}\nISBN: ${params.isbn || "não informado"}\n` +
          `Formato: ${dim.w} × ${dim.h}`,
      }],
    });
    const data = parseLLMJson<FichaCatalografica>(extractText(msg.content));
    return data?.numero_chamada ? data : null;
  } catch {
    return null;
  }
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildCreditosHtml(params: {
  config: CreditosConfig;
  ficha: FichaCatalografica | null;
  titulo: string;
  autor: string;
}): string {
  const { config, ficha, titulo, autor } = params;
  const fmt = FORMATO_DIMS[config.formato];

  const teamFields: [string, string | undefined][] = [
    ["Título original",      config.titulo_original],
    ["Idioma original",      config.idioma_original],
    ["Tradução",             config.traducao],
    ["Revisão técnica",      config.revisao_tecnica],
    ["Revisão",              config.revisao],
    ["Preparação de texto",  config.preparacao],
    ["Diagramação",          config.diagramacao],
    ["Projeto gráfico de capa", config.projeto_capa],
    ["Ilustração de capa",   config.ilustracao_capa],
    ["Produção editorial",   config.producao_editorial],
  ];

  const teamHtml = teamFields
    .filter(([, v]) => v?.trim())
    .map(([l, v]) => `<p><span class="itl">${esc(l)}:</span> ${esc(v!)}</p>`)
    .join("\n    ");

  const outrosHtml = config.outros_creditos?.trim()
    ? config.outros_creditos.split("\n").filter(l => l.trim())
        .map(l => `<p>${esc(l)}</p>`).join("\n    ")
    : "";

  // Ficha block
  let fichaHtml = "";
  if (config.incluir_ficha) {
    const isbn = config.isbn?.trim() || ficha?.isbn_formatado || "";
    const assuntos = config.assuntos_livres?.trim()
      ? config.assuntos_livres.split("\n").filter(l => l.trim())
      : (ficha?.assuntos ?? []);
    const cdd = config.cdd?.trim() || ficha?.cdd || "";
    const cdu = config.cdu?.trim() || ficha?.cdu || "";

    const fichaBody = ficha
      ? `<p>${esc(ficha.numero_chamada)}</p>
        <p>${esc(ficha.entrada_autor)}</p>
        <p>${esc(ficha.descricao_bibliografica)}</p>
        <p>${esc(ficha.extensao)}</p>
        <p>&nbsp;</p>
        ${isbn ? `<p>${esc(isbn)}</p><p>&nbsp;</p>` : ""}
        ${assuntos.map(a => `<p>${esc(a)}</p>`).join("\n        ")}
        ${(cdd || cdu) ? `<p>&nbsp;</p><p class="ficha-cdd">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`
      : `<p>${esc(autor)}</p>
        <p>${esc(titulo)}. – ${config.numero_edicao ? esc(config.numero_edicao) + " – " : ""}${esc(config.local_edicao || "São Paulo")} : ${esc(config.nome_editora || "Autoria")}, ${config.ano_edicao || config.ano_copyright}.</p>
        ${isbn ? `<p>&nbsp;</p><p>${esc(isbn)}</p>` : ""}
        ${assuntos.length ? `<p>&nbsp;</p>${assuntos.map(a => `<p>${esc(a)}</p>`).join("\n        ")}` : ""}
        ${(cdd || cdu) ? `<p>&nbsp;</p><p class="ficha-cdd">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`;

    fichaHtml = `
  <div class="ficha-wrap">
    <div class="ficha">
      <div class="ficha-header">
        CIP-BRASIL. CATALOGAÇÃO-NA-FONTE<br>
        SINDICATO NACIONAL DOS EDITORES DE LIVROS, RJ
      </div>
      <div class="ficha-body">
        ${fichaBody}
      </div>
    </div>
  </div>`;
  }

  // Publisher block
  const pubLines: string[] = [];
  if (config.ano_edicao || config.ano_copyright) {
    pubLines.push(`<p>${config.ano_edicao || config.ano_copyright}</p>`);
  }
  if (config.nome_editora?.trim()) {
    pubLines.push(`<p>Todos os direitos desta edição reservados à</p>`);
    pubLines.push(`<p class="editora-nome">${esc(config.nome_editora)}</p>`);
  }
  if (config.endereco_editora?.trim()) pubLines.push(`<p>${esc(config.endereco_editora)}</p>`);
  const cepCidade = [config.cep, config.cidade_estado].filter(Boolean).join(" — ");
  if (cepCidade) pubLines.push(`<p>${esc(cepCidade)}</p>`);
  if (config.site_editora?.trim())  pubLines.push(`<p>${esc(config.site_editora)}</p>`);
  if (config.email_editora?.trim()) pubLines.push(`<p>${esc(config.email_editora)}</p>`);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #fff; color: #1a1a1a;
  font-family: 'Times New Roman', Times, serif;
  font-size: 9pt; line-height: 1.6;
}
.page {
  width: ${fmt.w}; min-height: ${fmt.h};
  margin: 0 auto;
  padding: 3cm 2.2cm 2.5cm 2.5cm;
  display: flex; flex-direction: column;
}
.top { font-size: 8.5pt; line-height: 1.7; }
.top p { margin-bottom: 0.12em; }
.itl { font-style: italic; }
.ficha-wrap { flex: 1; display: flex; align-items: center; }
.ficha { border: 0.75pt solid #555; padding: 0.7cm 0.9cm; font-size: 8pt; line-height: 1.6; width: 100%; }
.ficha-header { text-align: center; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.02em; margin-bottom: 0.7em; line-height: 1.4; }
.ficha-body p { margin: 0; }
.ficha-cdd { text-align: right; }
.publisher { font-size: 8pt; line-height: 1.7; margin-top: auto; padding-top: 1cm; }
.publisher p { margin: 0; }
.editora-nome { text-transform: uppercase; font-weight: bold; }
@media print { @page { size: ${fmt.w} ${fmt.h}; margin: 0; } }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <p>Copyright &copy; ${config.ano_copyright} ${esc(config.titular_direitos)}</p>
    ${teamHtml}
    ${outrosHtml}
  </div>
  ${fichaHtml}
  ${pubLines.length > 0 ? `<div class="publisher">\n    ${pubLines.join("\n    ")}\n  </div>` : ""}
</div>
</body>
</html>`;
}

// ─── POST /api/ferramentas/creditos ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    config: CreditosConfig;
    titulo?: string;
    autor?: string;
    genero?: string;
    paginas?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { config, titulo = "Meu Livro", autor = "Autor", genero = "Literatura", paginas = 200 } = body;

  if (!config?.titular_direitos?.trim()) {
    return NextResponse.json(
      { error: "Campo 'titular_direitos' obrigatório." },
      { status: 400 }
    );
  }

  let ficha = null;
  if (config.incluir_ficha) {
    ficha = await gerarFicha({
      titulo,
      autor,
      genero,
      paginas,
      ano: config.ano_edicao ?? config.ano_copyright,
      editora: config.nome_editora ?? "Autoria",
      local: config.local_edicao ?? "São Paulo",
      isbn: config.isbn ?? "",
      formato: config.formato,
    });
  }

  const html = buildCreditosHtml({ config, ficha, titulo, autor });

  return NextResponse.json({ ok: true, html, ficha });
}

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreditosFormato = "bolso" | "a5" | "padrao_br" | "quadrado" | "a4";

export interface CreditosConfig {
  formato: CreditosFormato;

  // Direitos autorais
  ano_copyright: number;
  titular_direitos: string;       // Nome do detentor dos direitos

  // Tradução (opcional)
  titulo_original?: string;
  idioma_original?: string;

  // Equipe técnica (todos opcionais)
  traducao?: string;
  revisao_tecnica?: string;
  revisao?: string;
  preparacao?: string;
  diagramacao?: string;
  projeto_capa?: string;
  ilustracao_capa?: string;
  producao_editorial?: string;
  outros_creditos?: string;       // Campo livre para outros créditos

  // Editora
  nome_editora?: string;
  numero_edicao?: string;         // ex: "1ª edição"
  ano_edicao?: number;
  local_edicao?: string;
  endereco_editora?: string;
  cidade_estado?: string;
  cep?: string;
  site_editora?: string;
  email_editora?: string;

  // Ficha catalográfica (CIP-BRASIL)
  incluir_ficha: boolean;
  isbn?: string;
  assuntos_livres?: string;       // ex: "1. Romance brasileiro. 2. Ficção."
  cdd?: string;
  cdu?: string;
}

export interface CreditosResult {
  config: CreditosConfig;
  ficha_catalografica?: FichaCatalografica;
  html_storage_path: string;
  gerado_em: string;
}

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

// ─── Format dimensions ────────────────────────────────────────────────────────

const FORMATO_DIMS: Record<CreditosFormato, { w: string; h: string }> = {
  bolso:     { w: "11cm",   h: "18cm"   },
  a5:        { w: "14.8cm", h: "21cm"   },
  padrao_br: { w: "16cm",   h: "23cm"   },
  quadrado:  { w: "20cm",   h: "20cm"   },
  a4:        { w: "21cm",   h: "29.7cm" },
};

// ─── Claude prompt — ficha catalográfica ─────────────────────────────────────

const FICHA_PROMPT = `\
Você é um catalogador de bibliotecas brasileiro especializado em gerar fichas catalográficas \
seguindo o padrão AACR2/RDA e a norma ABNT NBR 6029. Gere a ficha catalográfica para o livro descrito.

Retorne EXCLUSIVAMENTE um objeto JSON válido com exatamente estes campos:
{
  "numero_chamada": "código de chamada: 1 letra do primeiro assunto + 3 letras iniciais do sobrenome do autor + letra minúscula inicial do título (ex: M854i)",
  "entrada_autor": "SOBRENOME, Nome, XXXX-  (usar ano de nascimento estimado ou deixar apenas traço após o ano)",
  "descricao_bibliografica": "Título completo / Nome Autor. – X. ed. – Local : Editora, Ano.",
  "extensao": "XXXp. : XX × XX cm",
  "isbn_formatado": "ISBN XXX-XX-XXXXX-XX-X  (ou string vazia se não informado)",
  "assuntos": ["1. Gênero/assunto principal. I. Título.", "mais itens se relevante"],
  "cdd": "classificação CDD numérica (ex: 869.3 para romance brasileiro)",
  "cdu": "classificação CDU numérica (ex: 821.134.3-3)"
}`;

async function gerarFichaCatalografica(params: {
  titulo: string;
  autor: string;
  genero: string;
  paginas: number;
  ano: number;
  editora: string;
  local: string;
  isbn: string;
  formato: CreditosFormato;
}): Promise<FichaCatalografica | null> {
  const { titulo, autor, genero, paginas, ano, editora, local, isbn, formato } = params;
  const dim = FORMATO_DIMS[formato];

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: FICHA_PROMPT,
      messages: [{
        role: "user",
        content: `Gere a ficha catalográfica para:\n\nTítulo: ${titulo}\nAutor: ${autor}\nGênero: ${genero}\n` +
          `Páginas estimadas: ${paginas}\nAno: ${ano}\nEditora: ${editora || "Autoria"}\nLocal: ${local || "São Paulo"}\n` +
          `ISBN: ${isbn || "não informado"}\nFormato: ${dim.w} × ${dim.h}`,
      }],
    });
    const raw = extractText(msg.content);
    const data = parseLLMJson<FichaCatalografica>(raw);
    if (!data?.numero_chamada) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildCreditosHtml(params: {
  config: CreditosConfig;
  ficha: FichaCatalografica | null;
  titulo: string;
  autor: string;
}): string {
  const { config, ficha, titulo, autor } = params;
  const fmt = FORMATO_DIMS[config.formato];

  // ── Team lines ────────────────────────────────────────────────────────────
  const teamFields: [string, string | undefined][] = [
    ["Título original",    config.titulo_original],
    ["Idioma original",    config.idioma_original],
    ["Tradução",           config.traducao],
    ["Revisão técnica",    config.revisao_tecnica],
    ["Revisão",            config.revisao],
    ["Preparação de texto",config.preparacao],
    ["Diagramação",        config.diagramacao],
    ["Projeto gráfico de capa", config.projeto_capa],
    ["Ilustração de capa", config.ilustracao_capa],
    ["Produção editorial", config.producao_editorial],
  ];

  const teamHtml = teamFields
    .filter(([, v]) => v?.trim())
    .map(([label, value]) =>
      `<p><span class="itl">${esc(label)}:</span> ${esc(value!)}</p>`
    ).join("\n    ");

  const outrosHtml = config.outros_creditos?.trim()
    ? config.outros_creditos.split("\n")
        .filter(l => l.trim())
        .map(l => `<p>${esc(l)}</p>`)
        .join("\n    ")
    : "";

  // ── Ficha catalográfica block ─────────────────────────────────────────────
  let fichaHtml = "";

  if (config.incluir_ficha) {
    const f = ficha;
    const isbn = config.isbn?.trim() || f?.isbn_formatado || "";
    const assuntos = config.assuntos_livres?.trim()
      ? config.assuntos_livres.split("\n").filter(l => l.trim())
      : (f?.assuntos ?? []);
    const cdd = config.cdd?.trim() || f?.cdd || "";
    const cdu = config.cdu?.trim() || f?.cdu || "";

    fichaHtml = `
  <div class="ficha-wrap">
    <div class="ficha">
      <div class="ficha-header">
        CIP-BRASIL. CATALOGAÇÃO-NA-FONTE<br>
        SINDICATO NACIONAL DOS EDITORES DE LIVROS, RJ
      </div>
      <div class="ficha-body">
        ${f ? `<p>${esc(f.numero_chamada)}</p>
        <p>${esc(f.entrada_autor)}</p>
        <p>${esc(f.descricao_bibliografica)}</p>
        <p>${esc(f.extensao)}</p>
        <p>&nbsp;</p>
        ${isbn ? `<p>${esc(isbn)}</p><p>&nbsp;</p>` : ""}
        ${assuntos.map(a => `<p>${esc(a)}</p>`).join("\n        ")}
        ${(cdd || cdu) ? `<p>&nbsp;</p>
        <p class="ficha-cdd">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}` :
        // Fallback when Claude didn't generate ficha
        `<p>${esc(autor)}</p>
        <p>${esc(titulo)}. – ${config.numero_edicao ? esc(config.numero_edicao) + " – " : ""}${esc(config.local_edicao || "São Paulo")} : ${esc(config.nome_editora || "Autoria")}, ${config.ano_edicao || config.ano_copyright}.</p>
        ${isbn ? `<p>&nbsp;</p><p>${esc(isbn)}</p>` : ""}
        ${assuntos.length ? `<p>&nbsp;</p>${assuntos.map(a => `<p>${esc(a)}</p>`).join("\n        ")}` : ""}
        ${(cdd || cdu) ? `<p>&nbsp;</p>
        <p class="ficha-cdd">${cdd ? `CDD: ${esc(cdd)}` : ""}${cdd && cdu ? "<br>" : ""}${cdu ? `CDU: ${esc(cdu)}` : ""}</p>` : ""}`}
      </div>
    </div>
  </div>`;
  }

  // ── Publisher block ───────────────────────────────────────────────────────
  const pubLines: string[] = [];
  if (config.ano_edicao || config.ano_copyright) {
    pubLines.push(`<p>${config.ano_edicao || config.ano_copyright}</p>`);
  }
  if (config.nome_editora?.trim()) {
    pubLines.push(`<p>Todos os direitos desta edição reservados à</p>`);
    pubLines.push(`<p class="editora-nome">${esc(config.nome_editora)}</p>`);
  }
  if (config.endereco_editora?.trim()) pubLines.push(`<p>${esc(config.endereco_editora)}</p>`);
  if (config.cidade_estado?.trim() || config.cep?.trim()) {
    const linha = [config.cep, config.cidade_estado].filter(Boolean).join(" — ");
    pubLines.push(`<p>${esc(linha)}</p>`);
  }
  if (config.site_editora?.trim()) pubLines.push(`<p>${esc(config.site_editora)}</p>`);
  if (config.email_editora?.trim()) pubLines.push(`<p>${esc(config.email_editora)}</p>`);

  const pubHtml = pubLines.join("\n    ");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: #fff;
  color: #1a1a1a;
  font-family: 'Times New Roman', Times, serif;
  font-size: 9pt;
  line-height: 1.6;
}
.page {
  width: ${fmt.w};
  min-height: ${fmt.h};
  margin: 0 auto;
  padding: 3cm 2.2cm 2.5cm 2.5cm;
  display: flex;
  flex-direction: column;
}
.top { font-size: 8.5pt; line-height: 1.7; }
.top p { margin-bottom: 0.12em; }
.itl { font-style: italic; }
.ficha-wrap { flex: 1; display: flex; align-items: center; }
.ficha {
  border: 0.75pt solid #555;
  padding: 0.7cm 0.9cm;
  font-size: 8pt;
  line-height: 1.6;
  width: 100%;
}
.ficha-header {
  text-align: center;
  font-size: 7.5pt;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  margin-bottom: 0.7em;
  line-height: 1.4;
}
.ficha-body p { margin: 0; }
.ficha-cdd { text-align: right; }
.publisher { font-size: 8pt; line-height: 1.7; margin-top: auto; padding-top: 1cm; }
.publisher p { margin: 0; }
.editora-nome { text-transform: uppercase; font-weight: bold; }
@media print {
  @page { size: ${fmt.w} ${fmt.h}; margin: 0; }
  body { background: #fff; }
}
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

  ${pubLines.length > 0 ? `<div class="publisher">\n    ${pubHtml}\n  </div>` : ""}

</div>
</body>
</html>`;
}

// ─── POST — generate credits page ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { project_id: string; config: CreditosConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id, config } = body;
  if (!project_id || !config) {
    return NextResponse.json(
      { error: "Campos obrigatórios: project_id, config." },
      { status: 400 }
    );
  }

  // Load project data
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome, genero_principal)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const genero = ms?.genero_principal ?? "Literatura";

  // Estimate pages from miolo data if available
  const mioloData = project.dados_miolo as { paginas_estimadas?: number } | null;
  const paginas = mioloData?.paginas_estimadas ?? 200;

  // Generate ficha catalográfica via Claude if requested
  let ficha: FichaCatalografica | null = null;
  if (config.incluir_ficha) {
    ficha = await gerarFichaCatalografica({
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

  // Build HTML
  const html = buildCreditosHtml({ config, ficha, titulo, autor });

  // Upload to storage
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = `${user.id}/creditos_${project_id}.html`;

  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, Buffer.from(html, "utf-8"), {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[creditos] Erro upload:", uploadErr);
    return NextResponse.json({ error: "Erro ao salvar a página de créditos." }, { status: 500 });
  }

  const result: CreditosResult = {
    config,
    ficha_catalografica: ficha ?? undefined,
    html_storage_path: storagePath,
    gerado_em: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_creditos: result, etapa_atual: "creditos" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[creditos] Erro ao salvar:", updateErr);
    return NextResponse.json(
      { error: "Página gerada, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  const { data: signed } = await storageClient.storage
    .from("manuscripts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({ ok: true, creditos: result, preview_url: signed?.signedUrl ?? null, html });
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
    .select("dados_creditos")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project?.dados_creditos) return NextResponse.json(null);

  const creditos = project.dados_creditos as CreditosResult;
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const [{ data: signed }, { data: htmlBlob }] = await Promise.all([
    storageClient.storage.from("manuscripts").createSignedUrl(creditos.html_storage_path, 3600),
    storageClient.storage.from("manuscripts").download(creditos.html_storage_path),
  ]);

  const html = htmlBlob ? await htmlBlob.text() : null;

  return NextResponse.json({ creditos, preview_url: signed?.signedUrl ?? null, html });
}

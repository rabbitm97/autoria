export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText, traceClaudeCall } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";
import { createClient } from "@supabase/supabase-js";
import { type FormatoLivro, getFormatoDef, isFormatoValido, estimarPaginas } from "@/lib/formatos";
import { calcularCreditosInputHash } from "@/lib/creditos-hash";
import { buildCreditosContentHtml, type FichaCatalografica } from "@/lib/creditos-render";
import { getBodyFontFamily, type TemplateId } from "@/lib/miolo-builder";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreditosConfig {
  formato: FormatoLivro;

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
  input_hash: string;
  paginas_usadas: number;
  paginas_origem: "real" | "estimada";
  gerado_em: string;
}

// ─── Claude prompt — ficha catalográfica ─────────────────────────────────────

const FALLBACK_PROMPT = `\
Você é um catalogador de bibliotecas brasileiro especializado em gerar fichas catalográficas \
seguindo o padrão AACR2/RDA e a norma ABNT NBR 6029. Gere a ficha catalográfica para o livro descrito.

Se houver subtítulo, incluí-lo na descrição bibliográfica no padrão "Título principal : Subtítulo / Autor."

Retorne EXCLUSIVAMENTE um objeto JSON válido com exatamente estes campos:
{
  "numero_chamada": "código de chamada: 1 letra do primeiro assunto + 3 letras iniciais do sobrenome do autor + letra minúscula inicial do título (ex: M854i)",
  "entrada_autor": "SOBRENOME, Nome, XXXX-  (usar ano de nascimento estimado ou deixar apenas traço após o ano)",
  "descricao_bibliografica": "Título principal : Subtítulo / Nome Autor. – X. ed. – Local : Editora, Ano. (Se não houver subtítulo, omitir ' : Subtítulo')",
  "extensao": "XXXp. : XX × XX cm",
  "isbn_formatado": "ISBN XXX-XX-XXXXX-XX-X  (ou string vazia se não informado)",
  "assuntos": ["1. Gênero/assunto principal. I. Título.", "mais itens se relevante"],
  "cdd": "classificação CDD numérica (ex: 869.3 para romance brasileiro)",
  "cdu": "classificação CDU numérica (ex: 821.134.3-3)"
}`;

async function gerarFichaCatalografica(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  paginas: number;
  ano: number;
  editora: string;
  local: string;
  isbn: string;
  formato: FormatoLivro;
  context?: { userId?: string; projectId?: string };
}): Promise<FichaCatalografica | null> {
  const { titulo, subtitulo, autor, genero, paginas, ano, editora, local, isbn, formato, context } = params;
  const { width_cm, height_cm } = getFormatoDef(formato).specs;
  const dim = { w: `${width_cm}cm`, h: `${height_cm}cm` };
  const FICHA_PROMPT = await getAgentPrompt("creditos", FALLBACK_PROMPT);

  try {
    const fichaUserContent = `Gere a ficha catalográfica para:\n\nTítulo: ${titulo}\n` +
      (subtitulo ? `Subtítulo: ${subtitulo}\n` : "") +
      `Autor: ${autor}\nGênero: ${genero}\n` +
      `Páginas: ${paginas}\nAno: ${ano}\nEditora: ${editora || "Autoria"}\nLocal: ${local || "São Paulo"}\n` +
      `ISBN: ${isbn || "não informado"}\nFormato: ${dim.w} × ${dim.h}`;
    const msg = await traceClaudeCall({
      agentName: "creditos",
      projectId: context?.projectId,
      userId: context?.userId,
      model: "claude-sonnet-4-6",
      input: { system: FICHA_PROMPT, messages: [{ role: "user", content: fichaUserContent }] },
      fn: () => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: FICHA_PROMPT,
        messages: [{ role: "user", content: fichaUserContent }],
      }),
    });
    const raw = extractText(msg.content);
    const data = parseLLMJson<FichaCatalografica>(raw);
    if (!data?.numero_chamada) return null;
    return data;
  } catch (err) {
    console.error("[creditos] gerarFichaCatalografica falhou:", err);
    return null;
  }
}

// ─── HTML builder — standalone preview/download envelope ─────────────────────

function buildCreditosStandaloneHtml(params: {
  config: CreditosConfig;
  ficha: FichaCatalografica | null;
  titulo: string;
  subtitulo: string;
  autor: string;
  bodyFontFamily?: string;
}): string {
  const content = buildCreditosContentHtml(params);
  const { width_cm, height_cm } = getFormatoDef(params.config.formato).specs;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; }
.page { width: ${width_cm}cm; min-height: ${height_cm}cm; margin: 0 auto; padding: 3cm 2.2cm 2.5cm 2.5cm; display: flex; flex-direction: column; }
@media print { @page { size: ${width_cm}cm ${height_cm}cm; margin: 0; } body { background: #fff; } }
</style>
</head>
<body>
<div class="page">
${content}
</div>
</body>
</html>`;
}

// ─── POST — generate credits page ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
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

  if (typeof config.ano_copyright !== "number" || !Number.isFinite(config.ano_copyright)) {
    return NextResponse.json(
      { error: "Campo obrigatório: ano_copyright (número)." },
      { status: 400 }
    );
  }

  if (!config.titular_direitos || typeof config.titular_direitos !== "string" || !config.titular_direitos.trim()) {
    return NextResponse.json(
      { error: "Campo obrigatório: titular_direitos (texto não vazio)." },
      { status: 400 }
    );
  }

  if (typeof config.incluir_ficha !== "boolean") {
    return NextResponse.json(
      { error: "Campo obrigatório: incluir_ficha (booleano)." },
      { status: 400 }
    );
  }

  // Load project data
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, formato, dados_elementos, dados_miolo, manuscripts(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, genero_principal, texto, texto_revisado)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // Resolve canonical format from project — ignore body's config.formato silently
  const formatoDb = (project as unknown as { formato?: string }).formato;
  if (!formatoDb || !isFormatoValido(formatoDb)) {
    return NextResponse.json(
      {
        error: "Formato do projeto não definido. Configure o formato antes de gerar a página de créditos.",
        action: "set_format",
      },
      { status: 422 }
    );
  }
  const configResolved: CreditosConfig = { ...config, formato: formatoDb as FormatoLivro };

  // Páginas: preferir reais (do miolo já gerado), cair para estimadas, ou estimar do texto.
  const mioloData = project.dados_miolo as {
    paginas_reais?: number;
    paginas_estimadas?: number;
    config?: { template?: TemplateId };
  } | null;
  let paginasParaFicha = mioloData?.paginas_reais ?? mioloData?.paginas_estimadas ?? 0;
  let paginasOrigem: "real" | "estimada" = mioloData?.paginas_reais ? "real" : "estimada";

  if (paginasParaFicha < 1) {
    const msText = project.manuscripts as unknown as { texto_revisado?: string; texto?: string } | null;
    const textoFull = msText?.texto_revisado ?? msText?.texto ?? "";
    const numCaracteres = textoFull.length;
    const spec = getFormatoDef(configResolved.formato).specs;
    // Sem corpoPt no CreditosConfig: assume base do formato.
    paginasParaFicha = estimarPaginas(spec, undefined, numCaracteres);
    paginasOrigem = "estimada";
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  // Cascata: escolha em Elementos > original do manuscrito > fallback.
  // Autor pode ter refinado o título em Elementos Editoriais — a ficha
  // catalográfica e a página de copyright precisam refletir a decisão
  // final dele.
  const el = project.dados_elementos as { titulo_escolhido?: string; subtitulo?: string } | null;
  const titulo = el?.titulo_escolhido ?? ms?.titulo ?? "Sem título";
  const subtitulo = el?.subtitulo ?? ms?.subtitulo?.trim() ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const genero = ms?.genero_principal ?? "Literatura";

  // Generate ficha catalográfica via Claude if requested
  let ficha: FichaCatalografica | null = null;
  if (configResolved.incluir_ficha) {
    ficha = await gerarFichaCatalografica({
      titulo,
      subtitulo,
      autor,
      genero,
      paginas: paginasParaFicha,
      ano: configResolved.ano_edicao ?? configResolved.ano_copyright,
      editora: configResolved.nome_editora ?? "Autoria",
      local: configResolved.local_edicao ?? "São Paulo",
      isbn: configResolved.isbn ?? "",
      formato: configResolved.formato,
      context: { userId: user.id, projectId: project_id },
    });
  }

  // Build HTML — passa a fonte editorial do template do miolo (se disponível)
  // para os créditos ficarem tipograficamente coerentes com o resto do livro.
  const template = mioloData?.config?.template;
  const bodyFontFamily = template ? getBodyFontFamily(template) : undefined;
  const html = buildCreditosStandaloneHtml({ config: configResolved, ficha, titulo, subtitulo, autor, bodyFontFamily });

  const inputHash = calcularCreditosInputHash({
    titulo,
    subtitulo,
    autor,
    genero,
    paginas: paginasParaFicha,
    formato: configResolved.formato,
    ano_copyright: configResolved.ano_copyright,
    ano_edicao: configResolved.ano_edicao ?? null,
    isbn: (configResolved.isbn ?? "").trim(),
    incluir_ficha: configResolved.incluir_ficha,
    titular_direitos: configResolved.titular_direitos,
    nome_editora: configResolved.nome_editora ?? "",
  });

  // Upload to storage
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = `${user.id}/creditos_${project_id}.html`;

  const buffer = Buffer.from(html, "utf-8");
  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, buffer, {
      contentType: "text/html",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[creditos] Erro upload — contexto completo:", {
      storagePath,
      contentType: "text/html",
      bufferBytes: buffer.length,
      bufferKB: Math.round(buffer.length / 1024),
      errorName: uploadErr.name,
      errorMessage: uploadErr.message,
      errorJSON: JSON.stringify(uploadErr, Object.getOwnPropertyNames(uploadErr)),
    });
    return NextResponse.json(
      {
        error: "Erro ao salvar a página de créditos.",
        detail: uploadErr.message,
        debug: {
          storagePath,
          bufferKB: Math.round(buffer.length / 1024),
          contentType: "text/html",
        },
      },
      { status: 500 }
    );
  }

  const result: CreditosResult = {
    config: configResolved,
    ficha_catalografica: ficha ?? undefined,
    html_storage_path: storagePath,
    input_hash: inputHash,
    paginas_usadas: paginasParaFicha,
    paginas_origem: paginasOrigem,
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
  } catch (err) {
    console.error("[creditos] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar a página de créditos. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET — refresh signed URL ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
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
  } catch (err) {
    console.error("[creditos] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter a página de créditos. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

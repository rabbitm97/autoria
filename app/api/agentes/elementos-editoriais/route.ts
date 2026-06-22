export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText, traceClaudeCall } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElementosEditoriais {
  sinopse_curta: string;
  sinopse_longa: string;
  palavras_chave: string[];
  ficha_catalografica: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const FALLBACK_PROMPT = `\
Você é um editor especialista em marketing editorial brasileiro com experiência em Amazon KDP, \
livrarias independentes e plataformas de eBook nacionais.

O título e subtítulo do livro são definitivos, escolhidos pelo autor — eles serão informados na \
mensagem do usuário. Você não deve sugerir títulos alternativos. Use o título e subtítulo informados \
para alinhar o tom da sinopse, das keywords e da ficha catalográfica. Se o título aparecer na sua \
saída (ex.: na ficha catalográfica), ele deve ser idêntico ao informado.

Sua tarefa é gerar os elementos editoriais de um livro a partir do trecho de manuscrito fornecido \
e retornar EXCLUSIVAMENTE um objeto JSON válido. Não inclua markdown ou texto fora do JSON.

Não inclua os campos \`opcoes_titulo\`, \`titulo\` ou \`subtitulo\` na sua resposta. \
O JSON de saída tem exatamente os campos listados no schema abaixo — nada além disso.

Schema obrigatório:
{
  "sinopse_curta": "<sinopse em 1-3 frases (máx 60 palavras) — ganchos emocionais, sem spoilers>",
  "sinopse_longa": "<sinopse em 2-3 parágrafos (~150-200 palavras) — para Amazon e livrarias>",
  "palavras_chave": [
    "<keyword 1 — alta busca no Kindle PT-BR>",
    "<keyword 2>",
    "<keyword 3>",
    "<keyword 4>",
    "<keyword 5>",
    "<keyword 6>",
    "<keyword 7>",
    "<keyword 8>",
    "<keyword 9>",
    "<keyword 10>"
  ],
  "ficha_catalografica": "<ficha no formato CBL (Câmara Brasileira do Livro):\\nAutor, Nome.\\nTítulo / Nome Autor. — Cidade: Editora, Ano.\\nXXX p.; 21 cm.\\nISBN xxx-xx-xxxxx-xx-x\\n1. Gênero literário. I. Título.>"
}

Diretrizes:
- Escreva em português brasileiro coloquial mas polido
- Sinopses devem ser magnéticas — façam o leitor querer comprar
- Palavras-chave: use termos reais de busca no Amazon Kindle BR
- Ficha catalográfica: use dados fictícios plausíveis se não houver informação real
- palavras_chave deve ter exatamente 10 itens`;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { project_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Campo 'project_id' obrigatório." }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, diagnostico, manuscripts(titulo, subtitulo, texto, nome)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo: string | null;
    subtitulo: string | null;
    texto: string | null;
    nome: string;
  } | null;

  const titulo = ms?.titulo ?? "";
  const subtitulo = ms?.subtitulo ?? "";
  const texto = ms?.texto ?? "";
  const nomeManuscrito = ms?.nome ?? "Manuscrito";

  if (!texto || texto.trim().length < 100) {
    return NextResponse.json(
      { error: "Texto do manuscrito muito curto ou não extraído. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  const diagnosticoCtx = project.diagnostico
    ? `\nContexto do diagnóstico já realizado: ${JSON.stringify(project.diagnostico)}`
    : "";

  const textoCortado =
    texto.length > 40_000
      ? texto.slice(0, 40_000) + "\n\n[...trecho truncado]"
      : texto;

  const tituloCtx = `TÍTULO DO LIVRO: "${titulo}"\nSUBTÍTULO: "${subtitulo || "(sem subtítulo)"}"\n\n`;

  const SYSTEM_PROMPT = await getAgentPrompt("elementos-editoriais", FALLBACK_PROMPT);
  let elementos: ElementosEditoriais;
  try {
    const userContent = `${tituloCtx}Manuscrito: "${nomeManuscrito}"${diagnosticoCtx}\n\nTexto:\n${textoCortado}\n\nGere os elementos editoriais e retorne apenas o JSON:`;
    const message = await traceClaudeCall({
      agentName: "elementos-editoriais",
      projectId: project_id,
      userId: user.id,
      model: "claude-sonnet-4-6",
      input: { system: SYSTEM_PROMPT, messages: [{ role: "user", content: userContent }] },
      fn: () => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    elementos = parseLLMJson<ElementosEditoriais>(extractText(message.content));

    const campos: (keyof ElementosEditoriais)[] = [
      "sinopse_curta", "sinopse_longa", "palavras_chave", "ficha_catalografica",
    ];
    for (const campo of campos) {
      if (elementos[campo] === undefined) throw new Error(`Campo ausente: ${campo}`);
    }
  } catch (e) {
    console.error("[elementos-editoriais] Erro Claude:", e);
    return NextResponse.json(
      { error: "Erro ao gerar elementos com IA. Tente novamente." },
      { status: 502 }
    );
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_elementos: elementos, etapa_atual: "capa" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[elementos-editoriais] Erro ao salvar:", updateErr);
    return NextResponse.json(
      {
        error: "Elementos gerados, mas falha ao salvar no banco.",
        debug: { code: updateErr.code, message: updateErr.message, details: updateErr.details, hint: updateErr.hint },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, elementos });
}

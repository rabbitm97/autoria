export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElementosEditoriais {
  sinopse_curta: string;
  sinopse_longa: string;
  opcoes_titulo: string[];
  palavras_chave: string[];
  ficha_catalografica: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um editor especialista em marketing editorial brasileiro com experiência em Amazon KDP, \
livrarias independentes e plataformas de eBook nacionais.

Sua tarefa é gerar os elementos editoriais de um livro a partir do trecho de manuscrito fornecido \
e retornar EXCLUSIVAMENTE um objeto JSON válido. Não inclua markdown ou texto fora do JSON.

Schema obrigatório:
{
  "sinopse_curta": "<sinopse em 1-3 frases (máx 60 palavras) — ganchos emocionais, sem spoilers>",
  "sinopse_longa": "<sinopse em 2-3 parágrafos (~150-200 palavras) — para Amazon e livrarias>",
  "opcoes_titulo": [
    "<opção 1 — memorável e original>",
    "<opção 2>",
    "<opção 3>",
    "<opção 4>",
    "<opção 5 — mais comercial/SEO>"
  ],
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
- Ficha catalográfica: use dados ficticios plausíveis se não houver informação real
- opcoes_titulo deve ter exatamente 5 itens
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
    .select("id, manuscript_id, diagnostico, manuscripts(texto, nome)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as { texto: string | null; nome: string } | null;
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

  let elementos: ElementosEditoriais;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Manuscrito: "${nomeManuscrito}"${diagnosticoCtx}\n\nTexto:\n${textoCortado}\n\nGere os elementos editoriais e retorne apenas o JSON:`,
        },
      ],
    });

    elementos = parseLLMJson<ElementosEditoriais>(extractText(message.content));

    const campos: (keyof ElementosEditoriais)[] = [
      "sinopse_curta", "sinopse_longa", "opcoes_titulo", "palavras_chave", "ficha_catalografica",
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
      { error: "Elementos gerados, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, elementos });
}

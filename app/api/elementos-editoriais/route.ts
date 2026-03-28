import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElementosEditoriais {
  sinopse_curta: string;
  sinopse_longa: string;
  opcoes_titulo: string[];
  palavras_chave: string[];
  ficha_catalografica: string;
}

// ─── Claude client ────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  // 1. Auth
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  // 2. Parse body
  let body: { project_id: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return Response.json({ error: "Campo 'project_id' obrigatório." }, { status: 400 });
  }

  // 3. Verify project + get manuscript text
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, diagnostico, manuscripts(texto, nome)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as { texto: string | null; nome: string } | null;
  const texto = ms?.texto ?? "";
  const nomeManuscrito = ms?.nome ?? "Manuscrito";

  if (!texto || texto.trim().length < 100) {
    return Response.json(
      { error: "Texto do manuscrito muito curto ou não extraído. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  // Include diagnostic context if available for richer output
  const diagnosticoCtx = project.diagnostico
    ? `\nContexto do diagnóstico já realizado: ${JSON.stringify(project.diagnostico)}`
    : "";

  const textoCortado =
    texto.length > 40_000
      ? texto.slice(0, 40_000) + "\n\n[...trecho truncado]"
      : texto;

  // 4. Call Claude
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

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const cleanJson = rawText
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```$/im, "")
      .trim();

    elementos = JSON.parse(cleanJson) as ElementosEditoriais;

    const campos: (keyof ElementosEditoriais)[] = [
      "sinopse_curta",
      "sinopse_longa",
      "opcoes_titulo",
      "palavras_chave",
      "ficha_catalografica",
    ];
    for (const campo of campos) {
      if (elementos[campo] === undefined) {
        throw new Error(`Campo ausente: ${campo}`);
      }
    }
  } catch (e) {
    console.error("[elementos-editoriais] Erro Claude:", e);
    return Response.json(
      { error: "Erro ao gerar elementos com IA. Tente novamente." },
      { status: 502 }
    );
  }

  // 5. Persist
  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_elementos: elementos, etapa_atual: "sinopse_ficha" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[elementos-editoriais] Erro ao salvar:", updateErr);
    return Response.json(
      { error: "Elementos gerados, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, elementos });
}

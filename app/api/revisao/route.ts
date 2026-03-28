import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SugestaoRevisao {
  id: string;
  tipo: "gramatica" | "ortografia" | "estilo" | "coesao" | "clareza";
  trecho_original: string;
  sugestao: string;
  explicacao: string;
}

export interface RevisaoResult {
  sugestoes: SugestaoRevisao[];
  revisado_em: string;
}

// ─── Claude client ────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um revisor literário brasileiro especializado, com profundo conhecimento do \
Acordo Ortográfico vigente e das melhores práticas do mercado editorial nacional.

Sua tarefa é revisar o trecho de manuscrito fornecido e retornar EXCLUSIVAMENTE um array JSON válido \
com sugestões de revisão. Não inclua markdown, explicações ou qualquer texto fora do JSON.

Schema de cada sugestão:
{
  "id": "<uuid único — use o formato 'r001', 'r002', etc.>",
  "tipo": "<'gramatica' | 'ortografia' | 'estilo' | 'coesao' | 'clareza'>",
  "trecho_original": "<trecho exato do texto com o problema — máximo 150 chars>",
  "sugestao": "<trecho corrigido — substituto direto para o original>",
  "explicacao": "<explicação didática em 1-2 frases do motivo da sugestão>"
}

Retorne entre 8 e 20 sugestões, priorizando:
1. Erros gramaticais e ortográficos (obrigatórios se existirem)
2. Repetições de palavras ou construções
3. Frases longas ou ambíguas que podem ser simplificadas
4. Problemas de coesão e transição entre parágrafos
5. Sugestões de estilo que melhoram a leitura sem alterar a voz do autor

IMPORTANTE:
- trecho_original deve ser uma substring EXATA do texto fornecido
- Seja cirúrgico: sugira alterações mínimas e precisas
- Preserve a voz e o estilo do autor`;

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
    .select("id, manuscript_id, manuscripts(texto)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const texto =
    (project.manuscripts as unknown as { texto: string | null } | null)?.texto ?? "";

  if (!texto || texto.trim().length < 100) {
    return Response.json(
      { error: "Texto do manuscrito muito curto ou não extraído. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  // 4. Truncate to ~60k chars for cost control (~10k words)
  const textoCortado =
    texto.length > 60_000
      ? texto.slice(0, 60_000) + "\n\n[...trecho truncado para revisão]"
      : texto;

  // 5. Call Claude
  let revisao: RevisaoResult;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Revise o seguinte manuscrito e retorne apenas o array JSON de sugestões:\n\n${textoCortado}`,
        },
      ],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";

    const cleanJson = rawText
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```$/im, "")
      .trim();

    const sugestoes = JSON.parse(cleanJson) as SugestaoRevisao[];

    revisao = {
      sugestoes,
      revisado_em: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[revisao] Erro Claude:", e);
    return Response.json(
      { error: "Erro ao processar a revisão com IA. Tente novamente." },
      { status: 502 }
    );
  }

  // 6. Persist in projects
  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_revisao: revisao, etapa_atual: "revisao" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[revisao] Erro ao salvar:", updateErr);
    return Response.json(
      { error: "Revisão gerada, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, revisao });
}

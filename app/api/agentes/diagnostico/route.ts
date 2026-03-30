import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosticoResult {
  genero_provavel: string;
  num_capitulos: number;
  num_palavras: number;
  pontos_fortes: string[];
  pontos_melhorar: string[];
  mercado_alvo: string;
  complexidade: "simples" | "médio" | "complexo";
}

// ─── Claude client (singleton) ────────────────────────────────────────────────

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um editor literário brasileiro sênior com 20 anos de experiência no mercado editorial. \
Já analisou mais de 5.000 manuscritos de todos os gêneros e conhece profundamente o mercado leitor brasileiro, \
as convenções editoriais, os catálogos das principais editoras nacionais e as tendências de autopublicação.

Sua tarefa é analisar o trecho de manuscrito fornecido e retornar EXCLUSIVAMENTE um objeto JSON válido. \
Não inclua markdown, explicações, comentários ou qualquer texto fora do JSON.

Schema obrigatório:
{
  "genero_provavel": "gênero literário principal em português (ex: Romance, Ficção Científica, Autoajuda, Biografia, etc.)",
  "num_capitulos": <número inteiro — estimativa baseada na estrutura e extensão do trecho>,
  "num_palavras": <número inteiro — contagem real das palavras no trecho>,
  "pontos_fortes": [
    "ponto forte 1 — específico e construtivo",
    "ponto forte 2",
    "ponto forte 3"
  ],
  "pontos_melhorar": [
    "sugestão de melhoria 1 — acionável e gentil",
    "sugestão de melhoria 2",
    "sugestão de melhoria 3"
  ],
  "mercado_alvo": "descrição do leitor-alvo brasileiro: faixa etária, perfil, plataformas onde consume (Wattpad, Amazon, livrarias, etc.)",
  "complexidade": "simples" | "médio" | "complexo"
}

Diretrizes:
- Seja específico: cite elementos concretos do texto analisado.
- Use linguagem profissional mas acessível, em português brasileiro.
- pontos_fortes e pontos_melhorar devem ter exatamente 3 itens cada.
- complexidade refere-se ao vocabulário, estrutura narrativa e demanda cognitiva do leitor.
- Se o trecho for muito curto para análise precisa, faça sua melhor estimativa e indique isso em mercado_alvo.`;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Autenticação via Supabase SSR
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

  // 2. Parse e validação do body
  let body: { texto: string; project_id: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { texto, project_id } = body;

  if (!texto || typeof texto !== "string" || texto.trim().length < 50) {
    return Response.json(
      { error: "Campo 'texto' obrigatório (mínimo 50 caracteres)." },
      { status: 400 }
    );
  }
  if (!project_id || typeof project_id !== "string") {
    return Response.json(
      { error: "Campo 'project_id' obrigatório." },
      { status: 400 }
    );
  }

  // 3. Verifica que o projeto pertence ao usuário
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // 4. Contagem real de palavras + truncagem para a API
  //    Limita a ~50k caracteres (~8.000 palavras) — suficiente para diagnóstico
  //    e mantém o custo de tokens controlado
  const numPalavras = texto.trim().split(/\s+/).filter(Boolean).length;
  const textoCortado = texto.length > 50_000 ? texto.slice(0, 50_000) + "\n\n[...trecho truncado para análise]" : texto;

  // 5. Chama Claude Sonnet
  let diagnostico: DiagnosticoResult;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Analise o seguinte manuscrito e retorne apenas o JSON:\n\n${textoCortado}`,
        },
      ],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Remove possíveis marcadores de código (```json ... ```)
    const cleanJson = rawText
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```$/im, "")
      .trim();

    diagnostico = JSON.parse(cleanJson) as DiagnosticoResult;

    // Sobrescreve num_palavras com a contagem real
    diagnostico.num_palavras = numPalavras;

    // Valida campos obrigatórios
    const campos: (keyof DiagnosticoResult)[] = [
      "genero_provavel",
      "num_capitulos",
      "num_palavras",
      "pontos_fortes",
      "pontos_melhorar",
      "mercado_alvo",
      "complexidade",
    ];
    for (const campo of campos) {
      if (diagnostico[campo] === undefined) {
        throw new Error(`Campo ausente na resposta da IA: ${campo}`);
      }
    }
  } catch (e) {
    console.error("[diagnostico] Erro Claude:", e);
    return Response.json(
      { error: "Erro ao processar o diagnóstico com IA. Tente novamente." },
      { status: 502 }
    );
  }

  // 6. Persiste na tabela projects
  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      diagnostico,
      etapa_atual: "diagnostico",
    })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[diagnostico] Erro ao salvar:", updateErr);
    return Response.json(
      { error: "Diagnóstico gerado, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, diagnostico });
}

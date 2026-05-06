export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, langfuse } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SugestaoRevisao {
  id: string;
  tipo: "ortografia" | "gramatica" | "coesao" | "consistencia" | "ritmo";
  severidade: "critico" | "recomendado" | "opcional";
  localizacao: {
    capitulo: number;
    paragrafo: number;
    linha_aproximada: number;
  };
  trecho_original: string;
  sugestao: string;
  explicacao: string;
  referencia_norma: string;
}

export interface RevisaoResult {
  sugestoes: SugestaoRevisao[];
  revisado_em: string;
  // Persisted user decisions
  aceitas?: string[];
  rejeitadas?: string[];
  finalizado_em?: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const FALLBACK_PROMPT = `\
Você é um revisor editorial profissional especializado em literatura em português brasileiro, \
com 20 anos de experiência em editoras nacionais. Trabalhe no modo "sugerir mudanças" — \
NUNCA reescreva o texto do autor sem permissão explícita.

NÍVEIS DE REVISÃO E SEVERIDADE:

Nível 1 — severidade "critico" (erros objetivos que devem ser corrigidos):
- Erros de ortografia (Acordo Ortográfico 2009)
- Concordância verbal e nominal
- Regência verbal e nominal
- Crase
- Pontuação inadequada que altera o sentido
- Uso incorreto de maiúsculas/minúsculas

Nível 2 — severidade "recomendado" (melhoram a qualidade sem alterar estilo):
- Repetições desnecessárias de palavras no mesmo parágrafo
- Conectivos inadequados ou ausentes
- Ordem das palavras que prejudica a clareza
- Parágrafos excessivamente longos (>300 palavras) ou fragmentados
- Transições abruptas entre ideias

Nível 3 — severidade "recomendado" (consistência interna da narrativa):
- Inconsistência de tempo verbal dentro de cenas
- Variações de nomes de personagens (ex: "João" vs "Joao")
- Contradições na linha temporal
- Inconsistências de espaço e localização
- Mudança de voz narrativa (1ª/3ª pessoa) sem intenção clara

Nível 4 — severidade "opcional" (sugestões estruturais, respeitar escolha do autor):
- Ritmo narrativo (capítulos muito longos ou curtos)
- Proporção diálogos vs. narração
- Estrutura de cenas e ganchos

PRINCÍPIOS ÉTICOS QUE VOCÊ SEGUE:
- NUNCA altere o estilo único do autor
- NUNCA censure conteúdo por ser polêmico
- SEMPRE explique o motivo da sugestão
- Regionalismos e gírias: manter se coerentes com personagem/contexto
- Diálogos informais: aceitar "erros" gramaticais intencionais
- Neologismos literários: aceitar se artisticamente justificados
- Tom das sugestões: "Considere..." em vez de "Você deve..."

Retorne EXCLUSIVAMENTE um array JSON de sugestões entre 5 e 25 itens. \
Não inclua markdown, comentários ou qualquer texto fora do JSON.

Schema de cada sugestão:
{
  "id": "r001",
  "tipo": "ortografia" | "gramatica" | "coesao" | "consistencia" | "ritmo",
  "severidade": "critico" | "recomendado" | "opcional",
  "localizacao": {
    "capitulo": <número inteiro estimado — 1 se não identificável>,
    "paragrafo": <número inteiro sequencial na parte analisada>,
    "linha_aproximada": <número inteiro estimado>
  },
  "trecho_original": "<substring EXATA do texto com o problema — máximo 200 caracteres>",
  "sugestao": "<substituto sugerido para o trecho original — mesmo comprimento aproximado>",
  "explicacao": "<1-2 frases colaborativas explicando o motivo>",
  "referencia_norma": "<ex: Acordo Ortográfico 2009 / Gramática Normativa / Convenção editorial>"
}

IMPORTANTE:
- trecho_original deve ser uma substring EXATA que aparece no texto fornecido
- Seja cirúrgico: alterações mínimas e precisas que preservem a voz do autor
- Priorize: críticos primeiro, depois recomendados, depois opcionais
- Se o texto estiver muito bem escrito, retorne apenas as sugestões genuínas (pode ser menos de 10)`;

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
    .select("id, usar_revisao, manuscript_id, manuscripts(texto)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  if (project.usar_revisao === false) {
    return NextResponse.json(
      { error: "Este projeto não tem revisão textual habilitada." },
      { status: 400 }
    );
  }

  const texto =
    (project.manuscripts as unknown as { texto: string | null } | null)?.texto ?? "";

  if (!texto || texto.trim().length < 100) {
    return NextResponse.json(
      { error: "Texto do manuscrito muito curto ou não extraído. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  // Limita a 20k chars (~3.500 palavras) para caber no timeout do Vercel (60s).
  // A revisão é amostral — sugestões representativas do manuscrito inteiro.
  const textoCortado =
    texto.length > 20_000
      ? texto.slice(0, 20_000) + "\n\n[...trecho truncado — revisão amostral das primeiras ~3.500 palavras]"
      : texto;

  // Mock: retorna instantaneamente sem chamar a API
  if (process.env.MOCK_AI === "true") {
    const revisaoMock: RevisaoResult = {
      sugestoes: [{
        id: "r001", tipo: "ortografia", severidade: "critico",
        localizacao: { capitulo: 1, paragrafo: 1, linha_aproximada: 1 },
        trecho_original: textoCortado.slice(0, 50).trim(),
        sugestao: "Verifique a ortografia deste trecho.",
        explicacao: "Modo de teste ativo (MOCK_AI=true). Resultado simulado.",
        referencia_norma: "Mock — sem chamada à API",
      }],
      revisado_em: new Date().toISOString(),
    };
    await supabase.from("projects")
      .update({ dados_revisao: revisaoMock, etapa_atual: "revisao" })
      .eq("id", project_id).eq("user_id", user.id);
    return NextResponse.json({ ok: true, revisao: revisaoMock });
  }

  // Streaming — envia chunks do Claude ao cliente à medida que chegam.
  // Isso evita o timeout do Vercel: a conexão fica viva enquanto dados fluem.
  const SYSTEM_PROMPT = await getAgentPrompt("revisao", FALLBACK_PROMPT);
  const enc = new TextEncoder();
  const aiStream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Revise o seguinte manuscrito e retorne apenas o array JSON de sugestões:\n\n${textoCortado}` }],
  });

  const streamStartTime = Date.now();
  const streamTrace = langfuse?.trace({
    name: "revisao",
    userId: user.id,
    metadata: { project_id, model: "claude-haiku-4-5-20251001" },
  });

  const streamBody = new ReadableStream({
    async start(controller) {
      let accumulated = "";
      try {
        for await (const event of aiStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            accumulated += event.delta.text;
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        const parsed = parseLLMJson<unknown>(accumulated);
        // Claude sometimes wraps the array: {"sugestoes": [...]} — unwrap it
        let sugestoes: SugestaoRevisao[];
        if (Array.isArray(parsed)) {
          sugestoes = parsed as SugestaoRevisao[];
        } else if (parsed && typeof parsed === "object") {
          const inner = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
          if (!inner) throw new Error("Resposta da IA não contém array de sugestões.");
          sugestoes = inner as SugestaoRevisao[];
        } else {
          throw new Error("Resposta da IA não é um array de sugestões.");
        }
        const revisao: RevisaoResult = { sugestoes, revisado_em: new Date().toISOString() };
        await supabase.from("projects")
          .update({ dados_revisao: revisao, etapa_atual: "revisao" })
          .eq("id", project_id).eq("user_id", user.id);
        streamTrace?.update({ output: { duration_ms: Date.now() - streamStartTime } });
        controller.enqueue(enc.encode("\n__DONE__" + JSON.stringify(revisao)));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[revisao] Erro stream:", msg);
        streamTrace?.update({ output: { error: msg, duration_ms: Date.now() - streamStartTime } });
        controller.enqueue(enc.encode("\n__ERROR__" + msg));
      }
      void (async () => { try { await langfuse?.flushAsync(); } catch {} })();
      controller.close();
    },
  });

  return new Response(streamBody, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

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
Você é um revisor editorial profissional e minucioso de textos em português brasileiro. \
Sua função é encontrar TODOS os problemas no texto — não apenas os óbvios.

OBRIGAÇÃO DE COBERTURA:
Para qualquer texto com mais de 300 palavras, retorne NO MÍNIMO 15 sugestões. \
Distribua as sugestões uniformemente do início ao fim — não concentre apenas no começo. \
Nunca retorne menos de 15 itens alegando que o texto está bem escrito. \
Mesmo textos de alta qualidade têm oportunidades de melhoria; procure-as ativamente.

CATEGORIAS A VERIFICAR EM TODO O TEXTO:

Ortografia — severidade "critico":
- Erros de grafia (Acordo Ortográfico 2009): hífen incorreto, acento errado ou faltando
- Concordância verbal e nominal
- Regência verbal e nominal (ex: "assistir o filme" → "assistir ao filme")
- Crase (a/à/há)
- Maiúsculas/minúsculas incorretas

Gramática e pontuação — severidade "critico" ou "recomendado":
- Vírgula faltando antes de orações subordinadas adverbiais
- Vírgula incorreta separando sujeito do predicado
- Travessão, meia-risca e hífen usados de forma inconsistente
- Ponto-e-vírgula desnecessário ou mal empregado
- Dois-pontos incorreto

Coesão e clareza — severidade "recomendado":
- A mesma palavra repetida em frases consecutivas no mesmo parágrafo
- Frases com mais de 50 palavras que podem ser divididas
- Parágrafos com mais de 250 palavras
- Conectivos ausentes ou inadequados entre frases ou parágrafos
- Pronome com referência ambígua ("ele", "ela", "isso" sem antecedente claro)
- Ordem das palavras que dificulta a leitura imediata

Consistência narrativa — severidade "recomendado":
- Variação na grafia de nomes de personagens ou lugares
- Mistura de tempos verbais (presente/pretérito) sem intenção clara
- Contradições de localização, tempo ou sequência de eventos
- Mudança de voz narrativa sem sinalização explícita

Ritmo e estrutura — severidade "opcional":
- Capítulos muito longos ou curtos em relação aos demais
- Excesso ou escassez de diálogos
- Ganchos fracos no final de capítulos ou cenas

REGRAS ABSOLUTAS:
- Varra o texto INTEIRO, parágrafo a parágrafo, do primeiro ao último
- "trecho_original" é uma substring EXATA que aparece no texto (máx 200 chars)
- "sugestao" SEMPRE propõe uma mudança concreta — nunca retorne trecho_original == sugestao
- Se estiver em dúvida sobre um problema, inclua como "opcional"
- Nunca escreva "Sem alteração necessária" — se não há mudança real, não inclua o item
- Preserve o estilo e a voz do autor; sugira com "Considere..." em vez de impor

Retorne EXCLUSIVAMENTE um array JSON — começando com [ e terminando com ]. \
Nunca retorne um objeto JSON, nunca inclua markdown, comentários ou texto fora do array. \
Se não houver sugestões, retorne [].

Schema de cada item:
{
  "id": "r001",
  "tipo": "ortografia" | "gramatica" | "coesao" | "consistencia" | "ritmo",
  "severidade": "critico" | "recomendado" | "opcional",
  "localizacao": {
    "capitulo": <número inteiro — 1 se não identificável>,
    "paragrafo": <número sequencial no texto analisado>,
    "linha_aproximada": <número inteiro estimado>
  },
  "trecho_original": "<substring EXATA do texto — máx 200 chars>",
  "sugestao": "<texto substituto concreto e diferente do original>",
  "explicacao": "<1-2 frases explicando o motivo>",
  "referencia_norma": "<ex: Acordo Ortográfico 2009 / Gramática Normativa / Convenção editorial>"
}`;

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

  // Limita a 50k chars (~8.500 palavras) para cobrir mais do texto no timeout do Vercel (60s).
  const textoCortado =
    texto.length > 50_000
      ? texto.slice(0, 50_000) + "\n\n[...trecho truncado após ~8.500 palavras — revise o restante em etapas]"
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
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Revise o seguinte manuscrito com minúcia. Analise TODO o texto do início ao fim, distribuindo as sugestões ao longo de toda a extensão — não apenas nas primeiras páginas. Retorne apenas o array JSON de sugestões:\n\n${textoCortado}` }],
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
        let sugestoes: SugestaoRevisao[];
        if (Array.isArray(parsed)) {
          sugestoes = parsed as SugestaoRevisao[];
        } else if (parsed && typeof parsed === "object") {
          const obj = parsed as Record<string, unknown>;
          // Search direct values first, then one level deeper for {"wrapper": {"sugestoes": [...]}}
          let inner: unknown[] | undefined =
            Object.values(obj).find(Array.isArray) as unknown[] | undefined;
          if (!inner) {
            for (const v of Object.values(obj)) {
              if (v && typeof v === "object" && !Array.isArray(v)) {
                inner = Object.values(v as Record<string, unknown>).find(Array.isArray) as unknown[] | undefined;
                if (inner) break;
              }
            }
          }
          if (inner) {
            sugestoes = inner as SugestaoRevisao[];
          } else if (obj.id && obj.tipo && obj.severidade) {
            // Single suggestion returned as object instead of array
            sugestoes = [obj as unknown as SugestaoRevisao];
          } else {
            // Unexpected format — log and treat as no suggestions
            console.warn("[revisao] Resposta inesperada da IA (sem array):", JSON.stringify(parsed).slice(0, 300));
            sugestoes = [];
          }
        } else {
          sugestoes = [];
        }
        // Drop no-op suggestions where the model proposed no real change
        sugestoes = sugestoes.filter(
          s => s.trecho_original?.trim() && s.sugestao?.trim() && s.trecho_original.trim() !== s.sugestao.trim()
        );
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

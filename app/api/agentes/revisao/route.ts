export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, langfuse } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { updateProject, avancarEtapa, negarPorPlano } from "@/lib/supabase-helpers";
import { getAgentPrompt } from "@/lib/agent-prompts";
import { validarProjectData } from "@/lib/project-data";
import type {
  SugestaoRevisao,
  RevisaoResult,
  RevisaoProcessingState,
} from "@/lib/project-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  SugestaoRevisao,
  RevisaoResult,
  RevisaoProcessingState,
} from "@/lib/project-data";

// ─── System prompt ────────────────────────────────────────────────────────────

const FALLBACK_PROMPT = `\
Você é um revisor editorial profissional e minucioso de textos em português brasileiro. \
Sua função é encontrar TODOS os problemas no texto — não apenas os óbvios.

COBERTURA:
Distribua a análise uniformemente do início ao fim do trecho — não concentre apenas no começo. \
Retorne exatamente o número de sugestões que o texto requer: zero se estiver correto, quantas forem necessárias se houver problemas. \
Não invente problemas onde não existem; não omita problemas reais por economia de tokens.

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

Use SEMPRE a tool registrar_sugestoes para devolver suas sugestões. Não escreva nenhum texto em prosa antes ou depois da chamada da tool. Se não houver sugestões, chame a tool com sugestoes: []. O schema da tool define os campos e seus valores permitidos — siga-o rigorosamente.`;

// ─── Tool schema ──────────────────────────────────────────────────────────────

const REVISAO_TOOL = {
  name: "registrar_sugestoes",
  description:
    "Registra a lista de sugestões de revisão editorial encontradas no trecho analisado. Use esta tool exatamente uma vez, com TODAS as sugestões encontradas. Se não houver nenhuma sugestão, chame a tool com sugestoes: [].",
  input_schema: {
    type: "object" as const,
    properties: {
      sugestoes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: {
              type: "string",
              enum: ["ortografia", "gramatica", "coesao", "consistencia", "ritmo"],
            },
            severidade: {
              type: "string",
              enum: ["critico", "recomendado", "opcional"],
            },
            localizacao: {
              type: "object",
              properties: {
                capitulo: { type: "integer", minimum: 1 },
                paragrafo: { type: "integer", minimum: 1 },
                linha_aproximada: { type: "integer", minimum: 1 },
              },
              required: ["capitulo", "paragrafo", "linha_aproximada"],
            },
            trecho_original: {
              type: "string",
              maxLength: 200,
              description: "Substring exata do texto analisado, máximo 200 caracteres.",
            },
            sugestao: {
              type: "string",
              description: "Texto substituto concreto, diferente do trecho_original.",
            },
            explicacao: {
              type: "string",
              description: "1-2 frases explicando o motivo da sugestão.",
            },
            referencia_norma: {
              type: "string",
              description: "Norma ou convenção que embasa a sugestão.",
            },
          },
          required: [
            "tipo",
            "severidade",
            "localizacao",
            "trecho_original",
            "sugestao",
            "explicacao",
            "referencia_norma",
          ],
        },
      },
    },
    required: ["sugestoes"],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

type AnyBlock = { type: string; [key: string]: unknown };

function extractSugestoesFromMessage(message: { content: unknown[] }): SugestaoRevisao[] {
  const blocks = message.content as AnyBlock[];

  // Caminho preferido: tool_use estruturado — o SDK garante escape correto de todos os campos.
  const toolBlock = blocks.find(
    (b) => b["type"] === "tool_use" && b["name"] === "registrar_sugestoes"
  );

  let sugestoes: SugestaoRevisao[] = [];

  if (toolBlock) {
    const input = toolBlock["input"] as { sugestoes?: SugestaoRevisao[] } | undefined;
    if (Array.isArray(input?.sugestoes)) {
      sugestoes = input!.sugestoes!;
    }
  } else {
    // Fallback defensivo: Claude eventualmente devolve text apesar do tool_choice.
    // Aceita, loga, mas não quebra.
    const textBlock = blocks.find((b) => b["type"] === "text");
    if (textBlock && typeof textBlock["text"] === "string") {
      console.warn(
        "[revisao] Claude retornou text em vez de tool_use — tentando parse defensivo."
      );
      try {
        const parsed = parseLLMJson<unknown>(textBlock["text"] as string);
        if (Array.isArray(parsed)) {
          sugestoes = parsed as SugestaoRevisao[];
        } else if (
          parsed &&
          typeof parsed === "object" &&
          "sugestoes" in parsed &&
          Array.isArray((parsed as { sugestoes: unknown }).sugestoes)
        ) {
          sugestoes = (parsed as { sugestoes: SugestaoRevisao[] }).sugestoes;
        }
      } catch (err) {
        console.error("[revisao] Fallback de parse também falhou:", err);
        sugestoes = [];
      }
    }
  }

  return sugestoes.filter(
    (s) =>
      s.trecho_original?.trim() &&
      s.sugestao?.trim() &&
      s.trecho_original.trim() !== s.sugestao.trim()
  );
}

function deduplicateAndRenumber(sugestoes: SugestaoRevisao[]): SugestaoRevisao[] {
  const seen = new Set<string>();
  return sugestoes
    .filter(s => {
      if (!s.trecho_original?.trim() || seen.has(s.trecho_original)) return false;
      seen.add(s.trecho_original);
      return true;
    })
    .map((s, i) => ({ ...s, id: `r${String(i + 1).padStart(3, "0")}` }));
}

async function getAuth(request: NextRequest) {
  void request;
  return requireAuth();
}

// ─── POST: submete batch job e retorna imediatamente ─────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];

  try {
    ({ user, supabase } = await getAuth(request));
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
    .select("id, plano, usar_revisao, manuscript_id, manuscripts(texto)")
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

  const gate = negarPorPlano((project as { plano?: unknown }).plano, "essencial", "revisao");
  if (gate) return gate;

  const texto = (project.manuscripts as unknown as { texto: string | null } | null)?.texto ?? "";
  if (!texto || texto.trim().length < 100) {
    return NextResponse.json(
      { error: "Texto do manuscrito muito curto ou não extraído. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  // Mock: retorna resultado imediato sem chamar a API
  if (process.env.MOCK_AI === "true") {
    const revisaoMock: RevisaoResult = {
      sugestoes: [{
        id: "r001", tipo: "ortografia", severidade: "critico",
        localizacao: { capitulo: 1, paragrafo: 1, linha_aproximada: 1 },
        trecho_original: texto.slice(0, 50).trim(),
        sugestao: "Verifique a ortografia deste trecho.",
        explicacao: "Modo de teste ativo (MOCK_AI=true). Resultado simulado.",
        referencia_norma: "Mock — sem chamada à API",
      }],
      revisado_em: new Date().toISOString(),
    };
    validarProjectData("dados_revisao", revisaoMock, { modo: "observador", contexto: "revisao" });
    const { ok: mockOk } = await updateProject(supabase, project_id, user.id, {
      dados_revisao: revisaoMock,
    }, "revisao");
    if (!mockOk) {
      return NextResponse.json({ error: "Falha ao salvar revisão (mock)." }, { status: 500 });
    }
    await avancarEtapa(supabase, project_id, user.id, "revisao", "revisao");
    return NextResponse.json({ status: "done", revisao: revisaoMock });
  }

  // ── Short-circuit: revisão já feita ou em andamento ──────────────────────────
  // Decisão de produto (Bloco 12): não reprocessamos automaticamente quando texto
  // muda pós-revisão. Mantém a revisão existente e avança etapa.
  {
    const { data: existing, error: existingErr } = await supabase
      .from("projects")
      .select("dados_revisao")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (existingErr) {
      // C5-04: sem esse guard, um erro transiente aqui deixaria `dr` como null
      // e o handler seguiria como se não houvesse revisão — dispararia batch
      // paralelo mesmo com revisão já em andamento. Melhor pedir retry.
      console.error("[revisao] falha ao carregar dados_revisao:", existingErr.message);
      return NextResponse.json(
        { error: "Falha ao verificar o estado da revisão. Tente novamente." },
        { status: 500 }
      );
    }

    const dr = existing?.dados_revisao as unknown as
      | RevisaoProcessingState
      | RevisaoResult
      | null;

    if (dr && typeof dr === "object") {
      // Caso A: batch em andamento — não duplica
      if ((dr as RevisaoProcessingState).status === "processing") {
        return NextResponse.json({
          status: "already_processing",
          message: "Revisão já está em andamento. Aguarde.",
        });
      }

      // Caso B: revisão finalizada — avança etapa, retorna skipped
      const drResult = dr as RevisaoResult;
      if (drResult.finalizado_em || drResult.revisado_em) {
        await avancarEtapa(supabase, project_id, user.id, "elementos", "revisao");

        return NextResponse.json({
          status: "skipped",
          message: "Revisão já foi feita. Mudanças no texto não disparam reprocessamento automático.",
          revisao: drResult,
        });
      }
    }
  }

  const SYSTEM_PROMPT = await getAgentPrompt("revisao", FALLBACK_PROMPT);
  const chunks = splitIntoChunks(texto, 10_000);

  // Submete todos os chunks como um único batch assíncrono — sem timeout de execução.
  const batch = await anthropic.messages.batches.create({
    requests: chunks.map((chunk, i) => ({
      custom_id: `chunk-${i}`,
      params: {
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: [
          {
            type: "text" as const,
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        tools: [REVISAO_TOOL],
        tool_choice: { type: "tool" as const, name: "registrar_sugestoes" },
        messages: [
          {
            role: "user" as const,
            content: `Revise o seguinte trecho do manuscrito com minúcia (parte ${i + 1} de ${chunks.length}). Analise do início ao fim, distribuindo as sugestões uniformemente. Use a tool registrar_sugestoes para devolver as sugestões encontradas:\n\n${chunk}`,
          },
        ],
      },
    })),
  });

  const state: RevisaoProcessingState = {
    status: "processing",
    batch_id: batch.id,
    total_chunks: chunks.length,
    iniciado_em: new Date().toISOString(),
  };

  validarProjectData("dados_revisao", state, { modo: "observador", contexto: "revisao" });
  const { ok: stateOk } = await updateProject(supabase, project_id, user.id, {
    dados_revisao: state,
  }, "revisao");
  if (!stateOk) {
    return NextResponse.json(
      { error: "Falha ao registrar o início da revisão. Tente novamente." },
      { status: 500 }
    );
  }
  await avancarEtapa(supabase, project_id, user.id, "revisao", "revisao");

  void (async () => {
    try {
      const t = langfuse?.trace({
        name: "revisao",
        userId: user.id,
        input: { batch_id: batch.id, total_chunks: chunks.length },
        metadata: { project_id },
        tags: ["revisao"],
      });
      t?.generation({
        name: "revisao-batch-submitted",
        model: "claude-sonnet-4-6",
        input: { batch_id: batch.id, total_chunks: chunks.length },
      });
      await langfuse?.flushAsync();
    } catch {}
  })();

  return NextResponse.json({ status: "processing", total_chunks: chunks.length });
}

// ─── GET: poll status do batch e coleta resultados quando pronto ──────────────

export async function GET(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];

  try {
    ({ user, supabase } = await getAuth(request));
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório." }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("dados_revisao")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const state = project.dados_revisao as RevisaoProcessingState | RevisaoResult | null;

  if (!state) {
    return NextResponse.json({ status: "idle" });
  }

  // Já tem resultado final — devolve direto sem chamar a API da Anthropic
  if ((state as RevisaoProcessingState).status !== "processing") {
    return NextResponse.json({ status: "done", revisao: state as RevisaoResult });
  }

  const { batch_id, total_chunks } = state as RevisaoProcessingState;
  const batch = await anthropic.messages.batches.retrieve(batch_id);

  if (batch.processing_status !== "ended") {
    const counts = batch.request_counts;
    const done = counts.succeeded + counts.errored;
    const processing = counts.processing;
    return NextResponse.json({
      status: "processing",
      done,
      processing,
      total: total_chunks,
      iniciado_em: (state as RevisaoProcessingState).iniciado_em,
    });
  }

  // Batch concluído — coleta, faz merge e salva resultado final
  const allSugestoes: SugestaoRevisao[] = [];
  const chunksFailed: Array<{ custom_id: string; reason: string }> = [];
  let chunksSucceeded = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;

  for await (const result of await anthropic.messages.batches.results(batch_id)) {
    const customId = result.custom_id;
    try {
      if (result.result.type !== "succeeded") {
        chunksFailed.push({
          custom_id: customId,
          reason: `result.type=${result.result.type}`,
        });
        continue;
      }

      const message = result.result.message;
      const sugestoesDoChunk = extractSugestoesFromMessage(
        message as { content: unknown[] }
      );

      if (sugestoesDoChunk.length === 0) {
        console.warn(`[revisao] Chunk ${customId} retornou 0 sugestões.`);
      }

      allSugestoes.push(...sugestoesDoChunk);
      chunksSucceeded++;

      const usage = result.result.message.usage as {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalCacheCreation += cacheCreationTokens;
      totalCacheRead += cacheReadTokens;

    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[revisao] Falha ao processar chunk ${customId}:`, reason);
      chunksFailed.push({ custom_id: customId, reason });

    }
  }

  if (chunksSucceeded === 0) {
    return NextResponse.json(
      {
        error: "Todos os chunks da revisão falharam. Tente novamente.",
        chunks_failed: chunksFailed,
      },
      { status: 500 }
    );
  }

  const revisao: RevisaoResult & {
    chunks_total: number;
    chunks_succeeded: number;
    chunks_failed_count: number;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  } = {
    sugestoes: deduplicateAndRenumber(allSugestoes),
    revisado_em: new Date().toISOString(),
    chunks_total: total_chunks,
    chunks_succeeded: chunksSucceeded,
    chunks_failed_count: chunksFailed.length,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_creation_input_tokens: totalCacheCreation,
      cache_read_input_tokens: totalCacheRead,
    },
  };

  validarProjectData("dados_revisao", revisao, { modo: "observador", contexto: "revisao" });
  const { ok: resultOk } = await updateProject(supabase, project_id, user.id, {
    dados_revisao: revisao,
  }, "revisao");
  if (!resultOk) {
    return NextResponse.json(
      { error: "Revisão concluída, mas falha ao salvar as sugestões. Tente novamente." },
      { status: 500 }
    );
  }

  void (async () => {
    try {
      const t = langfuse?.trace({
        name: "revisao",
        userId: user.id,
        input: { batch_id, total_chunks },
        output: {
          total_sugestoes: revisao.sugestoes.length,
          chunks_succeeded: chunksSucceeded,
          chunks_failed_count: chunksFailed.length,
        },
        metadata: { project_id },
        tags: ["revisao"],
      });
      t?.generation({
        name: "revisao-batch-completed",
        model: "claude-sonnet-4-6",
        output: {
          sugestoes_count: revisao.sugestoes.length,
          chunks_succeeded: chunksSucceeded,
          chunks_failed: chunksFailed.length,
        },
        usage: {
          input: totalInputTokens,
          output: totalOutputTokens,
        },
        metadata: {
          cache_creation_input_tokens: totalCacheCreation,
          cache_read_input_tokens: totalCacheRead,
        },
      });
      await langfuse?.flushAsync();
    } catch {}
  })();

  return NextResponse.json({ status: "done", revisao });
}

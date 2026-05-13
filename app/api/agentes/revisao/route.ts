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
  aceitas?: string[];
  rejeitadas?: string[];
  finalizado_em?: string;
}

export interface RevisaoProcessingState {
  status: "processing";
  batch_id: string;
  total_chunks: number;
  iniciado_em: string;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function extractSugestoes(text: string): SugestaoRevisao[] {
  const parsed = parseLLMJson<unknown>(text);
  let sugestoes: SugestaoRevisao[];

  if (Array.isArray(parsed)) {
    sugestoes = parsed as SugestaoRevisao[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    let inner: unknown[] | undefined = Object.values(obj).find(Array.isArray) as unknown[] | undefined;
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
      sugestoes = [obj as unknown as SugestaoRevisao];
    } else {
      console.warn("[revisao] Resposta inesperada da IA:", JSON.stringify(parsed).slice(0, 200));
      sugestoes = [];
    }
  } else {
    sugestoes = [];
  }

  return sugestoes.filter(
    s => s.trecho_original?.trim() && s.sugestao?.trim() && s.trecho_original.trim() !== s.sugestao.trim()
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
    await supabase.from("projects")
      .update({ dados_revisao: revisaoMock, etapa_atual: "revisao" })
      .eq("id", project_id).eq("user_id", user.id);
    return NextResponse.json({ status: "done", revisao: revisaoMock });
  }

  const SYSTEM_PROMPT = await getAgentPrompt("revisao", FALLBACK_PROMPT);
  const chunks = splitIntoChunks(texto, 10_000);

  // Submete todos os chunks como um único batch assíncrono — sem timeout de execução.
  const batch = await anthropic.messages.batches.create({
    requests: chunks.map((chunk, i) => ({
      custom_id: `chunk-${i}`,
      params: {
        model: "claude-sonnet-4-6",
        max_tokens: 8096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user" as const,
          content: `Revise o seguinte trecho do manuscrito com minúcia (parte ${i + 1} de ${chunks.length}). Analise do início ao fim, distribuindo as sugestões uniformemente. Retorne apenas o array JSON de sugestões:\n\n${chunk}`,
        }],
      },
    })),
  });

  const state: RevisaoProcessingState = {
    status: "processing",
    batch_id: batch.id,
    total_chunks: chunks.length,
    iniciado_em: new Date().toISOString(),
  };

  await supabase.from("projects")
    .update({ dados_revisao: state, etapa_atual: "revisao" })
    .eq("id", project_id).eq("user_id", user.id);

  void (async () => {
    try {
      langfuse?.trace({
        name: "revisao-batch-submitted",
        userId: user.id,
        metadata: { project_id, batch_id: batch.id, total_chunks: chunks.length },
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
    const done = batch.request_counts.succeeded + batch.request_counts.errored;
    return NextResponse.json({ status: "processing", done, total: total_chunks });
  }

  // Batch concluído — coleta, faz merge e salva resultado final
  const allSugestoes: SugestaoRevisao[] = [];
  for await (const result of await anthropic.messages.batches.results(batch_id)) {
    if (result.result.type === "succeeded") {
      const block = result.result.message.content[0];
      if (block?.type === "text") {
        allSugestoes.push(...extractSugestoes(block.text));
      }
    }
  }

  const revisao: RevisaoResult = {
    sugestoes: deduplicateAndRenumber(allSugestoes),
    revisado_em: new Date().toISOString(),
  };

  await supabase.from("projects")
    .update({ dados_revisao: revisao })
    .eq("id", project_id).eq("user_id", user.id);

  void (async () => {
    try {
      langfuse?.trace({
        name: "revisao-batch-completed",
        userId: user.id,
        metadata: { project_id, total_sugestoes: revisao.sugestoes.length },
      });
      await langfuse?.flushAsync();
    } catch {}
  })();

  return NextResponse.json({ status: "done", revisao });
}

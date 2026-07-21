import Anthropic from "@anthropic-ai/sdk";
import { Langfuse } from "langfuse";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // FIX-13: janelas de 529 (overload) de 1-2 min estouram o default (2).
  // Backoff exponencial do SDK; afeta todos os agentes síncronos.
  maxRetries: 4,
});

const langfuseEnabled = !!process.env.LANGFUSE_PUBLIC_KEY;

export const langfuse = langfuseEnabled
  ? new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_HOST,
    })
  : null;

export async function traceClaudeCall<T>(params: {
  agentName: string;
  projectId?: string;
  userId?: string;
  model?: string;
  input?: unknown;
  fn: () => Promise<T>;
  metadata?: Record<string, unknown>;
}): Promise<T> {
  if (!langfuse) return params.fn();

  const startTime = new Date();
  const trace = langfuse.trace({
    name: params.agentName,
    userId: params.userId,
    input: params.input,
    metadata: { project_id: params.projectId, ...params.metadata },
    tags: [params.agentName],
  });

  const generation = trace.generation({
    name: params.agentName,
    model: params.model,
    input: params.input,
    startTime,
  });

  try {
    const result = await params.fn();

    // Auto-extract usage and output from Anthropic message responses
    const maybeMsg = result as Record<string, unknown>;
    const usage = maybeMsg.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    const output = maybeMsg.content ?? maybeMsg.output;

    generation.end({
      output,
      usage: usage ? { input: usage.input_tokens, output: usage.output_tokens } : undefined,
    });
    trace.update({ output: { duration_ms: Date.now() - startTime.getTime() } });
    await langfuse.flushAsync();
    return result;
  } catch (e) {
    generation.end({
      level: "ERROR",
      statusMessage: e instanceof Error ? e.message : String(e),
    });
    trace.update({
      output: { error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startTime.getTime() },
    });
    await langfuse.flushAsync();
    throw e;
  }
}

export function parseLLMJson<T>(rawText: string): T {
  const clean = rawText
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```$/im, "")
    .trim();

  try {
    return JSON.parse(clean) as T;
  } catch (firstErr) {
    // Greedy regex fails when Claude adds trailing text that contains ] or }
    // (e.g. "sugestões [1, 2] identificadas." after the array).
    // Bracket-balanced scan stops at the correct closing bracket regardless.
    const extracted = extractFirstJsonValue(clean);
    if (!extracted) {
      throw new Error(
        `Nenhum JSON válido na resposta da IA. Preview: ${clean.slice(0, 300)}`
      );
    }
    try {
      return JSON.parse(extracted) as T;
    } catch (secondErr) {
      const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(
        `JSON inválido mesmo após extração balanceada. ` +
          `Primeira tentativa: ${firstMsg}. ` +
          `Segunda tentativa: ${secondMsg}. ` +
          `Preview do extraído: ${extracted.slice(0, 300)}`
      );
    }
  }
}

function extractFirstJsonValue(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;
    let depth = 1;
    let inString = false;
    let escape = false;
    for (let j = i + 1; j < text.length; j++) {
      const c = text[j];
      if (escape)               { escape = false; continue; }
      if (c === "\\" && inString) { escape = true;  continue; }
      if (c === '"')              { inString = !inString; continue; }
      if (inString)               continue;
      if (c === "{" || c === "[") { depth++; continue; }
      if (c === "}" || c === "]") {
        if (--depth === 0) return text.slice(i, j + 1);
      }
    }
  }
  return null;
}

export function extractText(content: Anthropic.ContentBlock[]): string {
  const block = content[0];
  return block?.type === "text" ? block.text : "";
}

export const isMock = () => process.env.MOCK_AI === "true";

// Safer than NODE_ENV === "development" alone — guards against misconfigured Vercel
// envs where NODE_ENV leaks as "development" on preview/production deployments.
export const isDev = () =>
  process.env.NODE_ENV === "development" &&
  process.env.VERCEL_ENV !== "production" &&
  process.env.VERCEL_ENV !== "preview";

import Anthropic from "@anthropic-ai/sdk";
import { Langfuse } from "langfuse";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
  fn: () => Promise<T>;
  metadata?: Record<string, unknown>;
}): Promise<T> {
  if (!langfuse) return params.fn();

  const startTime = Date.now();
  const trace = langfuse.trace({
    name: params.agentName,
    userId: params.userId,
    metadata: { project_id: params.projectId, ...params.metadata },
  });

  try {
    const result = await params.fn();
    trace.update({ output: { duration_ms: Date.now() - startTime } });
    await langfuse.flushAsync();
    return result;
  } catch (e) {
    trace.update({
      output: { error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startTime },
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
  } catch {
    const match = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) throw new Error("Nenhum JSON válido na resposta da IA.");
    return JSON.parse(match[0]) as T;
  }
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

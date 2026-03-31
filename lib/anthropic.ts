import Anthropic from "@anthropic-ai/sdk";

/** Shared Anthropic client — instantiated once at module load. */
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Extracts the text from a Claude response and parses it as JSON.
 * Handles markdown code fences (```json ... ```) that Claude sometimes adds.
 * Falls back to extracting the first JSON object or array literal.
 */
export function parseLLMJson<T>(rawText: string): T {
  const clean = rawText
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```$/im, "")
    .trim();

  try {
    return JSON.parse(clean) as T;
  } catch {
    // Fall back: extract first {...} or [...] block
    const match = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) throw new Error("Nenhum JSON válido na resposta da IA.");
    return JSON.parse(match[0]) as T;
  }
}

/** Convenience: extract text from the first content block of a Claude message. */
export function extractText(
  content: Anthropic.ContentBlock[]
): string {
  const block = content[0];
  return block?.type === "text" ? block.text : "";
}

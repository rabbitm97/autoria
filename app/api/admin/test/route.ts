import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase-server";
import { anthropic, extractText } from "@/lib/anthropic";

// ─── POST /api/admin/test ─────────────────────────────────────────────────────
// Dry-run: calls Claude with the given system prompt + user input.
// Does NOT write anything to Supabase. Returns output, token counts and cost.

const COST_PER_M_INPUT:  Record<string, number> = {
  "claude-sonnet-4-6":          3.00,
  "claude-haiku-4-5-20251001":  0.80,
  "claude-opus-4-7":           15.00,
};
const COST_PER_M_OUTPUT: Record<string, number> = {
  "claude-sonnet-4-6":         15.00,
  "claude-haiku-4-5-20251001":  4.00,
  "claude-opus-4-7":           75.00,
};

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  let body: {
    agent_name: string;
    model: string;
    system_prompt: string;
    user_input: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { model, system_prompt, user_input } = body;

  const validModels = Object.keys(COST_PER_M_INPUT);
  if (!validModels.includes(model)) {
    return NextResponse.json(
      { error: `Modelo inválido. Use: ${validModels.join(", ")}` },
      { status: 400 }
    );
  }

  if (!system_prompt?.trim() || !user_input?.trim()) {
    return NextResponse.json(
      { error: "system_prompt e user_input são obrigatórios" },
      { status: 400 }
    );
  }

  const t0 = Date.now();

  const msg = await anthropic.messages.create({
    model: model as "claude-sonnet-4-6",
    max_tokens: 2048,
    system: system_prompt.trim(),
    messages: [{ role: "user", content: user_input.trim() }],
  });

  const duration_ms   = Date.now() - t0;
  const input_tokens  = msg.usage.input_tokens;
  const output_tokens = msg.usage.output_tokens;
  const cost_usd =
    (input_tokens  / 1_000_000) * (COST_PER_M_INPUT[model]  ?? 3) +
    (output_tokens / 1_000_000) * (COST_PER_M_OUTPUT[model] ?? 15);

  return NextResponse.json({
    output:        extractText(msg.content),
    input_tokens,
    output_tokens,
    cost_usd:      +cost_usd.toFixed(6),
    duration_ms,
    stop_reason:   msg.stop_reason,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── GET /api/admin/prompts/[nome] ────────────────────────────────────────────
// Returns the last 10 versions + which one is active.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const { nome } = await params;

  const { data: versions } = await svc()
    .from("agent_prompts")
    .select("id, agent_name, version, is_active, created_at, created_by, prompt_content")
    .eq("agent_name", nome)
    .order("version", { ascending: false })
    .limit(10);

  return NextResponse.json(versions ?? []);
}

// ─── POST /api/admin/prompts/[nome] ───────────────────────────────────────────
// Saves a new version and marks it active (deactivates previous).

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  let user: { id: string; email?: string };
  try {
    ({ user } = await requireAdmin());
  } catch (res) {
    return res as Response;
  }

  const { nome } = await params;

  let body: { prompt_content: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.prompt_content?.trim()) {
    return NextResponse.json({ error: "prompt_content obrigatório" }, { status: 400 });
  }

  const client = svc();

  // Get current max version
  const { data: latest } = await client
    .from("agent_prompts")
    .select("version")
    .eq("agent_name", nome)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version ?? 0) + 1;

  // Deactivate current active
  await client
    .from("agent_prompts")
    .update({ is_active: false })
    .eq("agent_name", nome)
    .eq("is_active", true);

  // Insert new active version
  const { data: inserted, error } = await client
    .from("agent_prompts")
    .insert({
      agent_name: nome,
      prompt_content: body.prompt_content.trim(),
      version: nextVersion,
      is_active: true,
      created_by: user.email ?? user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(inserted);
}

// ─── PATCH /api/admin/prompts/[nome]?revert=<id> ──────────────────────────────
// Reverts to a specific version (sets it active, deactivates others).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const { nome } = await params;
  const id = req.nextUrl.searchParams.get("revert");
  if (!id) return NextResponse.json({ error: "revert id obrigatório" }, { status: 400 });

  const client = svc();

  await client
    .from("agent_prompts")
    .update({ is_active: false })
    .eq("agent_name", nome);

  await client
    .from("agent_prompts")
    .update({ is_active: true })
    .eq("id", id)
    .eq("agent_name", nome);

  return NextResponse.json({ ok: true });
}

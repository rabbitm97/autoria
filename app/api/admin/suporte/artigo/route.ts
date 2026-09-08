// SUP-2 · Flywheel KCS — CRUD mínimo de artigos derivados do suporte.
//
// kb_artigos NÃO tem RLS para authenticated (só service_role); todas as
// operações passam pela rota, guardadas por requireAdmin(). Status é
// 'rascunho' por default; consumo pelo autor não é objetivo deste bloco
// (estágio 2/3 do desenho — SUP-3+).

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

interface ArtigoRow {
  id: string;
  pergunta: string;
  resposta: string;
  tags: string[];
  origem_conversa_id: string | null;
  status: "rascunho" | "publicado";
  criado_em: string;
  atualizado_em: string;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalizarTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 20);
}

// ─── POST — cria rascunho ────────────────────────────────────────────────────

interface PostBody {
  conversa_id?: string | null;
  pergunta?: string;
  resposta?: string;
  tags?: string[];
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const pergunta = typeof body.pergunta === "string" ? body.pergunta.trim() : "";
  const resposta = typeof body.resposta === "string" ? body.resposta.trim() : "";
  const tags = normalizarTags(body.tags);

  if (!pergunta) return NextResponse.json({ error: "pergunta obrigatória." }, { status: 400 });
  if (!resposta) return NextResponse.json({ error: "resposta obrigatória." }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from("kb_artigos")
    .insert({
      pergunta,
      resposta,
      tags,
      origem_conversa_id: body.conversa_id ?? null,
      status: "rascunho",
    })
    .select("id, pergunta, resposta, tags, origem_conversa_id, status, criado_em, atualizado_em")
    .single();

  if (error) {
    console.error("[kb_artigos POST]:", error.message);
    return NextResponse.json({ error: "Falha ao salvar artigo." }, { status: 500 });
  }

  return NextResponse.json(data as ArtigoRow, { status: 201 });
}

// ─── GET — lista (rascunhos primeiro) ────────────────────────────────────────

export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("kb_artigos")
    .select("id, pergunta, resposta, tags, origem_conversa_id, status, criado_em, atualizado_em")
    .order("status", { ascending: false })      // 'rascunho' > 'publicado' em ASCII → rascunhos primeiro
    .order("atualizado_em", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[kb_artigos GET]:", error.message);
    return NextResponse.json({ error: "Falha ao listar artigos." }, { status: 500 });
  }
  return NextResponse.json({ items: (data ?? []) as ArtigoRow[] });
}

// ─── PATCH — editar/publicar/voltar-a-rascunho ───────────────────────────────

interface PatchBody {
  id?: string;
  pergunta?: string;
  resposta?: string;
  tags?: string[];
  status?: "rascunho" | "publicado";
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id obrigatório." }, { status: 400 });

  const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (typeof body.pergunta === "string") {
    const p = body.pergunta.trim();
    if (!p) return NextResponse.json({ error: "pergunta não pode ser vazia." }, { status: 400 });
    patch.pergunta = p;
  }
  if (typeof body.resposta === "string") {
    const r = body.resposta.trim();
    if (!r) return NextResponse.json({ error: "resposta não pode ser vazia." }, { status: 400 });
    patch.resposta = r;
  }
  if (Array.isArray(body.tags)) patch.tags = normalizarTags(body.tags);
  if (body.status === "rascunho" || body.status === "publicado") patch.status = body.status;

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "nada para atualizar." }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("kb_artigos")
    .update(patch)
    .eq("id", id)
    .select("id, pergunta, resposta, tags, origem_conversa_id, status, criado_em, atualizado_em")
    .single();

  if (error) {
    console.error("[kb_artigos PATCH]:", error.message);
    return NextResponse.json({ error: "Falha ao atualizar artigo." }, { status: 500 });
  }
  return NextResponse.json(data as ArtigoRow);
}

// SUP-2 · Inbox admin do suporte humano.
//
// GET (sem query)  → lista até 50 conversas com prévia da última mensagem
//                   e flag nao_respondida (última é do usuario). Ordem:
//                   1) abertas + não respondidas (fila de trabalho)
//                   2) abertas + respondidas (aguardando o autor)
//                   3) fechadas (histórico)
// GET ?c=<id>      → conversa completa (mensagens ordenadas ASC) + usuario.
// POST             → responde como equipe; e-mail best-effort ao autor.
// PATCH            → fecha/reabre a conversa.
//
// RLS: suporte_conversas e suporte_mensagens só liberam para o dono via
// authenticated. Admin precisa de service_role para bypass — o guard de
// autorização é o requireAdmin() no início (checa ADMIN_EMAILS + users.role='admin'
// via lib/supabase-server.ts).

export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";
import { sendEmail, buildRespostaSuporteEmail } from "@/lib/email";

interface Mensagem {
  id: string;
  conversa_id: string;
  autor: "usuario" | "equipe";
  texto: string;
  criado_em: string;
}

interface PerfilUsuario {
  nome: string | null;
  email: string;
}

interface ConversaRow {
  id: string;
  user_id: string;
  status: "aberta" | "fechada";
  criado_em: string;
  atualizado_em: string;
}

interface InboxItem {
  id: string;
  status: "aberta" | "fechada";
  atualizado_em: string;
  criado_em: string;
  usuario: PerfilUsuario;
  ultima_mensagem: Mensagem | null;
  nao_respondida: boolean;
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const admin = adminClient();
  const url = new URL(req.url);
  const c = url.searchParams.get("c");

  if (c) return getThread(admin, c);

  // Lista: puxa até 100 conversas por atualizado_em desc e ordena/limita depois.
  const { data: conversas, error: convErr } = await admin
    .from("suporte_conversas")
    .select("id, user_id, status, criado_em, atualizado_em")
    .order("atualizado_em", { ascending: false })
    .limit(100);

  if (convErr) {
    console.error("[admin/suporte GET] conversas:", convErr.message);
    return NextResponse.json({ error: "Falha ao carregar inbox." }, { status: 500 });
  }

  const lista = (conversas ?? []) as ConversaRow[];
  if (lista.length === 0) return NextResponse.json({ items: [] as InboxItem[] });

  const convIds = lista.map((c) => c.id);
  const userIds = Array.from(new Set(lista.map((c) => c.user_id)));

  const [{ data: msgs, error: msgErr }, { data: users, error: userErr }] = await Promise.all([
    admin
      .from("suporte_mensagens")
      .select("id, conversa_id, autor, texto, criado_em")
      .in("conversa_id", convIds)
      .order("criado_em", { ascending: false }),
    admin
      .from("users")
      .select("id, nome, email")
      .in("id", userIds),
  ]);

  if (msgErr || userErr) {
    console.error("[admin/suporte GET] joins:", msgErr?.message, userErr?.message);
    return NextResponse.json({ error: "Falha ao montar inbox." }, { status: 500 });
  }

  const ultimaPor = new Map<string, Mensagem>();
  for (const m of (msgs ?? []) as Mensagem[]) {
    if (!ultimaPor.has(m.conversa_id)) ultimaPor.set(m.conversa_id, m);
  }

  const perfilPor = new Map<string, PerfilUsuario>();
  for (const u of (users ?? []) as { id: string; nome: string | null; email: string }[]) {
    perfilPor.set(u.id, { nome: u.nome, email: u.email });
  }

  const items: InboxItem[] = lista.map((c) => {
    const ultima = ultimaPor.get(c.id) ?? null;
    return {
      id: c.id,
      status: c.status,
      atualizado_em: c.atualizado_em,
      criado_em: c.criado_em,
      usuario: perfilPor.get(c.user_id) ?? { nome: null, email: "" },
      ultima_mensagem: ultima,
      nao_respondida: !!(ultima && ultima.autor === "usuario" && c.status === "aberta"),
    };
  });

  // Ordenação: (aberta+não respondida) → (aberta+respondida) → (fechada); dentro
  // de cada grupo, mais recente primeiro.
  const rank = (i: InboxItem) => {
    if (i.status === "aberta" && i.nao_respondida) return 0;
    if (i.status === "aberta") return 1;
    return 2;
  };
  items.sort((a, b) => {
    const dr = rank(a) - rank(b);
    if (dr !== 0) return dr;
    return b.atualizado_em.localeCompare(a.atualizado_em);
  });

  return NextResponse.json({ items: items.slice(0, 50) });
}

async function getThread(admin: SupabaseClient, conversaId: string): Promise<Response> {
  const { data: conv, error: convErr } = await admin
    .from("suporte_conversas")
    .select("id, user_id, status, criado_em, atualizado_em")
    .eq("id", conversaId)
    .maybeSingle();

  if (convErr) {
    console.error("[admin/suporte GET c] conversa:", convErr.message);
    return NextResponse.json({ error: "Falha ao localizar conversa." }, { status: 500 });
  }
  if (!conv) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const row = conv as ConversaRow;

  const [{ data: msgs, error: msgErr }, { data: userRow, error: userErr }] = await Promise.all([
    admin
      .from("suporte_mensagens")
      .select("id, conversa_id, autor, texto, criado_em")
      .eq("conversa_id", conversaId)
      .order("criado_em", { ascending: true }),
    admin
      .from("users")
      .select("nome, email")
      .eq("id", row.user_id)
      .maybeSingle(),
  ]);

  if (msgErr || userErr) {
    console.error("[admin/suporte GET c] joins:", msgErr?.message, userErr?.message);
    return NextResponse.json({ error: "Falha ao carregar conversa." }, { status: 500 });
  }

  const perfil = (userRow as { nome: string | null; email: string } | null) ?? { nome: null, email: "" };
  return NextResponse.json({
    id: row.id,
    status: row.status,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
    usuario: { nome: perfil.nome, email: perfil.email },
    mensagens: (msgs ?? []) as Mensagem[],
  });
}

// ─── POST — responde como equipe ─────────────────────────────────────────────

interface PostBody {
  conversa_id?: string;
  texto?: string;
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  const conversaId = typeof body.conversa_id === "string" ? body.conversa_id : "";

  if (!conversaId) return NextResponse.json({ error: "conversa_id obrigatório." }, { status: 400 });
  if (!texto) return NextResponse.json({ error: "texto obrigatório." }, { status: 400 });
  if (texto.length > 5000) {
    return NextResponse.json({ error: "Mensagem muito longa (máx. 5000)." }, { status: 400 });
  }

  const admin = adminClient();

  const { data: conv, error: convErr } = await admin
    .from("suporte_conversas")
    .select("id, user_id")
    .eq("id", conversaId)
    .maybeSingle();
  if (convErr || !conv) {
    return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
  }

  const { error: msgErr } = await admin
    .from("suporte_mensagens")
    .insert({ conversa_id: conversaId, autor: "equipe", texto });
  if (msgErr) {
    console.error("[admin/suporte POST] inserir mensagem:", msgErr.message);
    return NextResponse.json({ error: "Falha ao enviar resposta." }, { status: 500 });
  }

  {
    const { error: updErr } = await admin
      .from("suporte_conversas")
      .update({ atualizado_em: new Date().toISOString(), status: "aberta" })
      .eq("id", conversaId);
    if (updErr) console.warn("[admin/suporte POST] update conversa:", updErr.message);
  }

  // E-mail ao autor (best-effort).
  void (async () => {
    try {
      const { data: userRow } = await admin
        .from("users")
        .select("nome, email")
        .eq("id", (conv as { user_id: string }).user_id)
        .maybeSingle();
      const perfil = userRow as { nome: string | null; email: string } | null;
      if (!perfil?.email) return;
      const t = buildRespostaSuporteEmail({ nomeAutor: perfil.nome });
      await sendEmail({ to: perfil.email, subject: t.subject, text: t.text });
    } catch (e) {
      console.error("[admin/suporte POST] e-mail autor:", e);
    }
  })();

  return NextResponse.json({ ok: true }, { status: 201 });
}

// ─── PATCH — fecha/reabre ────────────────────────────────────────────────────

interface PatchBody {
  conversa_id?: string;
  status?: "aberta" | "fechada";
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const conversaId = typeof body.conversa_id === "string" ? body.conversa_id : "";
  const status = body.status;

  if (!conversaId) return NextResponse.json({ error: "conversa_id obrigatório." }, { status: 400 });
  if (status !== "aberta" && status !== "fechada") {
    return NextResponse.json({ error: "status inválido." }, { status: 400 });
  }

  const admin = adminClient();
  const { error } = await admin
    .from("suporte_conversas")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", conversaId);
  if (error) {
    console.error("[admin/suporte PATCH]:", error.message);
    return NextResponse.json({ error: "Falha ao atualizar conversa." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

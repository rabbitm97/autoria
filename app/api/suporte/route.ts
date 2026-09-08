export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";

// ─── SUP-1 · Suporte humano (beta) ────────────────────────────────────────────
// Threads persistentes em suporte_conversas + suporte_mensagens. A rota antiga
// /api/agentes/suporte fica dormente (estágio 3 do KCS). RLS já limita ao dono
// da conversa; a rota centraliza ordenação, marca lida_em das respostas da
// equipe e dispara a notificação por e-mail (best-effort).

const MAX_TEXTO = 5000;
const LIMITE_MSGS_DIA = 20;

interface Mensagem {
  id: string;
  conversa_id: string;
  autor: "usuario" | "equipe";
  texto: string;
  criado_em: string;
  lida_em: string | null;
}

interface ConversaComMensagens {
  id: string;
  status: "aberta" | "fechada";
  criado_em: string;
  atualizado_em: string;
  mensagens: Mensagem[];
}

// ─── GET ──────────────────────────────────────────────────────────────────────
// Lista conversas do usuário (mais recente primeiro) com mensagens ordenadas
// crescente. Marca lida_em das mensagens de 'equipe' ainda não lidas.

export async function GET() {
  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as Response;
  }
  const { user, supabase } = auth;

  const { data: conversas, error: convErr } = await supabase
    .from("suporte_conversas")
    .select("id, status, criado_em, atualizado_em")
    .eq("user_id", user.id)
    .order("atualizado_em", { ascending: false });

  if (convErr) {
    console.error("[suporte GET] conversas:", convErr.message);
    return NextResponse.json({ error: "Falha ao carregar conversas." }, { status: 500 });
  }

  const lista = (conversas ?? []) as Omit<ConversaComMensagens, "mensagens">[];
  if (lista.length === 0) return NextResponse.json([] as ConversaComMensagens[]);

  const ids = lista.map((c) => c.id);
  const { data: mensagens, error: msgErr } = await supabase
    .from("suporte_mensagens")
    .select("id, conversa_id, autor, texto, criado_em, lida_em")
    .in("conversa_id", ids)
    .order("criado_em", { ascending: true });

  if (msgErr) {
    console.error("[suporte GET] mensagens:", msgErr.message);
    return NextResponse.json({ error: "Falha ao carregar mensagens." }, { status: 500 });
  }

  const todas = (mensagens ?? []) as Mensagem[];

  // Marca lida_em das mensagens de 'equipe' ainda não lidas (best-effort).
  const naoLidas = todas.filter((m) => m.autor === "equipe" && !m.lida_em).map((m) => m.id);
  if (naoLidas.length > 0) {
    const agora = new Date().toISOString();
    void (async () => {
      try {
        await supabase.from("suporte_mensagens").update({ lida_em: agora }).in("id", naoLidas);
      } catch (e) {
        console.warn("[suporte GET] marcar lida falhou:", e);
      }
    })();
  }

  const porConversa = new Map<string, Mensagem[]>();
  for (const m of todas) {
    const arr = porConversa.get(m.conversa_id) ?? [];
    arr.push(m);
    porConversa.set(m.conversa_id, arr);
  }

  const resposta: ConversaComMensagens[] = lista.map((c) => ({
    ...c,
    mensagens: porConversa.get(c.id) ?? [],
  }));

  return NextResponse.json(resposta);
}

// ─── POST ─────────────────────────────────────────────────────────────────────
// Cria/continua conversa. Se conversa_id ausente ou fechada, abre nova. Envia
// notificação por e-mail para SUPORTE_EMAIL_EQUIPE (best-effort — não bloqueia
// a resposta e não impede persistência).

interface PostBody {
  conversa_id?: string;
  texto?: string;
}

export async function POST(req: NextRequest) {
  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as Response;
  }
  const { user, supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const texto = typeof body.texto === "string" ? body.texto.trim() : "";
  if (!texto) {
    return NextResponse.json({ error: "texto obrigatório." }, { status: 400 });
  }
  if (texto.length > MAX_TEXTO) {
    return NextResponse.json(
      { error: `Mensagem muito longa (máx. ${MAX_TEXTO} caracteres).` },
      { status: 400 },
    );
  }

  // Anti-spam: máx. LIMITE_MSGS_DIA mensagens por usuário nas últimas 24h.
  const inicio24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: msgsHoje, error: countErr } = await supabase
    .from("suporte_mensagens")
    .select("id, suporte_conversas!inner(user_id)", { count: "exact", head: true })
    .eq("autor", "usuario")
    .eq("suporte_conversas.user_id", user.id)
    .gte("criado_em", inicio24h);

  if (countErr) {
    console.error("[suporte POST] count:", countErr.message);
  } else if ((msgsHoje ?? 0) >= LIMITE_MSGS_DIA) {
    return NextResponse.json(
      { error: `Limite de ${LIMITE_MSGS_DIA} mensagens por dia atingido. Aguarde 24h.` },
      { status: 429 },
    );
  }

  // Decide a conversa alvo. Se veio conversa_id, exige que seja do usuário e
  // esteja aberta; caso contrário, cria nova.
  let conversaId: string | null = null;
  if (body.conversa_id) {
    const { data: conv, error: convErr } = await supabase
      .from("suporte_conversas")
      .select("id, status")
      .eq("id", body.conversa_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (convErr) {
      console.error("[suporte POST] busca conversa:", convErr.message);
      return NextResponse.json({ error: "Falha ao localizar conversa." }, { status: 500 });
    }
    if (conv && conv.status === "aberta") {
      conversaId = conv.id;
    }
    // Se conv não existe, está fechada ou não pertence ao usuário, cai no
    // caminho de criar uma nova (mais tolerante do que 404).
  }

  if (!conversaId) {
    const { data: nova, error: novaErr } = await supabase
      .from("suporte_conversas")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (novaErr || !nova) {
      console.error("[suporte POST] criar conversa:", novaErr?.message);
      return NextResponse.json({ error: "Falha ao criar conversa." }, { status: 500 });
    }
    conversaId = (nova as { id: string }).id;
  }

  const { error: msgErr } = await supabase
    .from("suporte_mensagens")
    .insert({ conversa_id: conversaId, autor: "usuario", texto });

  if (msgErr) {
    console.error("[suporte POST] inserir mensagem:", msgErr.message);
    return NextResponse.json({ error: "Falha ao enviar mensagem." }, { status: 500 });
  }

  // Atualiza status/atualizado_em da conversa (idempotente para conversa nova).
  {
    const { error: updErr } = await supabase
      .from("suporte_conversas")
      .update({ status: "aberta", atualizado_em: new Date().toISOString() })
      .eq("id", conversaId);
    if (updErr) console.warn("[suporte POST] update conversa:", updErr.message);
  }

  // Notificação por e-mail à equipe (best-effort).
  void (async () => {
    try {
      const destino = process.env.SUPORTE_EMAIL_EQUIPE;
      if (!destino) {
        console.warn("[suporte POST] SUPORTE_EMAIL_EQUIPE ausente — notificação ignorada.");
        return;
      }
      const { data: perfil } = await supabase
        .from("users")
        .select("nome, email")
        .eq("id", user.id)
        .maybeSingle();
      const nome = (perfil as { nome?: string } | null)?.nome?.trim() || user.email || "usuário";
      const emailUsuario = (perfil as { email?: string } | null)?.email || user.email || "";
      await sendEmail({
        to: destino,
        subject: `[Suporte] Nova mensagem de ${nome}`,
        text:
          `Nova mensagem no suporte da Autoria.\n\n` +
          `Usuário: ${nome} <${emailUsuario}>\n` +
          `Conversa: ${conversaId}\n\n` +
          `Mensagem:\n${texto}\n\n` +
          `Responda pelo inbox: https://useautoria.com/admin/suporte?c=${conversaId}`,
        replyTo: emailUsuario || undefined,
      });
    } catch (e) {
      console.error("[suporte POST] notificação e-mail falhou:", e);
    }
  })();

  return NextResponse.json({ ok: true, conversa_id: conversaId }, { status: 201 });
}

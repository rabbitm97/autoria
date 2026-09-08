// REC-1 · POST /api/beta — inscrição pública na fase beta.
//
// Rota sem autenticação — qualquer pessoa se inscreve. Defesas:
//  · honeypot (campo `website`)
//  · rate limit por IP (5/h in-memory por instância)
//  · unique index em lower(email) — 23505 vira {ok:true, ja_inscrito:true}
//
// Escrita via service_role: beta_inscricoes tem RLS habilitada sem policies
// para authenticated/anon. Admin consome pelo Studio nesta fase.
//
// E-mail é best-effort: falha de envio não impede gravação. Notificação vai
// para SUPORTE_EMAIL_EQUIPE (mesma caixa do fluxo humano de suporte).

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

const MANUSCRITO_VALUES = ["concluido", "em_revisao", "escrevendo"] as const;
type ManuscritoStatus = (typeof MANUSCRITO_VALUES)[number];

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateBuckets = new Map<string, number[]>();

function extractIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

function checkRateLimit(ip: string | null): boolean {
  if (!ip) return true;
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (arr.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(ip, arr);
  return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  nome?: string;
  email?: string;
  manuscrito_status?: string;
  sobre_livro?: string;
  como_soube?: string;
  website?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body JSON obrigatório." }, { status: 400 });
  }

  // Honeypot — bot preencheu campo oculto.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const ip = extractIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Muitas inscrições deste IP na última hora. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const manuscritoRaw = typeof body.manuscrito_status === "string" ? body.manuscrito_status : "";
  const sobreLivro = typeof body.sobre_livro === "string" ? body.sobre_livro.trim() : "";
  const comoSoube = typeof body.como_soube === "string" ? body.como_soube.trim() : "";

  const faltando: string[] = [];
  if (!nome) faltando.push("nome");
  if (!email) faltando.push("email");
  if (!manuscritoRaw) faltando.push("manuscrito_status");
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: "Campos obrigatórios ausentes.", faltando },
      { status: 400 },
    );
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (nome.length > 120) {
    return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
  }
  if (sobreLivro.length > 2000) {
    return NextResponse.json({ error: "Campo 'sobre o livro' muito longo (máx. 2000)." }, { status: 400 });
  }
  if (comoSoube.length > 500) {
    return NextResponse.json({ error: "Campo 'como soube' muito longo." }, { status: 400 });
  }

  if (!(MANUSCRITO_VALUES as readonly string[]).includes(manuscritoRaw)) {
    return NextResponse.json(
      { error: `manuscrito_status inválido. Valores: ${MANUSCRITO_VALUES.join(", ")}.` },
      { status: 400 },
    );
  }
  const manuscrito_status = manuscritoRaw as ManuscritoStatus;

  const userAgent = req.headers.get("user-agent");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await admin
    .from("beta_inscricoes")
    .insert({
      nome,
      email,
      manuscrito_status,
      sobre_livro: sobreLivro || null,
      como_soube: comoSoube || null,
      ip,
      user_agent: userAgent,
    });

  if (error) {
    // 23505 = unique_violation no índice de lower(email) — trata como sucesso silencioso.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, ja_inscrito: true }, { status: 200 });
    }
    console.error("[beta] insert falhou:", error.message);
    return NextResponse.json({ error: "Falha ao registrar inscrição." }, { status: 500 });
  }

  // E-mail best-effort para a equipe. Sem confirmação ao autor — a página
  // já exibe o estado de sucesso e o próximo contato virá do fundador.
  const equipeMailbox = process.env.SUPORTE_EMAIL_EQUIPE;
  if (equipeMailbox) {
    const statusLabel =
      manuscrito_status === "concluido"
        ? "Concluído"
        : manuscrito_status === "em_revisao"
          ? "Em revisão"
          : "Escrevendo";

    const alertaTexto =
      `Nova inscrição na fase beta.\n\n` +
      `Nome: ${nome}\n` +
      `E-mail: ${email}\n` +
      `Manuscrito: ${statusLabel}\n` +
      (sobreLivro ? `\nSobre o livro:\n${sobreLivro}\n` : "") +
      (comoSoube ? `\nComo soube: ${comoSoube}\n` : "") +
      `\nTriagem: Supabase Studio → beta_inscricoes`;

    void sendEmail({
      to: equipeMailbox,
      subject: `[Beta] Nova inscrição · ${nome}`,
      text: alertaTexto,
      replyTo: email,
    }).catch((e) => console.error("[beta] email falhou:", e));
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

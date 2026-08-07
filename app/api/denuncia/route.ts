// POST /api/denuncia — canal público de notificação (LEGAL-1D).
//
// Verdade 41: toda notificação gera registro imutável de entrada. Rota
// sem autenticação — qualquer pessoa pode notificar, inclusive quem não
// tem conta. Defesas: honeypot (campo `website`), rate limit por IP
// (5/h in-memory por instância), validação de trecho mínimo.
//
// Escrita via service_role — content_reports tem RLS habilitada sem
// policies (nenhum authenticated/anon lê ou escreve direto).
//
// E-mail é best-effort: falha de envio não impede gravação.

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

const VINCULOS = ["titular", "representante", "terceiro", "autoridade"] as const;
const FUNDAMENTOS = ["direito_autoral", "imagem_honra", "dados_pessoais", "ilicito", "outro"] as const;
type Vinculo = (typeof VINCULOS)[number];
type Fundamento = (typeof FUNDAMENTOS)[number];

const DENUNCIA_MAILBOX = "denuncia@useautoria.com";
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Rate limit in-memory. Serverless: um Map por instância — suficiente
// para 5/h; instâncias diferentes têm janelas independentes, mas isso
// é aceitável no volume esperado.
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

const PROTOCOLO_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function generateProtocolo(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += PROTOCOLO_ALPHABET[Math.floor(Math.random() * PROTOCOLO_ALPHABET.length)];
  }
  return `AUT-${y}${m}${d}-${suffix}`;
}

type Body = {
  nome?: string;
  email?: string;
  vinculo?: string;
  obraRef?: string;
  fundamento?: string;
  trecho?: string;
  descricao?: string;
  provaUrl?: string | null;
  declaracaoBoaFe?: boolean;
  website?: string;
  projectId?: string | null;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body JSON obrigatório." }, { status: 400 });
  }

  // Honeypot — bot preencheu campo oculto.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ protocolo: generateProtocolo() }, { status: 200 });
  }

  // Rate limit.
  const ip = extractIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Limite de 5 notificações por hora atingido. Tente novamente mais tarde." },
      { status: 429 },
    );
  }

  const faltando: string[] = [];
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const vinculoRaw = typeof body.vinculo === "string" ? body.vinculo : "";
  const obraRef = typeof body.obraRef === "string" ? body.obraRef.trim() : "";
  const fundamentoRaw = typeof body.fundamento === "string" ? body.fundamento : "";
  const trecho = typeof body.trecho === "string" ? body.trecho.trim() : "";
  const descricao = typeof body.descricao === "string" ? body.descricao.trim() : "";

  if (!nome) faltando.push("nome");
  if (!email) faltando.push("email");
  if (!vinculoRaw) faltando.push("vinculo");
  if (!obraRef) faltando.push("obraRef");
  if (!fundamentoRaw) faltando.push("fundamento");
  if (!trecho) faltando.push("trecho");
  if (!descricao) faltando.push("descricao");
  if (body.declaracaoBoaFe !== true) faltando.push("declaracaoBoaFe");

  if (faltando.length > 0) {
    return NextResponse.json(
      { error: "Campos obrigatórios ausentes.", faltando },
      { status: 400 },
    );
  }

  if (!(VINCULOS as readonly string[]).includes(vinculoRaw)) {
    return NextResponse.json(
      { error: `Vínculo inválido. Valores: ${VINCULOS.join(", ")}.` },
      { status: 400 },
    );
  }
  const vinculo = vinculoRaw as Vinculo;

  if (!(FUNDAMENTOS as readonly string[]).includes(fundamentoRaw)) {
    return NextResponse.json(
      { error: `Fundamento inválido. Valores: ${FUNDAMENTOS.join(", ")}.` },
      { status: 400 },
    );
  }
  const fundamento = fundamentoRaw as Fundamento;

  if (trecho.length < 20) {
    return NextResponse.json(
      {
        error:
          "Indique página, capítulo ou trecho específico (mín. 20 caracteres). Notificação genérica não permite análise.",
      },
      { status: 400 },
    );
  }

  const provaUrl = typeof body.provaUrl === "string" && body.provaUrl.trim() !== ""
    ? body.provaUrl.trim()
    : null;
  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : null;

  const userAgent = req.headers.get("user-agent");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Tenta gerar protocolo único (colisão em 36^4 é raríssima; 3 tentativas).
  let protocolo = "";
  let reportId: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    protocolo = generateProtocolo();
    const { data, error } = await admin
      .from("content_reports")
      .insert({
        protocolo,
        nome,
        email,
        vinculo,
        obra_ref: obraRef,
        project_id: projectId,
        fundamento,
        trecho,
        descricao,
        prova_url: provaUrl,
        declaracao_boa_fe: true,
        status: "recebida",
        ip,
        user_agent: userAgent,
      })
      .select("id, protocolo")
      .single();

    if (!error && data) {
      reportId = (data as { id: string }).id;
      break;
    }
    // 23505 = unique_violation (protocolo duplicado) — retry
    if (error && error.code !== "23505") {
      console.error("[denuncia] insert content_reports falhou:", error.message);
      return NextResponse.json({ error: "Falha ao registrar notificação." }, { status: 500 });
    }
  }

  if (!reportId) {
    console.error("[denuncia] esgotou tentativas de protocolo único");
    return NextResponse.json({ error: "Falha ao registrar notificação." }, { status: 500 });
  }

  // Ação inicial de recebimento (append-only). Falha aqui só é logada:
  // o registro principal já existe.
  const { error: acaoErr } = await admin.from("content_report_actions").insert({
    report_id: reportId,
    acao: "recebimento_confirmado",
  });
  if (acaoErr) {
    console.error("[denuncia] insert action inicial falhou:", acaoErr.message);
  }

  // E-mails best-effort — não bloqueiam a resposta.
  const confirmacaoTexto =
    `Recebemos sua notificação sobre uma obra publicada pela Autoria.\n\n` +
    `Protocolo: ${protocolo}\n\n` +
    `Confirmaremos o recebimento em até 2 dias úteis e a decisão em até 5 dias úteis, ` +
    `conforme a Política de Conteúdo (https://useautoria.com/politica-de-conteudo).\n\n` +
    `Guarde este protocolo. Se precisar complementar informações, responda a este e-mail.\n\n` +
    `— Equipe Autoria`;

  const alertaTexto =
    `Nova notificação recebida.\n\n` +
    `Protocolo: ${protocolo}\n` +
    `Notificante: ${nome} <${email}> (${vinculo})\n` +
    `Obra: ${obraRef}\n` +
    `Fundamento: ${fundamento}\n` +
    `Trecho: ${trecho}\n\n` +
    `Descrição:\n${descricao}\n\n` +
    (provaUrl ? `Prova: ${provaUrl}\n\n` : "") +
    `Fila: /admin/notificacoes`;

  void Promise.all([
    sendEmail({
      to: email,
      subject: `Autoria — Notificação recebida (${protocolo})`,
      text: confirmacaoTexto,
    }),
    sendEmail({
      to: DENUNCIA_MAILBOX,
      subject: `[Notificação] ${protocolo} · ${fundamento} · ${obraRef.slice(0, 60)}`,
      text: alertaTexto,
      replyTo: email,
    }),
  ]).catch((e) => console.error("[denuncia] emails falharam:", e));

  return NextResponse.json({ protocolo }, { status: 200 });
}

// POST /api/legal/aceite — registra aceite legal versionado (append-only).
//
// Verdade 40: `versao` e `conteudoHash` são resolvidos a partir de
// `LEGAL_DOCS[slug]` no servidor. QUALQUER valor mandado pelo cliente é
// IGNORADO — o cliente não tem autoridade para carimbar versão de aceite.
//
// Escrita via service_role (RLS bloqueia insert de authenticated/anon).
// Idempotente: tupla (user_id, slug, versao, hash, contexto, project_id)
// já existente retorna 200 com o registro original.

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import {
  LEGAL_DOCS,
  LEGAL_DOC_SLUGS,
  LEGAL_ACEITE_CONTEXTOS,
  type LegalDocSlug,
  type LegalAceiteContexto,
} from "@/lib/legal-docs";

type Body = {
  slug?: string;
  contexto?: string;
  projectId?: string | null;
  artefatoRef?: string | null;
};

function extractIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

export async function POST(req: NextRequest) {
  let userId: string;
  let userEmail: string | null;
  try {
    const auth = await requireAuth();
    userId = auth.user.id;
    userEmail = auth.user.email ?? null;
  } catch (e) {
    return e as Response;
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body JSON obrigatório." }, { status: 400 });
  }

  const slugRaw = body.slug;
  if (!slugRaw || !(LEGAL_DOC_SLUGS as readonly string[]).includes(slugRaw)) {
    return NextResponse.json(
      { error: `Campo 'slug' inválido. Valores: ${LEGAL_DOC_SLUGS.join(", ")}.` },
      { status: 400 },
    );
  }
  const slug = slugRaw as LegalDocSlug;

  const contextoRaw = body.contexto;
  if (!contextoRaw || !(LEGAL_ACEITE_CONTEXTOS as readonly string[]).includes(contextoRaw)) {
    return NextResponse.json(
      { error: `Campo 'contexto' inválido. Valores: ${LEGAL_ACEITE_CONTEXTOS.join(", ")}.` },
      { status: 400 },
    );
  }
  const contexto = contextoRaw as LegalAceiteContexto;

  const projectId = body.projectId ?? null;
  const artefatoRef = body.artefatoRef ?? null;

  if (!userEmail) {
    // O snapshot user_email é NOT NULL — sem ele não há como preservar
    // rastreabilidade se a conta for apagada depois.
    return NextResponse.json({ error: "Conta sem email — aceite bloqueado." }, { status: 400 });
  }

  // Se aceite ligado a projeto, exigir ownership do usuário (mesmo padrão
  // de outras rotas: 403 se não for dele).
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  if (projectId) {
    const { data: proj, error: projErr } = await admin
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();
    if (projErr) {
      console.error("[legal/aceite] lookup projeto falhou:", projErr.message);
      return NextResponse.json({ error: "Falha ao validar projeto." }, { status: 500 });
    }
    if (!proj) {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }
    if ((proj as { user_id: string }).user_id !== userId) {
      return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
    }
  }

  const doc = LEGAL_DOCS[slug];
  const docVersao = doc.versao;
  const docHash = doc.conteudoHash;

  // Idempotência: procurar tupla equivalente ANTES de inserir.
  {
    let q = admin
      .from("legal_acceptances")
      .select("id, aceito_em")
      .eq("user_id", userId)
      .eq("doc_slug", slug)
      .eq("doc_versao", docVersao)
      .eq("doc_hash", docHash)
      .eq("contexto", contexto)
      .limit(1);
    q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);

    const { data: existing, error: existErr } = await q;
    if (existErr) {
      console.error("[legal/aceite] lookup idempotência falhou:", existErr.message);
      // Segue para tentar inserir; se colidir, a rota devolve 500 real.
    } else if (existing && existing.length > 0) {
      const row = existing[0] as { id: string; aceito_em: string };
      return NextResponse.json({ id: row.id, aceito_em: row.aceito_em }, { status: 200 });
    }
  }

  const ip = extractIp(req);
  const userAgent = req.headers.get("user-agent");

  const insertRow = {
    user_id: userId,
    user_email: userEmail,
    project_id: projectId,
    doc_slug: slug,
    doc_versao: docVersao,
    doc_hash: docHash,
    contexto,
    artefato_ref: artefatoRef,
    ip,
    user_agent: userAgent,
  };

  const { data: inserted, error: insErr } = await admin
    .from("legal_acceptances")
    .insert(insertRow)
    .select("id, aceito_em")
    .single();

  if (insErr || !inserted) {
    console.error("[legal/aceite] insert falhou:", insErr?.message);
    return NextResponse.json({ error: "Falha ao registrar aceite." }, { status: 500 });
  }

  const row = inserted as { id: string; aceito_em: string };
  return NextResponse.json({ id: row.id, aceito_em: row.aceito_em }, { status: 200 });
}

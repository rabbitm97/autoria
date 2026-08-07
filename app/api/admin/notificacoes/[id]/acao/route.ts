// POST /api/admin/notificacoes/[id]/acao — registra providência (append-only)
// e, quando pedido, atualiza content_reports.status. Verdade 41.

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

const ACOES = [
  "recebimento_confirmado",
  "analise_iniciada",
  "info_solicitada",
  "autor_notificado",
  "decidida",
  "autor_contestou",
  "reaberta",
] as const;

const STATUSES = [
  "recebida",
  "em_analise",
  "info_pendente",
  "mantida",
  "suspensa",
  "removida",
  "improcedente",
] as const;

type Body = {
  acao?: string;
  statusNovo?: string | null;
  fundamento?: string | null;
};

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  let adminEmail: string | null = null;
  let adminId: string;
  try {
    const auth = await requireAdmin();
    adminId = auth.user.id;
    adminEmail = auth.user.email ?? null;
  } catch (e) {
    return e as Response;
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Body JSON obrigatório." }, { status: 400 });
  }

  const acaoRaw = body.acao ?? "";
  if (!(ACOES as readonly string[]).includes(acaoRaw)) {
    return NextResponse.json(
      { error: `Ação inválida. Valores: ${ACOES.join(", ")}.` },
      { status: 400 },
    );
  }
  const acao = acaoRaw as (typeof ACOES)[number];

  const statusNovo = body.statusNovo && (STATUSES as readonly string[]).includes(body.statusNovo)
    ? body.statusNovo
    : null;

  const fundamento = typeof body.fundamento === "string" && body.fundamento.trim() !== ""
    ? body.fundamento.trim()
    : null;

  // Regra: quando a ação é `decidida`, exige fundamento explícito.
  if (acao === "decidida" && !fundamento) {
    return NextResponse.json(
      { error: "Ação `decidida` exige fundamento." },
      { status: 400 },
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: report, error: fetchErr } = await admin
    .from("content_reports")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) {
    console.error("[admin/notificacoes/acao] fetch falhou:", fetchErr.message);
    return NextResponse.json({ error: "Falha ao localizar notificação." }, { status: 500 });
  }
  if (!report) {
    return NextResponse.json({ error: "Notificação não encontrada." }, { status: 404 });
  }

  // 1) Log da providência (append-only).
  const { data: acaoRow, error: acaoErr } = await admin
    .from("content_report_actions")
    .insert({
      report_id: id,
      acao,
      status_novo: statusNovo,
      fundamento,
      ator_id: adminId,
      ator_email: adminEmail,
    })
    .select("id, criado_em")
    .single();

  if (acaoErr || !acaoRow) {
    console.error("[admin/notificacoes/acao] insert action falhou:", acaoErr?.message);
    return NextResponse.json({ error: "Falha ao registrar providência." }, { status: 500 });
  }

  // 2) Atualização condicional de status (única coluna mutável).
  if (statusNovo) {
    const { error: updErr } = await admin
      .from("content_reports")
      .update({ status: statusNovo })
      .eq("id", id);
    if (updErr) {
      console.error("[admin/notificacoes/acao] update status falhou:", updErr.message);
      return NextResponse.json(
        { error: "Providência registrada, mas atualização de status falhou." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { id: (acaoRow as { id: string }).id, criado_em: (acaoRow as { criado_em: string }).criado_em },
    { status: 200 },
  );
}

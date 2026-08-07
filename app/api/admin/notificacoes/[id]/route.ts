// GET /api/admin/notificacoes/[id] — detalhe + histórico de providências.

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const { id } = await ctx.params;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [reportRes, actionsRes] = await Promise.all([
    admin.from("content_reports").select("*").eq("id", id).maybeSingle(),
    admin
      .from("content_report_actions")
      .select("*")
      .eq("report_id", id)
      .order("criado_em", { ascending: true }),
  ]);

  if (reportRes.error) {
    console.error("[admin/notificacoes] fetch falhou:", reportRes.error.message);
    return NextResponse.json({ error: "Falha ao carregar notificação." }, { status: 500 });
  }
  if (!reportRes.data) {
    return NextResponse.json({ error: "Notificação não encontrada." }, { status: 404 });
  }

  return NextResponse.json(
    { report: reportRes.data, actions: actionsRes.data ?? [] },
    { status: 200 },
  );
}

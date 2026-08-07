// GET /api/admin/notificacoes — lista de notificações para /admin/notificacoes.
// Ordena pela mais antiga primeiro (mais antigo = mais urgente para o SLA).

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

const STATUSES = [
  "recebida",
  "em_analise",
  "info_pendente",
  "mantida",
  "suspensa",
  "removida",
  "improcedente",
] as const;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let q = admin
    .from("content_reports")
    .select("id, protocolo, criado_em, status, fundamento, obra_ref, vinculo, nome")
    .order("criado_em", { ascending: true })
    .limit(500);

  if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
    q = q.eq("status", statusParam);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[admin/notificacoes] list falhou:", error.message);
    return NextResponse.json({ error: "Falha ao listar notificações." }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}

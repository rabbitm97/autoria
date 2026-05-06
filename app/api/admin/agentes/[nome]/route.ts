import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

// ─── GET /api/admin/agentes/[nome] ────────────────────────────────────────────
// Returns last 50 usage_logs for a specific agent.

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

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: logs } = await svc
    .from("usage_logs")
    .select("*")
    .eq("agent_name", nome)
    .order("created_at", { ascending: false })
    .limit(50);

  const all = logs ?? [];
  const withCost = all.filter(l => l.cost_usd != null);
  const avgCost = withCost.length
    ? withCost.reduce((s, l) => s + (l.cost_usd ?? 0), 0) / withCost.length
    : null;
  const errorRate = all.length
    ? all.filter(l => l.error).length / all.length * 100
    : null;

  return NextResponse.json({
    logs: all,
    avg_cost: avgCost != null ? +avgCost.toFixed(6) : null,
    error_rate: errorRate != null ? +errorRate.toFixed(1) : null,
    last_call: all[0]?.created_at ?? null,
  });
}

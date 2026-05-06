import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";
import { AGENTS_REGISTRY } from "@/lib/admin-agents";

// ─── GET /api/admin/agentes ────────────────────────────────────────────────────
// Returns all agents with aggregated metrics from usage_logs.

export async function GET() {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Aggregate last 100 calls per agent
  const { data: logs } = await svc
    .from("usage_logs")
    .select("agent_name, cost_usd, error, created_at")
    .order("created_at", { ascending: false })
    .limit(1600); // generous upper bound across all agents

  type AgentStats = {
    last_call: string | null;
    total: number;
    errors: number;
    total_cost: number;
  };

  const stats: Record<string, AgentStats> = {};

  for (const row of logs ?? []) {
    if (!stats[row.agent_name]) {
      stats[row.agent_name] = { last_call: null, total: 0, errors: 0, total_cost: 0 };
    }
    const s = stats[row.agent_name];
    if (s.total === 0) s.last_call = row.created_at; // first = most recent (ordered DESC)
    if (s.total < 100) {
      s.total++;
      if (row.error) s.errors++;
      s.total_cost += row.cost_usd ?? 0;
    }
  }

  const result = AGENTS_REGISTRY.map(agent => {
    const s = stats[agent.name];
    return {
      ...agent,
      last_call:  s?.last_call  ?? null,
      avg_cost:   s && s.total > 0 ? +(s.total_cost / s.total).toFixed(6) : null,
      error_rate: s && s.total > 0 ? +(s.errors  / s.total * 100).toFixed(1) : null,
      total_calls: s?.total ?? 0,
    };
  });

  return NextResponse.json(result);
}

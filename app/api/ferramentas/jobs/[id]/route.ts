export const maxDuration = 10;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import type { FerramentaJob } from "@/lib/ferramenta-jobs";

// ─── GET /api/ferramentas/jobs/[id] ──────────────────────────────────────────
// Retomada do wizard (?job=): devolve o job do próprio usuário com o que
// o client precisa para reidratar o passo. Nunca expõe job de outro.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userId: string;
  try {
    userId = (await requireAuth()).user.id;
  } catch (e) {
    return e as Response;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, estado, projeto_sombra_id, entrada, custo_creditos, debitado_em, entregaveis, expira_em")
    .eq("id", id)
    .maybeSingle();
  const job = data as FerramentaJob | null;
  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }
  // Estado do sombra útil pra reidratar: formato, créditos, miolo.
  let sombra: { formato: string | null; tem_creditos: boolean; tem_miolo: boolean } | null = null;
  if (job.projeto_sombra_id) {
    const { data: p } = await admin
      .from("projects")
      .select("formato, dados_creditos, dados_miolo")
      .eq("id", job.projeto_sombra_id)
      .maybeSingle();
    const row = p as { formato?: string | null; dados_creditos?: { input_hash?: string } | null; dados_miolo?: { html_storage_path?: string } | null } | null;
    sombra = {
      formato: row?.formato ?? null,
      tem_creditos: !!row?.dados_creditos?.input_hash,
      tem_miolo: !!row?.dados_miolo?.html_storage_path,
    };
  }
  const { user_id: _omit, ...publico } = job;
  return NextResponse.json({ job: publico, sombra });
}

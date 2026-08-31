export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import {
  debitarCreditos,
  estornarCreditos,
  getSaldoCreditos,
  CUSTOS_CREDITOS,
  type AcaoCredito,
} from "@/lib/creditos";
import { isPlano, PLANO_RANK, type Plano } from "@/lib/planos";

// ─── POST /api/projects/[id]/plano/comprar ───────────────────────────────────
// Compra o plano do PROJETO com créditos do usuário (martelada 31/ago:
// beta sem gateway; paridade 1 crédito = R$ 1). Transições permitidas:
// freemium→essencial (plano_essencial) · freemium→pro (plano_pro) ·
// essencial→pro (upgrade_pro, a diferença). Promoção da coluna via
// service_role — passa o trigger trg_enforce_projects_plano por desenho.
// Desbloqueio é imediato: todos os gates leem projects.plano por chamada.

const bodySchema = z.object({ plano: z.enum(["essencial", "pro"]) });

function resolverAcao(atual: Plano, destino: "essencial" | "pro"): AcaoCredito | null {
  if (PLANO_RANK[destino] <= PLANO_RANK[atual]) return null;
  if (atual === "freemium" && destino === "essencial") return "plano_essencial";
  if (atual === "freemium" && destino === "pro") return "plano_pro";
  if (atual === "essencial" && destino === "pro") return "upgrade_pro";
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const dev = isDev();

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: SupabaseClient<any>;
  if (dev) {
    userId = "dev-user";
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido. Esperado { plano: 'essencial' | 'pro' }." },
      { status: 400 },
    );
  }
  const destino = parsed.data.plano;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, user_id, plano")
    .eq("id", projectId)
    .single();
  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const atual: Plano = isPlano((project as { plano?: unknown }).plano)
    ? ((project as { plano: Plano }).plano)
    : "freemium";
  const acao = resolverAcao(atual, destino);
  if (!acao) {
    return NextResponse.json(
      { error: `Este projeto já está no plano ${atual} — nada a comprar.` },
      { status: 400 },
    );
  }
  const custo = CUSTOS_CREDITOS[acao];

  // Dev não debita — só promove, espelhando comprar-imagens.
  if (!dev) {
    const debito = await debitarCreditos(admin, userId, acao, projectId);
    if (!debito.ok) {
      if (debito.erro === "saldo_insuficiente") {
        return NextResponse.json(
          {
            error: `Créditos insuficientes. Este plano custa ${custo} créditos.`,
            creditos_saldo: debito.saldo,
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: "Falha ao debitar créditos. Tente novamente." },
        { status: 500 },
      );
    }
  }

  const { error: updErr } = await admin
    .from("projects")
    .update({ plano: destino })
    .eq("id", projectId);
  if (updErr) {
    console.error("[plano/comprar] promoção falhou:", updErr.message);
    if (!dev) await estornarCreditos(admin, userId, acao, projectId);
    return NextResponse.json(
      { error: "Falha ao ativar o plano. Seus créditos foram devolvidos." },
      { status: 500 },
    );
  }

  try {
    const { error } = await admin.from("usage_logs").insert({
      agent_name: "creditos",
      user_id: userId,
      project_id: projectId,
      metadata: { tipo: "compra_plano", de: atual, para: destino, acao, custo, ok: true },
    });
    if (error) console.error("[plano/comprar] log falhou:", error.message);
  } catch (err) {
    console.error("[plano/comprar] log exception:", err);
  }

  const creditosSaldo = dev ? null : await getSaldoCreditos(supabase, userId);
  return NextResponse.json({ ok: true, plano: destino, creditos_saldo: creditosSaldo });
}

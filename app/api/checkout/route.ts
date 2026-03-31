import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

// ─── Plans ────────────────────────────────────────────────────────────────────

const PLANS = {
  essencial: { nome: "Essencial", preco: 197_00, descricao: "Diagnóstico + Revisão + Elementos Editoriais" },
  completo:  { nome: "Completo",  preco: 397_00, descricao: "Tudo do Essencial + Capa com IA + Diagramação" },
  pro:       { nome: "Pro",       preco: 697_00, descricao: "Tudo do Completo + Audiolivro + Publicação em 15+ plataformas" },
} as const;

type PlanId = keyof typeof PLANS;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch (res) {
    return res as Response;
  }

  let body: { plan: PlanId; project_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { plan } = body;
  if (!plan || !PLANS[plan]) {
    return NextResponse.json(
      { error: `Plano inválido. Escolha: ${Object.keys(PLANS).join(", ")}.` },
      { status: 400 }
    );
  }

  // Stripe not yet configured — return informative response
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      {
        error: "Pagamentos ainda não configurados.",
        info: `Plano ${PLANS[plan].nome} (R$ ${(PLANS[plan].preco / 100).toFixed(2).replace(".", ",")}) selecionado. Configure STRIPE_SECRET_KEY para ativar o checkout.`,
        plan: PLANS[plan],
      },
      { status: 503 }
    );
  }

  // TODO: create Stripe checkout session
  return NextResponse.json({ error: "Stripe não configurado." }, { status: 503 });
}

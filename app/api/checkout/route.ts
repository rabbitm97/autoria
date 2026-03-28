import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// ─── Plans ────────────────────────────────────────────────────────────────────

const PLANS = {
  essencial: { nome: "Essencial", preco: 197_00, descricao: "Diagnóstico + Revisão + Elementos Editoriais" },
  completo:  { nome: "Completo",  preco: 397_00, descricao: "Tudo do Essencial + Capa com IA + Diagramação" },
  pro:       { nome: "Pro",       preco: 697_00, descricao: "Tudo do Completo + Audiolivro + Publicação em 15+ plataformas" },
} as const;

type PlanId = keyof typeof PLANS;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body: { plan: PlanId; project_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { plan } = body;
  if (!plan || !PLANS[plan]) {
    return Response.json(
      { error: `Plano inválido. Escolha: ${Object.keys(PLANS).join(", ")}.` },
      { status: 400 }
    );
  }

  // Stripe not yet configured — return informative response
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json(
      {
        error: "Pagamentos ainda não configurados.",
        info: `Plano ${PLANS[plan].nome} (R$ ${(PLANS[plan].preco / 100).toFixed(2).replace(".", ",")}) selecionado. Configure STRIPE_SECRET_KEY para ativar o checkout.`,
        plan: PLANS[plan],
      },
      { status: 503 }
    );
  }

  // TODO: create Stripe checkout session
  // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });
  // const session = await stripe.checkout.sessions.create({ ... });
  // return Response.json({ ok: true, url: session.url });

  return Response.json({ error: "Stripe não configurado." }, { status: 503 });
}

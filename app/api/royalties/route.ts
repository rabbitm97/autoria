import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plataforma =
  | "amazon_kdp" | "draft2digital" | "kobo"
  | "apple_books" | "google_play" | "outros";

export interface Royalty {
  id: string;
  project_id: string;
  plataforma: Plataforma;
  periodo: string;          // 'YYYY-MM'
  unidades: number;
  preco_venda: number | null;
  royalty_pct: number;
  valor_recebido: number;   // computed by DB
  moeda: string;
  criado_em: string;
  // joined
  manuscript_nome?: string;
}

export const PLATAFORMA_INFO: Record<Plataforma, { label: string; royalty_padrao: number; cor: string }> = {
  amazon_kdp:    { label: "Amazon KDP",     royalty_padrao: 70, cor: "text-orange-600" },
  draft2digital: { label: "Draft2Digital",  royalty_padrao: 60, cor: "text-blue-600"   },
  kobo:          { label: "Kobo",           royalty_padrao: 70, cor: "text-red-600"    },
  apple_books:   { label: "Apple Books",    royalty_padrao: 70, cor: "text-zinc-600"   },
  google_play:   { label: "Google Play",    royalty_padrao: 52, cor: "text-green-600"  },
  outros:        { label: "Outros",         royalty_padrao: 50, cor: "text-zinc-500"   },
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK: Royalty[] = [
  { id: "m1", project_id: "mock-1", plataforma: "amazon_kdp",    periodo: "2026-01", unidades: 47, preco_venda: 29.90, royalty_pct: 70, valor_recebido: 983.21,  moeda: "BRL", criado_em: new Date().toISOString(), manuscript_nome: "O Último Manuscrito" },
  { id: "m2", project_id: "mock-1", plataforma: "draft2digital", periodo: "2026-01", unidades: 12, preco_venda: 29.90, royalty_pct: 60, valor_recebido: 215.28,  moeda: "BRL", criado_em: new Date().toISOString(), manuscript_nome: "O Último Manuscrito" },
  { id: "m3", project_id: "mock-1", plataforma: "amazon_kdp",    periodo: "2026-02", unidades: 63, preco_venda: 29.90, royalty_pct: 70, valor_recebido: 1318.59, moeda: "BRL", criado_em: new Date().toISOString(), manuscript_nome: "O Último Manuscrito" },
  { id: "m4", project_id: "mock-2", plataforma: "amazon_kdp",    periodo: "2026-02", unidades: 18, preco_venda: 24.90, royalty_pct: 70, valor_recebido: 313.74,  moeda: "BRL", criado_em: new Date().toISOString(), manuscript_nome: "Cartas ao Vento" },
  { id: "m5", project_id: "mock-1", plataforma: "kobo",          periodo: "2026-03", unidades: 8,  preco_venda: 29.90, royalty_pct: 70, valor_recebido: 167.44,  moeda: "BRL", criado_em: new Date().toISOString(), manuscript_nome: "O Último Manuscrito" },
];

// ─── GET /api/royalties ───────────────────────────────────────────────────────
// Query params: project_id? periodo? (YYYY-MM)

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    const project_id = req.nextUrl.searchParams.get("project_id");
    const data = project_id ? MOCK.filter(r => r.project_id === project_id) : MOCK;
    return NextResponse.json(data);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project_id = req.nextUrl.searchParams.get("project_id");
  const periodo    = req.nextUrl.searchParams.get("periodo");

  let query = supabase
    .from("royalties")
    .select("*, manuscript:project_id(manuscript_id(nome))")
    .eq("user_id", user.id)
    .order("periodo", { ascending: false });

  if (project_id) query = query.eq("project_id", project_id);
  if (periodo)    query = query.eq("periodo", periodo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// ─── POST /api/royalties ──────────────────────────────────────────────────────
// Body: { project_id, plataforma, periodo, unidades, preco_venda, royalty_pct?, moeda? }

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({ error: "Mock mode: use a produção para criar lançamentos" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: {
    project_id: string; plataforma: Plataforma; periodo: string;
    unidades: number; preco_venda?: number; royalty_pct?: number; moeda?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, plataforma, periodo, unidades, preco_venda, moeda = "BRL" } = body;
  if (!project_id || !plataforma || !periodo || unidades === undefined) {
    return NextResponse.json({ error: "Campos obrigatórios: project_id, plataforma, periodo, unidades" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return NextResponse.json({ error: "periodo deve ser YYYY-MM" }, { status: 400 });
  }

  const royalty_pct = body.royalty_pct ?? PLATAFORMA_INFO[plataforma]?.royalty_padrao ?? 70;

  const { data, error } = await supabase
    .from("royalties")
    .insert({ user_id: user.id, project_id, plataforma, periodo, unidades, preco_venda, royalty_pct, moeda })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// ─── DELETE /api/royalties?id=... ─────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({ ok: true });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("royalties")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

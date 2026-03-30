import OpenAI from "openai";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpcaoCapa {
  url: string;
  revised_prompt: string;
}

export interface CapaResult {
  project_id: string;
  prompt_usado: string;
  opcoes: OpcaoCapa[];       // up to 3 options
  url_escolhida: string | null;
}

// ─── POST /api/agentes/gerar-capa ─────────────────────────────────────────────
// Body: { project_id: string, titulo: string, sinopse: string, genero?: string, qtd?: 1|2|3 }
// Returns: CapaResult

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  let userId: string;
  if (process.env.NODE_ENV === "development") {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  // ── Validate env ──────────────────────────────────────────────────────────
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY não configurada. Configure no Vercel ou .env.local." },
      { status: 503 }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { project_id: string; titulo: string; sinopse: string; genero?: string; qtd?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, titulo, sinopse, genero = "literatura", qtd = 3 } = body;
  if (!project_id || !titulo || !sinopse) {
    return NextResponse.json(
      { error: "project_id, titulo e sinopse são obrigatórios" },
      { status: 400 }
    );
  }

  // ── Build prompt ──────────────────────────────────────────────────────────
  // Prompt engineered for book covers suitable for CMYK printing
  const prompt = [
    `Book cover design for a ${genero} book titled "${titulo}".`,
    `Story: ${sinopse.slice(0, 300)}.`,
    "Professional editorial design. No text, no letters, no words on the image.",
    "High contrast, suitable for CMYK print. Vertical orientation (6x9 inches book cover ratio).",
    "Cinematic lighting, rich colors, publishing industry quality.",
  ].join(" ");

  // ── Call DALL-E 3 ─────────────────────────────────────────────────────────
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const count = Math.min(Math.max(1, qtd), 3) as 1 | 2 | 3;
  const opcoes: OpcaoCapa[] = [];

  // DALL-E 3 only supports n=1 per request; loop for multiple options
  for (let i = 0; i < count; i++) {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1792",   // closest to 6×9 book ratio
      quality: "hd",
      response_format: "url",
    });
    const img = response.data?.[0];
    opcoes.push({
      url: img?.url ?? "",
      revised_prompt: img?.revised_prompt ?? prompt,
    });
  }

  // ── Persist to Supabase ───────────────────────────────────────────────────
  const dados_capa = {
    prompt_usado: prompt,
    opcoes,
    url_escolhida: opcoes[0]?.url ?? null,
  };

  if (process.env.NODE_ENV !== "development") {
    await supabase
      .from("projects")
      .update({ dados_capa, etapa_atual: "capa" })
      .eq("id", project_id)
      .eq("user_id", userId);
  }

  const result: CapaResult = {
    project_id,
    prompt_usado: prompt,
    opcoes,
    url_escolhida: opcoes[0]?.url ?? null,
  };

  return NextResponse.json(result);
}

// ─── GET /api/agentes/gerar-capa?project_id=... ───────────────────────────────
// Retrieve saved cover data for a project

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({
      project_id,
      prompt_usado: "Mock prompt para ambiente de dev",
      opcoes: [
        {
          url: "https://placehold.co/1024x1792/1a1a2e/e8c97b?text=Capa+Mock",
          revised_prompt: "Mock DALL-E prompt",
        },
      ],
      url_escolhida: "https://placehold.co/1024x1792/1a1a2e/e8c97b?text=Capa+Mock",
    } satisfies CapaResult);
  }

  const { data, error } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", project_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  return NextResponse.json(data.dados_capa ?? null);
}

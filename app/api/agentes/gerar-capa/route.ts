import { GoogleGenAI, type Part } from "@google/genai";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpcaoCapa {
  url: string;           // Supabase Storage public URL
  storage_path: string;  // e.g. "{user_id}/{project_id}/capa_0.png"
}

export interface CapaResult {
  project_id: string;
  prompt_usado: string;
  opcoes: OpcaoCapa[];
  url_escolhida: string | null;
}

// ─── POST /api/agentes/gerar-capa ─────────────────────────────────────────────
// Body: { project_id, titulo, sinopse, genero?, qtd?: 1|2|3 }

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
  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY não configurada. Configure no Vercel ou .env.local." },
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
  const prompt = [
    `Book cover design for a ${genero} book titled "${titulo}".`,
    `Story: ${sinopse.slice(0, 300)}.`,
    "Professional editorial design. No text, no letters, no words on the image.",
    "High contrast, suitable for CMYK print. Vertical portrait orientation.",
    "Cinematic lighting, rich colors, publishing industry quality.",
  ].join(" ");

  // ── Supabase Storage client (service role para upload server-side) ─────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Call Nano Banana Pro ──────────────────────────────────────────────────
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const count = Math.min(Math.max(1, qtd), 3);
  const opcoes: OpcaoCapa[] = [];

  for (let i = 0; i < count; i++) {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: prompt,
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: "2:3",   // proporção livro 6×9
          imageSize: "2K",
        },
      },
    });

    // Extract base64 image from response
    const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData);
    if (!imgPart?.inlineData?.data) continue;

    const base64 = imgPart.inlineData.data;
    const mimeType = imgPart.inlineData.mimeType ?? "image/png";
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const storagePath = `${userId}/${project_id}/capa_${i}.${ext}`;
    const buffer = Buffer.from(base64, "base64");

    // Upload to Supabase Storage
    const { error: uploadError } = await storageClient.storage
      .from("capas")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      continue;
    }

    const { data: { publicUrl } } = storageClient.storage
      .from("capas")
      .getPublicUrl(storagePath);

    opcoes.push({ url: publicUrl, storage_path: storagePath });
  }

  if (opcoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem foi gerada" }, { status: 500 });
  }

  // ── Persist to Supabase ───────────────────────────────────────────────────
  const dados_capa: CapaResult = {
    project_id,
    prompt_usado: prompt,
    opcoes,
    url_escolhida: opcoes[0]?.url ?? null,
  };

  await supabase
    .from("projects")
    .update({ dados_capa, etapa_atual: "capa" })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(dados_capa);
}

// ─── GET /api/agentes/gerar-capa?project_id=... ───────────────────────────────

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
          url: "https://placehold.co/683x1024/1a1a2e/e8c97b?text=Capa+Mock",
          storage_path: "dev-user/mock/capa_0.png",
        },
      ],
      url_escolhida: "https://placehold.co/683x1024/1a1a2e/e8c97b?text=Capa+Mock",
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

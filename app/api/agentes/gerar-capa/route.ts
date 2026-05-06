export const maxDuration = 60;

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EstiloCapa =
  | "minimalista"
  | "cartoon"
  | "aquarela"
  | "fotorrealista"
  | "abstrato"
  | "vintage"
  | "geometrico";

export interface OpcaoCapa {
  url: string;
  storage_path: string;
}

export interface CapaGeradaResult {
  project_id: string;
  modo: "ia";
  estilo: EstiloCapa;
  cor_predominante: string;
  quarta_capa_texto: string;
  usar_orelhas: boolean;
  prompt_usado: string;
  opcoes: OpcaoCapa[];
  url_escolhida: string | null;
  gerado_em: string;
  is_regeneracao: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTILO_DESC: Record<EstiloCapa, string> = {
  minimalista:    "minimalist editorial design, clean lines, flat colors, lots of white space",
  cartoon:        "cartoon illustration style, bold outlines, vibrant flat colors, playful feel",
  aquarela:       "watercolor painting style, soft washes, organic edges, painterly texture",
  fotorrealista:  "photorealistic digital art, cinematic lighting, high detail, professional photography feel",
  abstrato:       "abstract art, geometric shapes, overlapping forms, expressive color fields",
  vintage:        "vintage retro illustration, aged textures, muted palette, period-appropriate typography feel",
  geometrico:     "geometric design, bold shapes, strong contrast, modern graphic style",
};

function buildPrompt(opts: {
  titulo: string;
  autor: string;
  sinopse: string;
  genero: string;
  estilo: EstiloCapa;
  cor_predominante: string;
}): string {
  return [
    `Professional book cover design for "${opts.titulo}" by ${opts.autor}.`,
    `Genre: ${opts.genero}.`,
    `Story synopsis: ${opts.sinopse.slice(0, 250)}.`,
    `Style: ${ESTILO_DESC[opts.estilo]}.`,
    `Predominant color palette centered around ${opts.cor_predominante}.`,
    "Portrait orientation (2:3 aspect ratio). No text, no letters, no words on the image.",
    "High contrast, professional publishing industry quality, suitable for CMYK print.",
    "Full bleed composition, no borders or frames.",
  ].join(" ");
}

// ─── POST /api/agentes/gerar-capa ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev) {
    userId = "dev-user";
    supabase = await createSupabaseServerClient();
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY não configurada." },
      { status: 503 }
    );
  }

  let body: {
    project_id: string;
    titulo: string;
    autor: string;
    sinopse: string;
    genero?: string;
    estilo?: EstiloCapa;
    cor_predominante?: string;
    usar_orelhas?: boolean;
    quarta_capa_texto?: string;
    imagemRef?: string;
    is_regeneracao?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const {
    project_id,
    titulo,
    autor = "",
    sinopse,
    genero = "literatura",
    estilo = "minimalista",
    cor_predominante = "azul escuro",
    usar_orelhas = false,
    quarta_capa_texto = sinopse?.slice(0, 500) ?? "",
    imagemRef,
    is_regeneracao = false,
  } = body;

  if (!project_id || !titulo || !sinopse) {
    return NextResponse.json(
      { error: "project_id, titulo e sinopse são obrigatórios" },
      { status: 400 }
    );
  }

  // ── Credit check for regeneration ────────────────────────────────────────
  if (is_regeneracao && !isDev) {
    const { data: proj } = await supabase
      .from("projects")
      .select("creditos")
      .eq("id", project_id)
      .single();

    const creditos = (proj as { creditos?: number } | null)?.creditos ?? 0;
    if (creditos < 20) {
      return NextResponse.json(
        { error: "Créditos insuficientes. Regenerar capa custa 20 créditos." },
        { status: 402 }
      );
    }

    await supabase
      .from("projects")
      .update({ creditos: creditos - 20 })
      .eq("id", project_id);
  }

  const prompt = buildPrompt({ titulo, autor, sinopse, genero, estilo, cor_predominante });

  // Service-role client for Storage uploads
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const opcoes: OpcaoCapa[] = [];

  // Build final prompt — include reference style hint if provided
  const fullPrompt = imagemRef
    ? prompt + " Maintain a visual style consistent with the provided reference image aesthetic."
    : prompt;

  try {
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: fullPrompt,
      config: {
        numberOfImages: 4,
        aspectRatio: "3:4",
      },
    });

    for (let i = 0; i < (response.generatedImages?.length ?? 0); i++) {
      const imgBytes = response.generatedImages[i]?.image?.imageBytes;
      if (!imgBytes) {
        console.warn(`[gerar-capa] option ${i}: imageBytes ausente`);
        continue;
      }

      const storagePath = `${userId}/${project_id}/capa_ia_${i}.png`;
      const buffer = Buffer.from(imgBytes, "base64");

      const { error: uploadError } = await storageClient.storage
        .from("capas")
        .upload(storagePath, buffer, { contentType: "image/png", upsert: true });

      if (uploadError) {
        console.error("[gerar-capa] upload error:", uploadError.message);
        continue;
      }

      const { data: { publicUrl } } = storageClient.storage
        .from("capas")
        .getPublicUrl(storagePath);

      opcoes.push({ url: publicUrl, storage_path: storagePath });
    }
  } catch (err) {
    console.error("[gerar-capa] generateImages failed:", err);
  }

  if (opcoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem foi gerada" }, { status: 500 });
  }

  const result: CapaGeradaResult = {
    project_id,
    modo: "ia",
    estilo,
    cor_predominante,
    quarta_capa_texto,
    usar_orelhas,
    prompt_usado: prompt,
    opcoes,
    url_escolhida: opcoes[0]?.url ?? null,
    gerado_em: new Date().toISOString(),
    is_regeneracao,
  };

  await supabase
    .from("projects")
    .update({ dados_capa: result, etapa_atual: "capa" })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(result);
}

// ─── GET /api/agentes/gerar-capa?project_id=... ───────────────────────────────

export async function GET(req: NextRequest) {
  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json(null);
  }

  const supabase = await createSupabaseServerClient();
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

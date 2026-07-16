export const maxDuration = 60;

import { GoogleGenAI, type Part } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { estimarLombadaCapaMm } from "@/lib/formatos";
import { signedUrlCapas } from "@/lib/capa-signed-url";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Elemento = "frente" | "contra" | "lombada" | "orelha_frente" | "orelha_verso";

export interface ElementoGerado {
  elemento: Elemento;
  opcoes: Array<{ url: string; storage_path: string }>;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  elemento: Elemento,
  params: {
    titulo: string;
    autor: string;
    descricao: string;
    genero: string;
    lombada_mm?: number;
  }
): string {
  const { titulo, autor, descricao, genero, lombada_mm } = params;
  const base = `Book: "${titulo}" by ${autor || "unknown author"}. Genre: ${genero}.`;
  const custom = descricao ? ` Client instructions: ${descricao}.` : "";

  switch (elemento) {
    case "frente":
      return `${base}${custom} Professional book FRONT COVER design. Cinematic lighting, rich color palette, CMYK print quality. Vertical portrait orientation. Absolutely no text or letters anywhere on the image. Full bleed composition.`;

    case "contra":
      return `${base}${custom} Professional book BACK COVER design. Subtle design that complements the front cover style. Minimal background — must leave visual space for synopsis text to be placed later. No text or letters. Portrait orientation. CMYK quality.`;

    case "lombada":
      return `${base}${custom} Book SPINE design for a ${lombada_mm ?? 20}mm wide spine. Solid or gradient background matching front cover palette. Vertical strip composition. No text — title and author will be overlaid separately. Clean, professional. CMYK quality.`;

    case "orelha_frente":
      return `${base}${custom} Book FRONT FLAP design. Subtle continuation of the front cover visual style. Clean layout with space for author biography. No text or letters. Portrait orientation. CMYK print quality.`;

    case "orelha_verso":
      return `${base}${custom} Book BACK FLAP design. Subtle continuation of the back cover visual style. Clean layout for publisher information. No text or letters. Portrait orientation. CMYK print quality.`;
  }
}

function buildContents(prompt: string, ref: string | undefined): Part[] {
  if (ref) {
    const match = ref.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return [
        { text: prompt + " Use the provided reference image as a style and mood guide only — do not copy it literally." } as Part,
        { inlineData: { mimeType: match[1], data: match[2] } } as Part,
      ];
    }
  }
  return [{ text: prompt } as Part];
}

// ─── POST /api/agentes/gerar-elemento-capa ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
  const dev = isDev();
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (dev) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY não configurada." }, { status: 503 });
  }

  let body: {
    project_id: string;
    elemento: Elemento;
    descricao?: string;
    imagemRef?: string;
    qtd?: number;
  };

  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, elemento, descricao = "", imagemRef, qtd = 2 } = body;

  if (!project_id || !elemento) {
    return NextResponse.json({ error: "project_id e elemento são obrigatórios" }, { status: 400 });
  }

  if (imagemRef && imagemRef.length > 5_000_000) {
    return NextResponse.json(
      { error: "Imagem de referência muito grande (máx 5MB)" },
      { status: 413 },
    );
  }

  // ── Load project (ownership check + metadata) ────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome, genero_principal)")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as {
    titulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  const titulo = ms?.titulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ");
  const genero = ms?.genero_principal ?? "literatura";

  const dadosMiolo = project.dados_miolo as { paginas_reais?: number } | null;
  const paginas = dadosMiolo?.paginas_reais;

  if (elemento === "lombada" && (!paginas || paginas < 1)) {
    return NextResponse.json(
      { error: "Gere o miolo antes de criar a lombada — número real de páginas é obrigatório." },
      { status: 422 }
    );
  }

  const lombada_mm = paginas ? estimarLombadaCapaMm(paginas) : undefined;

  // ── Dev mode: return mock images ─────────────────────────────────────────
  if (dev) {
    const colors: Record<Elemento, string> = {
      frente: "1a1a2e/e8c97b",
      contra: "2a2a4e/e8c97b",
      lombada: "333355/e8c97b",
      orelha_frente: "1a1a3e/e8c97b",
      orelha_verso: "222244/e8c97b",
    };
    const label = elemento.replace("_", "+");
    const result: ElementoGerado = {
      elemento,
      opcoes: Array.from({ length: Math.min(qtd, 2) }, (_, i) => ({
        url: `https://placehold.co/683x1024/${colors[elemento]}?text=${label}+${i + 1}`,
        storage_path: `dev-user/${project_id}/${elemento}_${i}.png`,
      })),
    };
    return NextResponse.json(result);
  }

  // ── Generate with Imagen ──────────────────────────────────────────────────
  const prompt = buildPrompt(elemento, { titulo, autor, descricao, genero, lombada_mm });

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const count = Math.min(Math.max(1, qtd), 3);
  const opcoes: Array<{ url: string; storage_path: string }> = [];

  for (let i = 0; i < count; i++) {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [{ role: "user", parts: buildContents(prompt, imagemRef) }],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "2:3", imageSize: "2K" },
      },
    });

    const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData);
    if (!imgPart?.inlineData?.data) continue;

    const base64 = imgPart.inlineData.data;
    const mimeType = imgPart.inlineData.mimeType ?? "image/png";
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const storagePath = `${userId}/${project_id}/${elemento}_${i}.${ext}`;
    const buffer = Buffer.from(base64, "base64");

    const { error: uploadError } = await storageClient.storage
      .from("capas")
      .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

    if (uploadError) {
      console.error(`[gerar-elemento-capa] upload error (${elemento} ${i}):`, uploadError.message);
      continue;
    }

    const { url: publicUrl, error: signErr } = await signedUrlCapas(storageClient, storagePath);
    if (signErr || !publicUrl) {
      console.error(`[gerar-elemento-capa] signed URL failed (${elemento} ${i}):`, signErr);
      continue;
    }
    opcoes.push({ url: publicUrl, storage_path: storagePath });
  }

  if (opcoes.length === 0) {
    return NextResponse.json({ error: "Nenhuma imagem foi gerada" }, { status: 500 });
  }

  return NextResponse.json({ elemento, opcoes } satisfies ElementoGerado);
  } catch (err) {
    console.error("[gerar-elemento-capa] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar o elemento da capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

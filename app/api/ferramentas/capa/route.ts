import { GoogleGenAI, type Part } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapaFerramenta {
  prompt_usado: string;
  imagens: { dataUrl: string }[]; // base64 data URLs
}

// ─── Google GenAI ─────────────────────────────────────────────────────────────

function buildPrompt(titulo: string, sinopse: string, genero: string): string {
  return `Professional book cover for a Brazilian literary work.
Title: "${titulo}". Genre: ${genero}. Synopsis: ${sinopse.slice(0, 200)}.
Style: high-end publishing house, elegant typography, dramatic lighting, evocative atmosphere.
Aspect ratio 2:3 (portrait). No text overlaid. Photorealistic or painterly illustration.`;
}

// ─── Dev mock ─────────────────────────────────────────────────────────────────

function devMock(qtd: number): CapaFerramenta {
  return {
    prompt_usado: "Mock — API não chamada em desenvolvimento",
    imagens: Array.from({ length: qtd }, (_, i) => ({
      dataUrl: `https://placehold.co/400x600/1a1a2e/c9a84c?text=Capa+${i + 1}`,
    })),
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { titulo: string; sinopse: string; genero?: string; qtd?: number; imagemRef?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { titulo, sinopse, genero = "literatura", qtd = 2, imagemRef } = body;
  if (!titulo?.trim() || !sinopse?.trim())
    return NextResponse.json({ error: "titulo e sinopse são obrigatórios" }, { status: 400 });

  if (process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json(devMock(qtd));
  }

  if (!process.env.GOOGLE_AI_API_KEY)
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY não configurada" }, { status: 503 });

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const prompt = buildPrompt(titulo, sinopse, genero);
  const imagens: { dataUrl: string }[] = [];
  const count = Math.min(Number(qtd) || 2, 3);

  // Build multimodal contents — include reference image when provided
  function buildContents(withRef: string | undefined): Part[] {
    if (withRef) {
      const match = withRef.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        return [
          { text: prompt + "\nUse the provided reference image as a style and composition guide. Do not copy it literally — adapt its mood, color palette, and visual style for this new book cover." } as Part,
          { inlineData: { mimeType: match[1], data: match[2] } } as Part,
        ];
      }
    }
    return [{ text: prompt } as Part];
  }

  for (let i = 0; i < count; i++) {
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: buildContents(imagemRef) }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "2:3", imageSize: "2K" },
        },
      });
      const imgPart = resp.candidates?.[0]?.content?.parts?.find(
        (p: Part) => p.inlineData
      ) as Part | undefined;
      if (imgPart?.inlineData?.data) {
        imagens.push({ dataUrl: `data:image/png;base64,${imgPart.inlineData.data}` });
      }
    } catch (e) {
      console.error(`[capa-ferramenta] imagem ${i + 1} falhou:`, e);
    }
  }

  return NextResponse.json({ prompt_usado: prompt, imagens });
}

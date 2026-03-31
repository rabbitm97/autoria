import { NextRequest, NextResponse } from "next/server";
import { VOZES } from "@/lib/voices";


const MAX_CHARS = 4500;

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { texto: string; voz?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { texto, voz = VOZES[0].id } = body;
  if (!texto?.trim()) return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });

  if (process.env.NODE_ENV === "development") {
    // In dev, return a short public domain MP3 so the player works
    return NextResponse.json({
      audioUrl: null,
      dev: true,
      chars: Math.min(texto.length, MAX_CHARS),
      msg: "Em desenvolvimento: áudio não gerado. Configure ELEVENLABS_API_KEY e use em produção.",
    });
  }

  if (!process.env.ELEVENLABS_API_KEY)
    return NextResponse.json({ error: "ELEVENLABS_API_KEY não configurada" }, { status: 503 });

  const snippet = texto.slice(0, MAX_CHARS);

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: snippet,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return NextResponse.json({ error: `ElevenLabs: ${err}` }, { status: resp.status });
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  return new Response(buf, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `attachment; filename="narração.mp3"`,
    },
  });
}

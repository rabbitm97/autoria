import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapituloAudio {
  index: number;
  titulo: string;
  storage_path: string;
  url: string;          // signed URL, 1h
  caracteres: number;
  gerado_em: string;
}

export interface AudioResult {
  project_id: string;
  capitulos: CapituloAudio[];
}

// ElevenLabs voices with good PT-BR quality
export const VOZES = [
  { id: "21m00Tcm4TlvDq8ikWAM", nome: "Rachel",  desc: "Narradora feminina — clara e expressiva" },
  { id: "AZnzlk1XvdvUeBnXmlld", nome: "Domi",    desc: "Voz feminina — energética" },
  { id: "ErXwobaYiN019PkySvjV", nome: "Antoni",  desc: "Narrador masculino — suave" },
  { id: "VR6AewLTigWG4xSOukaG", nome: "Arnold",  desc: "Narrador masculino — grave e forte" },
  { id: "pNInz6obpgDQGcFmaJgB", nome: "Adam",    desc: "Narrador masculino — profissional" },
];

// ─── Text parsing ─────────────────────────────────────────────────────────────

interface RawChapter { title: string; text: string }

function parseChapters(texto: string, bookTitle: string): RawChapter[] {
  const CHAPTER_RE = /^(cap[íi]tulo\s+\d+[.:–—\s].*|chapter\s+\d+[.:–—\s].*|\d+\.\s+.{3,60}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/;
  const lines = texto.replace(/\r\n/g, "\n").split("\n");
  const chapters: RawChapter[] = [];
  let current: RawChapter = { title: bookTitle, text: "" };

  for (const raw of lines) {
    const line = raw.trim();
    const isHeading =
      CHAPTER_RE.test(line) ||
      (line.length < 60 && line === line.toUpperCase() && line.length > 3);

    if (isHeading && line) {
      if (current.text.trim()) chapters.push(current);
      current = { title: line, text: "" };
    } else {
      current.text += (current.text ? " " : "") + line;
    }
  }
  if (current.text.trim()) chapters.push(current);
  if (chapters.length === 0) chapters.push({ title: bookTitle, text: texto });
  return chapters;
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

const ELEVENLABS_MAX_CHARS = 4500; // safe per-request limit for all tiers

async function textToSpeech(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
  const truncated = text.slice(0, ELEVENLABS_MAX_CHARS);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: truncated,
      model_id: "eleven_multilingual_v2",  // suporta português nativamente
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ─── POST /api/agentes/gerar-audio ───────────────────────────────────────────
// Body: { project_id, capitulo_index: number, voice_id?: string }
// Generates audio for ONE chapter (to preserve ElevenLabs credits)

export async function POST(req: NextRequest) {
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
    if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    userId = user.id;
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY não configurada. Configure no Vercel ou .env.local." },
      { status: 503 }
    );
  }

  let body: { project_id: string; capitulo_index: number; voice_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, capitulo_index, voice_id = VOZES[0].id } = body;
  if (!project_id || capitulo_index === undefined) {
    return NextResponse.json({ error: "project_id e capitulo_index obrigatórios" }, { status: 400 });
  }

  // ── Load project ──────────────────────────────────────────────────────────
  let titulo = "";
  let texto = "";
  let dadosAudioAtual: AudioResult | null = null;

  if (process.env.NODE_ENV === "development") {
    titulo = "O Último Manuscrito";
    texto  = "CAPÍTULO 1\n\nEra uma noite escura e tempestuosa. O protagonista caminhou lentamente pela rua deserta, ouvindo apenas o eco dos seus próprios passos. Algo estava prestes a mudar para sempre.\n\nCAPÍTULO 2\n\nA manhã chegou com uma névoa densa cobrindo toda a cidade. Cada passo revelava um novo mistério, cada porta abria para um novo caminho inesperado.";
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_audio, dados_elementos, manuscript:manuscript_id(texto, nome)")
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

    const el = project.dados_elementos as Record<string, unknown> | null;
    const ms = project.manuscript as { texto?: string; nome?: string } | null;

    titulo = (el?.titulo_escolhido as string) ?? ms?.nome ?? "Sem título";
    texto  = ms?.texto ?? "";
    dadosAudioAtual = (project.dados_audio as AudioResult | null);
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: "Manuscrito sem texto. Execute o parse primeiro." }, { status: 422 });
  }

  const chapters = parseChapters(texto, titulo);
  if (capitulo_index < 0 || capitulo_index >= chapters.length) {
    return NextResponse.json(
      { error: `Índice inválido. Manuscrito tem ${chapters.length} capítulo(s).` },
      { status: 400 }
    );
  }

  const chapter = chapters[capitulo_index];

  // ── Generate audio ────────────────────────────────────────────────────────
  const audioBuffer = await textToSpeech(chapter.text, voice_id, process.env.ELEVENLABS_API_KEY!);

  // ── Upload ────────────────────────────────────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `${userId}/${project_id}/cap_${String(capitulo_index).padStart(3, "0")}.mp3`;

  const { error: uploadError } = await storageClient.storage
    .from("audiolivros")
    .upload(storagePath, audioBuffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Erro no upload: ${uploadError.message}` }, { status: 500 });
  }

  const { data: signed } = await storageClient.storage
    .from("audiolivros")
    .createSignedUrl(storagePath, 3600);

  const novoCapitulo: CapituloAudio = {
    index: capitulo_index,
    titulo: chapter.title,
    storage_path: storagePath,
    url: signed?.signedUrl ?? "",
    caracteres: Math.min(chapter.text.length, ELEVENLABS_MAX_CHARS),
    gerado_em: new Date().toISOString(),
  };

  // Merge with existing chapters
  const capitulosExistentes = dadosAudioAtual?.capitulos ?? [];
  const capitulosAtualizados = [
    ...capitulosExistentes.filter(c => c.index !== capitulo_index),
    novoCapitulo,
  ].sort((a, b) => a.index - b.index);

  const dados_audio: AudioResult = { project_id, capitulos: capitulosAtualizados };

  await supabase
    .from("projects")
    .update({ dados_audio })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(novoCapitulo);
}

// ─── GET /api/agentes/gerar-audio?project_id=... ─────────────────────────────
// Returns list of chapters (from text) + which ones have audio generated

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({
      capitulos_texto: [
        { index: 0, titulo: "O Último Manuscrito", caracteres: 800 },
        { index: 1, titulo: "CAPÍTULO 1", caracteres: 400 },
        { index: 2, titulo: "CAPÍTULO 2", caracteres: 380 },
      ],
      capitulos_audio: [],
    });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("dados_audio, dados_elementos, manuscript:manuscript_id(texto, nome)")
    .eq("id", project_id)
    .single();

  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const el = project.dados_elementos as Record<string, unknown> | null;
  const ms = project.manuscript as { texto?: string; nome?: string } | null;
  const titulo = (el?.titulo_escolhido as string) ?? ms?.nome ?? "Sem título";
  const texto  = ms?.texto ?? "";
  const chapters = parseChapters(texto, titulo);

  const dadosAudio = project.dados_audio as AudioResult | null;

  // Refresh signed URLs for existing audio
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const capitulosAudio: CapituloAudio[] = await Promise.all(
    (dadosAudio?.capitulos ?? []).map(async (c) => {
      const { data: signed } = await storageClient.storage
        .from("audiolivros")
        .createSignedUrl(c.storage_path, 3600);
      return { ...c, url: signed?.signedUrl ?? c.url };
    })
  );

  return NextResponse.json({
    capitulos_texto: chapters.map((c, i) => ({
      index: i,
      titulo: c.title,
      caracteres: Math.min(c.text.length, ELEVENLABS_MAX_CHARS),
    })),
    capitulos_audio: capitulosAudio,
  });
}

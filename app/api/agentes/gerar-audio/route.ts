export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { VOZES } from "@/lib/voices";
import { createHash } from "crypto";
import {
  segmentByCapitulosAprovados,
  type CapituloAprovado,
} from "@/lib/parse-chapters";

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
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (isDev()) {
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
  let capitulosAprovados: CapituloAprovado[] = [];

  if (isDev()) {
    titulo = "O Último Manuscrito";
    texto  = "CAPÍTULO 1\n\nEra uma noite escura e tempestuosa. O protagonista caminhou lentamente pela rua deserta, ouvindo apenas o eco dos seus próprios passos. Algo estava prestes a mudar para sempre.\n\nCAPÍTULO 2\n\nA manhã chegou com uma névoa densa cobrindo toda a cidade. Cada passo revelava um novo mistério, cada porta abria para um novo caminho inesperado.";
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_audio, dados_elementos, manuscript:manuscript_id(texto, texto_revisado, nome, titulo, capitulos_aprovados, capitulos_aprovados_texto_hash)")
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

    const el = project.dados_elementos as Record<string, unknown> | null;
    const ms = project.manuscript as {
      texto?: string;
      texto_revisado?: string;
      nome?: string;
      titulo?: string;
      capitulos_aprovados?: CapituloAprovado[] | null;
      capitulos_aprovados_texto_hash?: string | null;
    } | null;

    // Cascata: escolha em Elementos > titulo original > nome do arquivo
    // > fallback. Antes caía direto de titulo_escolhido para ms.nome,
    // que é o nome do arquivo (ex: "meu-livro.docx") e o audiolivro
    // anunciava o nome do arquivo em vez do título literário.
    titulo = (el?.titulo_escolhido as string) ?? ms?.titulo ?? ms?.nome ?? "Sem título";
    // Usa texto_revisado se existir (mesmo padrão do miolo/gerar-epub) —
    // garante que o hash bata com a aprovação (que hasheia texto_revisado).
    texto  = ms?.texto_revisado ?? ms?.texto ?? "";
    dadosAudioAtual = (project.dados_audio as AudioResult | null);

    // Q.6: valida capítulos aprovados (mesma lógica do miolo/gerar-epub).
    const capitulosAprovadosDb = ms?.capitulos_aprovados ?? null;
    const hashSalvo = ms?.capitulos_aprovados_texto_hash ?? null;

    if (capitulosAprovadosDb == null) {
      return NextResponse.json(
        {
          error: "Aprove os capítulos do livro antes de gerar o audiolivro.",
          action: "approve_chapters",
          reason: "no_approval",
        },
        { status: 422 },
      );
    }
    const hashAtual = createHash("md5").update(texto).digest("hex");
    if (hashSalvo !== hashAtual) {
      return NextResponse.json(
        {
          error: "O texto mudou desde a última aprovação de capítulos. Reaprove os capítulos.",
          action: "approve_chapters",
          reason: "text_changed",
        },
        { status: 422 },
      );
    }
    capitulosAprovados = capitulosAprovadosDb;
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: "Manuscrito sem texto. Execute o parse primeiro." }, { status: 422 });
  }

  // Q.6: segmentação vem de capitulos_aprovados (não de heurística).
  // Em dev mode capitulosAprovados fica em [] → cai em capítulo único.
  const chapters = segmentByCapitulosAprovados(texto, capitulosAprovados, titulo);
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

  const { ok: audioOk } = await updateProject(supabase, project_id, userId, {
    dados_audio,
  }, "gerar-audio");
  if (!audioOk) {
    return NextResponse.json(
      { error: "Áudio gerado, mas falha ao registrar no banco. Tente novamente." },
      { status: 500 }
    );
  }

  return NextResponse.json(novoCapitulo);
}

// ─── GET /api/agentes/gerar-audio?project_id=... ─────────────────────────────
// Returns list of chapters (from text) + which ones have audio generated

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  if (isDev()) {
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
    .select("dados_audio, dados_elementos, manuscript:manuscript_id(texto, texto_revisado, nome, titulo, capitulos_aprovados, capitulos_aprovados_texto_hash)")
    .eq("id", project_id)
    .single();

  if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

  const el = project.dados_elementos as Record<string, unknown> | null;
  const ms = project.manuscript as {
    texto?: string;
    texto_revisado?: string;
    nome?: string;
    titulo?: string;
    capitulos_aprovados?: CapituloAprovado[] | null;
    capitulos_aprovados_texto_hash?: string | null;
  } | null;
  // Cascata correta (ver comentário na primeira ocorrência acima).
  const titulo = (el?.titulo_escolhido as string) ?? ms?.titulo ?? ms?.nome ?? "Sem título";
  const texto  = ms?.texto_revisado ?? ms?.texto ?? "";

  // Q.6: valida capítulos aprovados. Se não aprovados ou hash mudou,
  // retorna 422 pra UI redirecionar autor à aprovação.
  const capitulosAprovados = ms?.capitulos_aprovados ?? null;
  const hashSalvo = ms?.capitulos_aprovados_texto_hash ?? null;

  if (capitulosAprovados == null) {
    return NextResponse.json(
      {
        error: "Aprove os capítulos do livro antes de gerar o audiolivro.",
        action: "approve_chapters",
        reason: "no_approval",
      },
      { status: 422 },
    );
  }
  const hashAtual = createHash("md5").update(texto).digest("hex");
  if (hashSalvo !== hashAtual) {
    return NextResponse.json(
      {
        error: "O texto mudou desde a última aprovação de capítulos. Reaprove os capítulos.",
        action: "approve_chapters",
        reason: "text_changed",
      },
      { status: 422 },
    );
  }

  // Q.6: mesma segmentação do POST
  const chapters = segmentByCapitulosAprovados(texto, capitulosAprovados, titulo);

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

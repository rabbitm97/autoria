export const maxDuration = 120;

import { GoogleGenAI, type Part } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { lockFormato } from "@/lib/projects";
import { isDev } from "@/lib/anthropic";
import { estimarLombadaCapaMm } from "@/lib/formatos";
import { clampOrelhaMm, getOrelhaDefault, type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import { validarProjectData } from "@/lib/project-data";
import type { EstiloCapa, OpcaoCapa, CapaGeradaResult } from "@/lib/project-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { EstiloCapa, OpcaoCapa, CapaGeradaResult } from "@/lib/project-data";

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

// ─── POST /api/agentes/gerar-capa ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
  const dev = isDev();

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (dev) {
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
    estilo?: EstiloCapa;
    cor_predominante?: string;
    usar_orelhas?: boolean;
    orelha_mm?: number;
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
    estilo = "minimalista",
    cor_predominante = "azul escuro",
    usar_orelhas = false,
    orelha_mm: rawOrelhaMm,
    imagemRef,
    is_regeneracao = false,
  } = body;

  if (!project_id) {
    return NextResponse.json({ error: "project_id é obrigatório" }, { status: 400 });
  }

  if (imagemRef && imagemRef.length > 5_000_000) {
    return NextResponse.json(
      { error: "Imagem de referência muito grande (máx 5MB)" },
      { status: 413 },
    );
  }

  // ── Fetch project + manuscripts from DB ───────────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, creditos, formato, dados_elementos, dados_miolo, manuscripts(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, genero_principal)")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  const dadosElementos = project.dados_elementos as {
    sinopse_curta?: string;
    sinopse_longa?: string;
  } | null;

  const titulo = ms?.titulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "";
  const genero = ms?.genero_principal || "literatura";

  const sinopse = dadosElementos?.sinopse_longa || dadosElementos?.sinopse_curta || "";

  const dadosMiolo = project.dados_miolo as { paginas_reais?: number; paginas_estimadas?: number } | null;
  const paginas = dadosMiolo?.paginas_reais ?? dadosMiolo?.paginas_estimadas ?? 200;

  const formato: FormatKey = ((project as { formato?: string }).formato as FormatKey) ?? "padrao_br";
  let orelha_mm = 0;
  if (typeof rawOrelhaMm === "number" && Number.isFinite(rawOrelhaMm)) {
    orelha_mm = clampOrelhaMm(formato, rawOrelhaMm);
  } else if (typeof usar_orelhas === "boolean") {
    orelha_mm = usar_orelhas ? getOrelhaDefault(formato) : 0;
  }
  const usar_orelhas_resolved = orelha_mm > 0;

  const quarta_capa_texto = body.quarta_capa_texto ?? sinopse.slice(0, 500);

  if (!titulo) {
    return NextResponse.json(
      { error: "Título do livro ausente. Configure no upload do manuscrito." },
      { status: 422 }
    );
  }

  if (!sinopse) {
    return NextResponse.json(
      { error: "Sinopse ausente. Gere os elementos editoriais antes de criar a capa." },
      { status: 422 }
    );
  }

  // ── Credit check for regeneration ────────────────────────────────────────
  if (is_regeneracao && !dev) {
    const creditos = (project as unknown as { creditos?: number }).creditos ?? 0;
    if (creditos < 20) {
      return NextResponse.json(
        { error: "Créditos insuficientes. Regenerar capa custa 20 créditos." },
        { status: 402 }
      );
    }

    const { error: debitoErr } = await supabase
      .from("projects")
      .update({ creditos: creditos - 20 })
      .eq("id", project_id);
    if (debitoErr) {
      console.error("[gerar-capa] Falha ao debitar créditos:", debitoErr.message);
      return NextResponse.json(
        { error: "Falha ao debitar créditos. Tente novamente." },
        { status: 500 }
      );
    }
  }

  const prompt = buildPrompt({ titulo, autor, sinopse, genero, estilo, cor_predominante });

  // Service-role client for Storage uploads
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const opcoes: OpcaoCapa[] = [];

  // Nano Banana Pro gera 1 imagem por chamada — fazemos 4 chamadas sequenciais
  // para obter as 4 opções de capa. A `imagemRef` (data URL) é injetada via
  // `buildContents` como `inlineData`, permitindo controle de estilo nativo.
  const NUM_OPCOES = 4;

  for (let i = 0; i < NUM_OPCOES; i++) {
    try {
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
      if (!imgPart?.inlineData?.data) {
        console.warn(`[gerar-capa] option ${i}: inlineData ausente`);
        continue;
      }

      const base64 = imgPart.inlineData.data;
      const mimeType = imgPart.inlineData.mimeType ?? "image/png";
      const ext = mimeType.includes("png") ? "png" : "jpg";
      const storagePath = `${userId}/${project_id}/capa_ia_${i}.${ext}`;
      const buffer = Buffer.from(base64, "base64");

      const { error: uploadError } = await storageClient.storage
        .from("capas")
        .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

      if (uploadError) {
        console.error(`[gerar-capa] upload error (opção ${i}):`, uploadError.message);
        continue;
      }

      const { url: publicUrl, error: signErr } = await signedUrlCapas(storageClient, storagePath);
      if (signErr || !publicUrl) {
        console.error(`[gerar-capa] signed URL failed (opção ${i}):`, signErr);
        continue;
      }

      opcoes.push({ url: publicUrl, storage_path: storagePath });
    } catch (err) {
      console.error(`[gerar-capa] generateContent failed (opção ${i}):`, err);
      // Continua tentando as próximas opções — não aborta tudo se uma falhar
    }
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
    usar_orelhas: usar_orelhas_resolved,
    orelha_mm,
    prompt_usado: prompt,
    opcoes,
    url_escolhida: opcoes[0]?.url ?? null,
    gerado_em: new Date().toISOString(),
    is_regeneracao,
    paginas_estimadas: paginas,
    lombada_mm: estimarLombadaCapaMm(paginas),
  };

  const vCapa = validarProjectData("dados_capa", result, {
    modo: "estrito", contexto: "gerar-capa",
  });
  if (!vCapa.ok) {
    console.error("[zod-reject][gerar-capa][dados_capa]", vCapa.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação. Tente novamente.", issues: vCapa.issues },
      { status: 500 }
    );
  }

  const { ok: capaOk } = await updateProject(supabase, project_id, userId, {
    dados_capa: result,
  }, "gerar-capa");
  if (!capaOk) {
    return NextResponse.json(
      { error: "Capas geradas, mas falha ao salvar no banco. Tente novamente." },
      { status: 500 }
    );
  }

  // C5-03 (item #31): capa IA é dimensionada pro formato atual (lombada,
  // proporção) — trava igual upload/montar. Idempotente.
  await lockFormato(project_id);

  return NextResponse.json(result);
  } catch (err) {
    console.error("[gerar-capa] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET /api/agentes/gerar-capa?project_id=... ───────────────────────────────

export async function GET(req: NextRequest) {
  try {
  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (isDev()) {
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
  } catch (err) {
    console.error("[gerar-capa] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

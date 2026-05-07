export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText, traceClaudeCall } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { MioloConfig, CapituloInfo } from "@/lib/miolo-builder";
import { buildBookHtml, FORMAT_DIMS } from "@/lib/miolo-builder";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { MioloConfig, CapituloInfo } from "@/lib/miolo-builder";
export type { FormatoId, TemplateId } from "@/lib/miolo-builder";

export interface MioloResult {
  config: MioloConfig;
  html_storage_path: string;
  capitulos: CapituloInfo[];
  paginas_estimadas: number;
  paginas_reais: number;       // counted from actual HTML page breaks
  lombada_mm: number;          // paginas_reais × 0.07 mm (80gsm paper)
  palavras: number;
  gerado_em: string;
}

// ─── Chapter detection (regex + Claude-assisted) ─────────────────────────────

const FALLBACK_STRUCTURE_PROMPT = `\
Você analisa manuscritos em português brasileiro para detectar capítulos.

IMPORTANTE: Respeite a estrutura já definida pelo autor. Se o autor já separou capítulos \
com títulos explícitos, use esses títulos EXATAMENTE como aparecem no texto — não invente \
nem altere nomes de capítulos.

Retorne EXCLUSIVAMENTE um array JSON de capítulos encontrados.
Se não houver capítulos claros, retorne [].

Schema:
[{ "titulo": "string — título EXATO como aparece no texto", "pos": number — posição de início em chars }]

Padrões a detectar (linhas isoladas por linhas em branco):
- "Capítulo 1", "Capítulo I", "CAPÍTULO 1", "Cap. 1", "Capítulo 1: Título"
- "Parte Um", "Parte 1", "PARTE I"
- Números isolados: "1.", "I.", "2.", "III"
- Títulos ALL CAPS isolados (< 80 chars, linha própria)
- Nomes próprios de capítulos isolados (ex: "O Despertar", "A Chegada") se seguirem padrão consistente
- Prefácio, Prólogo, Epílogo, Introdução, Apresentação, Conclusão quando isolados`;

function isChapterHeading(s: string): boolean {
  if (!s || s.includes('\n') || s.length > 100) return false;
  // Explicit chapter/part keywords
  if (/^(cap[íi]tulo|cap\.|parte)\s+/i.test(s)) return true;
  // Roman numerals alone (I, II, III, IV, V ... XX)
  if (/^[IVXLCDM]{1,6}\.?\s*$/.test(s)) return true;
  // Simple number alone (1. / 2 / 3.)
  if (/^\d{1,2}\.?\s*$/.test(s)) return true;
  // Common section names
  if (/^(prefácio|prólogo|epílogo|conclusão|introdução|apresentação|posfácio|agradecimentos|dedicatória|nota do autor|sobre o autor)$/i.test(s)) return true;
  // ALL CAPS short title (1-8 words, max 70 chars, must contain at least one letter)
  if (
    s.length <= 70 &&
    s.trim() === s.trim().toUpperCase() &&
    /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ]/.test(s) &&
    s.trim().split(/\s+/).length <= 8
  ) return true;
  return false;
}

function detectChaptersRegex(texto: string): { titulo: string; pos: number }[] {
  const results: { titulo: string; pos: number }[] = [];
  const lines = texto.split('\n');
  let charPos = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const prevBlank = i === 0 || lines[i - 1].trim() === '';
    const nextBlank = i === lines.length - 1 || lines[i + 1].trim() === '';

    if (prevBlank && nextBlank && trimmed && isChapterHeading(trimmed)) {
      const pos = texto.indexOf(trimmed, Math.max(0, charPos - 5));
      if (pos >= 0) results.push({ titulo: trimmed, pos });
    }
    charPos += raw.length + 1;
  }
  return results;
}

async function detectChaptersWithClaude(
  texto: string,
  context?: { userId?: string; projectId?: string }
): Promise<{ titulo: string; pos: number }[]> {
  // First: instant regex scan of full text — respects pre-defined author chapters
  const regexChapters = detectChaptersRegex(texto);
  if (regexChapters.length >= 2) {
    console.log("[miolo] Chapter detection via regex:", regexChapters.length, "chapters found");
    return regexChapters;
  }

  // Fallback: Claude on full text (up to 60k chars)
  const sample = texto.length > 60_000
    ? texto.slice(0, 60_000) + "\n\n[...texto truncado após 60.000 caracteres]"
    : texto;

  const STRUCTURE_PROMPT = await getAgentPrompt("miolo-estrutura", FALLBACK_STRUCTURE_PROMPT);

  try {
    const msg = await traceClaudeCall({
      agentName: "miolo-estrutura",
      projectId: context?.projectId,
      userId: context?.userId,
      metadata: { model: "claude-sonnet-4-6" },
      fn: () => anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: STRUCTURE_PROMPT,
        messages: [{ role: "user", content: `Detecte os capítulos neste manuscrito. Respeite a estrutura já definida pelo autor — use os títulos EXATAMENTE como aparecem no texto:\n\n${sample}` }],
      }),
    });
    const chapters = parseLLMJson<{ titulo: string; pos: number }[]>(extractText(msg.content));
    if (!Array.isArray(chapters)) return [];

    // Re-anchor positions to actual text (Claude positions might be approximate)
    return chapters.map(c => {
      const realPos = texto.indexOf(c.titulo);
      return { titulo: c.titulo, pos: realPos >= 0 ? realPos : c.pos };
    }).filter(c => c.pos >= 0);
  } catch {
    return [];
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { project_id: string; config: MioloConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id, config } = body;
  if (!project_id || !config) {
    return NextResponse.json({ error: "Campos obrigatórios: project_id, config." }, { status: 400 });
  }

  // Load project data including credits for injection
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, dados_creditos, manuscripts(titulo, subtitulo, texto, texto_revisado, autor_primeiro_nome, autor_sobrenome, genero_principal, capitulos_detectados, texto_hash)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string; subtitulo?: string; texto?: string; texto_revisado?: string;
    autor_primeiro_nome?: string; autor_sobrenome?: string;
    genero_principal?: string;
    capitulos_detectados?: { titulo: string; pos: number }[] | null;
    texto_hash?: string | null;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const subtitulo = ms?.subtitulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  // Prefer revised text if the author approved revisions
  const texto = ms?.texto_revisado ?? ms?.texto ?? "";

  if (!texto || texto.trim().length < 50) {
    return NextResponse.json(
      { error: "Texto do manuscrito não encontrado. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  // Detect chapters — MD5 cache to skip redundant Claude calls on re-generation
  const textoHash = createHash("md5").update(texto).digest("hex");
  let capitulos: { titulo: string; pos: number }[];
  if (ms?.texto_hash === textoHash && Array.isArray(ms?.capitulos_detectados)) {
    capitulos = ms.capitulos_detectados as { titulo: string; pos: number }[];
    console.log("[miolo] Cache HIT — usando capítulos persistidos:", {
      project_id,
      capitulos: capitulos.length,
    });
  } else {
    capitulos = await detectChaptersWithClaude(texto, { userId: user.id, projectId: project_id });
    console.log("[miolo] Cache MISS — detectando capítulos via Claude:", {
      project_id,
      texto_hash: textoHash,
      capitulos_detectados: capitulos.length,
    });
    void (async () => {
      try {
        await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
          .from("manuscripts")
          .update({ capitulos_detectados: capitulos, texto_hash: textoHash })
          .eq("id", project.manuscript_id as string);
      } catch (e) {
        console.error("[miolo] Falha ao persistir cache de capítulos:", {
          project_id: project.manuscript_id,
          texto_hash: textoHash,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();
  }

  // Fetch credits HTML from Storage if available
  let creditosInnerHtml: string | null = null;
  const dadosCreditos = project.dados_creditos as { html_storage_path?: string } | null;
  if (dadosCreditos?.html_storage_path) {
    try {
      const storageClientR = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: cFile } = await storageClientR.storage
        .from("manuscripts")
        .download(dadosCreditos.html_storage_path);
      if (cFile) {
        const raw = await cFile.text();
        const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        creditosInnerHtml = bodyMatch ? bodyMatch[1].trim() : null;
      }
    } catch {
      // Non-fatal: miolo generates without credits page
    }
  }

  // Build HTML — two passes when sumário is on so TOC shows real page numbers.
  // Pass 1 (no TOC): get chapterStartPages from actual page counter.
  // Pass 2: rebuild with those real numbers injected into the TOC.
  const buildArgs = { titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml };
  const pass1 = buildBookHtml({ ...buildArgs, config: { ...config, sumario: false } });
  const { html, capitulosInfo, paginasReais } =
    config.sumario && pass1.capitulosInfo.length > 1
      ? buildBookHtml({ ...buildArgs, chapterStartPagesOverride: pass1.chapterStartPages })
      : pass1;

  const numPalavras = texto.split(/\s+/).filter(Boolean).length;
  const paginasEstimadas = Math.max(1, Math.round(numPalavras / FORMAT_DIMS[config.formato].wpp));
  const lombadaMm = Math.round(paginasReais * 0.07 * 10) / 10;

  // Upload HTML to storage
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = `${user.id}/miolo_${project_id}.html`;

  const htmlBuffer = Buffer.from(html, "utf-8");
  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, htmlBuffer, {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[miolo] Erro upload:", uploadErr);
    return NextResponse.json({ error: "Erro ao salvar o miolo gerado." }, { status: 500 });
  }

  const mioloResult: MioloResult = {
    config,
    html_storage_path: storagePath,
    capitulos: capitulosInfo,
    paginas_estimadas: paginasEstimadas,
    paginas_reais: paginasReais,
    lombada_mm: lombadaMm,
    palavras: numPalavras,
    gerado_em: new Date().toISOString(),
  };

  // Save to project
  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_miolo: mioloResult, etapa_atual: "diagramacao" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[miolo] Erro ao salvar:", updateErr);
    return NextResponse.json({ error: "Miolo gerado, mas falha ao salvar no banco." }, { status: 500 });
  }

  // Return signed URL for preview (1 hour)
  const { data: signed } = await storageClient.storage
    .from("manuscripts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    ok: true,
    miolo: mioloResult,
    preview_url: signed?.signedUrl ?? null,
    html,
  });
}

// ─── GET — refresh signed URL ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const project_id = request.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project?.dados_miolo) return NextResponse.json(null);

  const miolo = project.dados_miolo as MioloResult;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const [{ data: signed }, { data: htmlBlob }] = await Promise.all([
    storageClient.storage.from("manuscripts").createSignedUrl(miolo.html_storage_path, 3600),
    storageClient.storage.from("manuscripts").download(miolo.html_storage_path),
  ]);

  const html = htmlBlob ? await htmlBlob.text() : null;

  return NextResponse.json({ miolo, preview_url: signed?.signedUrl ?? null, html });
}

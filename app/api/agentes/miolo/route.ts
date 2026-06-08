export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import type { MioloConfig, CapituloInfo } from "@/lib/miolo-builder";
import { buildBookHtml } from "@/lib/miolo-builder";
import { isFormatoValido, FORMATOS_VALORES, getFormatoDef } from "@/lib/formatos";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { MioloConfig, CapituloInfo } from "@/lib/miolo-builder";
export type { FormatoLivro, TemplateId } from "@/lib/miolo-builder";

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

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
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

  if (!isFormatoValido(config.formato)) {
    return NextResponse.json(
      {
        error: `Formato inválido. Valores aceitos: ${FORMATOS_VALORES.join(", ")}.`,
        received: (config as { formato?: unknown }).formato ?? null,
      },
      { status: 400 }
    );
  }

  // Load project data including credits for injection
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, dados_creditos, manuscripts(titulo, subtitulo, texto, texto_revisado, autor_primeiro_nome, autor_sobrenome, genero_principal, capitulos_aprovados)")
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
    capitulos_aprovados?: { titulo: string; pos: number }[] | null;
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

  // Read approved chapters from the manuscript. The author approves these via
  // /api/agentes/miolo/propor-capitulos and /aprovar-capitulos before generating
  // the miolo. No fallback heuristic — explicit approval is required.
  const capitulosAprovados = ms?.capitulos_aprovados as
    | { titulo: string; pos: number }[]
    | null
    | undefined;

  if (!Array.isArray(capitulosAprovados) || capitulosAprovados.length === 0) {
    return NextResponse.json(
      {
        error: "Aprove os capítulos do livro antes de gerar o miolo.",
        action: "approve_chapters",
      },
      { status: 422 }
    );
  }

  // Sort by position (defensive — UI should already send sorted, but enforce here)
  const capitulos = [...capitulosAprovados].sort((a, b) => a.pos - b.pos);

  console.log("[miolo] Capítulos aprovados:", {
    project_id,
    total: capitulos.length,
    primeiros_5: capitulos.slice(0, 5).map(c => c.titulo),
  });

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
  const paginasEstimadas = Math.max(1, Math.round(numPalavras / getFormatoDef(config.formato).specs.wpp));
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
  } catch (err) {
    console.error("[miolo] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar o miolo. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET — refresh signed URL ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
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
  } catch (err) {
    console.error("[miolo] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter o miolo. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

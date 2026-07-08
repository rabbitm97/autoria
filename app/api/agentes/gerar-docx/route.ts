export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createHash } from "crypto";
import { buildBookDocx } from "@/lib/docx-builder";
import type { MioloConfig } from "@/lib/miolo-builder";
import type { CreditosResult } from "@/app/api/agentes/creditos/route";
import type { CapituloAprovado } from "@/lib/parse-chapters";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string;
  if (isDev()) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { project_id: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Load project data ─────────────────────────────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select(
      "dados_miolo, dados_capa, dados_creditos, dados_elementos, manuscript:manuscript_id(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, capitulos_aprovados, capitulos_aprovados_texto_hash, texto_revisado, texto)"
    )
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const ms = project.manuscript as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    capitulos_aprovados?: CapituloAprovado[] | null;
    capitulos_aprovados_texto_hash?: string | null;
    texto_revisado?: string | null;
    texto?: string;
  } | null;

  const el = project.dados_elementos as {
    titulo_escolhido?: string;
    subtitulo?: string;
    palavras_chave?: string[];
  } | null;
  const mioloData = project.dados_miolo as { config?: MioloConfig } | null;
  const creditosData = project.dados_creditos as CreditosResult | null;

  const titulo = el?.titulo_escolhido ?? ms?.titulo ?? "Sem título";
  // Cascata do Q.4: escolha em Elementos > original do manuscrito.
  const subtitulo = el?.subtitulo ?? ms?.subtitulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const texto = ms?.texto_revisado ?? ms?.texto ?? "";

  if (!texto.trim()) {
    return NextResponse.json({ error: "Manuscrito sem texto. Execute o parse primeiro." }, { status: 422 });
  }

  const config = mioloData?.config;
  if (!config?.template) {
    return NextResponse.json({ error: "Configuração de miolo não encontrada. Gere o miolo primeiro." }, { status: 422 });
  }

  // G.1: capítulos vêm de manuscripts.capitulos_aprovados (mesma fonte que
  // miolo, EPUB e áudio). Zero heurística no artefato final.
  const capitulosAprovados = isDev()
    ? []
    : (ms?.capitulos_aprovados ?? null);
  const hashSalvo = isDev() ? null : (ms?.capitulos_aprovados_texto_hash ?? null);

  if (!isDev()) {
    if (capitulosAprovados == null) {
      return NextResponse.json(
        {
          error: "Aprove os capítulos do livro antes de gerar o DOCX.",
          action: "approve_chapters",
          reason: "no_approval",
        },
        { status: 422 },
      );
    }
    const hashAtual = createHash("md5").update(texto).digest("hex");
    if (hashSalvo !== hashAtual) {
      console.log("[gerar-docx] hash do texto mudou desde a aprovação", {
        project_id,
        hashSalvo: hashSalvo?.slice(0, 8),
        hashAtual: hashAtual.slice(0, 8),
      });
      return NextResponse.json(
        {
          error: "O texto mudou desde a última aprovação de capítulos. Reaprove os capítulos.",
          action: "approve_chapters",
          reason: "text_changed",
        },
        { status: 422 },
      );
    }
  }

  const capitulos = capitulosAprovados ?? [];

  // ── Generate DOCX ─────────────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    buffer = await buildBookDocx({
      titulo,
      subtitulo,
      autor,
      texto,
      capitulos,
      config,
      // Bloco 1h: se o autor optou por não incluir créditos, html_storage_path
      // fica null e a config não deve ser propagada — o docx emite verso branco.
      creditosConfig: creditosData?.html_storage_path ? creditosData.config : null,
      fichaOficial: creditosData?.ficha_oficial ?? null,
      projectId: project_id,
      palavras_chave: el?.palavras_chave,
    });
  } catch (e) {
    console.error("[gerar-docx] Erro ao gerar DOCX:", e);
    return NextResponse.json({ error: "Erro ao gerar DOCX." }, { status: 500 });
  }

  const safeName = titulo
    .replace(/[^a-zA-Z0-9À-ſ\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40) || "livro";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
}

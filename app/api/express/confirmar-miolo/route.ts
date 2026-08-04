export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { updateProject, avancarEtapa } from "@/lib/supabase-helpers";
import {
  isFormatoValido,
  estimarLombadaMm,
  type FormatoLivro,
} from "@/lib/formatos";
import { validarProjectData, type PdfResult } from "@/lib/project-data";
import { verificarMioloPdf } from "@/app/api/express/_verificacao";

// Confirmação do PDF de miolo enviado pela porta Express.
//  1. Re-verifica server-side (nunca confia em números do client).
//  2. Confere que `formato` do body bate com `projects.formato`.
//  3. Move o temp para o path canônico do projeto.
//  4. Persiste `dados_pdf` (origem: "upload") + `dados_miolo` em UPDATE único.
//  5. Avança etapa para "qa" (salto forward-only upload→qa via helper canônico).
//  6. Telemetria em usage_logs.
//
// Envelope espelha `gerar-pdf`: mesma forma de PdfResult, mesmo par de colunas
// escritas, mesma ordem (validar → updateProject → avancarEtapa → log).

export async function POST(req: NextRequest) {
  const dev = isDev();

  let userId: string;
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];
  if (dev) {
    return NextResponse.json(
      { error: "Rota Express não suportada em dev." },
      { status: 400 },
    );
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  let body: { project_id?: unknown; formato?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const projectId = typeof body.project_id === "string" ? body.project_id : "";
  if (!projectId) {
    return NextResponse.json({ error: "project_id obrigatório." }, { status: 400 });
  }
  if (!isFormatoValido(body.formato)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 422 });
  }
  const formato = body.formato as FormatoLivro;

  // ── Ownership + formato conferido ──────────────────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, formato")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  if (project.formato !== formato) {
    return NextResponse.json(
      { error: "Formato do projeto não confere com o verificado — refaça a verificação." },
      { status: 422 },
    );
  }

  // ── Re-verificação server-side ─────────────────────────────────────────────
  // Passa `paginas_declaradas` com valor sentinel positivo — nesta chamada só
  // nos importa a conferência DIMENSIONAL; a contagem real do PDF sempre vence
  // e vai para dados_pdf.paginas / dados_miolo.paginas_reais.
  const verificacao = await verificarMioloPdf({
    userId,
    formato,
    paginas_declaradas: 1,
  });

  if (!verificacao.ok) {
    const status =
      verificacao.motivo === "pdf_ausente" || verificacao.motivo === "pdf_ilegivel"
        ? 422
        : 422;
    return NextResponse.json(
      {
        error: verificacao.divergencias[0] ?? "Falha na verificação do PDF.",
        divergencias: verificacao.divergencias,
        formato_provavel: verificacao.formato_provavel,
      },
      { status },
    );
  }

  const paginasReais = verificacao.paginas_reais;

  // ── Move temp → destino canônico do projeto ────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const origem = `${userId}/express-temp.pdf`;
  const destino = `${userId}/${projectId}/miolo-upload.pdf`;

  let { error: moveErr } = await storageClient.storage
    .from("livros")
    .move(origem, destino);

  if (moveErr) {
    // Retry uma vez: caso o destino já exista (retry do autor), removemos e
    // repetimos.
    await storageClient.storage.from("livros").remove([destino]);
    const retry = await storageClient.storage
      .from("livros")
      .move(origem, destino);
    moveErr = retry.error;
  }

  if (moveErr) {
    return NextResponse.json(
      { error: `Falha ao mover o arquivo do miolo: ${moveErr.message}` },
      { status: 500 },
    );
  }

  // ── Signed URL 1h ──────────────────────────────────────────────────────────
  const { data: signedData, error: signErr } = await storageClient.storage
    .from("livros")
    .createSignedUrl(destino, 3600);

  if (signErr || !signedData) {
    return NextResponse.json(
      { error: "Erro ao gerar URL de download do miolo." },
      { status: 500 },
    );
  }

  // ── Payloads ───────────────────────────────────────────────────────────────
  const dados_pdf: PdfResult = {
    project_id: projectId,
    formato,
    storage_path: destino,
    url_download: signedData.signedUrl,
    paginas: paginasReais,
    gerado_em: new Date().toISOString(),
    origem: "upload",
  };

  const dados_miolo = {
    paginas_reais: paginasReais,
    lombada_mm: estimarLombadaMm(paginasReais),
  };

  // ── Fiscal estrito nas duas colunas ────────────────────────────────────────
  for (const [coluna, valor] of [
    ["dados_pdf", dados_pdf],
    ["dados_miolo", dados_miolo],
  ] as const) {
    const v = validarProjectData(coluna, valor, {
      modo: "estrito",
      contexto: "express-confirmar-miolo",
    });
    if (!v.ok) {
      console.error(
        `[zod-reject][express-confirmar-miolo][${coluna}]`,
        v.issues.join(" | "),
      );
      return NextResponse.json(
        {
          error:
            "Miolo verificado, mas os dados de persistência falharam na validação. Tente novamente.",
          issues: v.issues,
        },
        { status: 500 },
      );
    }
  }

  // ── UPDATE ÚNICO das duas colunas (C.2 — nunca fatiar) ─────────────────────
  const { ok: saveOk } = await updateProject(
    supabase,
    projectId,
    userId,
    { dados_pdf, dados_miolo },
    "express-confirmar-miolo",
  );
  if (!saveOk) {
    return NextResponse.json(
      {
        error:
          "Miolo verificado, mas falha ao salvar no banco. Tente novamente.",
      },
      { status: 500 },
    );
  }

  // ── Avanço forward-only upload → qa ────────────────────────────────────────
  await avancarEtapa(
    supabase,
    projectId,
    userId,
    "qa",
    "express-confirmar-miolo",
  );

  // ── Telemetria (best-effort; erro só loga, não falha a rota) ───────────────
  const { error: logErr } = await storageClient.from("usage_logs").insert({
    agent_name: "express-confirmar-miolo",
    project_id: projectId,
    user_id: userId,
    metadata: { paginas: paginasReais, formato },
  });
  if (logErr) {
    console.error("[express-confirmar-miolo] usage_logs falhou:", logErr.message);
  }

  return NextResponse.json(dados_pdf);
}

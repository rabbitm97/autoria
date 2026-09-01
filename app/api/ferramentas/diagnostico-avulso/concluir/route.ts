export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { launchWithRetry } from "@/lib/puppeteer-launch";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { normalizarPdfMiolo } from "@/lib/pdf-normalizar";
import { getFormatoDef } from "@/lib/formatos";
import { BUCKET_FERRAMENTAS, concluirJob, falharJob } from "@/lib/ferramenta-jobs";
import { carregarJobDoUsuario, lerExpiraEm } from "@/lib/ferramenta-concluir";
import { ACAO_DIAGNOSTICO } from "@/lib/diagnostico-avulso";
import { renderRelatorioDiagnosticoHtml } from "@/lib/relatorio-diagnostico";
import type { DiagnosticoState } from "@/lib/project-data";

const LAYOUT_VIEWPORT_PX = { width: 1240, height: 1754 };

export async function POST(request: NextRequest) {
  let user: { id: string };
  try {
    ({ user } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { job_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { job_id } = body;
  if (!job_id || typeof job_id !== "string") {
    return NextResponse.json({ error: "job_id obrigatório." }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const jobRes = await carregarJobDoUsuario(admin, user.id, job_id);
  if (!jobRes.ok) return jobRes.response;
  const { job } = jobRes;

  if (job.estado === "concluido") {
    return NextResponse.json({ ok: true, job_id, entregavel_index: 0, entregaveis: job.entregaveis });
  }

  if (!job.projeto_sombra_id) {
    return NextResponse.json({ error: "Job sem projeto sombra." }, { status: 400 });
  }

  const acao = ACAO_DIAGNOSTICO;

  // Carregar o sombra com diagnóstico e dados do manuscrito
  const { data: rawSombra } = await admin
    .from("projects")
    .select("diagnostico, manuscripts(titulo, nome, autor_primeiro_nome, autor_sobrenome)")
    .eq("id", job.projeto_sombra_id)
    .maybeSingle();

  const sombra = rawSombra as {
    diagnostico: unknown;
    manuscripts: { titulo?: string | null; nome?: string | null; autor_primeiro_nome?: string | null; autor_sobrenome?: string | null } | null;
  } | null;

  if (!sombra) {
    return NextResponse.json({ error: "Projeto sombra não encontrado." }, { status: 404 });
  }

  const estado = sombra.diagnostico as DiagnosticoState | null;
  if (!estado || estado.status !== "concluido") {
    return NextResponse.json({ error: "Diagnóstico ainda não concluído." }, { status: 409 });
  }

  if (!estado.resultado) {
    return NextResponse.json({ error: "Resultado do diagnóstico ausente." }, { status: 409 });
  }

  const ms = sombra.manuscripts;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Manuscrito";
  const autorPartes = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ");
  const autor = autorPartes || null;

  const amostra =
    estado.amostra && estado.amostra_fragmentos != null && estado.total_fragmentos != null
      ? { fragmentos: estado.amostra_fragmentos, total: estado.total_fragmentos }
      : null;

  let pdfBuffer: Buffer;

  const browser = await launchWithRetry({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const html = renderRelatorioDiagnosticoHtml({
      titulo,
      autor,
      resultado: estado.resultado,
      amostra,
      geradoEm: new Date(),
    });

    const page = await browser.newPage();
    await page.setViewport({ width: LAYOUT_VIEWPORT_PX.width, height: LAYOUT_VIEWPORT_PX.height, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });

    try {
      await page.evaluate(async () => { await document.fonts.ready; });
    } catch {
      // best-effort
    }

    const pdfData = await page.pdf({
      width: "210mm",
      height: "297mm",
      printBackground: true,
      scale: 1,
      timeout: 40_000,
    });

    pdfBuffer = Buffer.from(pdfData);
  } catch (err) {
    console.error("[diagnostico-avulso/concluir] Puppeteer falhou:", err);
    await browser.close().catch(() => {});
    await falharJob(admin, job, acao);
    return NextResponse.json(
      { error: "Falha ao gerar o relatório. Os créditos foram devolvidos." },
      { status: 500 },
    );
  }

  await browser.close().catch(() => {});

  try {
    pdfBuffer = await normalizarPdfMiolo(pdfBuffer, getFormatoDef("a4").specs, "digital");
  } catch (err) {
    console.error("[diagnostico-avulso/concluir] normalizarPdfMiolo falhou:", err);
    await falharJob(admin, job, acao);
    return NextResponse.json(
      { error: "Falha ao processar o PDF. Os créditos foram devolvidos." },
      { status: 500 },
    );
  }

  const storagePath = `${user.id}/${job.id}/diagnostico.pdf`;
  const { error: uploadErr } = await admin.storage
    .from(BUCKET_FERRAMENTAS)
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[diagnostico-avulso/concluir] upload falhou:", uploadErr.message);
    await falharJob(admin, job, acao);
    return NextResponse.json(
      { error: "Falha ao salvar o relatório. Os créditos foram devolvidos." },
      { status: 500 },
    );
  }

  const entregaveis = [
    {
      tipo: "relatorio_pdf" as const,
      storage_path: storagePath,
      bytes: pdfBuffer.byteLength,
      nome_exibicao: `Diagnóstico — ${titulo}.pdf`,
    },
  ];

  const ok = await concluirJob(admin, job, entregaveis);
  if (!ok) {
    return NextResponse.json({ error: "Falha ao registrar conclusão do job." }, { status: 500 });
  }

  const expiraEm = await lerExpiraEm(admin, job_id);

  return NextResponse.json({
    ok: true,
    job_id,
    entregavel_index: 0,
    expira_em: expiraEm,
    resultado: estado.resultado,
    amostra,
  });
}

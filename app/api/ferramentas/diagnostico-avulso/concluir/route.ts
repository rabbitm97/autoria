export const maxDuration = 60;

// POST /api/ferramentas/diagnostico-avulso/concluir
// Lê o resultado do diagnóstico no sombra project, gera PDF via Puppeteer,
// faz upload ao cofre (bucket "ferramentas") e conclui o job.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { launchWithRetry } from "@/lib/puppeteer-launch";
import { requireAuth } from "@/lib/supabase-server";
import { concluirJob, falharJob, type EntregavelJob } from "@/lib/ferramenta-jobs";
import { gerarRelatorioHtml } from "@/lib/relatorio-diagnostico";
import { ACAO_POR_MODO, ferramentaParaModo, type ModoDiagnostico } from "@/lib/diagnostico-avulso";
import type { DiagnosticoState } from "@/lib/project-data";

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    ({ user: { id: userId } } = await requireAuth());
  } catch (e) {
    return e as Response;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: { job_id: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { job_id } = body;
  if (!job_id || typeof job_id !== "string") {
    return NextResponse.json({ error: "Campo 'job_id' obrigatório." }, { status: 400 });
  }

  // 1. Carregar job — verificar ownership e estado.
  const { data: jobRow, error: jobErr } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, projeto_sombra_id, debitado_em, estado, entrada")
    .eq("id", job_id)
    .single();

  if (jobErr || !jobRow) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }

  const job = jobRow as {
    id: string; user_id: string; ferramenta_id: string;
    projeto_sombra_id: string | null; debitado_em: string | null;
    estado: string; entrada: Record<string, unknown>;
  };

  if (job.user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este job." }, { status: 403 });
  }

  if (job.estado !== "processando") {
    return NextResponse.json({ error: `Job em estado '${job.estado}' — esperado 'processando'.` }, { status: 409 });
  }

  if (!job.projeto_sombra_id) {
    return NextResponse.json({ error: "Job sem projeto sombra." }, { status: 422 });
  }

  const modo = (job.entrada?.modo as ModoDiagnostico | undefined) ?? ferramentaParaModo(job.ferramenta_id) ?? "completo";
  const titulo = (job.entrada?.titulo as string | undefined) ?? "Diagnóstico";

  // 2. Ler resultado do diagnóstico no sombra project.
  const { data: proj, error: projErr } = await admin
    .from("projects")
    .select("diagnostico")
    .eq("id", job.projeto_sombra_id)
    .single();

  if (projErr || !proj) {
    return NextResponse.json({ error: "Sombra project não encontrado." }, { status: 404 });
  }

  const estado = (proj as { diagnostico: unknown }).diagnostico as DiagnosticoState | null;
  if (!estado || estado.status !== "concluido" || !estado.resultado) {
    return NextResponse.json(
      { error: "Diagnóstico ainda não concluído." },
      { status: 422 },
    );
  }

  // 3. Gerar HTML e PDF via Puppeteer.
  const html = gerarRelatorioHtml({ titulo, modo, estado });

  let pdfBuffer: Buffer;
  const browser = await launchWithRetry({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });

    try {
      await page.evaluate(async () => { await document.fonts.ready; });
    } catch {
      // best-effort
    }

    const pdfData = await page.pdf({
      printBackground: true,
      width: "210mm",
      height: "297mm",
      scale: 1,
      timeout: 40_000,
    });

    pdfBuffer = Buffer.from(pdfData);
  } finally {
    await browser.close();
  }

  // 4. Upload ao cofre (bucket "ferramentas").
  const storagePath = `${userId}/${job_id}/diagnostico.pdf`;
  const { error: uploadErr } = await admin.storage
    .from("ferramentas")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[concluir] upload falhou:", uploadErr.message);
    const acao = ACAO_POR_MODO[modo];
    await falharJob(admin, {
      id: job.id, user_id: job.user_id,
      projeto_sombra_id: job.projeto_sombra_id,
      debitado_em: job.debitado_em,
    }, acao);
    return NextResponse.json({ error: "Falha ao salvar o arquivo." }, { status: 500 });
  }

  // 5. Concluir job — apaga o sombra project.
  const nomeExibicao = `Diagnóstico ${modo === "expresso" ? "Expresso" : "Completo"} — ${titulo}.pdf`;
  const entregaveis: EntregavelJob[] = [{
    tipo: "relatorio_pdf",
    storage_path: storagePath,
    bytes: pdfBuffer.length,
    nome_exibicao: nomeExibicao,
  }];

  await concluirJob(admin, {
    id: job.id,
    user_id: job.user_id,
    projeto_sombra_id: job.projeto_sombra_id,
  }, entregaveis);

  return NextResponse.json({ ok: true, entregaveis });
}

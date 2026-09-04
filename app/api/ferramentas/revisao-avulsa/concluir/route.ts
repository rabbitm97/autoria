export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import chromium from "@sparticuz/chromium";
import { launchWithRetry } from "@/lib/puppeteer-launch";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { BUCKET_FERRAMENTAS, concluirJob } from "@/lib/ferramenta-jobs";
import { carregarJobDoUsuario, lerExpiraEm } from "@/lib/ferramenta-concluir";
import { renderRelatorioRevisaoHtml } from "@/lib/relatorio-revisao";
import { proporCapitulos } from "@/lib/chapter-detection";
import type { EntregavelJob } from "@/lib/ferramenta-jobs";
import type { RevisaoResult } from "@/lib/project-data";

// FERR-3.5b — POST /api/ferramentas/revisao-avulsa/concluir
// Body: { job_id }
// Fluxo: valida que dados_revisao.finalizado_em existe → chama
// /api/agentes/gerar-docx (com o mesmo cookie) para materializar o DOCX
// revisado → renderiza o relatório de alterações via Puppeteer → sobe
// os dois no cofre → concluirJob (apaga sombra — revisão avulsa não
// reabre depois, ver FERR-3.5b: "sombra da revisão MORRE na conclusão").
// SEM falharJob no meio: se DOCX ou relatório falharem, devolvemos 500
// e o autor tenta de novo. O job segue pago e reaproveitável.

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

  if (job.ferramenta_id !== "revisao") {
    return NextResponse.json({ error: "Job não é de revisão." }, { status: 400 });
  }

  if (job.estado === "concluido") {
    return NextResponse.json({
      ok: true,
      job_id,
      entregaveis: job.entregaveis,
      expira_em: job.expira_em,
    });
  }

  if (!job.projeto_sombra_id) {
    return NextResponse.json({ error: "Job sem projeto sombra." }, { status: 400 });
  }

  // Carrega sombra + manuscript (título/autor pro nome dos entregáveis e
  // pro cabeçalho do relatório) e dados_revisao (precisa estar finalizada).
  // texto/texto_revisado são pra auto-aprovação de capítulos (FERR-3.5f).
  const { data: rawSombra } = await admin
    .from("projects")
    .select(
      "dados_revisao, manuscript_id, manuscripts(titulo, nome, autor_primeiro_nome, autor_sobrenome, texto, texto_revisado)",
    )
    .eq("id", job.projeto_sombra_id)
    .maybeSingle();

  const sombra = rawSombra as {
    dados_revisao: RevisaoResult | null;
    manuscript_id: string | null;
    manuscripts: {
      titulo?: string | null;
      nome?: string | null;
      autor_primeiro_nome?: string | null;
      autor_sobrenome?: string | null;
      texto?: string | null;
      texto_revisado?: string | null;
    } | null;
  } | null;

  if (!sombra) {
    return NextResponse.json({ error: "Projeto sombra não encontrado." }, { status: 404 });
  }

  const revisao = sombra.dados_revisao;
  if (!revisao?.finalizado_em) {
    return NextResponse.json(
      { error: "Finalize a revisão antes de gerar os arquivos." },
      { status: 409 },
    );
  }

  const ms = sombra.manuscripts;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Livro";
  const autorPartes = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ");
  const autor = autorPartes || null;

  // ── Auto-aprovação de capítulos (FERR-3.5f) ─────────────────────────────
  // Decisão 04/set: a revisão avulsa não usa capítulos como ferramenta —
  // só o DOCX final estrutura. Rodamos a MESMA detecção do propor-capitulos
  // sobre o texto_revisado (com fallback pro texto original) e persistimos
  // no mesmo shape que aprovar-capitulos usa. O hash nasce do texto usado
  // na detecção, então gerar-docx nunca dispara 422 data_changed aqui.
  if (!sombra.manuscript_id) {
    return NextResponse.json({ error: "Sombra sem manuscript_id." }, { status: 500 });
  }
  const textoFinal = ((ms?.texto_revisado ?? ms?.texto) ?? "") as string;
  const capitulosAprovados = proporCapitulos(textoFinal)
    .filter((c) => c.sugerido)
    .map((c) => ({ titulo: c.titulo, pos: c.pos }))
    .sort((a, b) => a.pos - b.pos);
  const textoHash = createHash("md5").update(textoFinal).digest("hex");
  const { error: capsErr } = await admin
    .from("manuscripts")
    .update({
      capitulos_aprovados: capitulosAprovados,
      capitulos_aprovados_texto_hash: textoHash,
    })
    .eq("id", sombra.manuscript_id);
  if (capsErr) {
    console.error("[revisao-avulsa/concluir] falha ao auto-aprovar capítulos:", capsErr.message);
    return NextResponse.json(
      { error: "Falha ao preparar capítulos. Tente novamente." },
      { status: 500 },
    );
  }

  // ── 1. DOCX ─────────────────────────────────────────────────────────────
  // Fetch interno autenticado (mesmo padrão de preparar-capa-grafica →
  // export-pdf). O endpoint gerar-docx devolve binário com
  // Content-Disposition; aqui a gente lê os bytes direto.
  const baseUrl = request.nextUrl.origin;
  const docxUrl = `${baseUrl}/api/agentes/gerar-docx`;
  let docxBytes: Buffer;
  try {
    const docxRes = await fetch(docxUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ project_id: job.projeto_sombra_id }),
    });
    if (!docxRes.ok) {
      const d = await docxRes.json().catch(() => ({}));
      console.error("[revisao-avulsa/concluir] gerar-docx falhou:", docxRes.status, d);
      return NextResponse.json(
        { error: (d as { error?: string })?.error ?? "Falha ao gerar o DOCX. Tente novamente." },
        { status: 500 },
      );
    }
    docxBytes = Buffer.from(await docxRes.arrayBuffer());
  } catch (fetchErr) {
    console.error("[revisao-avulsa/concluir] fetch DOCX falhou:", fetchErr);
    return NextResponse.json(
      { error: "Falha de comunicação ao gerar o DOCX. Tente novamente." },
      { status: 500 },
    );
  }

  const docxPath = `${user.id}/${job.id}/livro-revisado.docx`;
  const { error: docxUpErr } = await admin.storage
    .from(BUCKET_FERRAMENTAS)
    .upload(docxPath, docxBytes, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (docxUpErr) {
    console.error("[revisao-avulsa/concluir] upload DOCX falhou:", docxUpErr.message);
    return NextResponse.json(
      { error: "Falha ao salvar o DOCX. Tente novamente." },
      { status: 500 },
    );
  }

  // ── 2. Relatório PDF via Puppeteer ──────────────────────────────────────
  const aceitas = new Set(revisao.aceitas ?? []);
  const rejeitadas = new Set(revisao.rejeitadas ?? []);

  let pdfBuffer: Buffer;
  const browser = await launchWithRetry({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const html = renderRelatorioRevisaoHtml({
      titulo,
      autor,
      alteracoes: revisao.sugestoes,
      aceitas,
      rejeitadas,
      geradoEm: new Date(),
    });

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
      width: "210mm",
      height: "297mm",
      printBackground: true,
      scale: 1,
      timeout: 40_000,
    });
    pdfBuffer = Buffer.from(pdfData);
  } catch (err) {
    console.error("[revisao-avulsa/concluir] Puppeteer falhou:", err);
    await browser.close().catch(() => {});
    return NextResponse.json(
      { error: "Falha ao gerar o relatório. Tente novamente." },
      { status: 500 },
    );
  }

  await browser.close().catch(() => {});

  const pdfPath = `${user.id}/${job.id}/relatorio-revisao.pdf`;
  const { error: pdfUpErr } = await admin.storage
    .from(BUCKET_FERRAMENTAS)
    .upload(pdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (pdfUpErr) {
    console.error("[revisao-avulsa/concluir] upload relatório falhou:", pdfUpErr.message);
    return NextResponse.json(
      { error: "Falha ao salvar o relatório. Tente novamente." },
      { status: 500 },
    );
  }

  // ── 3. Marcar como concluído ─────────────────────────────────────────────
  const entregaveis: EntregavelJob[] = [
    {
      tipo: "docx",
      storage_path: docxPath,
      bytes: docxBytes.byteLength,
      nome_exibicao: `${titulo} — revisado.docx`,
    },
    {
      tipo: "relatorio_pdf",
      storage_path: pdfPath,
      bytes: pdfBuffer.byteLength,
      nome_exibicao: `Relatório de revisão — ${titulo}.pdf`,
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
    entregaveis,
    expira_em: expiraEm,
  });
}

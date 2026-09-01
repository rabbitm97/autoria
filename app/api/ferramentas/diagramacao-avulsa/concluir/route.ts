export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { concluirJob, falharJob, modoDiagramacao, type EntregavelJob } from "@/lib/ferramenta-jobs";
import { carregarJobDoUsuario, copiarParaCofre, lerExpiraEm } from "@/lib/ferramenta-concluir";
import type { AcaoCredito } from "@/lib/creditos-custos";

// POST /api/ferramentas/diagramacao-avulsa/concluir
// Body: { job_id }
// Copia livro-digital.pdf (sempre) e livro.pdf (só modo completa) do bucket
// livros do projeto sombra para o cofre ferramentas/{u}/{jobId}/, marca o
// job como concluído e apaga o sombra. Idempotente: se já concluído, apenas
// devolve os entregáveis existentes.

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

  const modo = modoDiagramacao(job.ferramenta_id);
  if (!modo) {
    return NextResponse.json({ error: "Job não é de diagramação." }, { status: 400 });
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

  const { data: rawSombra } = await admin
    .from("projects")
    .select("dados_pdf, dados_pdf_digital, manuscripts(titulo, nome)")
    .eq("id", job.projeto_sombra_id)
    .maybeSingle();

  const sombra = rawSombra as {
    dados_pdf: { storage_path?: string } | null;
    dados_pdf_digital: { storage_path?: string } | null;
    manuscripts: { titulo?: string | null; nome?: string | null } | null;
  } | null;

  if (!sombra) {
    return NextResponse.json({ error: "Projeto sombra não encontrado." }, { status: 404 });
  }

  const digitalPath = sombra.dados_pdf_digital?.storage_path ?? null;
  if (!digitalPath) {
    return NextResponse.json({ error: "PDF digital ainda não gerado." }, { status: 409 });
  }

  let graficoPath: string | null = null;
  if (modo === "completa") {
    graficoPath = sombra.dados_pdf?.storage_path ?? null;
    if (!graficoPath) {
      return NextResponse.json({ error: "PDF de impressão ainda não gerado." }, { status: 409 });
    }
  }

  const ms = sombra.manuscripts;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Livro";
  const acao: AcaoCredito = modo === "completa" ? "diagramacao_completa" : "diagramacao_digital";

  const entregaveis: EntregavelJob[] = [];

  const copiaDig = await copiarParaCofre(admin, {
    userId: user.id,
    jobId: job.id,
    srcBucket: "livros",
    srcPath: digitalPath,
    destFilename: "livro-digital.pdf",
    contentType: "application/pdf",
  });
  if ("error" in copiaDig) {
    console.error("[diagramacao-avulsa/concluir] cópia do PDF digital falhou:", copiaDig.error);
    await falharJob(admin, job, acao);
    return NextResponse.json(
      { error: "Falha ao salvar o PDF digital. Os créditos foram devolvidos." },
      { status: 500 },
    );
  }
  entregaveis.push({
    tipo: "pdf_digital",
    storage_path: copiaDig.storage_path,
    bytes: copiaDig.bytes,
    nome_exibicao: `${titulo}.pdf`,
  });

  if (graficoPath) {
    const copiaGraf = await copiarParaCofre(admin, {
      userId: user.id,
      jobId: job.id,
      srcBucket: "livros",
      srcPath: graficoPath,
      destFilename: "livro-impressao.pdf",
      contentType: "application/pdf",
    });
    if ("error" in copiaGraf) {
      console.error("[diagramacao-avulsa/concluir] cópia do PDF gráfico falhou:", copiaGraf.error);
      await falharJob(admin, job, acao);
      return NextResponse.json(
        { error: "Falha ao salvar o PDF de impressão. Os créditos foram devolvidos." },
        { status: 500 },
      );
    }
    entregaveis.push({
      tipo: "pdf_grafico",
      storage_path: copiaGraf.storage_path,
      bytes: copiaGraf.bytes,
      nome_exibicao: `${titulo} - impressão.pdf`,
    });
  }

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

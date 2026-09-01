export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { concluirJob, falharJob, type EntregavelJob } from "@/lib/ferramenta-jobs";
import { carregarJobDoUsuario, copiarParaCofre, lerExpiraEm } from "@/lib/ferramenta-concluir";

const ACAO_EPUB = "epub_avulso" as const;

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

  const { data: rawSombra } = await admin
    .from("projects")
    .select("dados_pdf, manuscripts(titulo, nome)")
    .eq("id", job.projeto_sombra_id)
    .maybeSingle();

  const sombra = rawSombra as {
    dados_pdf: Record<string, unknown> | null;
    manuscripts: { titulo?: string | null; nome?: string | null } | null;
  } | null;

  if (!sombra) {
    return NextResponse.json({ error: "Projeto sombra não encontrado." }, { status: 404 });
  }

  const epub = (sombra.dados_pdf as { epub?: { storage_path?: string } } | null)?.epub ?? null;
  if (!epub?.storage_path) {
    return NextResponse.json({ error: "EPUB ainda não gerado." }, { status: 409 });
  }

  const ms = sombra.manuscripts;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Manuscrito";

  const entregaveis: EntregavelJob[] = [];

  const copiaEpub = await copiarParaCofre(admin, {
    userId: user.id,
    jobId: job.id,
    srcBucket: "livros",
    srcPath: epub.storage_path,
    destFilename: "livro.epub",
    contentType: "application/epub+zip",
  });
  if ("error" in copiaEpub) {
    console.error("[epub-avulso/concluir] cópia do EPUB falhou:", copiaEpub.error);
    await falharJob(admin, job, ACAO_EPUB);
    return NextResponse.json(
      { error: "Falha ao salvar o EPUB. Os créditos foram devolvidos." },
      { status: 500 },
    );
  }
  entregaveis.push({
    tipo: "epub",
    storage_path: copiaEpub.storage_path,
    bytes: copiaEpub.bytes,
    nome_exibicao: `${titulo}.epub`,
  });

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
  });
}

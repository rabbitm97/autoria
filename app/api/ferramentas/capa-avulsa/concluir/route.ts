export const maxDuration = 60;

// FERR-3.4b: concluir a capa avulsa. Diferente de EPUB/diagramação, aqui:
//   1) o sombra NÃO é apagado (`apagarSombra: false`) — o autor continua
//      com direito de reabrir o editor até o job expirar;
//   2) o job aceita reconclusão (`permitirReconcluir`): quando o autor
//      volta ao editor, muda algo e refaz "Gerar arquivos", a rota
//      substitui os entregáveis do cofre sem cobrar de novo.
//
// Entregáveis:
//   [0] pdf_capa   — PDF gráfico (frente + lombada + verso) já produzido
//                    por preparar-capa-grafica em editor-assets.
//   [1] jpg_ebook  — Frente em alta res. Usa o mesmo extractFrontCover do
//                    gerar-epub; fallback baixa a url panorâmica se o crop
//                    falhar (mesmo behavior do EPUB).
//
// Não estorna imagens em falha. Créditos das imagens compradas já viraram
// arte na galeria — não somem por causa de um erro aqui.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { BUCKET_FERRAMENTAS, concluirJob, type EntregavelJob } from "@/lib/ferramenta-jobs";
import { carregarJobDoUsuario, copiarParaCofre, lerExpiraEm } from "@/lib/ferramenta-concluir";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { extractFrontCover, type FormatoCapa } from "@/lib/capa-frente-extractor";

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

  const jobRes = await carregarJobDoUsuario(admin, user.id, job_id, {
    permitirReconcluir: true,
  });
  if (!jobRes.ok) return jobRes.response;
  const { job } = jobRes;

  if (job.ferramenta_id !== "capa-ia") {
    return NextResponse.json({ error: "Job de ferramenta incompatível." }, { status: 400 });
  }

  // Só idempotente quando NÃO há mais sombra (job já expirou o vínculo);
  // com sombra vivo + `podeReconcluir`, deixa passar para regravar tudo.
  if (job.estado === "concluido" && !job.podeReconcluir) {
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
    .select("formato, dados_capa, manuscripts(titulo, nome)")
    .eq("id", job.projeto_sombra_id)
    .maybeSingle();

  const sombra = rawSombra as {
    formato: FormatoCapa | null;
    dados_capa: Record<string, unknown> | null;
    manuscripts: { titulo?: string | null; nome?: string | null } | null;
  } | null;

  if (!sombra) {
    return NextResponse.json({ error: "Projeto sombra não encontrado." }, { status: 404 });
  }
  if (!sombra.formato) {
    return NextResponse.json({ error: "Escolha o formato antes de gerar os arquivos." }, { status: 409 });
  }

  const capa = sombra.dados_capa ?? {};
  const pdfGrafica = (capa as { pdf_grafica?: { storage_path?: string } }).pdf_grafica;
  if (!pdfGrafica?.storage_path) {
    return NextResponse.json({ error: "Gere o PDF de capa primeiro." }, { status: 409 });
  }

  // Páginas vivem em ferramenta_jobs.entrada (o helper não seleciona esse
  // campo). extractFrontCover só usa como fallback; o valor real é
  // inferido da geometria da imagem.
  const { data: rawJobEntrada } = await admin
    .from("ferramenta_jobs")
    .select("entrada")
    .eq("id", job.id)
    .maybeSingle();
  const entradaPag = (rawJobEntrada as { entrada?: { paginas?: unknown } } | null)
    ?.entrada?.paginas;
  const paginasEntrada = Number(entradaPag);
  const paginas = Number.isInteger(paginasEntrada) && paginasEntrada > 0 ? paginasEntrada : 0;

  const ms = sombra.manuscripts;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Capa";

  // Nome de arquivo consistente entre reconclusões — upsert:true no cofre
  // substitui a versão anterior sem deixar lixo.
  const pdfDest = "capa-grafica.pdf";
  const copiaPdf = await copiarParaCofre(admin, {
    userId: user.id,
    jobId: job.id,
    srcBucket: "editor-assets",
    srcPath: pdfGrafica.storage_path,
    destFilename: pdfDest,
    contentType: "application/pdf",
  });
  if ("error" in copiaPdf) {
    console.error("[capa-avulsa/concluir] cópia do PDF gráfico falhou:", copiaPdf.error);
    return NextResponse.json({ error: "Falha ao copiar o PDF de capa. Tente novamente." }, { status: 500 });
  }

  const entregaveis: EntregavelJob[] = [
    {
      tipo: "pdf_capa",
      storage_path: copiaPdf.storage_path,
      bytes: copiaPdf.bytes,
      nome_exibicao: `${titulo} — capa para gráfica.pdf`,
    },
  ];

  // Frente em alta — extractFrontCover recorta a frente da panorâmica.
  // O mesmo fluxo do gerar-epub: se o extractor falhar (imagem exótica,
  // metadata quebrada), faz fallback baixando a própria url_principal.
  const capaResolvida = resolveCapaCompleta(capa, sombra.formato);
  const capaUrl = capaResolvida.url_area_util ?? capaResolvida.url_principal;

  if (capaUrl) {
    let frenteBuffer: Buffer | null = null;
    let frenteExt: string = "jpg";
    let frenteContentType = "image/jpeg";

    const front = await extractFrontCover({
      url: capaUrl,
      formato: sombra.formato,
      paginas,
      orelhaMm: capaResolvida.orelha_mm ?? 0,
    });
    if (front) {
      frenteBuffer = front.buffer;
      frenteExt = front.ext;
      frenteContentType = "image/jpeg";
    } else {
      // Fallback: baixa a própria url (igual ao gerar-epub).
      try {
        const res = await fetch(capaUrl);
        if (res.ok) {
          frenteBuffer = Buffer.from(await res.arrayBuffer());
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("png")) {
            frenteExt = "png";
            frenteContentType = "image/png";
          } else {
            frenteExt = "jpg";
            frenteContentType = "image/jpeg";
          }
        }
      } catch (err) {
        console.warn("[capa-avulsa/concluir] fallback download falhou:", err);
      }
    }

    if (frenteBuffer) {
      const frentePath = `${user.id}/${job.id}/capa-frente.${frenteExt}`;
      const { error: upErr } = await admin.storage
        .from(BUCKET_FERRAMENTAS)
        .upload(frentePath, frenteBuffer, {
          contentType: frenteContentType,
          upsert: true,
        });
      if (upErr) {
        console.error("[capa-avulsa/concluir] upload da frente falhou:", upErr.message);
        return NextResponse.json(
          { error: "Falha ao salvar a frente em alta resolução. Tente novamente." },
          { status: 500 },
        );
      }
      entregaveis.push({
        tipo: "jpg_ebook",
        storage_path: frentePath,
        bytes: frenteBuffer.byteLength,
        nome_exibicao: `${titulo} — capa frente.${frenteExt}`,
      });
    } else {
      return NextResponse.json(
        { error: "Não conseguimos baixar a arte da capa. Tente novamente." },
        { status: 500 },
      );
    }
  } else {
    return NextResponse.json({ error: "Capa sem arte confirmada." }, { status: 409 });
  }

  const ok = await concluirJob(admin, job, entregaveis, { apagarSombra: false });
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

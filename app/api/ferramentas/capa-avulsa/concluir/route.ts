export const maxDuration = 60;

// FERR-3.4b/g: concluir a capa avulsa. Diferente de EPUB/diagramação, aqui:
//   1) o sombra NÃO é apagado (`apagarSombra: false`) — o autor continua
//      com direito de reabrir o editor até o job expirar;
//   2) o job aceita reconclusão (`permitirReconcluir`): quando o autor
//      volta ao editor, muda algo e refaz "Gerar arquivos", a rota
//      substitui os entregáveis do cofre sem cobrar de novo.
//
// Entregáveis (FERR-3.4g — martelada 02/set: 4 arquivos):
//   [0] pdf_capa      — CMYK gráfica (`dados_capa.pdf_grafica.storage_path`)
//   [1] pdf_digital   — RGB para POD  (`dados_capa.exports.pdf_rgb.storage_path`)
//   [2] jpg_ebook     — Frente 300 DPI (preferência: capturas do editor em
//                       `job.entrada.exports_jpeg.frente`; fallback:
//                       extractFrontCover sobre a arte da capa)
//   [3] jpg_ebook     — Completa panorâmica 300 DPI (preferência: capturas em
//                       `entrada.exports_jpeg.completa`; fallback: download
//                       direto da url_principal)
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
  const exportsCapa = (capa as { exports?: { pdf_rgb?: { storage_path?: string } } }).exports ?? {};
  const pdfRgbPath = exportsCapa.pdf_rgb?.storage_path ?? null;

  // Páginas vivem em ferramenta_jobs.entrada (o helper não seleciona esse
  // campo). extractFrontCover só usa como fallback; o valor real é
  // inferido da geometria da imagem.
  const { data: rawJobEntrada } = await admin
    .from("ferramenta_jobs")
    .select("entrada")
    .eq("id", job.id)
    .maybeSingle();
  const entradaObj = (rawJobEntrada as { entrada?: Record<string, unknown> } | null)?.entrada ?? {};
  const entradaPag = (entradaObj as { paginas?: unknown }).paginas;
  const paginasEntrada = Number(entradaPag);
  const paginas = Number.isInteger(paginasEntrada) && paginasEntrada > 0 ? paginasEntrada : 0;
  const exportsJpeg = (entradaObj as { exports_jpeg?: { frente?: unknown; completa?: unknown } }).exports_jpeg ?? {};
  const jpegFrentePath = typeof exportsJpeg.frente === "string" ? exportsJpeg.frente : null;
  const jpegCompletaPath = typeof exportsJpeg.completa === "string" ? exportsJpeg.completa : null;

  const ms = sombra.manuscripts;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Capa";

  // [0] CMYK gráfica — nome fixo no cofre, upsert:true substitui versão anterior.
  const copiaCmyk = await copiarParaCofre(admin, {
    userId: user.id,
    jobId: job.id,
    srcBucket: "editor-assets",
    srcPath: pdfGrafica.storage_path,
    destFilename: "capa-grafica-CMYK.pdf",
    contentType: "application/pdf",
  });
  if ("error" in copiaCmyk) {
    console.error("[capa-avulsa/concluir] cópia CMYK falhou:", copiaCmyk.error);
    return NextResponse.json({ error: "Falha ao copiar o PDF de capa. Tente novamente." }, { status: 500 });
  }

  const entregaveis: EntregavelJob[] = [
    {
      tipo: "pdf_capa",
      storage_path: copiaCmyk.storage_path,
      bytes: copiaCmyk.bytes,
      nome_exibicao: `${titulo} — capa para gráfica (CMYK).pdf`,
    },
  ];

  // [1] RGB digital — mesmo esquema. Só entra se preparar-capa-grafica
  // conseguiu gerar (é não-fatal lá). Sem RGB, o entregável some.
  if (pdfRgbPath) {
    const copiaRgb = await copiarParaCofre(admin, {
      userId: user.id,
      jobId: job.id,
      srcBucket: "editor-assets",
      srcPath: pdfRgbPath,
      destFilename: "capa-digital-RGB.pdf",
      contentType: "application/pdf",
    });
    if ("error" in copiaRgb) {
      console.warn("[capa-avulsa/concluir] cópia RGB falhou (não-fatal):", copiaRgb.error);
    } else {
      entregaveis.push({
        tipo: "pdf_digital",
        storage_path: copiaRgb.storage_path,
        bytes: copiaRgb.bytes,
        nome_exibicao: `${titulo} — capa digital (RGB).pdf`,
      });
    }
  }

  // [2] Frente JPG — preferência: captura do editor (entrada.exports_jpeg.frente).
  //     Fallback: extractFrontCover recorta a panorâmica original.
  //     Fallback do fallback: baixa a própria url_principal (igual ao gerar-epub).
  const capaResolvida = resolveCapaCompleta(capa, sombra.formato);
  const capaUrl = capaResolvida.url_area_util ?? capaResolvida.url_principal;
  let frenteBuffer: Buffer | null = null;
  let frenteExt: "jpg" | "png" = "jpg";
  let frenteContentType = "image/jpeg";

  if (jpegFrentePath) {
    const { data: blob } = await admin.storage.from("editor-assets").download(jpegFrentePath);
    if (blob) {
      frenteBuffer = Buffer.from(await blob.arrayBuffer());
    } else {
      console.warn("[capa-avulsa/concluir] download da captura da frente falhou; usa fallback.");
    }
  }
  if (!frenteBuffer && capaUrl) {
    const front = await extractFrontCover({
      url: capaUrl,
      formato: sombra.formato,
      paginas,
      orelhaMm: capaResolvida.orelha_mm ?? 0,
    });
    if (front) {
      frenteBuffer = front.buffer;
      frenteExt = "jpg";
      frenteContentType = "image/jpeg";
    } else {
      try {
        const res = await fetch(capaUrl);
        if (res.ok) {
          frenteBuffer = Buffer.from(await res.arrayBuffer());
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("png")) {
            frenteExt = "png";
            frenteContentType = "image/png";
          }
        }
      } catch (err) {
        console.warn("[capa-avulsa/concluir] fallback download da frente falhou:", err);
      }
    }
  }
  if (frenteBuffer) {
    const frentePath = `${user.id}/${job.id}/capa-frente.${frenteExt}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET_FERRAMENTAS)
      .upload(frentePath, frenteBuffer, { contentType: frenteContentType, upsert: true });
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
      { error: "Não conseguimos preparar a frente da capa. Tente novamente." },
      { status: 500 },
    );
  }

  // [3] Completa panorâmica — preferência: captura do editor
  //     (entrada.exports_jpeg.completa). Fallback: baixa a própria url_principal.
  let completaBuffer: Buffer | null = null;
  let completaExt: "jpg" | "png" = "jpg";
  let completaContentType = "image/jpeg";
  if (jpegCompletaPath) {
    const { data: blob } = await admin.storage.from("editor-assets").download(jpegCompletaPath);
    if (blob) {
      completaBuffer = Buffer.from(await blob.arrayBuffer());
    } else {
      console.warn("[capa-avulsa/concluir] download da captura completa falhou; usa fallback.");
    }
  }
  if (!completaBuffer && capaUrl) {
    try {
      const res = await fetch(capaUrl);
      if (res.ok) {
        completaBuffer = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("png")) {
          completaExt = "png";
          completaContentType = "image/png";
        }
      }
    } catch (err) {
      console.warn("[capa-avulsa/concluir] fallback download da completa falhou:", err);
    }
  }
  if (completaBuffer) {
    const completaPath = `${user.id}/${job.id}/capa-completa.${completaExt}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET_FERRAMENTAS)
      .upload(completaPath, completaBuffer, { contentType: completaContentType, upsert: true });
    if (upErr) {
      console.warn("[capa-avulsa/concluir] upload da completa falhou (não-fatal):", upErr.message);
    } else {
      entregaveis.push({
        tipo: "jpg_ebook",
        storage_path: completaPath,
        bytes: completaBuffer.byteLength,
        nome_exibicao: `${titulo} — capa completa.${completaExt}`,
      });
    }
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

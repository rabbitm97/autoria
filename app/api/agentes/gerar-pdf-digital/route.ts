export const maxDuration = 60;

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { launchWithRetry } from "@/lib/puppeteer-launch";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { NextRequest, NextResponse } from "next/server";
import type { MioloResult } from "@/app/api/agentes/miolo/route";
import { validarProjectData, type PdfResult } from "@/lib/project-data";
import { applyDigitalCss } from "@/lib/miolo-builder-digital";
import type { FormatoLivro } from "@/lib/miolo-builder-digital";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FormatoLivro as Formato } from "@/lib/formatos";
export type { PdfResult } from "@/lib/project-data";

// Dimensões físicas dos formatos em mm.
// Mantido inline para evitar dependência cruzada com lib/formatos.ts durante o
// Bloco 13.3. Refatorar para importar de lib/formatos.ts em bloco posterior.
const FORMATO_MM: Record<FormatoLivro, { width: number; height: number }> = {
  padrao_br: { width: 160, height: 230 },
  compacto:  { width: 140, height: 210 },
  bolso:     { width: 110, height: 180 },
  quadrado:  { width: 200, height: 200 },
  a4:        { width: 210, height: 297 },
};

// 1 inch = 25.4 mm = 96 CSS px → conversão mm → CSS px.
const PX_PER_MM = 96 / 25.4;

// Viewport de layout para o Puppeteer — INTENCIONALMENTE não depende do formato.
//
// Por que fixo grande: o Chromium serverless 148 aplica scaling
// formato-dependente em page.pdf() quando o viewport é pequeno relativo a
// window.screen (800×600). Setando viewport em A4 @ 150dpi (maior que screen
// em ambos eixos), o scaling de proteção do Chromium deixa de se aplicar.
// O @page no CSS (preferCSSPageSize: true) continua controlando o tamanho
// real do PDF.
const LAYOUT_VIEWPORT_PX = { width: 1240, height: 1754 };

// ─── POST /api/agentes/gerar-pdf-digital ──────────────────────────────────────
// Body: { project_id, formato? }
// Gera PDF sem sangria e sem marcas de corte — para plataformas digitais
// (Amazon KDP, Apple Books, Google Play Books, Kobo).

export async function POST(req: NextRequest) {
  const dev = isDev();
  const supabase = await createSupabaseServerClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string;
  if (dev) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { project_id: string; formato?: FormatoLivro };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Dev mode ──────────────────────────────────────────────────────────────
  if (dev) {
    const mock: PdfResult = {
      project_id,
      formato: "padrao_br",
      storage_path: `dev-user/${project_id}/livro-digital.pdf`,
      url_download: "https://placehold.co/1/1/png",
      paginas: 0,
      gerado_em: new Date().toISOString(),
    };
    return NextResponse.json(mock);
  }

  // ── Load dados_miolo ──────────────────────────────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr) {
    // C5-04: sem esse guard, um erro transiente devolvia 422 "Gere o miolo
    // primeiro" mesmo com o miolo já pronto — mensagem enganosa. Retry.
    console.error("[gerar-pdf-digital] falha ao carregar projeto:", projErr.message);
    return NextResponse.json(
      { error: "Falha ao consultar o projeto. Tente novamente." },
      { status: 500 }
    );
  }

  const miolo = project?.dados_miolo as MioloResult | null;

  if (!miolo?.html_storage_path) {
    return NextResponse.json(
      { error: "Gere o miolo primeiro." },
      { status: 422 }
    );
  }

  // ── Download HTML from Storage ────────────────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: htmlBlob, error: downloadErr } = await storageClient.storage
    .from("manuscripts")
    .download(miolo.html_storage_path);

  if (downloadErr || !htmlBlob) {
    return NextResponse.json(
      { error: "Falha ao baixar o HTML do miolo. Regenere o miolo." },
      { status: 500 }
    );
  }

  // Remove bleed + crop marks: substitui @page CSS por versão sem sangria
  const formato = (miolo.config?.formato ?? "padrao_br") as FormatoLivro;
  const html = applyDigitalCss(await htmlBlob.text(), formato);

  // ── Resolver formato (apenas para log) ────────────────────────────────────
  // O @page do digital declara `size: width_mm height_mm` (sem sangria) — ver
  // `applyDigitalCss` em lib/miolo-builder-digital.ts. Esse continua sendo o
  // tamanho real do PDF.
  //
  // O viewport do Puppeteer usa LAYOUT_VIEWPORT_PX fixo grande (ver
  // comentário no topo). Não depende de formato. (Fix 13.3.4.)
  const formatoDim = FORMATO_MM[formato];

  // ── Puppeteer: HTML → PDF ─────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  const browser = await launchWithRetry({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Viewport fixo grande — desativa scaling de proteção do Chromium 148.
    // O tamanho real do PDF vem do @page no CSS (preferCSSPageSize: true).
    // Ver comentário em LAYOUT_VIEWPORT_PX no topo do arquivo. (Fix 13.3.4.)
    await page.setViewport({
      width: LAYOUT_VIEWPORT_PX.width,
      height: LAYOUT_VIEWPORT_PX.height,
      deviceScaleFactor: 1,
    });

    // Modo print: interpreta unidades pt corretamente e ativa @media print.
    await page.emulateMediaType("print");

    console.log("[gerar-pdf-digital] preparando setContent:", {
      project_id,
      length: html.length,
      formato,
      pageMm: { width: formatoDim.width, height: formatoDim.height },
      layoutViewport: LAYOUT_VIEWPORT_PX,
    });

    // Load HTML. `load` espera load event (inclui subrecursos como o @import
    // de Google Fonts), mas não garante que as fontes tenham sido aplicadas
    // ao layout. Por isso, abaixo, chamamos document.fonts.ready explícito.
    // (puppeteer-core 25 removeu "networkidle0" do enum de setContent.)
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 20_000,
    });

    // Esperar que TODAS as fontes declaradas tenham terminado de carregar.
    // Sem isto, Chromium pode cair em fallback genérico, ignorando o stack
    // `font-family` declarado no template (EB Garamond, Source Serif 4 etc).
    try {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    } catch (fontErr) {
      console.warn("[gerar-pdf-digital] document.fonts.ready falhou:", fontErr);
    }

    // ── Telemetria de runtime ─────────────────────────────────────────────
    // Captura estado real do rendering depois das fontes carregadas.
    // Persistir no log do Vercel ajuda diagnóstico de regressões.
    try {
      const runtimeInfo = await page.evaluate(() => {
        const body = document.body;
        const cs = getComputedStyle(body);
        const fontStatuses: Array<{ family: string; status: string }> = [];
        document.fonts.forEach((f) => {
          fontStatuses.push({ family: f.family, status: f.status });
        });
        return {
          bodyFontSize: cs.fontSize,
          bodyFontFamily: cs.fontFamily,
          bodyLineHeight: cs.lineHeight,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          fontStatuses,
          fontsCount: document.fonts.size,
        };
      });
      console.log("[gerar-pdf-digital] runtime depois de fonts.ready:", {
        project_id,
        formato,
        ...runtimeInfo,
      });
    } catch (telErr) {
      console.warn("[gerar-pdf-digital] telemetria runtime falhou:", telErr);
    }

    // Tamanho do PDF passado diretamente via API, em mm — não via `@page size`
    // do CSS. preferCSSPageSize foi REMOVIDO porque o Chromium 148 aplica
    // scaling de proteção quando interpreta @page size para formatos pequenos
    // (<150mm wide). Digital usa formato puro sem sangria — o applyDigitalCss
    // reescreve @page sem sangria. O @page margin do CSS continua controlando
    // margens e numeração. (Fix 13.3.5.)
    const pdfData = await page.pdf({
      printBackground: true,
      width: `${formatoDim.width}mm`,
      height: `${formatoDim.height}mm`,
      scale: 1,
      timeout: 40_000,
    });

    pdfBuffer = Buffer.from(pdfData);
  } finally {
    await browser.close();
  }

  // ── Count real pages ──────────────────────────────────────────────────────
  // pdf-lib não depende de DOMMatrix; funciona em runtime Node serverless do Vercel.
  const parsedPdf = await PDFDocument.load(pdfBuffer);
  const numPaginas = parsedPdf.getPageCount();

  // ── Upload PDF to Storage ─────────────────────────────────────────────────
  const storagePath = `${userId}/${project_id}/livro-digital.pdf`;

  const { error: uploadError } = await storageClient.storage
    .from("livros")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Erro no upload: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // ── Signed URL (1h) ───────────────────────────────────────────────────────
  const { data: signedData, error: signError } = await storageClient.storage
    .from("livros")
    .createSignedUrl(storagePath, 3600);

  if (signError || !signedData) {
    return NextResponse.json(
      { error: "Erro ao gerar URL de download" },
      { status: 500 }
    );
  }

  // ── Persist dados_pdf_digital ─────────────────────────────────────────────
  const dados_pdf_digital: PdfResult = {
    project_id,
    formato: (miolo.config?.formato ?? "padrao_br") as FormatoLivro,
    storage_path: storagePath,
    url_download: signedData.signedUrl,
    paginas: numPaginas,
    gerado_em: new Date().toISOString(),
  };

  const vPdfDig = validarProjectData("dados_pdf_digital", dados_pdf_digital, {
    modo: "estrito", contexto: "gerar-pdf-digital",
  });
  if (!vPdfDig.ok) {
    console.error("[zod-reject][gerar-pdf-digital][dados_pdf_digital]", vPdfDig.issues.join(" | "));
    return NextResponse.json(
      { error: "PDF digital gerado, mas os dados falharam na validação. Tente novamente.", issues: vPdfDig.issues },
      { status: 500 }
    );
  }

  const { ok: pdfDigOk } = await updateProject(supabase, project_id, userId, {
    dados_pdf_digital,
  }, "gerar-pdf-digital");
  if (!pdfDigOk) {
    return NextResponse.json(
      { error: "PDF digital gerado, mas falha ao salvar no banco. Tente novamente." },
      { status: 500 }
    );
  }

  console.log("[gerar-pdf-digital] concluído — páginas:", numPaginas);

  return NextResponse.json(dados_pdf_digital);
}

// ─── GET /api/agentes/gerar-pdf-digital?project_id=... ───────────────────────
// Returns saved digital PDF metadata + fresh signed URL.

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (isDev()) {
    return NextResponse.json(null);
  }

  const { data } = await supabase
    .from("projects")
    .select("dados_pdf_digital")
    .eq("id", project_id)
    .single();

  if (!data?.dados_pdf_digital) return NextResponse.json(null);

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const pdf = data.dados_pdf_digital as PdfResult;
  const { data: signedData } = await storageClient.storage
    .from("livros")
    .createSignedUrl(pdf.storage_path, 3600);

  return NextResponse.json({
    ...pdf,
    url_download: signedData?.signedUrl ?? pdf.url_download,
  } satisfies PdfResult);
}

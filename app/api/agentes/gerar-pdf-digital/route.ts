export const maxDuration = 60;

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { NextRequest, NextResponse } from "next/server";
import type { MioloResult } from "@/app/api/agentes/miolo/route";
import { applyDigitalCss } from "@/lib/miolo-builder-digital";
import type { FormatoLivro } from "@/lib/miolo-builder-digital";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { FormatoLivro as Formato } from "@/lib/formatos";

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

export interface PdfResult {
  project_id: string;
  formato: FormatoLivro;
  storage_path: string;
  url_download: string;  // signed URL (1h)
  paginas: number;
  gerado_em: string;
}

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
  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

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

  // ── Calcular viewport físico (Bloco 13.3) ─────────────────────────────────
  // O viewport DEVE bater com o tamanho físico da página declarado em @page,
  // senão o Chromium aplica scaling implícito viewport→página e o font-size
  // efetivo varia por formato.
  const formatoDim = FORMATO_MM[formato];
  const viewportWidth = Math.round(formatoDim.width * PX_PER_MM);
  const viewportHeight = Math.round(formatoDim.height * PX_PER_MM);

  // ── Puppeteer: HTML → PDF ─────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Viewport = tamanho físico da página em CSS px (96 px/in, 1 mm = 96/25.4 px).
    // Sem isso, Chromium usa default 800×600 e fonts encolhem/inflam por formato.
    await page.setViewport({
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
    });

    // Modo print: interpreta unidades pt corretamente e ativa @media print.
    await page.emulateMediaType("print");

    console.log("[gerar-pdf-digital] HTML carregado:", {
      project_id,
      length: html.length,
      formato,
      viewport: { width: viewportWidth, height: viewportHeight },
    });

    // Load HTML and wait for Google Fonts (@import) to finish resolving.
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 20_000,
    });

    // Use @page dimensions from the miolo's own CSS (preferCSSPageSize).
    // printBackground ensures template colors/ornaments are rendered.
    // scale: 1 explícito para evitar default implícito do Chromium.
    const pdfData = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
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
  // REQUER: coluna dados_pdf_digital (jsonb) em projects.
  // Se ainda não existe, criar via Supabase SQL editor:
  //   ALTER TABLE projects ADD COLUMN dados_pdf_digital JSONB;
  const dados_pdf_digital: PdfResult = {
    project_id,
    formato: (miolo.config?.formato ?? "padrao_br") as FormatoLivro,
    storage_path: storagePath,
    url_download: signedData.signedUrl,
    paginas: numPaginas,
    gerado_em: new Date().toISOString(),
  };

  await supabase
    .from("projects")
    .update({ dados_pdf_digital })
    .eq("id", project_id)
    .eq("user_id", userId);

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

  // REQUER: coluna dados_pdf_digital (jsonb) em projects.
  // Se ainda não existe, criar via Supabase SQL editor:
  //   ALTER TABLE projects ADD COLUMN dados_pdf_digital JSONB;
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

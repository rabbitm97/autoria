export const maxDuration = 60;

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { PDFParse } from "pdf-parse";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import type { MioloResult } from "@/app/api/agentes/miolo/route";

// ─── Types ────────────────────────────────────────────────────────────────────

// Includes legacy formats (kdp_6x9, letter) for backward compat + miolo formats.
export type Formato =
  | "kdp_6x9" | "a5" | "letter"           // legacy — accepted but ignored
  | "bolso" | "padrao_br" | "quadrado" | "a4";  // miolo formats

export interface PdfResult {
  project_id: string;
  formato: Formato;
  storage_path: string;
  url_download: string;  // signed URL (1h)
  paginas: number;
  gerado_em: string;
}

// ─── POST /api/agentes/gerar-pdf ─────────────────────────────────────────────
// Body: { project_id, formato? }
// `formato` is accepted for backward compatibility but ignored — the page size
// comes from the @page CSS already embedded in the miolo HTML.

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = await createSupabaseServerClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string;
  if (isDev) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { project_id: string; formato?: Formato };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Dev mode ──────────────────────────────────────────────────────────────
  if (isDev) {
    const mock: PdfResult = {
      project_id,
      formato: "padrao_br",
      storage_path: `dev-user/${project_id}/livro.pdf`,
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

  const html = await htmlBlob.text();

  // ── Puppeteer: HTML → PDF ─────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // Load HTML and wait for Google Fonts (@import) to finish resolving.
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 20_000,
    });

    // Use @page dimensions from the miolo's own CSS (preferCSSPageSize).
    // printBackground ensures template colors/ornaments are rendered.
    const pdfData = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 40_000,
    });

    pdfBuffer = Buffer.from(pdfData);
  } finally {
    await browser.close();
  }

  // ── Count real pages ──────────────────────────────────────────────────────
  const parser = new PDFParse({ data: pdfBuffer });
  const { total: numPaginas } = await parser.getInfo();
  await parser.destroy();

  // ── Upload PDF to Storage ─────────────────────────────────────────────────
  const storagePath = `${userId}/${project_id}/livro.pdf`;

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

  // ── Persist dados_pdf ─────────────────────────────────────────────────────
  const formato = (miolo.config?.formato ?? "padrao_br") as Formato;

  const dados_pdf: PdfResult = {
    project_id,
    formato,
    storage_path: storagePath,
    url_download: signedData.signedUrl,
    paginas: numPaginas,
    gerado_em: new Date().toISOString(),
  };

  await supabase
    .from("projects")
    .update({ dados_pdf, etapa_atual: "diagramacao" })
    .eq("id", project_id)
    .eq("user_id", userId);

  // ── Sync paginas_reais + lombada_mm in dados_miolo ────────────────────────
  // PDF page count is authoritative; update miolo so qa/route.ts cross-check
  // (capa lombada vs paginas reais) stays consistent.
  const lombada_mm = Math.round(numPaginas * 0.07 * 10) / 10;
  await supabase
    .from("projects")
    .update({
      dados_miolo: {
        ...(miolo as unknown as Record<string, unknown>),
        lombada_mm,
        paginas_reais: numPaginas,
      },
    })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(dados_pdf);
}

// ─── GET /api/agentes/gerar-pdf?project_id=... ────────────────────────────────
// Returns saved PDF metadata + fresh signed URL.

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json(null);
  }

  const { data } = await supabase
    .from("projects")
    .select("dados_pdf")
    .eq("id", project_id)
    .single();

  if (!data?.dados_pdf) return NextResponse.json(null);

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const pdf = data.dados_pdf as PdfResult;
  const { data: signedData } = await storageClient.storage
    .from("livros")
    .createSignedUrl(pdf.storage_path, 3600);

  return NextResponse.json({
    ...pdf,
    url_download: signedData?.signedUrl ?? pdf.url_download,
  } satisfies PdfResult);
}

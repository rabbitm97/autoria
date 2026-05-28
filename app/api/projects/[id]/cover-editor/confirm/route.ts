export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { join } from "path";
import { renderCoverAsHtml } from "@/app/editor/capa/[project_id]/lib/cover-html-renderer";
import type { EditorData } from "@/app/editor/capa/[project_id]/lib/editor-serializer";
import { FORMATS, SANGRIA_MM, ORELHA_MM, calcularLombada } from "@/app/editor/capa/[project_id]/lib/dimensions";

function readLogoBase64(filename: string): string | null {
  try {
    const buf = readFileSync(join(process.cwd(), "public", "brand", filename));
    return buf.toString("base64");
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const isDev = process.env.NODE_ENV === "development";

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev) {
    userId = "dev-user";
    supabase = await createSupabaseServerClient();
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  // Parse multipart form
  const formData = await req.formData();
  const pngFile = formData.get("png") as File | null;
  if (!pngFile) {
    return NextResponse.json({ error: "PNG obrigatório." }, { status: 400 });
  }
  const downloadFormatPdf = formData.get("download_format") === "pdf";

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Upload PNG to storage
  const timestamp = Date.now();
  const pngPath = `${userId}/${id}/cover-confirmed-${timestamp}.png`;
  const pngBuffer = Buffer.from(await pngFile.arrayBuffer());

  const { error: pngUploadErr } = await storageClient.storage
    .from("editor-assets")
    .upload(pngPath, pngBuffer, { contentType: "image/png", upsert: true });

  if (pngUploadErr) {
    return NextResponse.json({ error: pngUploadErr.message }, { status: 500 });
  }

  const { data: pngSigned } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(pngPath, 365 * 24 * 3600);

  const imagemUrl = pngSigned?.signedUrl ?? null;

  // PDF generation — only in prod and when requested (or always as best-effort)
  let pdfUrl: string | null = null;
  let pdfWarning: string | null = null;

  if (!isDev && downloadFormatPdf) {
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("dados_capa, dados_miolo")
        .eq("id", id)
        .single();

      const capa = project?.dados_capa as Record<string, unknown> | null;
      const miolo = project?.dados_miolo as { paginas_reais?: number } | null;
      const editorData = capa?.editor_data as EditorData | null;

      if (editorData?.version === 1) {
        const rawFormat = capa?.formato as string | undefined;
        const format =
          rawFormat && rawFormat in FORMATS ? (rawFormat as keyof typeof FORMATS) : "16x23";
        const pages = miolo?.paginas_reais ?? 200;
        const comOrelhas = editorData.comOrelhas ?? Boolean(capa?.usar_orelhas);

        const logoDouradoBase64 = readLogoBase64("logo-autoria-dourado.png");
        const logoAzulBase64 = readLogoBase64("logo-autoria-azul.png");

        const html = renderCoverAsHtml(editorData.elements, editorData.fills, {
          format,
          pages,
          comOrelhas,
          logoDouradoBase64,
          logoAzulBase64,
          versao: "digital",
        });

        const f = FORMATS[format];
        const lombadaMm = calcularLombada(pages);
        const orelhaMm = comOrelhas ? ORELHA_MM : 0;
        const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
        const totalHMm = f.height_mm + SANGRIA_MM * 2;
        const docWMm = totalWMm - SANGRIA_MM * 2;
        const docHMm = totalHMm - SANGRIA_MM * 2;

        const browser = await puppeteer.launch({
          args: chromium.args,
          executablePath: await chromium.executablePath(),
          headless: true,
        });

        let pdfBuffer: Buffer;
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: "networkidle0" });
          await page.evaluateHandle("document.fonts.ready");
          pdfBuffer = Buffer.from(
            await page.pdf({
              width: `${docWMm}mm`,
              height: `${docHMm}mm`,
              printBackground: true,
              margin: { top: 0, right: 0, bottom: 0, left: 0 },
            }),
          );
        } finally {
          await browser.close();
        }

        const pdfPath = `${userId}/${id}/cover-confirmed-${timestamp}.pdf`;
        const { error: pdfUploadErr } = await storageClient.storage
          .from("editor-assets")
          .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

        if (!pdfUploadErr) {
          const { data: pdfSigned } = await storageClient.storage
            .from("editor-assets")
            .createSignedUrl(pdfPath, 365 * 24 * 3600);
          pdfUrl = pdfSigned?.signedUrl ?? null;
        } else {
          pdfWarning = "PDF gerado mas falhou ao salvar no storage.";
        }
      } else {
        pdfWarning = "editor_data não encontrado — salve o projeto antes de exportar PDF.";
      }
    } catch (err) {
      pdfWarning = String(err);
    }
  } else if (isDev && downloadFormatPdf) {
    pdfUrl = "https://placehold.co/1/1/png";
  }

  // Update dados_capa
  const { data: currentProject } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", id)
    .single();

  const currentCapa = ((currentProject?.dados_capa as Record<string, unknown>) ?? {});
  const confirmedAt = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      dados_capa: {
        ...currentCapa,
        imagem_url: imagemUrl,
        ...(pdfUrl ? { pdf_url: pdfUrl } : {}),
        source: "editor",
        confirmed_at: confirmedAt,
      },
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const status = pdfWarning && downloadFormatPdf ? 207 : 200;
  return NextResponse.json(
    {
      imagem_url: imagemUrl,
      pdf_url: pdfUrl,
      confirmed_at: confirmedAt,
      ...(pdfWarning ? { warning: pdfWarning } : {}),
    },
    { status },
  );
}

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { renderCoverFromImage } from "@/app/editor/capa/[project_id]/lib/cover-html-renderer";
import {
  buildGraficaPdf,
  ICC_PROFILE_PATH,
} from "@/app/editor/capa/[project_id]/lib/cover-grafica-pdf";
import type { EditorData } from "@/app/editor/capa/[project_id]/lib/editor-serializer";
import type { AnyElement, TextElement } from "@/app/editor/capa/[project_id]/lib/elements";
import {
  FORMATS,
  SANGRIA_MM,
  ORELHA_MM,
  calcularLombada,
} from "@/app/editor/capa/[project_id]/lib/dimensions";

const MARKS_MM = 10;
const SANGRIA_PX = Math.round(SANGRIA_MM * 300 / 25.4); // ≈ 35px at 300 DPI

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteOldPdfs(storageClient: any, userId: string, projectId: string, versao: "digital" | "grafica") {
  const { data: files } = await storageClient.storage
    .from("editor-assets")
    .list(`${userId}/${projectId}/exports`, { search: `capa-${versao}-` });
  if (!files?.length) return;
  const paths = files.map((f: { name: string }) => `${userId}/${projectId}/exports/${f.name}`);
  await storageClient.storage.from("editor-assets").remove(paths);
}

function extractTitle(elements: AnyElement[]): string {
  const el = elements.find(
    (e): e is TextElement => e.type === "text" && (e as TextElement).smartField === "titulo",
  );
  return el?.content.trim() ?? "";
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

  const body = await req.json().catch(() => ({})) as {
    versao?: string;
    editorData?: EditorData;
    coverImagePath?: string; // storage path of the uploaded cover JPEG
    format?: string;
    pages?: number;
  };

  const versao: "digital" | "grafica" = body.versao === "grafica" ? "grafica" : "digital";

  const editorData = body.editorData ?? null;
  if (!editorData || editorData.version !== 1) {
    return NextResponse.json(
      { error: "Dados do editor ausentes ou inválidos. Recarregue o editor e tente de novo." },
      { status: 422 },
    );
  }

  if (!body.coverImagePath) {
    return NextResponse.json(
      { error: "coverImagePath é obrigatório." },
      { status: 422 },
    );
  }

  // Read format and page count from DB; fall back to body/defaults.
  const { data: project } = await supabase
    .from("projects")
    .select("formato, dados_capa, dados_miolo")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  const capa = (project?.dados_capa ?? null) as Record<string, unknown> | null;
  const miolo = (project?.dados_miolo ?? null) as { paginas_reais?: number } | null;

  const rawFormat = (project?.formato ?? body.format ?? "") as string;
  const format = rawFormat in FORMATS ? (rawFormat as keyof typeof FORMATS) : "padrao_br";
  const pages = miolo?.paginas_reais ?? body.pages ?? 200;
  const comOrelhas = editorData.comOrelhas ?? Boolean(capa?.usar_orelhas);
  const projectName = extractTitle(editorData.elements);

  if (isDev) {
    return NextResponse.json({
      url: "https://placehold.co/1/1/png",
      filename: `capa-${versao}-${id}.pdf`,
      dev: true,
    });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Download the cover image from storage
  const { data: signedData } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(body.coverImagePath, 300);

  if (!signedData?.signedUrl) {
    return NextResponse.json({ error: "Imagem da capa não encontrada no storage." }, { status: 404 });
  }

  const imgRes = await fetch(signedData.signedUrl);
  if (!imgRes.ok) {
    return NextResponse.json({ error: "Falha ao baixar imagem da capa." }, { status: 500 });
  }
  const fullCoverBuffer = Buffer.from(await imgRes.arrayBuffer());

  let pdfBuffer: Buffer;

  if (versao === "grafica") {
    // Convert RGB JPEG → CMYK JPEG using FOGRA39 ICC profile, then build PDF with pdf-lib
    const cmykJpegBuffer = await sharp(fullCoverBuffer)
      .withIccProfile(ICC_PROFILE_PATH)
      .jpeg({ quality: 95 })
      .toBuffer();

    const pdfBytes = await buildGraficaPdf(cmykJpegBuffer, { format, pages, comOrelhas, projectName });
    pdfBuffer = Buffer.from(pdfBytes);
  } else {
    // Digital: trim sangria from all 4 edges, then render with Puppeteer
    const imgMeta = await sharp(fullCoverBuffer).metadata();
    const imgW = imgMeta.width ?? 0;
    const imgH = imgMeta.height ?? 0;
    const trimmedBuffer = await sharp(fullCoverBuffer)
      .extract({
        left: SANGRIA_PX,
        top: SANGRIA_PX,
        width: Math.max(1, imgW - SANGRIA_PX * 2),
        height: Math.max(1, imgH - SANGRIA_PX * 2),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    const coverImageSrc = `data:image/jpeg;base64,${trimmedBuffer.toString("base64")}`;
    const html = renderCoverFromImage(coverImageSrc, { format, pages, comOrelhas, projectName }, "digital");

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

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
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
  }

  await deleteOldPdfs(storageClient, userId, id, versao);

  const timestamp = Date.now();
  const storagePath = `${userId}/${id}/exports/capa-${versao}-${timestamp}.pdf`;

  const { error: uploadErr } = await storageClient.storage
    .from("editor-assets")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: "PDF gerado mas falhou ao salvar no storage. Tente novamente." },
      { status: 500 },
    );
  }

  const { data: pdfSigned } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(storagePath, 365 * 24 * 3600);

  return NextResponse.json({
    url: pdfSigned?.signedUrl ?? null,
    filename: `capa-${versao}-${timestamp}.pdf`,
  });
}

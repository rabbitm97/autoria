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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteOldRgbPdfs(storageClient: any, userId: string, projectId: string) {
  const { data: files } = await storageClient.storage
    .from("editor-assets")
    .list(`${userId}/${projectId}/exports`, { search: `capa-grafica-rgb-` });
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

  const versao: "digital" | "grafica" | "grafica_rgb" =
    body.versao === "grafica" ? "grafica" :
    body.versao === "grafica_rgb" ? "grafica_rgb" :
    "digital";

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
    // CMYK: converte usando ICC profile FOGRA39 (comportamento atual, intocado)
    const cmykJpegBuffer = await sharp(fullCoverBuffer)
      .withIccProfile(ICC_PROFILE_PATH)
      .jpeg({ quality: 95 })
      .toBuffer();

    const pdfBytes = await buildGraficaPdf(cmykJpegBuffer, { format, pages, comOrelhas, projectName });
    pdfBuffer = Buffer.from(pdfBytes);
  } else if (versao === "grafica_rgb") {
    // RGB: usa o JPEG da capa sem conversão de cor — gráficas digitais (POD)
    const rgbJpegBuffer = await sharp(fullCoverBuffer)
      .jpeg({ quality: 95 })
      .toBuffer();

    const pdfBytes = await buildGraficaPdf(rgbJpegBuffer, { format, pages, comOrelhas, projectName });
    pdfBuffer = Buffer.from(pdfBytes);
  } else {
    // Digital: eBook não tem orelhas. Cortar sangria de todos os 4 lados E orelhas (esquerda e direita).
    const imgMeta = await sharp(fullCoverBuffer).metadata();
    const imgW = imgMeta.width ?? 0;
    const imgH = imgMeta.height ?? 0;

    const ORELHA_PX = Math.round(ORELHA_MM * 300 / 25.4);
    const orelhaPxParaCortar = comOrelhas ? ORELHA_PX : 0;
    const leftOffset = SANGRIA_PX + orelhaPxParaCortar;

    const trimmedBuffer = await sharp(fullCoverBuffer)
      .extract({
        left: leftOffset,
        top: SANGRIA_PX,
        width: Math.max(1, imgW - leftOffset * 2),
        height: Math.max(1, imgH - SANGRIA_PX * 2),
      })
      .jpeg({ quality: 92 })
      .toBuffer();

    const coverImageSrc = `data:image/jpeg;base64,${trimmedBuffer.toString("base64")}`;
    // comOrelhas: false — digital nunca renderiza orelhas no HTML
    const html = renderCoverFromImage(coverImageSrc, { format, pages, comOrelhas: false, projectName }, "digital");

    const f = FORMATS[format];
    const lombadaMm = calcularLombada(pages);
    // PDF digital: largura = contracapa + lombada + frente (sem orelhas, sem sangria)
    const docWMm = f.width_mm * 2 + lombadaMm;
    const docHMm = f.height_mm;

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

  const timestamp = Date.now();

  if (versao === "grafica_rgb") {
    await deleteOldRgbPdfs(storageClient, userId, id);
  } else {
    await deleteOldPdfs(storageClient, userId, id, versao);
  }

  const storagePath = versao === "grafica_rgb"
    ? `${userId}/${id}/exports/capa-grafica-rgb-${timestamp}.pdf`
    : `${userId}/${id}/exports/capa-${versao}-${timestamp}.pdf`;

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

  const filename = versao === "grafica_rgb"
    ? `capa-grafica-rgb-${timestamp}.pdf`
    : `capa-${versao}-${timestamp}.pdf`;

  return NextResponse.json({
    url: pdfSigned?.signedUrl ?? null,
    filename,
    storage_path: storagePath,
  });
}

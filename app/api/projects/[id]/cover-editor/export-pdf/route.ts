export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { join } from "path";
import { renderCoverAsHtml } from "@/app/editor/capa/[project_id]/lib/cover-html-renderer";
import { buildEmbeddedFontFaceCss } from "@/app/editor/capa/[project_id]/lib/font-embedding";
import type { EditorData } from "@/app/editor/capa/[project_id]/lib/editor-serializer";
import type { AnyElement, TextElement } from "@/app/editor/capa/[project_id]/lib/elements";
import {
  FORMATS,
  SANGRIA_MM,
  ORELHA_MM,
  calcularLombada,
} from "@/app/editor/capa/[project_id]/lib/dimensions";

function readLogoBase64(filename: string): string | null {
  try {
    const buf = readFileSync(join(process.cwd(), "public", "brand", filename));
    return buf.toString("base64");
  } catch {
    return null;
  }
}

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
    format?: string;
    pages?: number;
  };

  const versao: "digital" | "grafica" =
    body.versao === "grafica" ? "grafica" : "digital";

  const editorData = body.editorData ?? null;
  if (!editorData || editorData.version !== 1) {
    return NextResponse.json(
      { error: "Dados do editor ausentes ou inválidos. Recarregue o editor e tente de novo." },
      { status: 422 },
    );
  }

  // Read format and page count from DB; fall back to values from body/defaults.
  // Use maybeSingle so a DB hiccup doesn't block the export.
  const { data: project } = await supabase
    .from("projects")
    .select("dados_capa, dados_miolo")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  const capa = (project?.dados_capa ?? null) as Record<string, unknown> | null;
  const miolo = (project?.dados_miolo ?? null) as { paginas_reais?: number } | null;

  const rawFormat = (capa?.formato ?? body.format ?? "") as string;
  const format = rawFormat in FORMATS ? (rawFormat as keyof typeof FORMATS) : "16x23";
  const pages = miolo?.paginas_reais ?? body.pages ?? 200;
  const comOrelhas = editorData.comOrelhas ?? Boolean(capa?.usar_orelhas);
  const projectName = extractTitle(editorData.elements);

  const logoDouradoBase64 = readLogoBase64("logo-autoria-dourado.png");
  const logoAzulBase64 = readLogoBase64("logo-autoria-azul.png");

  const embeddedFontCss = buildEmbeddedFontFaceCss();
  const html = renderCoverAsHtml(editorData.elements, editorData.fills, {
    format,
    pages,
    comOrelhas,
    logoDouradoBase64,
    logoAzulBase64,
    versao,
    projectName,
  }, embeddedFontCss);

  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
  const totalHMm = f.height_mm + SANGRIA_MM * 2;
  const MARKS_MM = 10;
  const docWMm = versao === "grafica" ? totalWMm + MARKS_MM * 2 : totalWMm - SANGRIA_MM * 2;
  const docHMm = versao === "grafica" ? totalHMm + MARKS_MM * 2 : totalHMm - SANGRIA_MM * 2;

  if (isDev) {
    return NextResponse.json({
      url: "https://placehold.co/1/1/png",
      filename: `capa-${versao}-${id}.pdf`,
      dev: true,
    });
  }

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

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

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

  const { data: signedData } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(storagePath, 365 * 24 * 3600);

  return NextResponse.json({
    url: signedData?.signedUrl ?? null,
    filename: `capa-${versao}-${timestamp}.pdf`,
  });
}

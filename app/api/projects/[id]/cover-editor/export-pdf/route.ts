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

  const body = await req.json().catch(() => ({})) as { versao?: string };
  const versao: "digital" | "grafica" =
    body.versao === "grafica" ? "grafica" : "digital";

  // Load project + editor_data
  const { data: project, error: loadErr } = await supabase
    .from("projects")
    .select("title, dados_capa, dados_miolo")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (loadErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const capa = project.dados_capa as Record<string, unknown> | null;
  const miolo = project.dados_miolo as { paginas_reais?: number } | null;

  const editorData = capa?.editor_data as EditorData | null;
  if (!editorData || editorData.version !== 1) {
    return NextResponse.json(
      { error: "Salve o projeto no editor antes de exportar." },
      { status: 422 },
    );
  }

  const rawFormat = capa?.formato as string | undefined;
  const format = rawFormat && rawFormat in FORMATS ? (rawFormat as keyof typeof FORMATS) : "16x23";
  const pages = miolo?.paginas_reais ?? 200;
  const comOrelhas = editorData.comOrelhas ?? Boolean(capa?.usar_orelhas);
  const projectName = (project.title as string | null) ?? "";

  const logoDouradoBase64 = readLogoBase64("logo-autoria-dourado.png");
  const logoAzulBase64 = readLogoBase64("logo-autoria-azul.png");

  const html = renderCoverAsHtml(editorData.elements, editorData.fills, {
    format,
    pages,
    comOrelhas,
    logoDouradoBase64,
    logoAzulBase64,
    versao,
    projectName,
  });

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

  // Clean up previous PDFs of this versao
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

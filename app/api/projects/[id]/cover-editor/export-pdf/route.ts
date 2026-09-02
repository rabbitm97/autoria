export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { buildGraficaPdf } from "@/app/editor/capa/[project_id]/lib/cover-grafica-pdf";
import { converterImagemParaCmyk } from "@/lib/cmyk-imagem";
import type { EditorData } from "@/app/editor/capa/[project_id]/lib/editor-serializer";
import type { AnyElement, TextElement } from "@/app/editor/capa/[project_id]/lib/elements";
import {
  FORMATS,
  clampOrelhaMm,
  getOrelhaDefault,
  type FormatKey,
} from "@/app/editor/capa/[project_id]/lib/dimensions";

/**
 * Nome-base dos arquivos exportados por versão. Usado no filename do
 * download; o storage path é o mesmo base com sufixo `_${Date.now()}.pdf`
 * (versionado — FERR-3.4g) para evitar cache stale de edge/CDN quando o
 * autor refaz a capa avulsa no editor.
 *   - "capa-CMYK-grafica"   — versão CMYK para gráfica offset
 *   - "capa-RGB-grafica"    — versão RGB para gráfica digital
 *
 * A versão eBook (antigo "digital") foi descontinuada no 14.M.5 — o
 * download agora sai como JPEG só-frente extraído client-side pelo Konva
 * (ver `captureFrontAsJpegDataUrl` em `png-export.ts`).
 */
function getFilenameBase(versao: "grafica" | "grafica_rgb"): string {
  if (versao === "grafica_rgb") return "capa-RGB-grafica";
  return "capa-CMYK-grafica";
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
  const dev = isDev();

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (dev) {
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

  let versao: "grafica" | "grafica_rgb";
  if (body.versao === "grafica") {
    versao = "grafica";
  } else if (body.versao === "grafica_rgb") {
    versao = "grafica_rgb";
  } else {
    return NextResponse.json(
      { error: "versao inválida. Aceitos: 'grafica' | 'grafica_rgb'. O PDF eBook foi descontinuado — use exportJpegEbook() client-side." },
      { status: 400 },
    );
  }

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
  const format: FormatKey = rawFormat in FORMATS ? (rawFormat as FormatKey) : "padrao_br";
  const pages = miolo?.paginas_reais ?? body.pages ?? 200;

  // Resolve orelhaMm with legacy fallbacks:
  // 1) editorData.orelhaMm (preferred)  2) editorData.comOrelhas (legacy)
  // 3) capa.orelha_mm (preferred DB)    4) capa.usar_orelhas (legacy DB)
  const editorRaw = editorData as unknown as Record<string, unknown>;
  let orelhaMm = 0;
  if (typeof editorRaw.orelhaMm === "number" && Number.isFinite(editorRaw.orelhaMm)) {
    orelhaMm = clampOrelhaMm(format, editorRaw.orelhaMm);
  } else if (typeof editorRaw.comOrelhas === "boolean") {
    orelhaMm = editorRaw.comOrelhas ? getOrelhaDefault(format) : 0;
  } else if (typeof capa?.orelha_mm === "number" && Number.isFinite(capa.orelha_mm)) {
    orelhaMm = clampOrelhaMm(format, capa.orelha_mm as number);
  } else if (typeof capa?.usar_orelhas === "boolean") {
    orelhaMm = capa.usar_orelhas ? getOrelhaDefault(format) : 0;
  }

  const projectName = extractTitle(editorData.elements);

  if (dev) {
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
    // CMYK: núcleo compartilhado com a ferramenta RGB→CMYK (lib/cmyk-imagem).
    const cmykJpegBuffer = await converterImagemParaCmyk(fullCoverBuffer);

    const pdfBytes = await buildGraficaPdf(cmykJpegBuffer, {
      format, pages, orelhaMm, projectName,
      withCmykGuides: true,
    });
    pdfBuffer = Buffer.from(pdfBytes);
  } else {
    // versao === "grafica_rgb"
    // RGB: usa o JPEG da capa sem conversão de cor — gráficas digitais (POD).
    // Sem registration marks e sem color bar (ambos são específicos de offset CMYK).
    const rgbJpegBuffer = await sharp(fullCoverBuffer)
      .jpeg({ quality: 95 })
      .toBuffer();

    const pdfBytes = await buildGraficaPdf(rgbJpegBuffer, {
      format, pages, orelhaMm, projectName,
      withCmykGuides: false,
    });
    pdfBuffer = Buffer.from(pdfBytes);
  }

  // FERR-3.4g: path versionado por timestamp — CDN/browser não segura mais
  // versão antiga cacheada, e a capa avulsa consegue oferecer o PDF fresco
  // no painel a cada reconfirmação. Remoção best-effort dos anteriores
  // (mesmo prefixo por versão) para evitar acúmulo. cacheControl "0" na
  // subida garante que quem baixar pelo signed URL nunca sirva bytes
  // obsoletos vindos de um edge cache anterior.
  const filenameBase = getFilenameBase(versao);
  const exportsDir = `${userId}/${id}/exports`;
  const storagePath = `${exportsDir}/${filenameBase}_${Date.now()}.pdf`;

  const { data: existentes } = await storageClient.storage
    .from("editor-assets")
    .list(exportsDir);
  if (existentes && existentes.length > 0) {
    const antigos = existentes
      .filter((f) => f.name.startsWith(`${filenameBase}`) && f.name.endsWith(".pdf"))
      .map((f) => `${exportsDir}/${f.name}`);
    if (antigos.length > 0) {
      await storageClient.storage.from("editor-assets").remove(antigos).catch(() => {});
    }
  }

  const { error: uploadErr } = await storageClient.storage
    .from("editor-assets")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "0",
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

  const filename = `${filenameBase}.pdf`;

  return NextResponse.json({
    url: pdfSigned?.signedUrl ?? null,
    filename,
    storage_path: storagePath,
  });
}

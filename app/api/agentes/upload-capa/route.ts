export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapaUploadResult {
  project_id: string;
  modo: "upload";
  url: string;
  storage_path: string;
  largura_px: number;
  altura_px: number;
  dpi: number;
  lombada_mm_na_validacao: number;
  validacao: CapaValidacao;
  gerado_em: string;
}

export interface CapaValidacao {
  ok: boolean;
  largura_esperada_mm: number;
  altura_esperada_mm: number;
  largura_recebida_mm: number;
  altura_recebida_mm: number;
  tolerancia_mm: number;
  detalhes: string[];
}

// ─── Dimension helpers ────────────────────────────────────────────────────────

const FORMATO_DIMS: Record<string, { w: number; h: number }> = {
  "16x23":   { w: 160, h: 230 },
  "14x21":   { w: 148, h: 210 },
  "11x18":   { w: 110, h: 180 },
  "20x20":   { w: 200, h: 200 },
  "a4":      { w: 210, h: 297 },
  "kdp_6x9": { w: 152, h: 229 },
  "a5":      { w: 148, h: 210 },
  "letter":  { w: 216, h: 279 },
};

export function calcExpectedDims(opts: {
  formato: string;
  paginas: number;
  usar_orelhas: boolean;
  dpi: number;
}): { wMm: number; hMm: number; wPx: number; hPx: number; lombadaMm: number } {
  const fmt = FORMATO_DIMS[opts.formato] ?? { w: 160, h: 230 };
  const lombadaMm = Math.round(opts.paginas * 0.07 * 10) / 10;
  const sangriaMm = 3; // each side
  const orelhasMm = opts.usar_orelhas ? 80 : 0; // 8cm per flap

  const totalWMm =
    sangriaMm +
    orelhasMm +
    fmt.w +
    lombadaMm +
    fmt.w +
    orelhasMm +
    sangriaMm;
  const totalHMm = sangriaMm + fmt.h + sangriaMm;

  const mm2px = opts.dpi / 25.4;
  return {
    wMm: totalWMm,
    hMm: totalHMm,
    wPx: Math.round(totalWMm * mm2px),
    hPx: Math.round(totalHMm * mm2px),
    lombadaMm,
  };
}

// ─── POST /api/agentes/upload-capa ────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

  let body: {
    project_id: string;
    imagem_base64: string;
    mime_type: string;
    largura_px: number;
    altura_px: number;
    dpi?: number;
    formato: string;
    paginas: number;
    usar_orelhas: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const {
    project_id,
    imagem_base64,
    mime_type,
    largura_px,
    altura_px,
    dpi = 300,
    formato,
    paginas,
    usar_orelhas,
  } = body;

  if (!project_id || !imagem_base64 || !largura_px || !altura_px) {
    return NextResponse.json(
      { error: "project_id, imagem_base64, largura_px e altura_px são obrigatórios" },
      { status: 400 }
    );
  }

  // ── Validate dimensions ───────────────────────────────────────────────────
  const expected = calcExpectedDims({ formato, paginas, usar_orelhas, dpi });
  const mm2px = dpi / 25.4;
  const tolPx = Math.round(2 * mm2px); // ±2mm tolerance

  const recebidaWMm = Math.round((largura_px / mm2px) * 10) / 10;
  const recebidaHMm = Math.round((altura_px / mm2px) * 10) / 10;

  const wOk = Math.abs(largura_px - expected.wPx) <= tolPx;
  const hOk = Math.abs(altura_px - expected.hPx) <= tolPx;

  const detalhes: string[] = [];
  if (!wOk) {
    detalhes.push(
      `Largura: recebida ${recebidaWMm}mm (${largura_px}px), esperada ${expected.wMm}mm (${expected.wPx}px) ±2mm`
    );
  }
  if (!hOk) {
    detalhes.push(
      `Altura: recebida ${recebidaHMm}mm (${altura_px}px), esperada ${expected.hMm}mm (${expected.hPx}px) ±2mm`
    );
  }
  if (wOk && hOk) {
    detalhes.push("Dimensões dentro da tolerância ±2mm.");
  }

  const validacao: CapaValidacao = {
    ok: wOk && hOk,
    largura_esperada_mm: expected.wMm,
    altura_esperada_mm: expected.hMm,
    largura_recebida_mm: recebidaWMm,
    altura_recebida_mm: recebidaHMm,
    tolerancia_mm: 2,
    detalhes,
  };

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const ext = mime_type.includes("png") ? "png" : "jpg";
  const storagePath = `${userId}/${project_id}/capa_upload.${ext}`;
  const buffer = Buffer.from(imagem_base64, "base64");

  const { error: uploadError } = await storageClient.storage
    .from("capas")
    .upload(storagePath, buffer, { contentType: mime_type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: `Erro ao salvar imagem: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = storageClient.storage
    .from("capas")
    .getPublicUrl(storagePath);

  const result: CapaUploadResult = {
    project_id,
    modo: "upload",
    url: publicUrl,
    storage_path: storagePath,
    largura_px,
    altura_px,
    dpi,
    lombada_mm_na_validacao: expected.lombadaMm,
    validacao,
    gerado_em: new Date().toISOString(),
  };

  await supabase
    .from("projects")
    .update({ dados_capa: result, etapa_atual: "capa" })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(result);
}

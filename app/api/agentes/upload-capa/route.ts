export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { getFormatoDef, estimarLombadaCapaMm, type FormatoLivro } from "@/lib/formatos";
import { getProjectFormato, lockFormato } from "@/lib/projects";
import { clampOrelhaMm, getOrelhaDefault, type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapaUploadResult {
  project_id: string;
  modo: "upload";
  url: string;
  storage_path: string;
  largura_px: number;
  altura_px: number;
  dpi: number;
  orelha_mm: number;
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

export function calcExpectedDims(opts: {
  formato: FormatoLivro;
  paginas: number;
  orelha_mm: number;
  dpi: number;
}): { wMm: number; hMm: number; wPx: number; hPx: number; lombadaMm: number } {
  const specs = getFormatoDef(opts.formato).specs;
  const lombadaMm = estimarLombadaCapaMm(opts.paginas);
  const sangriaMm = specs.bleed_mm;
  const orelhasMm = opts.orelha_mm > 0 ? opts.orelha_mm : 0;

  const totalWMm =
    sangriaMm +
    orelhasMm +
    specs.width_mm +
    lombadaMm +
    specs.width_mm +
    orelhasMm +
    sangriaMm;
  const totalHMm = sangriaMm + specs.height_mm + sangriaMm;

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
  try {
  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev()) {
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
    storage_path: string;
    mime_type: string;
    largura_px: number;
    altura_px: number;
    dpi?: number;
    paginas: number;
    orelha_mm?: number;
    usar_orelhas?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const {
    project_id,
    storage_path,
    mime_type,
    largura_px,
    altura_px,
    dpi = 300,
    paginas,
    orelha_mm: rawOrelhaMm,
    usar_orelhas,
  } = body;

  if (!project_id || !storage_path || !largura_px || !altura_px) {
    return NextResponse.json(
      { error: "project_id, storage_path, largura_px e altura_px são obrigatórios" },
      { status: 400 }
    );
  }

  // ── Resolve canonical format ──────────────────────────────────────────────
  const formato = await getProjectFormato(project_id);
  if (!formato) {
    return NextResponse.json(
      { error: "Formato do livro não definido. Configure em Elementos antes de fazer upload da capa." },
      { status: 422 }
    );
  }

  // Resolve orelha_mm: prefer numeric input, fallback to legacy boolean.
  let orelhaMm = 0;
  if (typeof rawOrelhaMm === "number" && Number.isFinite(rawOrelhaMm)) {
    orelhaMm = clampOrelhaMm(formato as FormatKey, rawOrelhaMm);
  } else if (typeof usar_orelhas === "boolean") {
    orelhaMm = usar_orelhas ? getOrelhaDefault(formato as FormatKey) : 0;
  }

  // ── Validate dimensions ───────────────────────────────────────────────────
  const expected = calcExpectedDims({ formato, paginas, orelha_mm: orelhaMm, dpi });
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

  // ── Get public URL for the already-uploaded file ─────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { publicUrl } } = storageClient.storage
    .from("capas")
    .getPublicUrl(storage_path);

  const result: CapaUploadResult = {
    project_id,
    modo: "upload",
    url: publicUrl,
    storage_path,
    largura_px,
    altura_px,
    dpi,
    orelha_mm: orelhaMm,
    lombada_mm_na_validacao: expected.lombadaMm,
    validacao,
    gerado_em: new Date().toISOString(),
  };

  // Zera explicitamente qualquer schema residual (editor/IA anterior) para o
  // resolver em lib/capa-resolver.ts não misturar rastros entre pipelines.
  // A coluna JSONB do Supabase é substituída inteira em `.update({ dados_capa })`,
  // mas manter os `null`s explícitos serve de defesa contra merges parciais
  // e deixa clara a intenção no schema. Ver comentário no isEditorCapa em
  // lib/capa-resolver.ts.
  const dadosCapaPayload = {
    ...result,
    source: null,
    imagem_url: null,
    confirmed_at: null,
    editor_data: null,
    url_escolhida: null,
    opcoes: null,
    pdf_grafica: null,
  };

  await Promise.all([
    supabase
      .from("projects")
      .update({ dados_capa: dadosCapaPayload, etapa_atual: "capa" })
      .eq("id", project_id)
      .eq("user_id", userId),
    lockFormato(project_id),
  ]);

  // Dispara PDF gráfica em background (fire-and-forget). Só surte efeito se
  // o miolo já foi gerado — caso contrário a rota devolve 422 e a UI trata
  // depois. Não bloqueia a resposta do upload.
  fetch(`${req.nextUrl.origin}/api/agentes/prova/preparar-capa-grafica`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ project_id }),
  }).catch((err) => {
    console.warn("[upload-capa] preparar-capa-grafica fire-and-forget falhou:", err);
  });

  return NextResponse.json(result);
  } catch (err) {
    console.error("[upload-capa] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao processar o upload da capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

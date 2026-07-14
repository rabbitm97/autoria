export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { getFormatoDef, estimarLombadaCapaMm, type FormatoLivro } from "@/lib/formatos";
import { getProjectFormato, lockFormato } from "@/lib/projects";
import { clampOrelhaMm, getOrelhaDefault, type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import { trimarMarcasDeCapa } from "@/lib/capa-trim-marcas";

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
  /**
   * Origem do arquivo enviado pelo autor. Quando o autor sobe um PDF,
   * o cliente converte a primeira página em PNG (usado como `url`) mas
   * preserva o PDF cru em `pdf_original_path`. `origem_arquivo` reflete
   * o tipo original — usado nas recomendações para pular avisos que só
   * fazem sentido para imagem (ex: DPI, já que PDF é vetorial).
   */
  origem_arquivo: "pdf" | "png" | "jpg";
  /** Path no bucket `capas` do PDF original quando `origem_arquivo === "pdf"`. */
  pdf_original_path: string | null;
  /**
   * Nome do arquivo original enviado pelo autor (antes de qualquer conversão
   * PDF→PNG feita no cliente). Usado no preview para o autor reconhecer
   * seu próprio arquivo. Fallback para "capa" quando não fornecido.
   */
  filename_original: string | null;
  /**
   * Motivo pelo qual o PDF original NÃO foi preservado, quando aplicável.
   * `null` significa "sucesso" ou "não era PDF". Preenchido pelo frontend
   * quando o upload paralelo falha, permitindo rastreamento sem quebrar
   * o fluxo principal.
   */
  pdf_original_error: string | null;
  /**
   * URL assinada da imagem já com marcas de corte removidas (Config A → B).
   * Populada quando o autor sobe PDF com BleedBox declarado e o trim rodou
   * com sucesso. `null` para Config B/C, uploads não-PDF, ou falha no trim.
   * Consumidores (EPUB, Prova 3D, extractor de frente) devem preferir esta
   * URL sobre `url`. Ver `lib/capa-trim-marcas.ts`.
   */
  url_area_util: string | null;
  /** Path no bucket `capas` da imagem trimada. `null` quando `url_area_util` é null. */
  storage_path_area_util: string | null;
  /** Dimensões físicas da área útil (BleedBox equivalente) em mm. `null` quando não houve trim. */
  area_util_mm: { largura: number; altura: number } | null;
  /**
   * `true` quando o upload é uma capa em formato eBook — só a frente do
   * livro, sem lombada nem contracapa. Detectado por comparação direta
   * das dimensões contra `formato.width_mm × formato.height_mm` (com ou
   * sem sangria de 3mm), independentemente da análise técnica ter rodado.
   *
   * Propagado pelo `capa-resolver` como `is_panoramica: !is_frente_pura`.
   * Consumidores devem preferir esse campo canônico sobre o `is_frente_pura`
   * do analyzer (que é fallback pra casos legacy).
   */
  is_frente_pura: boolean;
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
    origem_arquivo?: "pdf" | "png" | "jpg";
    pdf_original_path?: string | null;
    filename_original?: string | null;
    pdf_original_error?: string | null;
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
    origem_arquivo: rawOrigemArquivo,
    pdf_original_path: rawPdfOriginalPath,
    filename_original: rawFilenameOriginal,
    pdf_original_error: rawPdfOriginalError,
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

  // ── Get public URL for the already-uploaded file ─────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { url: publicUrl, error: signErr } = await signedUrlCapas(storageClient, storage_path);
  if (signErr || !publicUrl) {
    return NextResponse.json({ error: `Falha ao gerar URL da capa: ${signErr}` }, { status: 500 });
  }

  // Origem do arquivo: prefere o campo explícito do body; se ausente
  // (clientes legados), inferir do mime_type. PDF vem sempre por
  // `origem_arquivo` porque a conversão para PNG ocorre no cliente e o
  // mime_type que chega aqui já é image/png.
  const origemArquivo: "pdf" | "png" | "jpg" =
    rawOrigemArquivo ??
    (mime_type === "application/pdf"
      ? "pdf"
      : mime_type.includes("png")
      ? "png"
      : "jpg");
  const pdfOriginalPath =
    origemArquivo === "pdf" && typeof rawPdfOriginalPath === "string"
      ? rawPdfOriginalPath
      : null;

  // ── Trim marcas de corte (Config A → área útil equivalente a Config B) ──
  // Quando o autor sobe PDF com BleedBox declarado, extraímos a versão sem
  // marcas para consumo downstream (EPUB, Prova 3D, extractor de frente).
  // O arquivo original permanece intacto — necessário para a análise técnica
  // detectar corretamente Config A via TrimBox/BleedBox. Falhas silenciosas:
  // trim é otimização, não bloqueia o upload.
  let urlAreaUtil: string | null = null;
  let storagePathAreaUtil: string | null = null;
  let areaUtilMm: { largura: number; altura: number } | null = null;
  let larguraValidacao_px = largura_px;
  let alturaValidacao_px = altura_px;

  if (pdfOriginalPath) {
    try {
      const [pdfDl, imgDl] = await Promise.all([
        storageClient.storage.from("capas").download(pdfOriginalPath),
        storageClient.storage.from("capas").download(storage_path),
      ]);
      if (!pdfDl.error && !imgDl.error && pdfDl.data && imgDl.data) {
        const pdfBuffer = Buffer.from(await pdfDl.data.arrayBuffer());
        const imageBuffer = Buffer.from(await imgDl.data.arrayBuffer());
        const trim = await trimarMarcasDeCapa({
          pdfBuffer,
          imageBuffer,
          imageWidthPx: largura_px,
          imageHeightPx: altura_px,
          imageDpi: dpi,
        });
        if (trim) {
          const trimmedPath = storage_path.replace(/(\.[^./]+)?$/, "-areautil.jpg");
          const { error: upErr } = await storageClient.storage
            .from("capas")
            .upload(trimmedPath, trim.buffer, {
              contentType: "image/jpeg",
              upsert: true,
            });
          if (!upErr) {
            const { url: trimUrl, error: trimSignErr } = await signedUrlCapas(
              storageClient,
              trimmedPath,
            );
            if (!trimSignErr && trimUrl) {
              urlAreaUtil = trimUrl;
              storagePathAreaUtil = trimmedPath;
              areaUtilMm = { largura: trim.widthMm, altura: trim.heightMm };
              larguraValidacao_px = trim.widthPx;
              alturaValidacao_px = trim.heightPx;
            }
          } else {
            console.warn("[upload-capa] upload da area util falhou:", upErr.message);
          }
        }
      }
    } catch (err) {
      console.warn(
        `[upload-capa] trim de marcas falhou: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── Validate dimensions ───────────────────────────────────────────────────
  // Quando o trim rodou, valida sobre a área útil (BleedBox equivalente).
  // Caso contrário, valida sobre as dimensões originais do upload.
  const expected = calcExpectedDims({ formato, paginas, orelha_mm: orelhaMm, dpi });
  const mm2px = dpi / 25.4;
  const tolPx = Math.round(2 * mm2px); // ±2mm tolerance

  // ── Detecção de frente pura (formato eBook) ─────────────────────────────
  // Se dimensões batem com `specs.width_mm × specs.height_mm` (com ou sem
  // sangria de 3mm), o autor subiu uma capa eBook — só a frente, sem
  // lombada nem contracapa. Válido: autor pode preferir usar upload em
  // vez do dropdown do editor. Não é erro.
  //
  // A detecção via dimensões é robusta: capa panorâmica de qualquer formato
  // é MUITO mais larga que frente pura (mín ~280mm vs 140mm no menor
  // formato). Sem ambiguidade.
  const specs = getFormatoDef(formato).specs;
  const frentePura_wPx = Math.round(specs.width_mm * mm2px);
  const frentePura_wComSangria_px = Math.round((specs.width_mm + 2 * specs.bleed_mm) * mm2px);
  const frentePura_hPx = Math.round(specs.height_mm * mm2px);
  const frentePura_hComSangria_px = Math.round((specs.height_mm + 2 * specs.bleed_mm) * mm2px);

  const bateFrentePuraSemSangria =
    Math.abs(largura_px - frentePura_wPx) <= tolPx &&
    Math.abs(altura_px - frentePura_hPx) <= tolPx;
  const bateFrentePuraComSangria =
    Math.abs(largura_px - frentePura_wComSangria_px) <= tolPx &&
    Math.abs(altura_px - frentePura_hComSangria_px) <= tolPx;

  const isFrentePura = bateFrentePuraSemSangria || bateFrentePuraComSangria;

  // Dimensões esperadas para a validação: se frente pura, valida contra
  // o próprio formato; senão contra a panorâmica calculada em `expected`.
  const validacao_wPx = isFrentePura
    ? (bateFrentePuraComSangria ? frentePura_wComSangria_px : frentePura_wPx)
    : expected.wPx;
  const validacao_hPx = isFrentePura
    ? (bateFrentePuraComSangria ? frentePura_hComSangria_px : frentePura_hPx)
    : expected.hPx;
  const validacao_wMm = isFrentePura
    ? (bateFrentePuraComSangria ? specs.width_mm + 2 * specs.bleed_mm : specs.width_mm)
    : expected.wMm;
  const validacao_hMm = isFrentePura
    ? (bateFrentePuraComSangria ? specs.height_mm + 2 * specs.bleed_mm : specs.height_mm)
    : expected.hMm;

  const recebidaWMm = Math.round((larguraValidacao_px / mm2px) * 10) / 10;
  const recebidaHMm = Math.round((alturaValidacao_px / mm2px) * 10) / 10;

  const wOk = Math.abs(larguraValidacao_px - validacao_wPx) <= tolPx;
  const hOk = Math.abs(alturaValidacao_px - validacao_hPx) <= tolPx;

  const detalhes: string[] = [];
  if (!wOk) {
    detalhes.push(
      `Largura: recebida ${recebidaWMm}mm (${larguraValidacao_px}px), esperada ${validacao_wMm}mm (${validacao_wPx}px) ±2mm`
    );
  }
  if (!hOk) {
    detalhes.push(
      `Altura: recebida ${recebidaHMm}mm (${alturaValidacao_px}px), esperada ${validacao_hMm}mm (${validacao_hPx}px) ±2mm`
    );
  }
  if (wOk && hOk) {
    if (isFrentePura) {
      detalhes.push("Capa em formato eBook detectada — pronta para publicação digital (Amazon KDP, Apple Books, Kobo).");
    } else if (areaUtilMm) {
      detalhes.push("Dimensões da área útil dentro da tolerância ±2mm (marcas de corte detectadas e trimadas).");
    } else {
      detalhes.push("Dimensões dentro da tolerância ±2mm.");
    }
  }

  const validacao: CapaValidacao = {
    ok: wOk && hOk,
    largura_esperada_mm: validacao_wMm,
    altura_esperada_mm: validacao_hMm,
    largura_recebida_mm: recebidaWMm,
    altura_recebida_mm: recebidaHMm,
    tolerancia_mm: 2,
    detalhes,
  };

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
    origem_arquivo: origemArquivo,
    pdf_original_path: pdfOriginalPath,
    filename_original: typeof rawFilenameOriginal === "string" ? rawFilenameOriginal : null,
    pdf_original_error: typeof rawPdfOriginalError === "string" ? rawPdfOriginalError : null,
    url_area_util: urlAreaUtil,
    storage_path_area_util: storagePathAreaUtil,
    area_util_mm: areaUtilMm,
    is_frente_pura: isFrentePura,
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

  const { ok: capaOk } = await updateProject(supabase, project_id, userId, {
    dados_capa: dadosCapaPayload,
  }, "upload-capa");
  if (!capaOk) {
    return NextResponse.json(
      { error: "Upload processado, mas falha ao salvar no banco. Tente novamente." },
      { status: 500 }
    );
  }
  await lockFormato(project_id);

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

  // Análise técnica NÃO dispara mais automaticamente (14.M.2.1). Autor
  // clica no botão "Analisar capa" no frontend após o upload concluir.
  // Isso elimina race conditions entre uploads consecutivos e a análise
  // assíncrona, e garante que dados antigos nunca aparecem para o autor.

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

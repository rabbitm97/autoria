export const maxDuration = 60;

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { launchWithRetry } from "@/lib/puppeteer-launch";
import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { NextRequest, NextResponse } from "next/server";
import type { MioloResult } from "@/app/api/agentes/miolo/route";

// ─── Types ────────────────────────────────────────────────────────────────────

import { estimarLombadaMm, type FormatoLivro } from "@/lib/formatos";
export type { FormatoLivro as Formato } from "@/lib/formatos";

// Dimensões físicas dos formatos em mm + sangria.
// Mantido inline para evitar dependência cruzada com lib/formatos.ts durante o
// Bloco 13.3. Refatorar para importar de lib/formatos.ts em bloco posterior.
// `bleed` espelha `spec.bleed_mm` em lib/formatos.ts — manter sincronizado.
const FORMATO_MM: Record<FormatoLivro, { width: number; height: number; bleed: number }> = {
  padrao_br: { width: 160, height: 230, bleed: 3 },
  compacto:  { width: 140, height: 210, bleed: 3 },
  bolso:     { width: 110, height: 180, bleed: 3 },
  quadrado:  { width: 200, height: 200, bleed: 3 },
  a4:        { width: 210, height: 297, bleed: 3 },
};

// 1 inch = 25.4 mm = 96 CSS px → conversão mm → CSS px.
const PX_PER_MM = 96 / 25.4;

// Viewport de layout para o Puppeteer — INTENCIONALMENTE não depende do formato.
//
// Por que fixo grande: o Chromium serverless 148 aplica scaling
// formato-dependente em page.pdf() quando o viewport é pequeno relativo a
// window.screen (800×600). Telemetria do BLOCO-13.3.3 mostrou que o DOM
// renderiza corretamente (11pt → 14.667px) mas o PDF gravado tem font menor.
// Setando o viewport em A4 @ 150dpi (maior que screen em ambos eixos), o
// scaling de proteção do Chromium deixa de se aplicar. O @page no CSS
// (preferCSSPageSize: true) continua controlando o tamanho real do PDF.
const LAYOUT_VIEWPORT_PX = { width: 1240, height: 1754 };

export interface PdfResult {
  project_id: string;
  formato: FormatoLivro;
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
  try {
  const dev = isDev();
  const supabase = await createSupabaseServerClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string;
  if (dev) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { project_id: string; formato?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Dev mode ──────────────────────────────────────────────────────────────
  if (dev) {
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

  // ── Load dados_miolo + dados_capa ─────────────────────────────────────────
  // `dados_capa` é usado no fim para decidir se disparamos `preparar-capa-grafica`
  // retroativamente (quando o autor confirmou a capa ANTES de gerar o miolo,
  // preparar-capa-grafica devolve 422 — só dá pra rodar quando o miolo existe,
  // ou seja, agora).
  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo, dados_capa")
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

  // ── Resolver formato e tamanho físico declarado em @page ──────────────────
  // O @page no CSS do miolo gráfico declara
  // `size: (width + 2*bleed)mm (height + 2*bleed)mm` — ver `buildPageCss`
  // em lib/miolo-builder.ts. Esse continua sendo o tamanho REAL do PDF
  // (controlado por preferCSSPageSize: true em page.pdf()).
  //
  // O viewport do Puppeteer é separado: usamos LAYOUT_VIEWPORT_PX fixo grande
  // (ver comentário no topo). Não dependente de formato. (Fix 13.3.4.)
  const formato = (miolo.config?.formato ?? "padrao_br") as FormatoLivro;
  const formatoDim = FORMATO_MM[formato];
  const totalWidthMm = formatoDim.width + 2 * formatoDim.bleed;
  const totalHeightMm = formatoDim.height + 2 * formatoDim.bleed;

  // ── Puppeteer: HTML → PDF ─────────────────────────────────────────────────
  let pdfBuffer: Buffer;
  const browser = await launchWithRetry({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  // ── DEBUG 13.3.3 — chromium runtime info ──────────────────────────────────
  // Log único de investigação. Remover este bloco depois do diagnóstico
  // (TODO: bloco 13.3.4 remove-debug).
  try {
    const browserVersion = await browser.version();
    // chromium.defaultViewport / chromium.headless existem em runtime no
    // @sparticuz/chromium, mas não estão expostos no .d.ts — cast pra ler.
    const chromiumAny = chromium as unknown as {
      defaultViewport?: unknown;
      headless?: unknown;
    };
    console.log("[gerar-pdf][DEBUG-13.3.3] chromium runtime:", {
      project_id,
      formato,
      browserVersion,
      chromiumArgs: chromium.args,
      chromiumArgsCount: chromium.args.length,
      chromiumDefaultViewport: chromiumAny.defaultViewport,
      chromiumHeadless: chromiumAny.headless,
      nodeVersion: process.version,
      vercelRegion: process.env.VERCEL_REGION,
      vercelEnv: process.env.VERCEL_ENV,
    });
  } catch (dbgErr) {
    console.warn("[gerar-pdf][DEBUG-13.3.3] runtime info falhou:", dbgErr);
  }

  try {
    const page = await browser.newPage();

    // Viewport fixo grande — desativa scaling de proteção do Chromium 148.
    // O tamanho real do PDF vem do @page no CSS (preferCSSPageSize: true).
    // Ver comentário em LAYOUT_VIEWPORT_PX no topo do arquivo. (Fix 13.3.4.)
    await page.setViewport({
      width: LAYOUT_VIEWPORT_PX.width,
      height: LAYOUT_VIEWPORT_PX.height,
      deviceScaleFactor: 1,
    });

    // ── DEBUG 13.3.3 — confirmar viewport aplicado ──────────────────────────
    try {
      const effectiveViewport = page.viewport();
      console.log("[gerar-pdf][DEBUG-13.3.3] viewport aplicado:", {
        project_id,
        formato,
        requested: LAYOUT_VIEWPORT_PX,
        effective: effectiveViewport,
      });
    } catch (dbgErr) {
      console.warn("[gerar-pdf][DEBUG-13.3.3] viewport check falhou:", dbgErr);
    }

    // Modo print: interpreta unidades pt corretamente e ativa @media print.
    await page.emulateMediaType("print");

    console.log("[gerar-pdf] preparando setContent:", {
      project_id,
      length: html.length,
      formato,
      pageMm: { width: totalWidthMm, height: totalHeightMm },
      layoutViewport: LAYOUT_VIEWPORT_PX,
    });

    // Load HTML. `load` espera load event (inclui subrecursos como o @import
    // de Google Fonts), mas não garante que as fontes tenham sido aplicadas
    // ao layout. Por isso, abaixo, chamamos document.fonts.ready explícito.
    // (puppeteer-core 25 removeu "networkidle0" do enum de setContent.)
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 20_000,
    });

    // Esperar que TODAS as fontes declaradas tenham terminado de carregar.
    // Sem isto, Chromium pode cair em fallback genérico, ignorando o stack
    // `font-family` declarado no template (EB Garamond, Source Serif 4 etc).
    try {
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
    } catch (fontErr) {
      console.warn("[gerar-pdf] document.fonts.ready falhou:", fontErr);
    }

    // ── Telemetria de runtime ─────────────────────────────────────────────
    // Captura estado real do rendering depois das fontes carregadas.
    // Persistir no log do Vercel ajuda diagnóstico de regressões.
    try {
      const runtimeInfo = await page.evaluate(() => {
        const body = document.body;
        const cs = getComputedStyle(body);
        const fontStatuses: Array<{ family: string; status: string }> = [];
        document.fonts.forEach((f) => {
          fontStatuses.push({ family: f.family, status: f.status });
        });
        return {
          bodyFontSize: cs.fontSize,
          bodyFontFamily: cs.fontFamily,
          bodyLineHeight: cs.lineHeight,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          fontStatuses,
          fontsCount: document.fonts.size,
        };
      });
      console.log("[gerar-pdf] runtime depois de fonts.ready:", {
        project_id,
        formato,
        ...runtimeInfo,
      });
    } catch (telErr) {
      console.warn("[gerar-pdf] telemetria runtime falhou:", telErr);
    }

    // ── DEBUG 13.3.3 — measurement test de glyph físico ─────────────────────
    // Injeta um span temporário com texto conhecido e mede o BoundingClientRect.
    // Se o Chromium renderiza 11pt corretamente, rect.height ≈ 24.2px (linha cheia,
    // line-height 1.65) e a width de "M" ≈ 11px (depende da fonte). Se o bug
    // acontece no page.pdf(), esses valores estarão CORRETOS aqui — o bug só
    // aparece quando o Chromium serializa para PDF.
    try {
      const measureInfo = await page.evaluate(() => {
        const span = document.createElement("span");
        span.id = "__debug_measure__";
        span.style.cssText =
          "position:absolute;top:0;left:0;visibility:hidden;font-size:11pt;line-height:1.65;font-family:'EB Garamond', Georgia, serif;";
        span.textContent = "MMMMMMMMMM"; // 10 "M" pra medir largura média
        document.body.appendChild(span);
        const rect = span.getBoundingClientRect();
        const cs = getComputedStyle(span);
        const result = {
          rectWidth: rect.width,
          rectHeight: rect.height,
          computedFontSize: cs.fontSize,
          computedFontFamily: cs.fontFamily,
          computedLineHeight: cs.lineHeight,
          devicePixelRatio: window.devicePixelRatio,
          screen: { w: window.screen?.width, h: window.screen?.height },
        };
        document.body.removeChild(span);
        return result;
      });
      console.log("[gerar-pdf][DEBUG-13.3.3] glyph measurement:", {
        project_id,
        formato,
        ...measureInfo,
      });
    } catch (dbgErr) {
      console.warn("[gerar-pdf][DEBUG-13.3.3] glyph measure falhou:", dbgErr);
    }

    // ── DEBUG 13.3.3 — connectivity test para Google Fonts ──────────────────
    // Tenta fetch() para fonts.googleapis.com de dentro do page context.
    // Se status 200, rede está OK e o problema é outro (@import não disparou,
    // CORS, etc). Se erro de rede, está bloqueado e precisamos embutir fonts.
    try {
      const fontsConnectivity = await page.evaluate(async () => {
        const url =
          "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&display=swap";
        try {
          const t0 = performance.now();
          const r = await fetch(url, { method: "GET" });
          const t1 = performance.now();
          const text = await r.text().catch(() => "<read failed>");
          return {
            reached: true,
            status: r.status,
            ok: r.ok,
            elapsedMs: Math.round(t1 - t0),
            contentLength: text.length,
            contentPreview: text.slice(0, 200),
          };
        } catch (fetchErr) {
          return {
            reached: false,
            error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          };
        }
      });
      console.log("[gerar-pdf][DEBUG-13.3.3] fonts.googleapis.com:", {
        project_id,
        formato,
        ...fontsConnectivity,
      });
    } catch (dbgErr) {
      console.warn("[gerar-pdf][DEBUG-13.3.3] connectivity test falhou:", dbgErr);
    }

    // Tamanho do PDF passado diretamente via API, em mm — não via `@page size`
    // do CSS. preferCSSPageSize foi REMOVIDO porque o Chromium 148 aplica
    // scaling de proteção quando interpreta @page size para formatos pequenos
    // (<150mm wide). totalWidthMm/totalHeightMm já incluem a sangria
    // (declarados antes do puppeteer.launch). O @page margin do CSS continua
    // controlando margens, marcas de corte e numeração. (Fix 13.3.5.)
    const pdfData = await page.pdf({
      printBackground: true,
      width: `${totalWidthMm}mm`,
      height: `${totalHeightMm}mm`,
      scale: 1,
      timeout: 40_000,
    });

    pdfBuffer = Buffer.from(pdfData);
  } finally {
    await browser.close();
  }

  // ── Count real pages ──────────────────────────────────────────────────────
  // pdf-lib não depende de DOMMatrix; funciona em runtime Node serverless do Vercel.
  const parsedPdf = await PDFDocument.load(pdfBuffer);
  const numPaginas = parsedPdf.getPageCount();

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
  // formato já declarado antes do puppeteer.launch (Bloco 13.3).
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
  // (capa lombada vs paginas reais) stays consistent. Usa a fórmula gráfica
  // brasileira unificada (`estimarLombadaMm`), substituindo a fórmula antiga
  // `pgs × 0.07` que divergia ~35% da realidade.
  const lombada_mm = estimarLombadaMm(numPaginas);
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

  // Dispara PDF gráfica em background quando a capa já está confirmada mas
  // ainda não tem `pdf_grafica`. Cobre o caso: autor confirmou a capa (editor
  // ou upload) ANTES de gerar o miolo — naquela hora, preparar-capa-grafica
  // devolveu 422 porque não tinha lombada real. Agora que o miolo existe,
  // rodamos o pipeline. Fire-and-forget: não bloqueia a resposta do PDF.
  const capaCheck = project?.dados_capa as {
    source?: string;
    modo?: string;
    confirmed_at?: string;
    pdf_grafica?: unknown;
  } | null;
  const capaConfirmada =
    capaCheck?.source === "editor" ||
    capaCheck?.modo === "upload" ||
    Boolean(capaCheck?.confirmed_at);
  const pdfGraficaAusente = capaCheck?.pdf_grafica == null;
  if (capaConfirmada && pdfGraficaAusente) {
    fetch(`${req.nextUrl.origin}/api/agentes/prova/preparar-capa-grafica`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ project_id }),
    }).catch((err) => {
      console.warn("[gerar-pdf] preparar-capa-grafica retroativo falhou:", err);
    });
  }

  return NextResponse.json(dados_pdf);
  } catch (err) {
    console.error("[gerar-pdf] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar o PDF. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET /api/agentes/gerar-pdf?project_id=... ────────────────────────────────
// Returns saved PDF metadata + fresh signed URL.

export async function GET(req: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient();

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (isDev()) {
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
  } catch (err) {
    console.error("[gerar-pdf] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter o PDF. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

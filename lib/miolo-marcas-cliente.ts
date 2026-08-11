"use client";

/**
 * Detecção VISUAL de marcas de corte em PDFs de miolo — pista para o motor
 * server-side (`lib/verificacao-miolo.ts`).
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 * O motor lê TrimBox/BleedBox/MediaBox via pdf-lib quando o PDF declara boxes
 * semânticos (InDesign, Illustrator, exports profissionais). PDFs sem boxes
 * — incluindo os que o nosso próprio `gerar-pdf` produz via Chromium/Puppeteer
 * — desenham marcas de corte como conteúdo dentro da sangria; sem boxes
 * declarados, o motor cai no MediaBox cru e o formato cruzado com sangria
 * dá falso match.
 *
 * ─── Modelo v2 (FIX-F-PUB-5-02) ────────────────────────────────────────────
 * Rasteriza a página 1 em 150 DPI no browser (via pdfjs-dist) e analisa os 4
 * cantos com PRIORS DE CLASSE FIXOS (universais, não deriváveis do formato):
 *   - linha escura: cinza < 160
 *   - comprimento da linha: 2mm a 12mm (@150dpi ≈ 12 a 71 px)
 *   - janela de canto: 20mm (@150dpi ≈ 118 px)
 *
 * A GEOMETRIA é SEMPRE MEDIDA, nunca assumida:
 *   - cada canto reporta candidatos de posição em cada eixo, medidos como
 *     INSET À BORDA EXTERNA (espelhamento por orientação — v1 tinha bug ao
 *     medir sempre do topo/esquerda do recorte, envenenando cantos B/R).
 *   - o consenso por borda cruza os candidatos dos 2 cantos vizinhos com
 *     tolerância ±2px; o inset da borda é o menor valor com consenso.
 *
 * Retorna `insets_mm` (topo/fundo/esq/dir) quando as 4 bordas têm consenso.
 * Sem consenso completo, `insets_mm` fica ausente e o motor cai na fórmula
 * legada `média − 2×distância` (mantida por retrocompat).
 *
 * ─── Contrato ──────────────────────────────────────────────────────────────
 * Retorna `null` em qualquer falha (PDF inválido, worker indisponível,
 * canvas 2D negado, exceção interna). O caller trata `null` como "sem pista"
 * — o motor continua funcionando normalmente contra o MediaBox.
 */

export interface MarcasVisuaisHint {
  /** Quantidade de cantos onde o padrão de marca foi detectado (0–4). */
  cantos_detectados: number;
  /**
   * Distância média das marcas à borda em mm — compat com o motor legado.
   * v2: média dos insets das bordas com consenso.
   */
  distancia_borda_mm: number;
  /**
   * Insets por borda em mm (v2). Presente apenas quando as 4 bordas tiveram
   * consenso entre os cantos vizinhos. Caminho aditivo — sem isto, o motor
   * usa a fórmula legada `mídia − 2×distancia_borda_mm`.
   */
  insets_mm?: {
    topo: number;
    fundo: number;
    esq: number;
    dir: number;
  };
}

const DPI_RASTER = 150;
const CORNER_ANALISE_MM = 20;

// ─── Priors de classe (fixos, universais) ────────────────────────────────────
// Não derivados do formato do livro — marcas de corte têm forma padronizada.
const DARK_THRESHOLD = 160;
const LINE_MIN_LEN_MM = 2;
const LINE_MAX_LEN_MM = 12;
// Tolerância de consenso entre cantos vizinhos, em px @150dpi.
const CONSENSO_TOL_PX = 2;

// FASE 1 (instrumentação): quantos px iniciais coletar por eixo em modo debug.
const DEBUG_FIRST_PX = 60;

type DebugCandidato = {
  pos: number;
  inset: number;
  maxRun: number;
  aceita: boolean;
  motivo?: "curto" | "longo";
};

type DebugCanto = {
  linhas: DebugCandidato[];
  colunas: DebugCandidato[];
  histograma: number[];
};

function computarHistograma(gray: Uint8Array): number[] {
  const buckets = new Array(8).fill(0);
  for (let i = 0; i < gray.length; i++) {
    const b = Math.min(7, gray[i] >> 5);
    buckets[b]++;
  }
  return buckets;
}

/**
 * Analisa um canto rasterizado e devolve TODOS os candidatos de marca em
 * cada eixo, medidos como INSET À BORDA EXTERNA do canto.
 *
 * Espelhamento por orientação (o bug de v1 que envenenava cantos B/R):
 *   - `espelhaHoriz`: canto inferior (B*) → insetY = (size − 1) − y
 *   - `espelhaVert`:  canto direito  (*R) → insetX = (size − 1) − x
 *
 * Contract:
 *   - candidatasHoriz: insets à borda horizontal externa (topo se T*, fundo
 *     se B*), na ordem em que foram encontrados varrendo do topo do recorte.
 *   - candidatasVert:  insets à borda vertical externa (esq se *L, dir se
 *     *R), na ordem em que foram encontrados varrendo da esquerda do recorte.
 */
function analisarCanto(
  gray: Uint8Array,
  size: number,
  espelhaHoriz: boolean,
  espelhaVert: boolean,
  lineMinPx: number,
  lineMaxPx: number,
  debug?: DebugCanto,
): { candidatasHoriz: number[]; candidatasVert: number[] } {
  const candidatasHoriz: number[] = [];
  const candidatasVert: number[] = [];

  // Scan horizontal: varre linhas (y = 0..size-1). Cada linha tem um "maxRun"
  // de píxeis escuros consecutivos horizontalmente.
  for (let y = 0; y < size; y++) {
    let maxRun = 0;
    let run = 0;
    for (let x = 0; x < size; x++) {
      if (gray[y * size + x] < DARK_THRESHOLD) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 0;
      }
    }
    const aceita = maxRun >= lineMinPx && maxRun <= lineMaxPx;
    const inset = espelhaHoriz ? size - 1 - y : y;
    if (aceita) candidatasHoriz.push(inset);
    if (debug && y < DEBUG_FIRST_PX && maxRun > 0) {
      const motivo: DebugCandidato["motivo"] | undefined = aceita
        ? undefined
        : maxRun < lineMinPx
          ? "curto"
          : "longo";
      debug.linhas.push({ pos: y, inset, maxRun, aceita, motivo });
    }
  }

  // Scan vertical: varre colunas (x = 0..size-1). Cada coluna tem um "maxRun"
  // de píxeis escuros consecutivos verticalmente.
  for (let x = 0; x < size; x++) {
    let maxRun = 0;
    let run = 0;
    for (let y = 0; y < size; y++) {
      if (gray[y * size + x] < DARK_THRESHOLD) {
        run++;
        if (run > maxRun) maxRun = run;
      } else {
        run = 0;
      }
    }
    const aceita = maxRun >= lineMinPx && maxRun <= lineMaxPx;
    const inset = espelhaVert ? size - 1 - x : x;
    if (aceita) candidatasVert.push(inset);
    if (debug && x < DEBUG_FIRST_PX && maxRun > 0) {
      const motivo: DebugCandidato["motivo"] | undefined = aceita
        ? undefined
        : maxRun < lineMinPx
          ? "curto"
          : "longo";
      debug.colunas.push({ pos: x, inset, maxRun, aceita, motivo });
    }
  }

  return { candidatasHoriz, candidatasVert };
}

/**
 * Extrai um recorte de `size×size` px do ImageData e devolve grayscale como
 * Uint8Array (média RGB, alpha ignorado).
 */
function extrairCantoGray(
  img: ImageData,
  left: number,
  top: number,
  size: number,
): Uint8Array {
  const out = new Uint8Array(size * size);
  const rowBytes = img.width * 4;
  for (let y = 0; y < size; y++) {
    const srcRow = (top + y) * rowBytes;
    const dstRow = y * size;
    for (let x = 0; x < size; x++) {
      const i = srcRow + (left + x) * 4;
      out[dstRow + x] = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    }
  }
  return out;
}

/**
 * Consenso por borda: dado o par de listas de candidatos dos 2 cantos que
 * medem uma mesma borda, devolve o menor inset que tem par na outra lista
 * dentro de ±CONSENSO_TOL_PX. Retorna `undefined` se não há consenso.
 */
function consensoBorda(
  candA: number[],
  candB: number[],
): number | undefined {
  const ordenadaA = [...candA].sort((x, y) => x - y);
  for (const v of ordenadaA) {
    for (const w of candB) {
      if (Math.abs(v - w) <= CONSENSO_TOL_PX) return v;
    }
  }
  return undefined;
}

function debugAtivo(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.localStorage !== "undefined" &&
      window.localStorage.getItem("autoria:marcas-debug") === "1"
    );
  } catch {
    return false;
  }
}

function pxParaMm(px: number): number {
  return Math.round((px / DPI_RASTER) * 25.4 * 10) / 10;
}

export async function detectarMarcasMioloCliente(
  file: File,
): Promise<MarcasVisuaisHint | null> {
  const debug = debugAtivo();
  try {
    // Import dinâmico: pdfjs-dist só pode carregar no browser, e queremos
    // que este módulo seja tree-shakable no server (o import "use client"
    // acima já protege, mas o dynamic import evita paginar o bundle
    // no build server-side).
    const pdfjs = await import("pdfjs-dist");
    // Alinhado com o worker usado em `app/dashboard/prova/[id]/page.tsx`.
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const buffer = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buffer }).promise;
    if (doc.numPages < 1) return null;

    const page = await doc.getPage(1);
    // scale = DPI_RASTER / 72 (pontos → px @ DPI_RASTER)
    const viewport = page.getViewport({ scale: DPI_RASTER / 72 });
    const widthPx = Math.floor(viewport.width);
    const heightPx = Math.floor(viewport.height);

    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Fundo branco: PDFs sem cor de fundo declarada renderizam transparente,
    // e a heurística procura contraste escuro-sobre-claro.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    const imgData = ctx.getImageData(0, 0, widthPx, heightPx);

    // Libera GPU/CPU do pdfjs quanto antes.
    page.cleanup();
    doc.destroy();

    const cornerPx = Math.round((CORNER_ANALISE_MM * DPI_RASTER) / 25.4);
    const cornerPxSafe = Math.min(
      cornerPx,
      Math.floor(widthPx / 4),
      Math.floor(heightPx / 4),
    );
    // Priors em px derivados da janela e do DPI.
    const lineMinPx = Math.max(
      2,
      Math.floor((LINE_MIN_LEN_MM * DPI_RASTER) / 25.4),
    );
    const lineMaxPx = Math.min(
      cornerPxSafe,
      Math.ceil((LINE_MAX_LEN_MM * DPI_RASTER) / 25.4),
    );
    if (cornerPxSafe < lineMinPx * 2) return null;

    const cantos = [
      {
        nome: "TL",
        left: 0,
        top: 0,
        espelhaHoriz: false,
        espelhaVert: false,
        bordaHoriz: "topo" as const,
        bordaVert: "esq" as const,
      },
      {
        nome: "TR",
        left: widthPx - cornerPxSafe,
        top: 0,
        espelhaHoriz: false,
        espelhaVert: true,
        bordaHoriz: "topo" as const,
        bordaVert: "dir" as const,
      },
      {
        nome: "BL",
        left: 0,
        top: heightPx - cornerPxSafe,
        espelhaHoriz: true,
        espelhaVert: false,
        bordaHoriz: "fundo" as const,
        bordaVert: "esq" as const,
      },
      {
        nome: "BR",
        left: widthPx - cornerPxSafe,
        top: heightPx - cornerPxSafe,
        espelhaHoriz: true,
        espelhaVert: true,
        bordaHoriz: "fundo" as const,
        bordaVert: "dir" as const,
      },
    ];

    // ─── Análise por canto ─────────────────────────────────────────────────
    const analises = cantos.map((c) => {
      const gray = extrairCantoGray(imgData, c.left, c.top, cornerPxSafe);
      const debugCanto: DebugCanto | undefined = debug
        ? {
            linhas: [],
            colunas: [],
            histograma: computarHistograma(gray),
          }
        : undefined;
      const r = analisarCanto(
        gray,
        cornerPxSafe,
        c.espelhaHoriz,
        c.espelhaVert,
        lineMinPx,
        lineMaxPx,
        debugCanto,
      );
      if (debug && debugCanto) {
        console.log(`[marcas-debug] ${c.nome}`, {
          candidatasHoriz: r.candidatasHoriz,
          candidatasVert: r.candidatasVert,
          linhas: debugCanto.linhas,
          colunas: debugCanto.colunas,
          histograma_gray_8b: debugCanto.histograma,
        });
      }
      return { canto: c, resultado: r };
    });

    // ─── Consenso por borda ────────────────────────────────────────────────
    // Topo: TL e TR reportam candidatasHoriz (inset ao topo em ambos).
    // Fundo: BL e BR reportam candidatasHoriz (inset ao fundo em ambos).
    // Esq:   TL e BL reportam candidatasVert (inset à esq em ambos).
    // Dir:   TR e BR reportam candidatasVert (inset à dir em ambos).
    const TL = analises[0].resultado;
    const TR = analises[1].resultado;
    const BL = analises[2].resultado;
    const BR = analises[3].resultado;

    const insetTopoPx = consensoBorda(TL.candidatasHoriz, TR.candidatasHoriz);
    const insetFundoPx = consensoBorda(BL.candidatasHoriz, BR.candidatasHoriz);
    const insetEsqPx = consensoBorda(TL.candidatasVert, BL.candidatasVert);
    const insetDirPx = consensoBorda(TR.candidatasVert, BR.candidatasVert);

    // ─── Compat: `cantos_detectados` e `distancia_borda_mm` ───────────────
    // Um canto "detecta" quando tem ≥1 candidato em cada eixo (mesma semântica
    // aproximada do modelo legado).
    const cantos_detectados = analises.filter(
      (a) =>
        a.resultado.candidatasHoriz.length > 0 &&
        a.resultado.candidatasVert.length > 0,
    ).length;

    const insetsComConsenso = [
      insetTopoPx,
      insetFundoPx,
      insetEsqPx,
      insetDirPx,
    ].filter((x): x is number => x != null);
    const distanciaMediaPx =
      insetsComConsenso.length > 0
        ? insetsComConsenso.reduce((a, b) => a + b, 0) /
          insetsComConsenso.length
        : 0;
    const distancia_borda_mm = pxParaMm(distanciaMediaPx);

    // ─── `insets_mm` só quando as 4 bordas têm consenso ───────────────────
    const insets_mm =
      insetTopoPx != null &&
      insetFundoPx != null &&
      insetEsqPx != null &&
      insetDirPx != null
        ? {
            topo: pxParaMm(insetTopoPx),
            fundo: pxParaMm(insetFundoPx),
            esq: pxParaMm(insetEsqPx),
            dir: pxParaMm(insetDirPx),
          }
        : undefined;

    if (debug) {
      console.log("[marcas-debug] consenso", {
        insetTopoPx,
        insetFundoPx,
        insetEsqPx,
        insetDirPx,
        insets_mm,
      });
      console.log("[marcas-debug] final", {
        cantos_detectados,
        distancia_borda_mm,
        insets_mm,
        cornerPxSafe,
        lineMinPx,
        lineMaxPx,
        darkThreshold: DARK_THRESHOLD,
        dpi: DPI_RASTER,
        widthPx,
        heightPx,
      });
    }

    return {
      cantos_detectados,
      distancia_borda_mm,
      ...(insets_mm ? { insets_mm } : {}),
    };
  } catch (err) {
    console.warn(
      `[miolo-marcas-cliente] falha na detecção visual: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

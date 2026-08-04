"use client";

/**
 * Detecção VISUAL de marcas de corte em PDFs de miolo — pista para o motor
 * server-side (`_verificacao.ts`).
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 * `_verificacao.ts` lê TrimBox/BleedBox/MediaBox via pdf-lib quando o PDF
 * declara boxes semânticos (InDesign, Illustrator, exports profissionais).
 * PDFs sem boxes — incluindo os que o nosso próprio `gerar-pdf` produz via
 * Chromium/Puppeteer — desenham marcas de corte como conteúdo dentro da
 * sangria; sem boxes declarados, o motor cai no MediaBox cru e o formato
 * cruzado com sangria dá falso match.
 *
 * Este módulo rasteriza a página 1 em 150 DPI no browser (via pdfjs-dist)
 * e analisa os 4 cantos procurando o padrão "linha fina horizontal + linha
 * fina vertical próximas ao canto". Se ≥3 cantos batem, devolve `cantos`
 * + `distancia_borda_mm` média — o server valida a geometria (fórmula
 * `corte = mídia − 2×distância`) antes de aceitar como marcas.
 *
 * ─── Origem da heurística ──────────────────────────────────────────────────
 * `analisarPadraoMarca` e `detectMarcasVisual` portadas verbatim de
 * `lib/capa-analyzer.ts` (funções homônimas), substituindo `sharp` (server)
 * por `canvas` 2D (browser). Grayscale = média RGB.
 *
 * ─── Contrato ──────────────────────────────────────────────────────────────
 * Retorna `null` em qualquer falha (PDF inválido, worker indisponível,
 * canvas 2D negado, exceção interna). O caller trata `null` como "sem
 * pista" — o motor continua funcionando normalmente contra o MediaBox.
 */

export interface MarcasVisuaisHint {
  /** Quantidade de cantos onde o padrão de marca foi detectado (0–4). */
  cantos_detectados: number;
  /**
   * Distância média das marcas à borda em mm — computada a partir da média
   * das distâncias em px, convertida pelo DPI de rasterização (150).
   */
  distancia_borda_mm: number;
}

const DPI_RASTER = 150;
const CORNER_ANALISE_MM = 20;
const DARK_THRESHOLD = 100;
const LINE_MIN_LEN = 3;

/**
 * Analisa um canto rasterizado procurando padrão de marca de corte.
 * Portada verbatim de `lib/capa-analyzer.ts::analisarPadraoMarca`, adaptada
 * para receber grayscale já computado (Uint8Array) em vez do buffer sharp.
 */
function analisarPadraoMarca(
  gray: Uint8Array,
  size: number,
): { detectada: boolean; distanciaBordaPx: number } {
  const LINE_MAX_LEN = Math.floor(size / 3);

  let linhaH: number | null = null;
  for (let y = 0; y < size; y++) {
    let maxConsecutivos = 0;
    let consecutivos = 0;
    for (let x = 0; x < size; x++) {
      if (gray[y * size + x] < DARK_THRESHOLD) {
        consecutivos++;
        if (consecutivos > maxConsecutivos) maxConsecutivos = consecutivos;
      } else {
        consecutivos = 0;
      }
    }
    if (maxConsecutivos >= LINE_MIN_LEN && maxConsecutivos <= LINE_MAX_LEN) {
      linhaH = y;
      break;
    }
  }

  let linhaV: number | null = null;
  for (let x = 0; x < size; x++) {
    let maxConsecutivos = 0;
    let consecutivos = 0;
    for (let y = 0; y < size; y++) {
      if (gray[y * size + x] < DARK_THRESHOLD) {
        consecutivos++;
        if (consecutivos > maxConsecutivos) maxConsecutivos = consecutivos;
      } else {
        consecutivos = 0;
      }
    }
    if (maxConsecutivos >= LINE_MIN_LEN && maxConsecutivos <= LINE_MAX_LEN) {
      linhaV = x;
      break;
    }
  }

  if (linhaH != null && linhaV != null) {
    return { detectada: true, distanciaBordaPx: Math.min(linhaH, linhaV) };
  }
  return { detectada: false, distanciaBordaPx: 0 };
}

/**
 * Extrai um recorte de `size×size` px do ImageData e devolve grayscale
 * como Uint8Array (média RGB, alpha ignorado).
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
      // grayscale = média RGB; equivalente ao `.toColourspace("b-w")` do
      // sharp para os propósitos desta heurística (linha fina escura vs
      // fundo claro).
      out[dstRow + x] = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    }
  }
  return out;
}

export async function detectarMarcasMioloCliente(
  file: File,
): Promise<MarcasVisuaisHint | null> {
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
    if (cornerPxSafe < LINE_MIN_LEN * 2) return null;

    const cantos = [
      { left: 0, top: 0 },
      { left: widthPx - cornerPxSafe, top: 0 },
      { left: 0, top: heightPx - cornerPxSafe },
      { left: widthPx - cornerPxSafe, top: heightPx - cornerPxSafe },
    ];

    let detectados = 0;
    const distancias: number[] = [];
    for (const c of cantos) {
      const gray = extrairCantoGray(imgData, c.left, c.top, cornerPxSafe);
      const r = analisarPadraoMarca(gray, cornerPxSafe);
      if (r.detectada) {
        detectados++;
        distancias.push(r.distanciaBordaPx);
      }
    }

    const distanciaMediaPx =
      distancias.length > 0
        ? distancias.reduce((a, b) => a + b, 0) / distancias.length
        : 0;
    const distancia_borda_mm =
      Math.round((distanciaMediaPx / DPI_RASTER) * 25.4 * 10) / 10;

    return {
      cantos_detectados: detectados,
      distancia_borda_mm,
    };
  } catch (err) {
    console.warn(
      `[miolo-marcas-cliente] falha na detecção visual: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

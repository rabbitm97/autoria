import { PDFDocument } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import {
  FORMATOS_LIVRO,
  getFormatoDef,
  estimarLombadaMm,
  type FormatoLivro,
} from "@/lib/formatos";

// ─── Constantes de tolerância ─────────────────────────────────────────────────
// Mesma tolerância usada em outros detectores dimensionais da stack.

const TOLERANCIA_MM = 2;

// Points → mm (PDF vem em points; 72pt = 1in = 25.4mm).
const PT_PER_MM = 72 / 25.4;

// Igualdade de boxes: mesmo limiar do padrão canônico `lib/capa-trim-marcas.ts`
// — abaixo disso consideramos que dois boxes coincidem (rounding do PDF).
const TOLERANCIA_BOX_PT = 0.5;

// ─── Contrato de saída ────────────────────────────────────────────────────────

export type MotivoFalha =
  | "pdf_ausente"
  | "pdf_ilegivel"
  | "dimensao_divergente";

export type DeteccaoFonte = "pdf_boxes" | "visual" | "none";

/**
 * Pista de detecção visual computada no cliente (rasterização + análise de
 * cantos em pdfjs). O motor a valida geometricamente antes de aceitar.
 */
export interface MarcasVisuaisHint {
  cantos_detectados: number;
  distancia_borda_mm: number;
}

export interface VerificacaoOk {
  ok: true;
  paginas_reais: number;
  /**
   * Medida canônica em mm da página 1: TrimBox quando o PDF declara boxes
   * semânticos; corte deduzido (mídia − 2×sangria) quando marcas foram
   * detectadas visualmente; MediaBox caso contrário.
   */
  largura_mm: number;
  altura_mm: number;
  /**
   * Mantido por retrocompatibilidade — espelha `sangria_detectada`. Novos
   * consumidores devem preferir o par `sangria_detectada`/`marcas_detectadas`.
   */
  com_sangria: boolean;
  /**
   * Sangria presente. Com boxes declarados, BleedBox > TrimBox (>0.5pt em
   * algum eixo). Sem boxes + hint visual aceito, é a distância deduzida.
   * Sem boxes e sem hint, corresponde à hipótese com-sangria batendo no
   * MediaBox.
   */
  sangria_detectada: boolean;
  /**
   * Marcas de corte presentes. Fonte `pdf_boxes` → MediaBox > BleedBox
   * (>0.5pt em algum eixo). Fonte `visual` → hint do cliente aceito
   * (≥3 cantos + geometria fecha contra o formato). Fonte `none` → false.
   */
  marcas_detectadas: boolean;
  /**
   * Sangria em mm, quando quantificável. `null` na fonte MediaBox cru
   * (não sabemos a sangria exata, só que o formato fecha com hipótese
   * de 3mm por padrão do `estimarLombadaMm`).
   */
  sangria_mm: number | null;
  /** Origem da decisão sobre marcas/sangria — para telemetria e debug. */
  deteccao_fonte: DeteccaoFonte;
  lombada_mm: number;
  /**
   * Quando `paginas_reais !== paginas_declaradas`, uma mensagem de aviso não
   * bloqueante. Apenas informa o autor — a contagem real vence em tudo.
   */
  avisos: string[];
}

export interface VerificacaoErro {
  ok: false;
  motivo: MotivoFalha;
  divergencias: string[];
  /** Presente em `dimensao_divergente` quando as medidas batem com OUTRO formato. */
  formato_provavel?: FormatoLivro;
  /**
   * Medida canônica da página 1 (TrimBox quando declarado; MediaBox senão).
   * Presente se conseguimos abrir o PDF.
   */
  largura_mm?: number;
  altura_mm?: number;
  /** Contagem real, se conseguimos abrir o PDF. */
  paginas_reais?: number;
}

export type VerificacaoResultado = VerificacaoOk | VerificacaoErro;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ptParaMm(pt: number): number {
  return Math.round((pt / PT_PER_MM) * 10) / 10;
}

interface HipoteseDimensao {
  bate: boolean;
  com_sangria: boolean;
}

/**
 * `apenasSemSangria: true` — descarta a hipótese "com sangria" contra o
 * formato. Usado quando a medida vem do TrimBox: o TrimBox por definição
 * já exclui sangria, então testar a hipótese com sangria daria falso match
 * cruzado (formato menor + sangria ≈ formato maior sem sangria).
 */
function testarFormato(
  formato: FormatoLivro,
  larguraMm: number,
  alturaMm: number,
  apenasSemSangria = false,
): HipoteseDimensao {
  const spec = getFormatoDef(formato).specs;
  const semSangria =
    Math.abs(larguraMm - spec.width_mm) <= TOLERANCIA_MM &&
    Math.abs(alturaMm - spec.height_mm) <= TOLERANCIA_MM;
  if (semSangria) return { bate: true, com_sangria: false };
  if (apenasSemSangria) return { bate: false, com_sangria: false };

  const wSang = spec.width_mm + 2 * spec.bleed_mm;
  const hSang = spec.height_mm + 2 * spec.bleed_mm;
  const comSangria =
    Math.abs(larguraMm - wSang) <= TOLERANCIA_MM &&
    Math.abs(alturaMm - hSang) <= TOLERANCIA_MM;
  if (comSangria) return { bate: true, com_sangria: true };

  return { bate: false, com_sangria: false };
}

// ─── Motor ────────────────────────────────────────────────────────────────────

/**
 * Baixa o PDF temporário do bucket `livros` e roda todas as conferências
 * determinísticas. Sem escrita no banco, sem chamada de IA.
 *
 * Medição por boxes semânticos (mesmo padrão de `lib/capa-trim-marcas.ts`):
 *  - PDF profissional declara TrimBox (corte final), BleedBox (corte +
 *    sangria) e MediaBox (página inteira incluindo marcas de corte). Quando
 *    `TrimBox !== MediaBox` (>0.5pt), a medida canônica é o TrimBox e só
 *    testamos a hipótese SEM sangria — evita o falso match cruzado onde um
 *    Compacto com marcas mede tanto quanto um Padrão com sangria pelo
 *    MediaBox cru.
 *  - PDF sem boxes declarados (TrimBox == MediaBox) → cai no MediaBox com
 *    dupla hipótese sem/com sangria, comportamento herdado.
 *
 * Motivos de falha:
 *  - Ausência do arquivo → `pdf_ausente`.
 *  - PDF ilegível/corrompido/senha → `pdf_ilegivel`.
 *  - Página 1 com dimensões fora do `formato` (tolerância ±2mm) →
 *    `dimensao_divergente`. Se as medidas casam com OUTRO dos 5 formatos,
 *    `formato_provavel` é preenchido.
 *  - Divergência de páginas declaradas vs reais NÃO bloqueia — vira aviso; a
 *    contagem real vence.
 */
export async function verificarMioloPdf(params: {
  userId: string;
  formato: FormatoLivro;
  paginas_declaradas: number;
  /**
   * Pista de detecção visual do cliente. Aceita apenas quando `boxesDeclarados`
   * é false, `cantos_detectados >= 3` e `2 <= distancia_borda_mm <= 15`. Se a
   * geometria não fecha contra nenhum formato, é descartada (log) e caímos no
   * MediaBox cru.
   */
  marcas_visuais?: MarcasVisuaisHint | null;
}): Promise<VerificacaoResultado> {
  const { userId, formato, paginas_declaradas, marcas_visuais } = params;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const path = `${userId}/express-temp.pdf`;
  const { data: blob, error: downloadErr } = await storageClient.storage
    .from("livros")
    .download(path);

  if (downloadErr || !blob) {
    return {
      ok: false,
      motivo: "pdf_ausente",
      divergencias: ["Envie o arquivo do miolo antes de verificar."],
    };
  }

  const buffer = await blob.arrayBuffer();

  let pdf: PDFDocument;
  let paginasReais: number;
  let larguraMm: number;
  let alturaMm: number;
  let mediaLarguraMm: number;
  let mediaAlturaMm: number;
  let boxesDeclarados: boolean;
  let sangriaDetectada: boolean;
  let marcasDetectadas: boolean;
  let sangriaMm: number | null;
  let deteccaoFonte: DeteccaoFonte;
  try {
    pdf = await PDFDocument.load(buffer);
    paginasReais = pdf.getPageCount();
    if (paginasReais < 1) throw new Error("PDF sem páginas");

    const page = pdf.getPage(0);
    const mediaBox = page.getMediaBox();
    const trimBox = page.getTrimBox();
    const bleedBox = page.getBleedBox();

    mediaLarguraMm = ptParaMm(mediaBox.width);
    mediaAlturaMm = ptParaMm(mediaBox.height);

    // TrimBox difere do MediaBox → PDF tem semântica declarada.
    boxesDeclarados =
      Math.abs(mediaBox.width - trimBox.width) > TOLERANCIA_BOX_PT ||
      Math.abs(mediaBox.height - trimBox.height) > TOLERANCIA_BOX_PT;

    if (boxesDeclarados) {
      larguraMm = ptParaMm(trimBox.width);
      alturaMm = ptParaMm(trimBox.height);
      sangriaDetectada =
        Math.abs(bleedBox.width - trimBox.width) > TOLERANCIA_BOX_PT ||
        Math.abs(bleedBox.height - trimBox.height) > TOLERANCIA_BOX_PT;
      marcasDetectadas =
        Math.abs(mediaBox.width - bleedBox.width) > TOLERANCIA_BOX_PT ||
        Math.abs(mediaBox.height - bleedBox.height) > TOLERANCIA_BOX_PT;
      // Sangria em mm quando quantificável (bleed − trim) / 2 no menor eixo.
      sangriaMm = sangriaDetectada
        ? Math.round(
            (Math.min(
              (bleedBox.width - trimBox.width) / 2,
              (bleedBox.height - trimBox.height) / 2,
            ) /
              PT_PER_MM) *
              10,
          ) / 10
        : 0;
      deteccaoFonte = "pdf_boxes";
    } else {
      larguraMm = mediaLarguraMm;
      alturaMm = mediaAlturaMm;
      marcasDetectadas = false;
      sangriaDetectada = false;
      sangriaMm = null;
      deteccaoFonte = "none";
    }
  } catch {
    return {
      ok: false,
      motivo: "pdf_ilegivel",
      divergencias: [
        "Não foi possível ler o PDF — verifique se o arquivo não está protegido por senha.",
      ],
    };
  }

  // ── Pista visual do cliente (só faz sentido sem boxes declarados) ─────────
  // Se o hint bate os limiares mínimos, tenta deduzir o corte pela fórmula
  //   corte = media − 2×distancia_borda
  // e testar contra o formato. Aceita se algum formato conhecido fecha (só
  // hipótese sem-sangria, porque a distância já modela a própria sangria).
  // Se nenhum formato fecha: descarta o hint (log) e cai no MediaBox cru.
  if (!boxesDeclarados && marcas_visuais) {
    const { cantos_detectados, distancia_borda_mm } = marcas_visuais;
    const hintValido =
      Number.isFinite(cantos_detectados) &&
      Number.isFinite(distancia_borda_mm) &&
      cantos_detectados >= 3 &&
      distancia_borda_mm >= 2 &&
      distancia_borda_mm <= 15;

    if (hintValido) {
      const corteW =
        Math.round((mediaLarguraMm - 2 * distancia_borda_mm) * 10) / 10;
      const corteH =
        Math.round((mediaAlturaMm - 2 * distancia_borda_mm) * 10) / 10;
      const bateFormato = testarFormato(formato, corteW, corteH, true).bate;
      const bateOutro =
        !bateFormato &&
        FORMATOS_LIVRO.some(
          (f) =>
            f.value !== formato &&
            testarFormato(f.value, corteW, corteH, true).bate,
        );
      if (bateFormato || bateOutro) {
        larguraMm = corteW;
        alturaMm = corteH;
        sangriaDetectada = true;
        marcasDetectadas = true;
        sangriaMm = Math.round(distancia_borda_mm * 10) / 10;
        deteccaoFonte = "visual";
      } else {
        console.warn(
          "[express-verificacao] hint de marcas descartado (geometria não fecha)",
          { mediaLarguraMm, mediaAlturaMm, distancia_borda_mm, corteW, corteH },
        );
      }
    }
  }

  // ── Conferência de dimensão contra o formato declarado ────────────────────
  // Com boxes declarados OU com hint visual aceito, a medida já é a de corte
  // (sem sangria) — restrição `apenasSemSangria` evita falso match cruzado.
  const apenasSemSangria = boxesDeclarados || deteccaoFonte === "visual";
  const hipotese = testarFormato(formato, larguraMm, alturaMm, apenasSemSangria);
  if (!hipotese.bate) {
    const def = getFormatoDef(formato);
    const wSang = def.specs.width_mm + 2 * def.specs.bleed_mm;
    const hSang = def.specs.height_mm + 2 * def.specs.bleed_mm;

    // Tentar mapear para OUTRO dos 5 formatos, respeitando o mesmo modo
    // (medida já é de corte → só hipótese sem sangria).
    let formatoProvavel: FormatoLivro | undefined;
    for (const outro of FORMATOS_LIVRO) {
      if (outro.value === formato) continue;
      if (testarFormato(outro.value, larguraMm, alturaMm, apenasSemSangria).bate) {
        formatoProvavel = outro.value;
        break;
      }
    }

    const rotuloMedida = apenasSemSangria
      ? "A área de corte do seu PDF"
      : "Seu PDF";

    const divergencias: string[] = [];
    if (formatoProvavel) {
      const defProv = getFormatoDef(formatoProvavel);
      divergencias.push(
        `${rotuloMedida} mede ${larguraMm.toFixed(1)}×${alturaMm.toFixed(1)}mm — corresponde ao formato ${defProv.label} (${defProv.descricao_curta}), não ao ${def.label} (${def.descricao_curta}). Corrija a seleção ou reexporte o arquivo.`,
      );
    } else if (apenasSemSangria) {
      divergencias.push(
        `${rotuloMedida} mede ${larguraMm.toFixed(1)}×${alturaMm.toFixed(1)}mm. Esperado para ${def.label}: ${def.specs.width_mm}×${def.specs.height_mm}mm (área de corte). Reexporte o arquivo no formato correto.`,
      );
    } else {
      divergencias.push(
        `${rotuloMedida} mede ${larguraMm.toFixed(1)}×${alturaMm.toFixed(1)}mm. Esperado para ${def.label}: ${def.specs.width_mm}×${def.specs.height_mm}mm (sem sangria) ou ${wSang}×${hSang}mm (com sangria). Reexporte o arquivo no formato correto.`,
      );
    }

    return {
      ok: false,
      motivo: "dimensao_divergente",
      divergencias,
      formato_provavel: formatoProvavel,
      largura_mm: larguraMm,
      altura_mm: alturaMm,
      paginas_reais: paginasReais,
    };
  }

  // Sem boxes e sem hint visual aceito: a sangria é o que a hipótese
  // vencedora do MediaBox diz (deteccaoFonte permanece "none" porque não
  // temos evidência declarativa nem visual — só o formato bateu).
  if (deteccaoFonte === "none") {
    sangriaDetectada = hipotese.com_sangria;
    // sangriaMm segue null: sem boxes e sem hint, não quantificamos a sangria
    // — só sabemos que a dimensão total fecha com a hipótese com/sem sangria.
  }

  // ── OK dimensional. Contagem de páginas: divergência vira aviso. ──────────
  const avisos: string[] = [];
  if (paginas_declaradas > 0 && paginas_declaradas !== paginasReais) {
    avisos.push(
      `Seu PDF tem ${paginasReais} páginas; você declarou ${paginas_declaradas}. Vamos usar a contagem real: ${paginasReais}.`,
    );
  }

  return {
    ok: true,
    paginas_reais: paginasReais,
    largura_mm: larguraMm,
    altura_mm: alturaMm,
    com_sangria: sangriaDetectada,
    sangria_detectada: sangriaDetectada,
    marcas_detectadas: marcasDetectadas,
    sangria_mm: sangriaMm,
    deteccao_fonte: deteccaoFonte,
    lombada_mm: estimarLombadaMm(paginasReais),
    avisos,
  };
}

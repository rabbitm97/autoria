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

export interface VerificacaoOk {
  ok: true;
  paginas_reais: number;
  /**
   * Medida canônica em mm da página 1: TrimBox quando o PDF declara boxes
   * semânticos (`marcas_detectadas` implica isso), MediaBox caso contrário.
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
   * algum eixo). Sem boxes, corresponde à hipótese com-sangria batendo no
   * MediaBox.
   */
  sangria_detectada: boolean;
  /**
   * Marcas de corte presentes (MediaBox > BleedBox, >0.5pt em algum eixo).
   * Sempre false quando o PDF não declara boxes — não distingue marcas de
   * página com sangria só via MediaBox.
   */
  marcas_detectadas: boolean;
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
}): Promise<VerificacaoResultado> {
  const { userId, formato, paginas_declaradas } = params;

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
  let boxesDeclarados: boolean;
  let sangriaDetectada: boolean;
  let marcasDetectadas: boolean;
  try {
    pdf = await PDFDocument.load(buffer);
    paginasReais = pdf.getPageCount();
    if (paginasReais < 1) throw new Error("PDF sem páginas");

    const page = pdf.getPage(0);
    const mediaBox = page.getMediaBox();
    const trimBox = page.getTrimBox();
    const bleedBox = page.getBleedBox();

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
    } else {
      larguraMm = ptParaMm(mediaBox.width);
      alturaMm = ptParaMm(mediaBox.height);
      marcasDetectadas = false;
      // Sem boxes: preenchemos `sangria_detectada` depois, quando a hipótese
      // vencer contra o formato.
      sangriaDetectada = false;
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

  // ── Conferência de dimensão contra o formato declarado ────────────────────
  const hipotese = testarFormato(formato, larguraMm, alturaMm, boxesDeclarados);
  if (!hipotese.bate) {
    const def = getFormatoDef(formato);
    const wSang = def.specs.width_mm + 2 * def.specs.bleed_mm;
    const hSang = def.specs.height_mm + 2 * def.specs.bleed_mm;

    // Tentar mapear para OUTRO dos 5 formatos, respeitando o mesmo modo
    // (boxes declarados → só hipótese sem sangria).
    let formatoProvavel: FormatoLivro | undefined;
    for (const outro of FORMATOS_LIVRO) {
      if (outro.value === formato) continue;
      if (testarFormato(outro.value, larguraMm, alturaMm, boxesDeclarados).bate) {
        formatoProvavel = outro.value;
        break;
      }
    }

    const rotuloMedida = boxesDeclarados
      ? "A área de corte do seu PDF"
      : "Seu PDF";

    const divergencias: string[] = [];
    if (formatoProvavel) {
      const defProv = getFormatoDef(formatoProvavel);
      divergencias.push(
        `${rotuloMedida} mede ${larguraMm.toFixed(1)}×${alturaMm.toFixed(1)}mm — corresponde ao formato ${defProv.label} (${defProv.descricao_curta}), não ao ${def.label} (${def.descricao_curta}). Corrija a seleção ou reexporte o arquivo.`,
      );
    } else if (boxesDeclarados) {
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

  // Sem boxes: a sangria é o que a hipótese vencedora diz.
  if (!boxesDeclarados) {
    sangriaDetectada = hipotese.com_sangria;
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
    lombada_mm: estimarLombadaMm(paginasReais),
    avisos,
  };
}

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

// ─── Contrato de saída ────────────────────────────────────────────────────────

export type MotivoFalha =
  | "pdf_ausente"
  | "pdf_ilegivel"
  | "dimensao_divergente";

export interface VerificacaoOk {
  ok: true;
  paginas_reais: number;
  largura_mm: number;
  altura_mm: number;
  com_sangria: boolean;
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
  /** Medidas reais lidas da página 1, se conseguimos abrir o PDF. */
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

function testarFormato(
  formato: FormatoLivro,
  larguraMm: number,
  alturaMm: number,
): HipoteseDimensao {
  const spec = getFormatoDef(formato).specs;
  const semSangria =
    Math.abs(larguraMm - spec.width_mm) <= TOLERANCIA_MM &&
    Math.abs(alturaMm - spec.height_mm) <= TOLERANCIA_MM;
  if (semSangria) return { bate: true, com_sangria: false };

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
 *  - Ausência do arquivo → `pdf_ausente`.
 *  - PDF ilegível/corrompido/senha → `pdf_ilegivel`.
 *  - Página 1 com dimensões fora do `formato` (tolerância ±2mm, dupla hipótese
 *    sem/com sangria) → `dimensao_divergente`. Se as medidas casam com OUTRO
 *    dos 5 formatos, `formato_provavel` é preenchido.
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
  try {
    pdf = await PDFDocument.load(buffer);
    paginasReais = pdf.getPageCount();
    if (paginasReais < 1) throw new Error("PDF sem páginas");
    const size = pdf.getPage(0).getSize();
    larguraMm = ptParaMm(size.width);
    alturaMm = ptParaMm(size.height);
  } catch {
    return {
      ok: false,
      motivo: "pdf_ilegivel",
      divergencias: [
        "Não foi possível ler o PDF — verifique se o arquivo não está protegido por senha.",
      ],
    };
  }

  // ── Conferência de dimensão contra o formato declarado (sem/com sangria) ──
  const hipotese = testarFormato(formato, larguraMm, alturaMm);
  if (!hipotese.bate) {
    const def = getFormatoDef(formato);
    const wSang = def.specs.width_mm + 2 * def.specs.bleed_mm;
    const hSang = def.specs.height_mm + 2 * def.specs.bleed_mm;

    // Tentar mapear para OUTRO dos 5 formatos.
    let formatoProvavel: FormatoLivro | undefined;
    for (const outro of FORMATOS_LIVRO) {
      if (outro.value === formato) continue;
      if (testarFormato(outro.value, larguraMm, alturaMm).bate) {
        formatoProvavel = outro.value;
        break;
      }
    }

    const divergencias: string[] = [];
    if (formatoProvavel) {
      const defProv = getFormatoDef(formatoProvavel);
      divergencias.push(
        `Seu PDF mede ${larguraMm.toFixed(1)}×${alturaMm.toFixed(1)}mm — corresponde ao formato ${defProv.label} (${defProv.descricao_curta}), não ao ${def.label} (${def.descricao_curta}). Corrija a seleção ou reexporte o arquivo.`,
      );
    } else {
      divergencias.push(
        `Seu PDF mede ${larguraMm.toFixed(1)}×${alturaMm.toFixed(1)}mm. Esperado para ${def.label}: ${def.specs.width_mm}×${def.specs.height_mm}mm (sem sangria) ou ${wSang}×${hSang}mm (com sangria). Reexporte o arquivo no formato correto.`,
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

  // ── OK dimensional. Contagem de páginas: divergência vira aviso. ──
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
    com_sangria: hipotese.com_sangria,
    lombada_mm: estimarLombadaMm(paginasReais),
    avisos,
  };
}

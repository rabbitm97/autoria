// ─────────────────────────────────────────────────────────────────────────────
// lib/capa-resolver.ts
//
// Helper canônico que normaliza `projects.dados_capa` em um objeto único,
// independente de qual pipeline (Editor, IA, Upload) o produziu — e de se a
// capa foi montada via `montar-capa` (que adiciona `url_completa`).
//
// Por que existe:
// `dados_capa` tem TRÊS schemas diferentes na base, conforme o pipeline:
//   - Editor visual: { source: "editor", imagem_url, editor_data: { fills, ... }, confirmed_at }
//   - gerar-capa IA: { modo: "ia", url_escolhida, opcoes: [...], lombada_mm, ... }
//   - upload-capa:   { modo: "upload", url, largura_px, altura_px, dpi, lombada_mm_na_validacao, ... }
//
// Além disso, qualquer um dos três pode (opcionalmente) ter passado por
// `montar-capa`, que adiciona `url_completa` + `composta_storage_path` +
// `montada_em` + `dimensoes_montada` ao objeto via merge.
//
// USO:
//   const capa = resolveCapaCompleta(project.dados_capa);
//   if (capa.is_panoramica) {
//     // url_principal contém frente+lombada+contracapa → recortar em 3 faces
//   } else {
//     // url_principal contém só a frente → renderizar isolada
//   }
// ─────────────────────────────────────────────────────────────────────────────

export type OrigemCapa = "editor" | "ia" | "upload" | null;

export interface CapaResolvida {
  /** True quando há pelo menos uma URL de capa utilizável. */
  pronta: boolean;

  /** Qual pipeline produziu esta capa. `null` se `dados_capa` está vazio. */
  origem: OrigemCapa;

  /**
   * URL principal para exibição da capa.
   * - Quando `is_panoramica = true`: a URL aponta para uma imagem panorâmica
   *   contendo frente + lombada + contracapa lado a lado.
   * - Quando `is_panoramica = false`: a URL aponta apenas para a frente do livro.
   */
  url_principal: string | null;

  /**
   * True quando `url_principal` é uma imagem panorâmica.
   *
   * Regras:
   * - Editor SEMPRE exporta panorâmica → true para origem "editor".
   * - IA/Upload simples são apenas a frente → false.
   * - IA/Upload + montar-capa → true (a URL principal vira `url_completa`).
   */
  is_panoramica: boolean;

  /**
   * Cores de preenchimento definidas pelo autor no Editor. `null` para os
   * outros pipelines (IA e Upload não expõem fills separadas).
   * Útil para o Book3D renderizar lombada/contracapa sintéticas com as
   * cores reais escolhidas pelo autor, em casos não panorâmicos.
   */
  fills: {
    capa?: string;
    lombada?: string;
    contracapa?: string;
  } | null;

  /** Espessura da lombada em milímetros. */
  lombada_mm: number | null;

  /** Largura da capa em pixels (apenas para upload). */
  largura_px: number | null;

  /** Altura da capa em pixels (apenas para upload). */
  altura_px: number | null;

  /** Resolução em DPI (apenas para upload; assumido 300 para IA/Editor). */
  dpi: number | null;
}

// ─── Type guards para cada schema ────────────────────────────────────────────

type DadosCapa = Record<string, unknown> | null | undefined;

function isEditorCapa(c: DadosCapa): c is Record<string, unknown> & {
  source: "editor";
  imagem_url?: string;
  editor_data?: { fills?: { capa?: string; lombada?: string; contracapa?: string } };
  confirmed_at?: string;
} {
  return !!c && (c as Record<string, unknown>).source === "editor";
}

function isIACapa(c: DadosCapa): c is Record<string, unknown> & {
  modo: "ia";
  url_escolhida?: string;
  opcoes?: { url: string }[];
  lombada_mm?: number;
} {
  return !!c && (c as Record<string, unknown>).modo === "ia";
}

function isUploadCapa(c: DadosCapa): c is Record<string, unknown> & {
  modo: "upload";
  url?: string;
  largura_px?: number;
  altura_px?: number;
  dpi?: number;
  lombada_mm_na_validacao?: number;
} {
  return !!c && (c as Record<string, unknown>).modo === "upload";
}

/** Lê o campo `url_completa` setado pelo `montar-capa` quando existe. */
function urlCompletaFrom(c: DadosCapa): string | null {
  if (!c) return null;
  const v = (c as Record<string, unknown>).url_completa;
  return typeof v === "string" ? v : null;
}

// ─── Resolver principal ──────────────────────────────────────────────────────

/**
 * Normaliza `projects.dados_capa` em `CapaResolvida`.
 *
 * Sempre retorna um objeto válido — nunca lança nem retorna null. Quando não
 * há capa, todos os campos ficam `null` / `false` e `pronta = false`.
 */
export function resolveCapaCompleta(dados_capa: DadosCapa): CapaResolvida {
  const urlCompleta = urlCompletaFrom(dados_capa);

  // Schema 1: Editor visual
  if (isEditorCapa(dados_capa)) {
    const imagemUrl = typeof dados_capa.imagem_url === "string" ? dados_capa.imagem_url : null;
    const fills = dados_capa.editor_data?.fills ?? null;
    // Editor SEMPRE exporta panorâmica. Se url_completa existir (montar-capa
    // foi rodado em cima), usa essa; senão usa imagem_url do Editor.
    const urlPrincipal = urlCompleta ?? imagemUrl;
    return {
      pronta: !!urlPrincipal && !!dados_capa.confirmed_at,
      origem: "editor",
      url_principal: urlPrincipal,
      is_panoramica: true,
      fills,
      lombada_mm: null,
      largura_px: null,
      altura_px: null,
      dpi: 300,
    };
  }

  // Schema 2: IA (gerar-capa)
  if (isIACapa(dados_capa)) {
    const escolhida = typeof dados_capa.url_escolhida === "string" ? dados_capa.url_escolhida : null;
    const primeiraOpcao = dados_capa.opcoes?.[0]?.url ?? null;
    const urlFrente = escolhida ?? primeiraOpcao;
    // Se montar-capa foi rodado, url_completa tem prioridade e é panorâmica.
    const usaCompleta = !!urlCompleta;
    return {
      pronta: !!(urlCompleta ?? urlFrente),
      origem: "ia",
      url_principal: urlCompleta ?? urlFrente,
      is_panoramica: usaCompleta,
      fills: null,
      lombada_mm: typeof dados_capa.lombada_mm === "number" ? dados_capa.lombada_mm : null,
      largura_px: null,
      altura_px: null,
      dpi: 300,
    };
  }

  // Schema 3: Upload
  if (isUploadCapa(dados_capa)) {
    const url = typeof dados_capa.url === "string" ? dados_capa.url : null;
    const usaCompleta = !!urlCompleta;
    return {
      pronta: !!(urlCompleta ?? url),
      origem: "upload",
      url_principal: urlCompleta ?? url,
      is_panoramica: usaCompleta,
      fills: null,
      lombada_mm: typeof dados_capa.lombada_mm_na_validacao === "number" ? dados_capa.lombada_mm_na_validacao : null,
      largura_px: typeof dados_capa.largura_px === "number" ? dados_capa.largura_px : null,
      altura_px: typeof dados_capa.altura_px === "number" ? dados_capa.altura_px : null,
      dpi: typeof dados_capa.dpi === "number" ? dados_capa.dpi : 300,
    };
  }

  // Schema desconhecido ou vazio
  return {
    pronta: false,
    origem: null,
    url_principal: null,
    is_panoramica: false,
    fills: null,
    lombada_mm: null,
    largura_px: null,
    altura_px: null,
    dpi: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// lib/capa-resolver.ts
//
// Helper canônico que normaliza `projects.dados_capa` em um objeto único,
// independente de qual pipeline (Editor, IA, Upload) o produziu.
//
// Por que existe:
// `dados_capa` tem TRÊS schemas diferentes na base, conforme o pipeline:
//   - Editor visual: { source: "editor", imagem_url, editor_data: { fills, ... }, confirmed_at }
//   - gerar-capa IA: { modo: "ia", url_escolhida, opcoes: [...], lombada_mm, ... }
//   - upload-capa:   { modo: "upload", url, largura_px, altura_px, dpi, lombada_mm_na_validacao, ... }
//
// Sem esse helper, cada consumidor (QA, Book3D, etc) faria seu próprio lookup
// e esqueceria pelo menos um schema (foi o que causou o bug "Capa fantasma").
//
// USO:
//   const capa = resolveCapaCompleta(project.dados_capa);
//   if (capa.pronta) {
//     <img src={capa.url_frente} />
//   }
// ─────────────────────────────────────────────────────────────────────────────

export type OrigemCapa = "editor" | "ia" | "upload" | null;

export interface CapaResolvida {
  /** True quando há pelo menos uma URL de capa utilizável. */
  pronta: boolean;

  /** Qual pipeline produziu esta capa. `null` se `dados_capa` está vazio. */
  origem: OrigemCapa;

  /**
   * URL principal da capa (frente do livro). Para Editor, é a única arte
   * exportada (`imagem_url`). Para IA, é `url_escolhida` ou a primeira opção.
   * Para Upload, é a URL do arquivo enviado pelo autor.
   */
  url_frente: string | null;

  /**
   * URL da capa completa montada (frente + lombada + contracapa + orelhas).
   * Produzida pela rota `montar-capa`. NUNCA está preenchida no schema atual —
   * será adicionada no Prompt 2. Mantida no tipo para evitar nova refatoração.
   */
  url_completa: string | null;

  /**
   * Cores de preenchimento definidas pelo autor no Editor. `null` para os
   * outros pipelines (IA e Upload não expõem fills separadas).
   * Útil para o Book3D renderizar lombada/contracapa sintéticas com as
   * cores reais escolhidas pelo autor.
   */
  fills: {
    capa?: string;
    lombada?: string;
    contracapa?: string;
  } | null;

  /** Espessura da lombada em milímetros. Calculada a partir do número de páginas. */
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

// ─── Resolver principal ──────────────────────────────────────────────────────

/**
 * Normaliza `projects.dados_capa` em `CapaResolvida`.
 *
 * Sempre retorna um objeto válido — nunca lança nem retorna null. Quando não
 * há capa, todos os campos ficam `null` e `pronta = false`.
 */
export function resolveCapaCompleta(dados_capa: DadosCapa): CapaResolvida {
  // Schema 1: Editor visual
  if (isEditorCapa(dados_capa)) {
    const imagemUrl = typeof dados_capa.imagem_url === "string" ? dados_capa.imagem_url : null;
    const fills = dados_capa.editor_data?.fills ?? null;
    return {
      pronta: !!imagemUrl && !!dados_capa.confirmed_at,
      origem: "editor",
      url_frente: imagemUrl,
      url_completa: null,
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
    return {
      pronta: !!urlFrente,
      origem: "ia",
      url_frente: urlFrente,
      url_completa: null,
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
    return {
      pronta: !!url,
      origem: "upload",
      url_frente: url,
      url_completa: null,
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
    url_frente: null,
    url_completa: null,
    fills: null,
    lombada_mm: null,
    largura_px: null,
    altura_px: null,
    dpi: null,
  };
}

/**
 * BLOCO-02-C — Cálculo de preço da impressão POD.
 *
 * Valores calibrados UICLAP -5% (planilha autoria-precos-simulacao-uiclap.xlsx,
 * blocos 2-6). Substituíveis quando Graphium enviar custos reais.
 *
 * REGRA DE OURO: cálculo aqui é o único caminho para gerar preço confiável
 * (server-side). O client renderiza este resultado, nunca invente valores.
 */

import type { FormatoLivro } from "@/lib/formatos";

// ─── Tipos ────────────────────────────────────────────────────────────────

export type PapelMiolo =
  | "offset_75g"
  | "avena_80g"
  | "polen_bold_90g"
  | "couche_fosco_90g";

export type CorMiolo = "pb" | "cor";

export type AcabamentoCapa =
  | "fosca_bopp"
  | "brilho_bopp"
  | "verniz_uv";

export type EncadernacaoTecnica = "grampeado" | "brochura_pur";

export type RegiaoFrete = "sul_sudeste" | "centro_oeste" | "norte_nordeste" | "desconhecida";

export interface ConfigImpressao {
  formato: FormatoLivro;
  paginas: number;
  papel_miolo: PapelMiolo;
  cor_miolo: CorMiolo;
  acabamento_capa: AcabamentoCapa;
  com_orelhas: boolean;
  tiragem: number;
  cep_entrega?: string;
}

export interface OrcamentoImpressao {
  // Custos por unidade (antes do multiplicador)
  custo_miolo_unit_reais: number;
  custo_capa_unit_reais: number;
  custo_encadernacao_unit_reais: number;
  subtotal_unit_reais: number;

  // Escala
  multiplicador_tiragem: number;
  custo_unit_com_multiplicador_reais: number;

  // Setup
  setup_titulo_reais: number;
  setup_rateado_unit_reais: number;

  // Total
  custo_por_exemplar_reais: number;
  subtotal_produtos_reais: number; // custo_por_exemplar × tiragem
  frete_estimado_reais: number;
  total_reais: number;
  total_centavos: number;

  // Metadata
  prazo_producao_dias: number;
  encadernacao_tecnica: EncadernacaoTecnica;
  faixa_tiragem_label: string;
  regiao_frete: RegiaoFrete;
}

export type ResultadoOrcamento =
  | { ok: true; orcamento: OrcamentoImpressao }
  | { ok: false; erro: string; codigo: "PAGINAS_INVALIDAS" | "TIRAGEM_INVALIDA" | "COMBINACAO_INVALIDA" | "PAPEL_INVALIDO" };

// ─── Constantes calibradas (planilha aba 2: Miolo) ────────────────────────

const PRECO_PAPEL_PB: Record<PapelMiolo, number> = {
  offset_75g: 0.073,
  avena_80g: 0.078,
  polen_bold_90g: 0.09,
  couche_fosco_90g: 0.105,
};

const PRECO_PAPEL_COR: Record<PapelMiolo, number> = {
  offset_75g: 0.168,
  avena_80g: 0.187,
  polen_bold_90g: 0.215,
  couche_fosco_90g: 0.19,
};

// ─── Capa (planilha aba 3) ────────────────────────────────────────────────

interface FaixaCapa {
  ate_cm: number;
  sem_orelhas: number;
  com_orelhas: number;
}

const CAPA_POR_ACABAMENTO: Record<AcabamentoCapa, FaixaCapa[]> = {
  fosca_bopp: [
    { ate_cm: 40, sem_orelhas: 7.41, com_orelhas: 13.42 },
    { ate_cm: 51, sem_orelhas: 11.53, com_orelhas: 17.55 },
    { ate_cm: Infinity, sem_orelhas: 20.0, com_orelhas: 26.02 },
  ],
  brilho_bopp: [
    { ate_cm: 40, sem_orelhas: 7.41, com_orelhas: 13.42 },
    { ate_cm: 51, sem_orelhas: 11.53, com_orelhas: 17.55 },
    { ate_cm: Infinity, sem_orelhas: 20.0, com_orelhas: 26.02 },
  ],
  verniz_uv: [
    { ate_cm: 40, sem_orelhas: 9.63, com_orelhas: 17.45 },
    { ate_cm: 51, sem_orelhas: 14.99, com_orelhas: 22.82 },
    { ate_cm: Infinity, sem_orelhas: 26.0, com_orelhas: 33.83 },
  ],
};

// ─── Encadernação (planilha aba 4) ────────────────────────────────────────

interface FaixaEncadernacao {
  min_paginas: number;
  max_paginas: number;
  tecnica: EncadernacaoTecnica;
  preco: number;
  prazo_dias: number;
}

const ENCADERNACAO_FAIXAS: FaixaEncadernacao[] = [
  { min_paginas: 4, max_paginas: 48, tecnica: "grampeado", preco: 1.5, prazo_dias: 3 },
  { min_paginas: 49, max_paginas: 100, tecnica: "brochura_pur", preco: 2.85, prazo_dias: 5 },
  { min_paginas: 101, max_paginas: 200, tecnica: "brochura_pur", preco: 3.4, prazo_dias: 5 },
  { min_paginas: 201, max_paginas: 350, tecnica: "brochura_pur", preco: 4.2, prazo_dias: 6 },
  { min_paginas: 351, max_paginas: 500, tecnica: "brochura_pur", preco: 5.8, prazo_dias: 7 },
];

// ─── Multiplicador tiragem (planilha aba 6) ───────────────────────────────

interface FaixaTiragem {
  min: number;
  max: number;
  multiplicador: number;
  label: string;
}

const FAIXAS_TIRAGEM: FaixaTiragem[] = [
  { min: 1, max: 1, multiplicador: 1.0, label: "1 exemplar" },
  { min: 2, max: 9, multiplicador: 0.868, label: "2 a 9 exemplares" },
  { min: 10, max: 20, multiplicador: 0.773, label: "10 a 20 exemplares" },
  { min: 21, max: 49, multiplicador: 0.698, label: "21 a 49 exemplares" },
  { min: 50, max: 149, multiplicador: 0.669, label: "50 a 149 exemplares" },
  { min: 150, max: 299, multiplicador: 0.582, label: "150 a 299 exemplares" },
  { min: 300, max: 499, multiplicador: 0.547, label: "300 a 499 exemplares" },
  { min: 500, max: 799, multiplicador: 0.496, label: "500 a 799 exemplares" },
  { min: 800, max: 1199, multiplicador: 0.452, label: "800 a 1.199 exemplares" },
  { min: 1200, max: Infinity, multiplicador: 0.438, label: "1.200+ exemplares" },
];

// ─── Custos fixos (planilha aba 5) ────────────────────────────────────────

const SETUP_TITULO_REAIS = 2.375;

// ─── Frete estimado por região (fixo — item 5 conversa) ──────────────────

const FRETE_POR_REGIAO: Record<RegiaoFrete, number> = {
  sul_sudeste: 25,
  centro_oeste: 35,
  norte_nordeste: 45,
  desconhecida: 40,
};

// Prefixos de CEP por região (BR — aproximado, suficiente para MVP)
function inferirRegiao(cep: string): RegiaoFrete {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return "desconhecida";
  const prefixo = parseInt(clean.slice(0, 2), 10);
  if (prefixo >= 1 && prefixo <= 39) return "sul_sudeste";
  if (prefixo >= 80 && prefixo <= 99) return "sul_sudeste";
  if (prefixo >= 70 && prefixo <= 79) return "centro_oeste";
  if (prefixo >= 40 && prefixo <= 65) return "norte_nordeste";
  if (prefixo >= 66 && prefixo <= 69) return "norte_nordeste";
  return "desconhecida";
}

// ─── Formatos: largura da capa aberta (cm) ────────────────────────────────

interface FormatoInfo {
  largura_capa_sem_orelhas_cm: number; // 2 × largura miolo + lombada aproximada 0.4cm
  largura_orelha_cm: number;
}

// Padrão Autoria: orelhas de 7cm cada
const FORMATO_INFO: Record<FormatoLivro, FormatoInfo> = {
  compacto: { largura_capa_sem_orelhas_cm: 28.4, largura_orelha_cm: 7 },
  padrao_br: { largura_capa_sem_orelhas_cm: 32.4, largura_orelha_cm: 7 },
  bolso: { largura_capa_sem_orelhas_cm: 22.4, largura_orelha_cm: 7 },
  quadrado: { largura_capa_sem_orelhas_cm: 40.4, largura_orelha_cm: 7 },
  a4: { largura_capa_sem_orelhas_cm: 42.4, largura_orelha_cm: 7 },
};

// ─── Cálculo principal ────────────────────────────────────────────────────

export function calcularOrcamento(config: ConfigImpressao): ResultadoOrcamento {
  if (!Number.isInteger(config.paginas) || config.paginas < 4 || config.paginas > 500) {
    return {
      ok: false,
      erro: `Número de páginas fora do suportado (4 a 500). Recebido: ${config.paginas}`,
      codigo: "PAGINAS_INVALIDAS",
    };
  }

  if (!Number.isInteger(config.tiragem) || config.tiragem < 1) {
    return {
      ok: false,
      erro: `Tiragem inválida. Mínimo 1 exemplar.`,
      codigo: "TIRAGEM_INVALIDA",
    };
  }

  if (config.papel_miolo === "couche_fosco_90g" && config.cor_miolo === "pb") {
    return {
      ok: false,
      erro: `Papel Couché é usado apenas para miolo colorido. Escolha outro papel para preto-e-branco.`,
      codigo: "COMBINACAO_INVALIDA",
    };
  }

  const precoPapel = config.cor_miolo === "pb"
    ? PRECO_PAPEL_PB[config.papel_miolo]
    : PRECO_PAPEL_COR[config.papel_miolo];
  const custoMioloUnit = precoPapel * config.paginas;

  const formatoInfo = FORMATO_INFO[config.formato];
  const larguraCapa = formatoInfo.largura_capa_sem_orelhas_cm
    + (config.com_orelhas ? 2 * formatoInfo.largura_orelha_cm : 0);
  const faixasCapa = CAPA_POR_ACABAMENTO[config.acabamento_capa];
  const faixaCapa = faixasCapa.find(f => larguraCapa <= f.ate_cm)!;
  const custoCapaUnit = config.com_orelhas ? faixaCapa.com_orelhas : faixaCapa.sem_orelhas;

  const faixaEnc = ENCADERNACAO_FAIXAS.find(
    f => config.paginas >= f.min_paginas && config.paginas <= f.max_paginas,
  );
  if (!faixaEnc) {
    return {
      ok: false,
      erro: `Não há encadernação disponível para ${config.paginas} páginas.`,
      codigo: "PAGINAS_INVALIDAS",
    };
  }
  const custoEncadernacaoUnit = faixaEnc.preco;

  const subtotalUnit = custoMioloUnit + custoCapaUnit + custoEncadernacaoUnit;

  const faixaTir = FAIXAS_TIRAGEM.find(f => config.tiragem >= f.min && config.tiragem <= f.max)!;
  const custoUnitComMult = subtotalUnit * faixaTir.multiplicador;

  const setupRateado = SETUP_TITULO_REAIS / config.tiragem;
  const custoPorExemplar = custoUnitComMult + setupRateado;

  const subtotalProdutos = custoPorExemplar * config.tiragem;

  const regiao = config.cep_entrega ? inferirRegiao(config.cep_entrega) : "desconhecida";
  const freteEstimado = FRETE_POR_REGIAO[regiao];

  const total = subtotalProdutos + freteEstimado;

  return {
    ok: true,
    orcamento: {
      custo_miolo_unit_reais: round2(custoMioloUnit),
      custo_capa_unit_reais: round2(custoCapaUnit),
      custo_encadernacao_unit_reais: round2(custoEncadernacaoUnit),
      subtotal_unit_reais: round2(subtotalUnit),
      multiplicador_tiragem: faixaTir.multiplicador,
      custo_unit_com_multiplicador_reais: round2(custoUnitComMult),
      setup_titulo_reais: SETUP_TITULO_REAIS,
      setup_rateado_unit_reais: round2(setupRateado),
      custo_por_exemplar_reais: round2(custoPorExemplar),
      subtotal_produtos_reais: round2(subtotalProdutos),
      frete_estimado_reais: freteEstimado,
      total_reais: round2(total),
      total_centavos: Math.round(total * 100),
      prazo_producao_dias: faixaEnc.prazo_dias,
      encadernacao_tecnica: faixaEnc.tecnica,
      faixa_tiragem_label: faixaTir.label,
      regiao_frete: regiao,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Labels helpers (para UI) ─────────────────────────────────────────────

export const PAPEL_LABELS: Record<PapelMiolo, string> = {
  offset_75g: "Offset branco 75g/m²",
  avena_80g: "Avena creme 80g/m²",
  polen_bold_90g: "Pólen Bold 90g/m² (premium)",
  couche_fosco_90g: "Couché fosco 90g/m² (só para colorido)",
};

export const ACABAMENTO_LABELS: Record<AcabamentoCapa, string> = {
  fosca_bopp: "Laminação fosca (BOPP fosco)",
  brilho_bopp: "Laminação brilho (BOPP brilho)",
  verniz_uv: "Verniz UV total",
};

export const REGIAO_LABELS: Record<RegiaoFrete, string> = {
  sul_sudeste: "Sul e Sudeste",
  centro_oeste: "Centro-Oeste",
  norte_nordeste: "Norte e Nordeste",
  desconhecida: "Estimativa geral",
};

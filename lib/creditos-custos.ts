// lib/creditos-custos.ts
//
// FONTE ÚNICA de custos em créditos (1 crédito = R$ 1). Módulo PURO —
// zero imports de server — porque o registry (client) exibe preços daqui.
// Mesma lição de lib/segmentar-capitulos.ts: núcleo puro apartado.
// Novas ações consumidoras de crédito entram AQUI.

import { PLANO_PRECO_CENTAVOS } from "./planos";

export const CUSTOS_CREDITOS = {
  // Pool de imagens DENTRO de projeto com plano (B2-05b, intacto)
  imagem_capa_extra: 10,
  pacote_imagens_capa: 30,
  // Planos por projeto (PLANO-CREDITOS): paridade com a fonte de preço
  plano_essencial: PLANO_PRECO_CENTAVOS.essencial / 100, // 197
  plano_pro: PLANO_PRECO_CENTAVOS.pro / 100,             // 397
  upgrade_pro:
    (PLANO_PRECO_CENTAVOS.pro - PLANO_PRECO_CENTAVOS.essencial) / 100, // 200
  // Ferramentas avulsas (FASE 3; martelada 31/ago: avulso ≠ pool)
  diagnostico: 30, // Diagnóstico editorial avulso (unificado 01/set)
  revisao_completa: 150,
  epub_avulso: 50,
  diagramacao_digital: 100,
  diagramacao_completa: 150,
  capa_avulsa: 50, // capa com IA avulsa — produto único, inclui 4 gerações da frente (martelada 02/set)
  capa_avulsa_imagem: 20,
  capa_avulsa_pacote: 60,
} as const;

export type AcaoCredito = keyof typeof CUSTOS_CREDITOS;

/** Gerações INCLUÍDAS no produto capa avulsa (martelada revisada 02/set:
 *  experiência completa — frente, verso e capa única). Única debita 1 de
 *  cada partição (regra 05k) → até 4 únicas. Extras via pool avulso. */
export const INCLUSO_CAPA_AVULSA = { frente: 4, verso: 4 } as const;

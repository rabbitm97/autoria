// lib/diagnostico-avulso.ts — config da ferramenta avulsa de diagnóstico.
// Puro (sem imports de server): usado pelo motor, pelo relatório e pelo
// wizard (client). Rotas do Next não podem exportar constantes, por isso
// vive aqui.
import type { AcaoCredito } from "./creditos-custos";

export type ModoDiagnostico = "completo" | "expresso";

/** Expresso = primeiros N fragmentos de fragmentarParaDiagnostico (decisão 01/set). */
export const AMOSTRA_EXPRESSO_FRAGMENTOS = 3;

export const FERRAMENTA_ID_POR_MODO: Record<ModoDiagnostico, string> = {
  completo: "diagnostico-completo",
  expresso: "diagnostico-expresso",
};

export const ACAO_POR_MODO: Record<ModoDiagnostico, AcaoCredito> = {
  completo: "diagnostico_completo",
  expresso: "diagnostico_expresso",
};

export function isModoDiagnostico(v: unknown): v is ModoDiagnostico {
  return v === "completo" || v === "expresso";
}

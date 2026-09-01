// lib/diagnostico-avulso.ts — config da ferramenta avulsa de diagnóstico.
// Puro (sem imports de server). Unificado em 01/set: um Diagnóstico.
import type { AcaoCredito } from "./creditos-custos";

export type ModoDiagnostico = "completo" | "expresso";

export const FERRAMENTA_ID_DIAGNOSTICO = "diagnostico";
export const ACAO_DIAGNOSTICO: AcaoCredito = "diagnostico";

/** Amostra DORMENTE (motor aceita modo:"expresso" no body; nenhuma UI
 *  envia). Reservado para futura isca gratuita. */
export const AMOSTRA_EXPRESSO_FRAGMENTOS = 3;

export function isModoDiagnostico(v: unknown): v is ModoDiagnostico {
  return v === "completo" || v === "expresso";
}

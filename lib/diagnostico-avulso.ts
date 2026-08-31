// lib/diagnostico-avulso.ts
// Config puro para a ferramenta de diagnóstico avulso (FERR-3.1).
// Sem imports de server — safe para wizard client.

import type { AcaoCredito } from "./creditos-custos";

/** Fragmentos analisados no modo Expresso. */
export const FRAGMENTOS_EXPRESSO = 3;

export type ModoDiagnostico = "expresso" | "completo";

export function ferramentaParaModo(ferramentaId: string): ModoDiagnostico | null {
  if (ferramentaId === "diagnostico-expresso") return "expresso";
  if (ferramentaId === "diagnostico-completo") return "completo";
  return null;
}

export const ACAO_POR_MODO: Record<ModoDiagnostico, AcaoCredito> = {
  expresso: "diagnostico_expresso",
  completo: "diagnostico_completo",
};

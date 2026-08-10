/**
 * FLOW-NEXT: valida um destino de redirect pós-auth.
 * Só aceita caminho interno: começa com "/" e não com "//" (evita
 * open redirect protocolo-relativo). Qualquer outra coisa → null.
 */
export function safeNext(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  return valor;
}

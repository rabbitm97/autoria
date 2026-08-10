// Vetores de teste (determinísticos):
//   978853590277  → DV 8   (9788535902778 ok, prefixo 978 = ISBN)
//   978650000000  → DV 9   (9786500000009 ok, prefixo 978 = ISBN)

/** Remove tudo que não for dígito (hífens, espaços, letras). */
export function limparIsbn(entrada: string): string {
  return (entrada ?? "").replace(/\D/g, "");
}

/**
 * Dígito verificador EAN-13 dos 12 primeiros dígitos.
 * Pesos alternados 1, 3, 1, 3, ...; dv = (10 - soma % 10) % 10.
 */
export function digitoVerificadorEan13(doze: string): number {
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    const d = doze.charCodeAt(i) - 48;
    soma += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (soma % 10)) % 10;
}

export type ValidacaoIsbn =
  | { ok: true; codigo: string; tipo: "isbn" | "ean13" }
  | { ok: false; erro: string; sugestao?: string };

/**
 * Valida a entrada do usuário e devolve um EAN-13 pronto pra renderização,
 * ou uma mensagem de erro com sugestão quando possível.
 */
export function validarIsbn(entrada: string): ValidacaoIsbn {
  const puros = limparIsbn(entrada);

  if (puros.length === 0) {
    return { ok: false, erro: "Cole ou digite o ISBN-13 do seu livro." };
  }

  if (puros.length === 12) {
    const dv = digitoVerificadorEan13(puros);
    return {
      ok: false,
      erro: "Faltou o dígito verificador — o ISBN-13 tem 13 dígitos.",
      sugestao: `${puros}${dv}`,
    };
  }

  if (puros.length !== 13) {
    return {
      ok: false,
      erro: `O ISBN-13 tem 13 dígitos — você digitou ${puros.length}.`,
    };
  }

  const doze = puros.slice(0, 12);
  const dvInformado = puros.charCodeAt(12) - 48;
  const dvCorreto = digitoVerificadorEan13(doze);

  if (dvInformado !== dvCorreto) {
    return {
      ok: false,
      erro: `Dígito verificador incorreto (deveria ser ${dvCorreto}).`,
      sugestao: `${doze}${dvCorreto}`,
    };
  }

  const prefixo = puros.slice(0, 3);
  const tipo: "isbn" | "ean13" = prefixo === "978" || prefixo === "979" ? "isbn" : "ean13";
  return { ok: true, codigo: puros, tipo };
}

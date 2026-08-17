// Client-only (document/canvas). Núcleo único do barcode ISBN — editor
// de capa e ferramenta pública delegam (V47). EDITOR-FIX-1, 17/ago.

import { validarIsbn, type ValidacaoIsbn } from "@/lib/isbn";

type ValidacaoOk = Extract<ValidacaoIsbn, { ok: true }>;

// bwip-js: import dinâmico via subpath /browser (mantém o node build fora do
// bundle do cliente).
type BwipModule = typeof import("bwip-js/browser");
export async function loadBwip(): Promise<BwipModule> {
  return await import("bwip-js/browser");
}

// Fonte única do texto passado ao BWIPP.
// - EAN-13 (não-ISBN): dígitos puros.
// - ISBN com hífens do usuário: respeita a estrutura editorial que ele quer
//   (só usa entrada bruta se, tirando os hífens, os dígitos batem com o código).
// - ISBN sem hífens: BWIPP `isbn` exige 17 chars (13 dígitos + 4 hífens em
//   posições estruturais). Fallback 3-2-5-2-1 (prefix-group-publisher-title-check)
//   — testado como universalmente aceito para qualquer ISBN-13 com DV correto.
//   Não pretende refletir a faixa real da Agência do ISBN (isso exigiria as
//   tabelas de registrant range da GS1 — fora de escopo).
export function textoParaBwip(validacao: ValidacaoOk, entradaOriginal: string): string {
  if (validacao.tipo === "ean13") return validacao.codigo;
  const soft = entradaOriginal.replace(/[^\d-]/g, "");
  if (soft.includes("-") && soft.replace(/-/g, "") === validacao.codigo) return soft;
  const c = validacao.codigo;
  return `${c.slice(0, 3)}-${c.slice(3, 5)}-${c.slice(5, 10)}-${c.slice(10, 12)}-${c.slice(12, 13)}`;
}

// Fonte única das opções de render — preview, SVG e PNG usam este mesmo
// objeto (só `scale` varia por finalidade). O BWIPP desenha sozinho o
// layout editorial: linha "ISBN ..." em cima (só bcid "isbn"), primeiro
// dígito fora à esquerda, dois grupos de seis, guardas descendo entre eles
// e ">" da zona de silêncio à direita.
export function opcoesBarcode(validacao: ValidacaoOk, entradaOriginal: string, scale: number) {
  return {
    bcid: validacao.tipo,
    text: textoParaBwip(validacao, entradaOriginal),
    includetext: true,
    guardwhitespace: true,
    height: 22,
    backgroundcolor: "FFFFFF",
    paddingwidth: 6,
    paddingheight: 6,
    scale,
  };
}

/** Gera o barcode ISBN/EAN-13 como PNG dataURL (client-only: usa
 *  document/canvas). Layout editorial completo do BWIPP (linha "ISBN"
 *  quando aplicável, guardas, zona de silêncio). Retorna null se o
 *  código for inválido segundo lib/isbn. */
export async function gerarBarcodePngDataUrl(
  entrada: string,
  scale = 4,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const validacao = validarIsbn(entrada);
  if (!validacao.ok) return null;
  try {
    const bwipjs = await loadBwip();
    const canvas = document.createElement("canvas");
    bwipjs.toCanvas(canvas, opcoesBarcode(validacao, entrada, scale));
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

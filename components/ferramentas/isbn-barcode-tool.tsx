"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { validarIsbn, type ValidacaoIsbn } from "@/lib/isbn";

// bwip-js: import dinâmico via subpath /browser (mantém o node build fora do
// bundle do cliente). Precedente: app/editor/capa/[project_id]/lib/barcode.ts.
type BwipModule = typeof import("bwip-js/browser");
async function loadBwip(): Promise<BwipModule> {
  return await import("bwip-js/browser");
}

// Preserva os hífens que o usuário digitou pra linha "ISBN 978-..." acima
// das barras; só usa o entrada bruto se, tirando os hífens, bater com o
// código de 13 dígitos validado (evita passar lixo pro BWIPP).
function textoIsbn(entradaRaw: string, codigo13: string): string {
  const soft = entradaRaw.replace(/[^\d-]/g, "");
  if (soft.includes("-") && soft.replace(/-/g, "") === codigo13) return soft;
  return codigo13;
}

// Fonte única das opções de render — preview, SVG e PNG usam este mesmo
// objeto (só `scale` varia por finalidade). O BWIPP desenha sozinho o
// layout editorial: linha "ISBN ..." em cima (só bcid "isbn"), primeiro
// dígito fora à esquerda, dois grupos de seis, guardas descendo entre eles
// e ">" da zona de silêncio à direita.
function opcoesBarcode(
  codigo: string,
  tipo: "isbn" | "ean13",
  entradaRaw: string,
  scale: number,
) {
  return {
    bcid: tipo,
    text: tipo === "isbn" ? textoIsbn(entradaRaw, codigo) : codigo,
    includetext: true,
    guardwhitespace: true,
    height: 22,
    backgroundcolor: "FFFFFF",
    paddingwidth: 6,
    paddingheight: 6,
    scale,
  };
}

function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function IsbnBarcodeTool() {
  const [entrada, setEntrada] = useState("");
  const [validacao, setValidacao] = useState<ValidacaoIsbn>(() => validarIsbn(""));
  const [renderError, setRenderError] = useState<string | null>(null);
  const [baixando, setBaixando] = useState<"svg" | "png" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setValidacao(validarIsbn(entrada));
  }, [entrada]);

  const codigoValido = validacao.ok ? validacao.codigo : null;
  const tipoValido = validacao.ok ? validacao.tipo : null;

  // Preview no canvas sempre que houver código válido. Entrada bruta entra
  // na dep pra que ligar/desligar hífens re-renderize a linha "ISBN ...".
  useEffect(() => {
    if (!codigoValido || !tipoValido) {
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext("2d");
        ctx?.clearRect(0, 0, c.width, c.height);
      }
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        const bwipjs = await loadBwip();
        if (cancelado || !canvasRef.current) return;
        bwipjs.toCanvas(canvasRef.current, opcoesBarcode(codigoValido, tipoValido, entrada, 3));
        setRenderError(null);
      } catch (err) {
        console.error("[isbn-barcode] preview:", err);
        setRenderError("Não foi possível gerar o preview. Tente outro código.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [codigoValido, tipoValido, entrada]);

  const aplicarSugestao = useCallback(() => {
    if (!validacao.ok && validacao.sugestao) setEntrada(validacao.sugestao);
  }, [validacao]);

  async function baixarSvg() {
    if (!codigoValido || !tipoValido) return;
    setBaixando("svg");
    try {
      const bwipjs = await loadBwip();
      const svg = bwipjs.toSVG(opcoesBarcode(codigoValido, tipoValido, entrada, 3));
      baixarBlob(new Blob([svg], { type: "image/svg+xml" }), `isbn-${codigoValido}.svg`);
    } catch (err) {
      console.error("[isbn-barcode] svg:", err);
      setRenderError("Falha ao gerar SVG.");
    } finally {
      setBaixando(null);
    }
  }

  async function baixarPng() {
    if (!codigoValido || !tipoValido) return;
    setBaixando("png");
    try {
      const bwipjs = await loadBwip();
      const off = document.createElement("canvas");
      bwipjs.toCanvas(off, opcoesBarcode(codigoValido, tipoValido, entrada, 4));
      await new Promise<void>((resolve) => {
        off.toBlob((blob) => {
          if (blob) baixarBlob(blob, `isbn-${codigoValido}.png`);
          resolve();
        }, "image/png");
      });
    } catch (err) {
      console.error("[isbn-barcode] png:", err);
      setRenderError("Falha ao gerar PNG.");
    } finally {
      setBaixando(null);
    }
  }

  const naoIsbn = validacao.ok && validacao.tipo === "ean13";
  const disabled = !codigoValido || baixando !== null;

  return (
    <div>
      <main className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Ferramenta
          </p>
          <h1 className="font-heading text-3xl text-brand-primary mb-2">
            Gerador de código de barras ISBN
          </h1>
          <p className="text-zinc-500 text-sm">
            Cole o ISBN-13 do seu livro e baixe o código de barras EAN-13 pronto para a capa.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Input card */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <h2 className="font-heading text-lg text-brand-primary mb-5">ISBN-13 do seu livro</h2>

            <label className="block">
              <span className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
                Cole ou digite o ISBN
              </span>
              <input
                type="text"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                placeholder="978-65-XXXXX-XX-X"
                inputMode="numeric"
                autoComplete="off"
                className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
              />
            </label>

            <p className="mt-1.5 text-xs text-zinc-400">
              Dica: digite com hífens (<span className="font-mono">978-65-XXXXX-XX-X</span>) pra
              linha ISBN sair formatada acima do código.
            </p>

            {/* Erro de validação */}
            {!validacao.ok && entrada.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-sm text-amber-800">{validacao.erro}</p>
                {validacao.sugestao && (
                  <button
                    onClick={aplicarSugestao}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono text-amber-900 underline underline-offset-4 hover:text-amber-950"
                  >
                    Usar {validacao.sugestao}
                  </button>
                )}
              </div>
            )}

            {/* Aviso EAN-13 não-ISBN */}
            {naoIsbn && (
              <div className="mt-4 rounded-xl bg-zinc-50 border border-zinc-200 p-3">
                <p className="text-sm text-zinc-700">
                  Este código é um <strong>EAN-13 válido</strong>, mas não começa com{" "}
                  <strong>978</strong> ou <strong>979</strong> (prefixos de ISBN). Vai gerar o
                  código de barras mesmo assim.
                </p>
              </div>
            )}

            {/* Estado inicial */}
            {entrada.length === 0 && (
              <p className="mt-4 text-xs text-zinc-400">
                Exemplo válido:{" "}
                <button
                  onClick={() => setEntrada("978-85-359-0277-8")}
                  className="font-mono text-zinc-500 underline underline-offset-4 hover:text-brand-gold"
                >
                  978-85-359-0277-8
                </button>
              </p>
            )}
          </div>

          {/* Preview + downloads */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <h2 className="font-heading text-lg text-brand-primary mb-5">Preview</h2>

            <div className="w-full min-h-[140px] rounded-xl border border-zinc-100 bg-zinc-50 flex items-center justify-center p-4 mb-5">
              {codigoValido ? (
                <canvas ref={canvasRef} className="max-w-full h-auto" />
              ) : (
                <p className="text-xs text-zinc-400 text-center">
                  {entrada.length === 0
                    ? "Digite um ISBN-13 acima para ver o código de barras."
                    : "Corrija o ISBN acima para visualizar."}
                </p>
              )}
            </div>

            {renderError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                {renderError}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={baixarSvg}
                disabled={disabled}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Baixar SVG (vetor)</span>
                <span className="text-xs opacity-70">
                  {baixando === "svg" ? "Gerando…" : "para InDesign, Illustrator"}
                </span>
              </button>
              <button
                onClick={baixarPng}
                disabled={disabled}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-200 text-brand-primary text-sm font-semibold hover:border-brand-gold/40 hover:bg-zinc-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>Baixar PNG (alta resolução)</span>
                <span className="text-xs text-zinc-500">
                  {baixando === "png" ? "Gerando…" : "≈ 300 dpi"}
                </span>
              </button>
            </div>

            <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
              No layout da capa, dimensione para <strong>~37 mm de largura</strong> (tamanho
              nominal). Imprima sempre em preto sobre fundo claro.
            </p>
          </div>
        </div>

        {/* Info block */}
        <div className="mt-6 bg-brand-primary/5 rounded-xl border border-brand-primary/10 px-5 py-4 space-y-2">
          <p className="text-sm text-zinc-600 leading-relaxed">
            <strong className="text-brand-primary">O que é isso?</strong> O EAN-13 é o código de
            barras internacional que a partir do ISBN identifica o livro nas livrarias e
            distribuidores. Vai impresso na <strong>quarta capa</strong>, geralmente no canto
            inferior, ao lado do preço.
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            <strong className="text-brand-primary">Importante:</strong> esta ferramenta gera o{" "}
            <em>código de barras</em> a partir de um ISBN que você já tem. O <strong>ISBN em si</strong>{" "}
            é emitido pela <strong>CBL — Câmara Brasileira do Livro</strong> (via{" "}
            <a
              href="https://www.cblservicos.org.br/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 text-brand-primary hover:text-brand-gold"
            >
              cblservicos.org.br
            </a>
            ).
          </p>
        </div>
      </main>
    </div>
  );
}

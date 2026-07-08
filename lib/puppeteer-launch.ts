// lib/puppeteer-launch.ts
//
// Helper de retry para puppeteer.launch(). Resolve a race condition
// ETXTBSY que acontece em cold start do Vercel Serverless com
// @sparticuz/chromium: a extração lazy do binário para /tmp pode não
// terminar antes do spawn(), retornando ETXTBSY. Retry funciona porque
// segunda tentativa já encontra o binário pronto no /tmp.
//
// Uso:
//   const browser = await launchWithRetry({
//     args: chromium.args,
//     executablePath: await chromium.executablePath(),
//     headless: true,
//   });
//
// Compartilhado por gerar-pdf e gerar-pdf-digital.

import puppeteer, { type Browser, type LaunchOptions } from "puppeteer-core";

function isETXTBSY(err: unknown): boolean {
  const e = err as { code?: string };
  return e?.code === "ETXTBSY";
}

/**
 * Chama puppeteer.launch() com retry específico para ETXTBSY.
 * Outros erros são propagados imediatamente (sem retry).
 *
 * Backoff: 1s → 2s → 3s (soma máxima 6s, dentro do orçamento do maxDuration).
 * Total: até 3 tentativas.
 */
export async function launchWithRetry(
  opts: LaunchOptions,
  maxAttempts = 3,
): Promise<Browser> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await puppeteer.launch(opts);
    } catch (err) {
      lastError = err;

      if (!isETXTBSY(err) || attempt === maxAttempts) {
        throw err;
      }

      const waitMs = attempt * 1000;
      console.warn(
        `[puppeteer-launch] ETXTBSY (attempt ${attempt}/${maxAttempts}), ` +
          `waiting ${waitMs}ms before retry...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError ?? new Error("launchWithRetry: unreachable");
}

"use client";

import { useEffect, useState } from "react";
import useImage from "use-image";

/** EDITOR-FIX-1C: downscale progressivo (mipmap) pra fontes muito
 *  maiores que o destino. Canvas faz drawImage de 1 passo com filtro
 *  fraco; reduzir por metades sucessivas até ≤2× o alvo elimina o
 *  serrilhado no ecrã E no export (paper px = 300dpi, então 2× o box
 *  em paper px cobre o print com sobra).
 *  alvoPx: largura do box em paper px. PISO_PX garante headroom se o
 *  autor ampliar o elemento depois. */
const PISO_PX = 1024;

export function useImagemSuavizada(
  src: string,
  alvoPx: number,
): HTMLImageElement | HTMLCanvasElement | undefined {
  const [img] = useImage(src, "anonymous");
  const [suavizada, setSuavizada] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setSuavizada(null);
    if (!img) return;
    const alvo = Math.max(Math.ceil(alvoPx * 2), PISO_PX);
    if (img.naturalWidth <= alvo * 1.25) return; // já perto do alvo: usa direto
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    let fonte: HTMLImageElement | HTMLCanvasElement = img;
    while (w / 2 >= alvo) {
      w = Math.round(w / 2);
      h = Math.round(h / 2);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(fonte, 0, 0, w, h);
      fonte = c;
    }
    setSuavizada(fonte === img ? null : (fonte as HTMLCanvasElement));
  }, [img, alvoPx]);

  return suavizada ?? img ?? undefined;
}

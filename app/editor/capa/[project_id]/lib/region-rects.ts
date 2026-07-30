import { FORMATS, SANGRIA_MM, calcularLombada } from "./dimensions";
import { CAPA_IA_ASPECT_H, CAPA_IA_ASPECT_W } from "./constants";
import { getRatioArteUnica } from "@/lib/formatos";
import type { Region } from "./elements";
import type { EditorLayout, FormatKey } from "../types";

export interface RegionRect {
  x: number;      // mm from left edge of full paper (sangria included)
  y: number;      // mm from top edge of full paper
  width: number;  // mm
  height: number; // mm
}

// ─── Sobreposição anti-costura ────────────────────────────────────────────────
// Sem overlap, os rects vizinhos compartilham uma borda exata. O rasterizador
// aplica anti-aliasing nas duas faces dessa borda e o fundo do canvas (branco)
// aparece como uma linha de 1px na costura. Expandindo cada lado interno em
// fração de mm, os vizinhos se sobrepõem levemente e o pixel de fronteira
// sempre carrega cor de uma das duas regiões — nunca branco. As bordas
// externas do papel (que já mordem na sangria de 3mm) não são tocadas.
//
// Escolha dos valores: 300 DPI ⇒ 1 px ≈ 0,0847 mm.
//  - Fills fill↔fill (contracapa/orelhas/lombada-verso): ~1,5 px de cada lado
//    é suficiente porque os dois vizinhos são cores sólidas opacas.
//  - Fill LOMBADA↔FRENTE: o vizinho da frente é a IMAGEM IA clipada, cujo
//    AA nas bordas do clip é mais agressivo que o AA entre dois fills. A
//    lombada expande ~3 px para dentro da frente por baixo da imagem —
//    invisível (cor sólida por baixo de arte opaca) e cobre a costura.
//  - Clip da imagem IA: expande em AMBOS os lados internos (orelha frente
//    E lombada) por ~1 px. O clipFunc do Konva recorta com borda dura e a
//    dependência do AA do clip varia por navegador — só a expansão do fill
//    sob a imagem (LOMBADA_FRENTE_OVERLAP_MM) não bastou empiricamente.
//    Somando arte por cima do vinco (0,09 mm ≈ 1 px) o pixel de costura
//    fica sempre carregado por uma das duas fontes (fill sólido por baixo
//    OU arte por cima), eliminando o branco residual. 0,09 mm de arte
//    cruzando o vinco é invisível (o vinco dobra ali e a diferença de
//    conteúdo entre arte e lombada é mínima nos ~1 px afetados).
export const FILL_OVERLAP_MM = 0.13;
export const LOMBADA_FRENTE_OVERLAP_MM = 0.25;
export const CLIP_OVERLAP_MM = 0.09;

/**
 * Bordas laterais INTERNAS (que tocam outra região) para cada region na
 * configuração dada. Bordas externas (que mordem no bleed) retornam false.
 * Y é sempre externo (papel inteiro).
 */
function getInternalBorders(
  region: Region,
  temOrelhas: boolean,
): { left: boolean; right: boolean } {
  switch (region) {
    case "orelha_verso":  return { left: false,      right: true };
    case "contracapa":    return { left: temOrelhas, right: true };
    case "lombada":       return { left: true,       right: true };
    case "capa":          return { left: true,       right: temOrelhas };
    case "orelha_frente": return { left: true,       right: false };
  }
}

/**
 * Deltas de sobreposição (mm) por lado para o fill de cada região.
 * Zero em lados externos. Assimétrico: a lombada usa `LOMBADA_FRENTE_OVERLAP_MM`
 * (~3 px) no lado que toca a frente porque o vizinho ali é a imagem IA
 * clipada — AA mais agressivo exige cobertura mais generosa por baixo da
 * arte.
 */
function getFillDeltas(
  region: Region,
  temOrelhas: boolean,
): { left: number; right: number } {
  const borders = getInternalBorders(region, temOrelhas);
  const left = borders.left ? FILL_OVERLAP_MM : 0;
  const right = borders.right ? FILL_OVERLAP_MM : 0;
  if (region === "lombada") {
    // Lombada tem frente à direita e contracapa à esquerda. Só o lado da
    // frente pede overlap ampliado (o outro é fill↔fill).
    return { left, right: LOMBADA_FRENTE_OVERLAP_MM };
  }
  return { left, right };
}

/**
 * Aplica sobreposição assimétrica em mm nas laterais. `y`/`height` intocados.
 */
function expandRectSides(
  rect: RegionRect,
  deltas: { left: number; right: number },
): RegionRect {
  return {
    x: rect.x - deltas.left,
    y: rect.y,
    width: rect.width + deltas.left + deltas.right,
    height: rect.height,
  };
}

/**
 * Returns the bleed-aware fill rectangle for a region.
 *
 * Regions on the outer physical edge (contracapa left, capa right, orelhas)
 * extend 3mm into the bleed so no white stripe appears after trimming.
 * Inner fold edges never extend — the fold itself is the boundary.
 *
 * Y always spans the full paper height (0 → height_mm + 2×sangria) so the
 * top and bottom bleeds are always covered.
 *
 * `options.overlap` (opcional): quando true, expande cada borda INTERNA
 * em `FILL_OVERLAP_MM` para os vizinhos se sobreporem no render — evita
 * costura branca de anti-aliasing entre regiões. Use no paint (canvas do
 * editor e export). Não use no cálculo geométrico (reanchor, anchored
 * rect, etc.) — esses precisam do rect canônico.
 */
export function getFillRect(
  region: Region,
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  options?: { overlap?: boolean },
): RegionRect | null {
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const alturaTotal = f.height_mm + 2 * SANGRIA_MM;
  const temOrelhas = orelhaMm > 0;
  const orelha = temOrelhas ? orelhaMm : 0;

  let x_start: number;
  let x_end: number;

  if (region === "orelha_verso") {
    if (!temOrelhas) return null;
    // Left-most region — extends into left bleed (outer edge)
    x_start = 0;
    x_end = SANGRIA_MM + orelha;
  } else if (region === "contracapa") {
    if (temOrelhas) {
      // Bounded by orelha_verso fold (left) and lombada fold (right) — no extension
      x_start = SANGRIA_MM + orelha;
      x_end = x_start + f.width_mm;
    } else {
      // Left-most region without flaps — extends into left bleed (outer edge)
      x_start = 0;
      x_end = SANGRIA_MM + f.width_mm;
    }
  } else if (region === "lombada") {
    // Bounded by folds on both sides — no lateral extension
    x_start = SANGRIA_MM + orelha + f.width_mm;
    x_end = x_start + lombada;
  } else if (region === "capa") {
    if (temOrelhas) {
      // Bounded by lombada fold (left) and orelha_frente fold (right) — no extension
      x_start = SANGRIA_MM + orelha + f.width_mm + lombada;
      x_end = x_start + f.width_mm;
    } else {
      // Right-most region without flaps — extends into right bleed (outer edge)
      x_start = SANGRIA_MM + f.width_mm + lombada;
      x_end = x_start + f.width_mm + SANGRIA_MM;
    }
  } else if (region === "orelha_frente") {
    if (!temOrelhas) return null;
    // Right-most region — extends into right bleed (outer edge)
    x_start = SANGRIA_MM + orelha + 2 * f.width_mm + lombada;
    x_end = x_start + orelha + SANGRIA_MM;
  } else {
    return null;
  }

  const base: RegionRect = {
    x: x_start,
    y: 0,
    width: x_end - x_start,
    height: alturaTotal,
  };
  if (!options?.overlap) return base;
  return expandRectSides(base, getFillDeltas(region, temOrelhas));
}

/**
 * Rect da REGIÃO da FRENTE (área visível pintada, sem expansão para cover):
 *  - `layout="frente"`: papel inteiro (frente + sangria em todos os lados);
 *  - `layout="panoramica"`: rect canônico da região "capa" (com orelhas =
 *    entre folds; sem orelhas = frente + sangria externa).
 * Usado como base para (a) clip da arte da IA e (b) cálculo do anchored
 * rect com fit-cover. B2-05 usará `getVersoRect` (contracapa) espelhando
 * este contrato.
 */
export function getFrenteRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect {
  const f = FORMATS[format];
  if (layout === "frente") {
    return {
      x: 0,
      y: 0,
      width: f.width_mm + SANGRIA_MM * 2,
      height: f.height_mm + SANGRIA_MM * 2,
    };
  }
  const canonical = getFillRect("capa", format, pages, orelhaMm);
  return canonical ?? {
    x: SANGRIA_MM + f.width_mm + calcularLombada(pages),
    y: 0,
    width: f.width_mm + SANGRIA_MM,
    height: f.height_mm + SANGRIA_MM * 2,
  };
}

/**
 * Rect da REGIÃO do VERSO (contracapa) para clip da arte de verso e reanchor
 * de smart fields do verso. Panorâmica apenas — em `layout="frente"` não há
 * contracapa (retorna null). Reserva o contrato do B2-05.
 */
export function getVersoRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect | null {
  if (layout === "frente") return null;
  return getFillRect("contracapa", format, pages, orelhaMm);
}

/**
 * Rect de CLIP do grupo capa-ia-frente. Idêntico ao rect canônico da frente,
 * expandido em `CLIP_OVERLAP_MM` nos DOIS lados internos: ORELHA FRENTE
 * (quando há orelhas) e LOMBADA (sempre em panorâmica). A lombada por baixo
 * já expande sob a imagem via `LOMBADA_FRENTE_OVERLAP_MM`, mas empiricamente
 * essa cobertura por baixo sozinha não elimina a costura em todos os
 * browsers — o clipFunc do Konva usa borda dura e o AA varia. Somando arte
 * por cima do vinco (~1 px), o pixel fica sempre coberto por uma das duas
 * fontes (fill sólido embaixo OU arte por cima). Em `layout="frente"` não
 * há vizinhos internos — retorna o rect base intacto.
 */
export function getCapaIaClipRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect {
  const rect = getFrenteRect(format, pages, orelhaMm, layout);
  if (layout === "frente") return rect;
  const temOrelhas = orelhaMm > 0;
  return expandRectSides(rect, {
    left: CLIP_OVERLAP_MM,
    right: temOrelhas ? CLIP_OVERLAP_MM : 0,
  });
}

/**
 * Rect de CLIP do grupo capa-ia-verso. Espelho do da frente: verso é a
 * contracapa em layout panorâmico. Expande em `CLIP_OVERLAP_MM` nos lados
 * internos — LOMBADA (à direita da contracapa) e ORELHA_VERSO (à esquerda,
 * se houver orelhas). Em `layout="frente"` não existe verso (retorna null).
 */
export function getCapaIaVersoClipRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect | null {
  if (layout === "frente") return null;
  const rect = getVersoRect(format, pages, orelhaMm, layout);
  if (!rect) return null;
  const temOrelhas = orelhaMm > 0;
  return expandRectSides(rect, {
    left: temOrelhas ? CLIP_OVERLAP_MM : 0,
    right: CLIP_OVERLAP_MM,
  });
}

/**
 * Fit-cover centralizado de uma imagem com aspect `imgAspect` (w/h) dentro
 * do rect base. O excedente do cover é distribuído igual em ambos os lados
 * (metade cruza os vizinhos / metade os bleeds). No render o Group clipa
 * a região da frente/verso e no export a área fora do papel é clipada.
 */
function coverRect(rect: RegionRect, imgAspect: number): RegionRect {
  const rectAspect = rect.width / rect.height;
  let coverW: number;
  let coverH: number;
  if (imgAspect > rectAspect) {
    // Imagem é mais larga: fixar altura, excedente horizontal.
    coverH = rect.height;
    coverW = coverH * imgAspect;
  } else {
    // Imagem é mais estreita: fixar largura, excedente vertical.
    coverW = rect.width;
    coverH = coverW / imgAspect;
  }
  return {
    x: rect.x - (coverW - rect.width) / 2,
    y: rect.y - (coverH - rect.height) / 2,
    width: coverW,
    height: coverH,
  };
}

/**
 * Rect da região onde a arte da IA deve ser posicionada com FIT COVER
 * centralizado sobre a frente. Aspecto 2:3.
 */
export function getCapaIaAnchoredRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect {
  const rect = getFrenteRect(format, pages, orelhaMm, layout);
  return coverRect(rect, CAPA_IA_ASPECT_W / CAPA_IA_ASPECT_H);
}

/**
 * Rect da região onde a arte de verso deve ser posicionada com FIT COVER
 * centralizado sobre a contracapa. Mesmo aspecto 2:3 da frente. Retorna
 * null em `layout="frente"` (não há verso).
 */
export function getCapaIaVersoAnchoredRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect | null {
  const rect = getVersoRect(format, pages, orelhaMm, layout);
  if (!rect) return null;
  return coverRect(rect, CAPA_IA_ASPECT_W / CAPA_IA_ASPECT_H);
}

/**
 * Rect da REGIÃO ÚNICA (verso + lombada + capa) — arte panorâmica cobre
 * as três regiões como UMA imagem contínua. Igual ao spread canônico sem
 * orelhas (contracapa fold → capa fold), preservando as sangrias top/bottom.
 * Em layout="frente" não há arte única (retorna null).
 *
 * As orelhas (quando existem) NÃO fazem parte da arte única — permanecem
 * pintadas com a cor predominante. Isso é intencional: a IA gera 3-região
 * (contracapa + lombada + capa) e as orelhas ficam como faixa auxiliar.
 */
export function getUnicaRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect | null {
  if (layout === "frente") return null;
  const f = FORMATS[format];
  const lombada = calcularLombada(pages);
  const temOrelhas = orelhaMm > 0;
  const alturaTotal = f.height_mm + 2 * SANGRIA_MM;

  // Início do rect: onde termina a orelha_verso + fold (se houver),
  // ou o bleed esquerdo (se não houver). Mesmo raciocínio para o fim.
  const x_start = temOrelhas ? SANGRIA_MM + orelhaMm : 0;
  const largura = temOrelhas
    ? 2 * f.width_mm + lombada
    : 2 * f.width_mm + lombada + 2 * SANGRIA_MM;

  return { x: x_start, y: 0, width: largura, height: alturaTotal };
}

/**
 * Rect de CLIP do grupo capa-ia-unica. É o próprio spread — não há costura
 * interna porque a imagem cobre as 3 regiões como UMA. Só clipa contra os
 * bleeds externos / orelhas. Em `layout="frente"` não há unica (retorna null).
 */
export function getCapaIaUnicaClipRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect | null {
  return getUnicaRect(format, pages, orelhaMm, layout);
}

/**
 * Rect da posição fit-cover da arte única sobre o spread. O aspecto real
 * do spread muda com o nº de páginas (lombada) e formato; o Gemini gera
 * na proporção mais próxima suportada (3:2 ou 16:9). Ajustamos o cover
 * pelo aspecto GERADO, não pelo real — a IA teria distorcido a arte para
 * o real e o cover reintroduz o excedente pra fora do papel.
 */
export function getCapaIaUnicaAnchoredRect(
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  layout: EditorLayout,
): RegionRect | null {
  const rect = getUnicaRect(format, pages, orelhaMm, layout);
  if (!rect) return null;
  const ratioStr = getRatioArteUnica(format, pages);
  const [w, h] = ratioStr.split(":").map(Number);
  return coverRect(rect, w / h);
}

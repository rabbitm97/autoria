import type { AnyElement, RegionFills, SmartField, TextElement } from "./elements";
import { CAPA_IA_FRENTE_ID } from "./constants";
import { getFrenteRect, getCapaIaAnchoredRect, type RegionRect } from "./region-rects";
import { createSmartFieldElement, type SmartFieldContentMap, type PosicaoTitulo } from "./smart-field-layout";
import type { EditorLayout, FormatKey } from "../types";

/**
 * Smart fields cuja posição é recalculada automaticamente quando a geometria
 * do papel muda (orelhas ligam/desligam, layout troca, lombada diverge por
 * páginas). Título/subtítulo/autor vivem na região da frente e se movem
 * junto quando ela se desloca (ex.: ligar orelhas puxa a frente para a
 * direita em panorâmica; lombada real maior que a estimada também empurra).
 * Sinopse/bio/lombada têm âncoras próprias, não seguem esse contrato.
 */
export const SMART_FIELDS_REANCHOR: readonly SmartField[] = ["titulo", "subtitulo", "autor"];

/**
 * Retorna `true` quando o elemento tem "âncora canônica" para a região da
 * frente (posição calculada por default): o `capa-ia-frente` e os TextElement
 * de smart fields de título/subtítulo/autor. Usado para marcar `posicaoManual`
 * no dragend/transformend e para diferenciar reset-para-default × translação.
 */
export function isReanchorTarget(el: AnyElement | undefined): boolean {
  if (!el) return false;
  if (el.id === CAPA_IA_FRENTE_ID) return true;
  if (el.type === "text") {
    const smart = (el as TextElement).smartField;
    return smart !== null && (SMART_FIELDS_REANCHOR as readonly string[]).includes(smart);
  }
  return false;
}

export interface Geometria {
  format: FormatKey;
  pages: number;
  orelhaMm: number;
  layout: EditorLayout;
}

export interface ReanchorContext {
  title: string;
  subtitle: string;
  posicaoTitulo: PosicaoTitulo;
  fills: RegionFills;
}

/**
 * Diferença de origem da região da FRENTE entre duas geometrias.
 * Y sempre é 0 hoje (frente sempre toca topo/base do papel via sangria);
 * X varia com orelhas/lombada/layout.
 */
export function deltaFrenteRect(prev: Geometria, curr: Geometria): { dx: number; dy: number; prevRect: RegionRect; currRect: RegionRect } {
  const prevRect = getFrenteRect(prev.format, prev.pages, prev.orelhaMm, prev.layout);
  const currRect = getFrenteRect(curr.format, curr.pages, curr.orelhaMm, curr.layout);
  return {
    dx: currRect.x - prevRect.x,
    dy: currRect.y - prevRect.y,
    prevRect,
    currRect,
  };
}

/**
 * True quando o centro do elemento cai dentro do rect da frente PRÉVIO.
 * Usado para identificar elementos ancorados à frente por posição (sem
 * anotação explícita — o modelo de elementos não guarda a região).
 */
function isCenterInRect(el: AnyElement, rect: RegionRect): boolean {
  const cx = el.x_mm + el.width_mm / 2;
  const cy = el.y_mm + el.height_mm / 2;
  return (
    cx >= rect.x &&
    cx <= rect.x + rect.width &&
    cy >= rect.y &&
    cy <= rect.y + rect.height
  );
}

/**
 * Recalcula a posição dos elementos ancorados na FRENTE quando a origem da
 * região se desloca (orelhas, layout, lombada por páginas). Regra:
 *  - Elementos com âncora canônica (IA + smart fields título/subtítulo/autor):
 *      • `posicaoManual = false` → resetam para o rect default calculado
 *        na nova geometria (createSmartFieldElement / getCapaIaAnchoredRect);
 *      • `posicaoManual = true`  → transladam pelo delta da origem, preservam
 *        deslocamento relativo dentro da frente e tamanho ajustado pelo autor.
 *  - Demais elementos que caírem dentro do rect PRÉVIO da frente (custom
 *    text/shape/logo/etc.): sempre transladam pelo delta. Não têm default.
 *
 * A flag posicaoManual passa a significar apenas "não reposicionar para o
 * default calculado" — nunca isenta da translação, para não deixar elemento
 * ficar para trás quando a frente inteira se move.
 */
export function reanchorFrenteElements(
  prev: Geometria,
  curr: Geometria,
  ctx: ReanchorContext,
  updateElement: (id: string, patch: Partial<AnyElement>) => void,
  elements: AnyElement[],
): void {
  const { dx, dy, prevRect } = deltaFrenteRect(prev, curr);
  if (dx === 0 && dy === 0) return;

  const contentMap: SmartFieldContentMap = {
    titulo: ctx.title,
    subtitulo: ctx.subtitle,
  };

  elements.forEach((el) => {
    // IA — reset para fit-cover default se não manual; senão translada.
    if (el.id === CAPA_IA_FRENTE_ID && el.type === "image") {
      if (el.posicaoManual) {
        updateElement(el.id, { x_mm: el.x_mm + dx, y_mm: el.y_mm + dy });
      } else {
        const rect = getCapaIaAnchoredRect(curr.format, curr.pages, curr.orelhaMm, curr.layout);
        updateElement(el.id, {
          x_mm: rect.x,
          y_mm: rect.y,
          width_mm: rect.width,
          height_mm: rect.height,
        });
      }
      return;
    }

    // Smart fields de título/subtítulo/autor — reset canônico ou translação.
    if (el.type === "text") {
      const t = el as TextElement;
      if (t.smartField && (SMART_FIELDS_REANCHOR as readonly string[]).includes(t.smartField)) {
        if (t.posicaoManual) {
          updateElement(t.id, { x_mm: t.x_mm + dx, y_mm: t.y_mm + dy });
        } else {
          const template = createSmartFieldElement(
            t.smartField,
            curr.format,
            curr.pages,
            curr.orelhaMm,
            ctx.fills,
            contentMap,
            t.zIndex,
            { layout: curr.layout, posicaoTitulo: ctx.posicaoTitulo },
          );
          updateElement(t.id, {
            x_mm: template.x_mm,
            y_mm: template.y_mm,
            width_mm: template.width_mm,
            height_mm: template.height_mm,
          });
        }
        return;
      }
    }

    // Demais elementos: translada se o centro cai no rect prévio da frente.
    if (isCenterInRect(el, prevRect)) {
      updateElement(el.id, { x_mm: el.x_mm + dx, y_mm: el.y_mm + dy });
    }
  });
}

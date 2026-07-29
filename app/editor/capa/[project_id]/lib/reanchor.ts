import type { AnyElement, SmartField, TextElement } from "./elements";
import { CAPA_IA_FRENTE_ID } from "./constants";

/**
 * Smart fields cuja posição é recalculada automaticamente quando a geometria
 * do papel muda (orelhas ligam/desligam, layout troca). Título/subtítulo/autor
 * vivem na região da frente e se movem junto quando ela se desloca (ex.: ligar
 * orelhas puxa a frente para a direita em panorâmica). Sinopse/bio/lombada
 * têm âncoras próprias, não seguem esse contrato.
 */
export const SMART_FIELDS_REANCHOR: readonly SmartField[] = ["titulo", "subtitulo", "autor"];

/**
 * Retorna `true` quando o elemento é candidato à reancoragem automática:
 * o `capa-ia-frente` e os TextElement de smart fields de título/subtítulo/autor.
 * Usado para (a) marcar `posicaoManual: true` no dragend/transform e
 * (b) recalcular âncoras quando a geometria muda.
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

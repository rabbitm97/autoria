import type { AnyElement, RegionFills } from "./elements";
import { getOrelhaDefault, type FormatKey } from "./dimensions";

export interface EditorMeta {
  last_saved_at: string;
  last_saved_by: string;
  autosave_count: number;
}

export interface EditorData {
  version: 1;
  orelhaMm: number;
  elements: AnyElement[];
  fills: RegionFills;
  isbn: string | null;
  /**
   * URL da imagem panorâmica exibida travada atrás dos elementos. Populado
   * automaticamente quando o autor abre o editor sobre uma capa de upload,
   * antes de confirmar. Após confirmar, o `source` migra para `"editor"` mas
   * este campo continua carregando o link do PNG original.
   */
  backgroundUrl: string | null;
  meta: EditorMeta;
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; error: string };

export function serializeEditorState(state: {
  orelhaMm: number;
  elements: AnyElement[];
  fills: RegionFills;
  isbn: string | null;
  backgroundUrl: string | null;
  autosaveCount: number;
}): EditorData {
  return {
    version: 1,
    orelhaMm: state.orelhaMm,
    elements: state.elements,
    fills: state.fills,
    isbn: state.isbn,
    backgroundUrl: state.backgroundUrl,
    meta: {
      last_saved_at: new Date().toISOString(),
      last_saved_by: "",
      autosave_count: state.autosaveCount,
    },
  };
}

export function deserializeEditorState(
  data: unknown,
  format: FormatKey,
): Pick<EditorData, "orelhaMm" | "elements" | "fills" | "isbn" | "backgroundUrl"> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) {
    console.warn("[editor] unknown editor_data version:", d.version);
    return null;
  }
  // Prefer new orelhaMm; fall back to legacy comOrelhas boolean.
  let orelhaMm = 0;
  if (typeof d.orelhaMm === "number" && Number.isFinite(d.orelhaMm)) {
    orelhaMm = d.orelhaMm;
  } else if (typeof d.comOrelhas === "boolean") {
    orelhaMm = d.comOrelhas ? getOrelhaDefault(format) : 0;
  }
  return {
    orelhaMm,
    elements: Array.isArray(d.elements)
      ? (d.elements as AnyElement[]).map((el) => {
          if (el.type === "text" && typeof (el as any).lineHeight !== "number") {
            return { ...el, lineHeight: 1.2 };
          }
          return el;
        })
      : [],
    fills: (d.fills as RegionFills) ?? {},
    isbn: typeof d.isbn === "string" ? d.isbn : null,
    backgroundUrl: typeof d.backgroundUrl === "string" ? d.backgroundUrl : null,
  };
}

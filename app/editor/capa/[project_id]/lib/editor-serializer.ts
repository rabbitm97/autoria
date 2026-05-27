import type { AnyElement, RegionFills } from "./elements";

export interface EditorMeta {
  last_saved_at: string;
  last_saved_by: string;
  autosave_count: number;
}

export interface EditorData {
  version: 1;
  elements: AnyElement[];
  fills: RegionFills;
  isbn: string | null;
  meta: EditorMeta;
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; error: string };

export function serializeEditorState(state: {
  elements: AnyElement[];
  fills: RegionFills;
  isbn: string | null;
  autosaveCount: number;
}): EditorData {
  return {
    version: 1,
    elements: state.elements,
    fills: state.fills,
    isbn: state.isbn,
    meta: {
      last_saved_at: new Date().toISOString(),
      last_saved_by: "",
      autosave_count: state.autosaveCount,
    },
  };
}

export function deserializeEditorState(
  data: unknown,
): Pick<EditorData, "elements" | "fills" | "isbn"> | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1) {
    console.warn("[editor] unknown editor_data version:", d.version);
    return null;
  }
  return {
    elements: Array.isArray(d.elements) ? (d.elements as AnyElement[]) : [],
    fills: (d.fills as RegionFills) ?? {},
    isbn: typeof d.isbn === "string" ? d.isbn : null,
  };
}

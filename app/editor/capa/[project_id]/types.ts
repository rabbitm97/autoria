import type { FORMATS } from "./lib/dimensions";
import type { EditorData } from "./lib/editor-serializer";

export type FormatKey = keyof typeof FORMATS;

export interface ProjectData {
  projectId: string;
  format: FormatKey;
  pages: number;
  title: string;
  subtitle: string;
  authorName: string;
  isbn: string | null;
  synopsisShort: string;
  synopsisLong: string;
  pagesSource: "real" | "estimated" | "default";
  initialEditorData: EditorData | null;
}

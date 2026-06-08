import type { FormatoLivro } from "@/lib/formatos";
import type { EditorData } from "./lib/editor-serializer";

export type FormatKey = FormatoLivro;

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
  confirmedAt: string | null;
  confirmedImageUrl: string | null;
}

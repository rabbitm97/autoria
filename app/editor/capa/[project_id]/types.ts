import type { FormatoLivro } from "@/lib/formatos";
import type { EditorData } from "./lib/editor-serializer";

export type FormatKey = FormatoLivro;

export type HydratableEditorData = Pick<
  EditorData,
  "orelhaMm" | "elements" | "fills" | "isbn" | "backgroundUrl"
>;

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
  initialEditorData: HydratableEditorData | null;
  confirmedAt: string | null;
  confirmedImageUrl: string | null;
  /**
   * URL panorâmica que o editor deve exibir como layer travada de fundo. Vem
   * de `dados_capa.editor_data.backgroundUrl` (edições anteriores) ou, quando
   * o autor entra no editor a partir de uma capa de upload sem edição prévia,
   * de `dados_capa.url` (o próprio PNG do upload).
   */
  backgroundUrl: string | null;
}

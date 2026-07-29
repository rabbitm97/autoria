import type { FormatoLivro } from "@/lib/formatos";
import type { EditorData, SerializedLayout } from "./lib/editor-serializer";

export type FormatKey = FormatoLivro;
export type EditorLayout = SerializedLayout;

export type HydratableEditorData = Pick<
  EditorData,
  "orelhaMm" | "elements" | "fills" | "isbn" | "backgroundUrl" | "layout" | "capaIaRemovida"
>;

/**
 * Vindo do gerar-capa (dados_capa.modo === "ia"): quando o autor abre o editor
 * sobre a capa da IA, o servidor entrega esses dados para que o cliente monte
 * um `ImageElement` travado (id determinístico `capa-ia-frente`) na região da
 * frente e defina as cores iniciais de lombada/contracapa. `null` nos demais
 * modos.
 */
export interface CapaIaHandoff {
  url: string;
  corPredominanteHex: string;
  posicaoTitulo: "topo" | "centro" | "base" | "sem_preferencia";
}

export interface ProjectData {
  projectId: string;
  format: FormatKey;
  pages: number;
  layout: EditorLayout;
  title: string;
  subtitle: string;
  authorName: string;
  isbn: string | null;
  synopsisShort: string;
  synopsisLong: string;
  pagesSource: "real" | "estimativa";
  initialEditorData: HydratableEditorData | null;
  confirmedAt: string | null;
  confirmedImageUrl: string | null;
  /**
   * URL panorâmica que o editor deve exibir como layer travada de fundo. Vem
   * de `dados_capa.editor_data.backgroundUrl` (edições anteriores) ou, quando
   * o autor entra no editor a partir de uma capa de upload sem edição prévia,
   * de `dados_capa.url` (o próprio PNG do upload).
   *
   * OBS (B2-04c): capa de IA NÃO usa mais este campo — a IA vira um
   * `ImageElement` travado com id `capa-ia-frente`, ver `capaIaHandoff`.
   */
  backgroundUrl: string | null;
  /**
   * Payload da capa IA quando `dados_capa.modo === "ia"`. Cliente injeta um
   * ImageElement travado na frente + fills iniciais de lombada/contracapa
   * quando o editor abre limpo (sem `editor_data.elements`).
   */
  capaIaHandoff: CapaIaHandoff | null;
}

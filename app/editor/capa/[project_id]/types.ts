import type { FormatoLivro } from "@/lib/formatos";
import type { EditorData, SerializedLayout } from "./lib/editor-serializer";

export type FormatKey = FormatoLivro;
export type EditorLayout = SerializedLayout;

export type HydratableEditorData = Pick<
  EditorData,
  "orelhaMm" | "elements" | "fills" | "isbn" | "backgroundUrl" | "layout" | "capaIaRemovida" | "pages"
>;

/**
 * Vindo do gerar-capa (dados_capa.modo === "ia"): quando o autor abre o editor
 * sobre a capa da IA, o servidor entrega esses dados para que o cliente monte
 * ImageElements travados (ids determinísticos por alvo) e defina as cores
 * iniciais de lombada/contracapa. `null` nos demais modos.
 *
 * cobertura:
 *  - "frente_verso": duas artes independentes. `frenteUrl` sempre presente.
 *    `versoUrl` presente se autor já escolheu uma arte para a contracapa;
 *    `versoModoCor` = true se o autor escolheu apenas cor (sem imagem).
 *  - "unica": uma arte panorâmica cobre verso+lombada+capa. `unicaUrl`
 *    presente; `frenteUrl`/`versoUrl` são null (a arte única é a única
 *    imagem que renderiza — verso/frente/lombada compartilham o mesmo
 *    bitmap).
 */
export interface CapaIaHandoff {
  cobertura: "frente_verso" | "unica";
  corPredominanteHex: string;
  posicaoTitulo: "topo" | "centro" | "base" | "sem_preferencia";
  frenteUrl: string | null;
  versoUrl: string | null;
  versoModoCor: boolean;
  unicaUrl: string | null;
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

import { TEMPLATE_OPTIONS } from "@/lib/miolo-builder";
import type { TemplateId } from "@/app/api/agentes/miolo/route";

// Map genre → template (sugestão inicial; o autor pode alterar na UI)
export function suggestTemplate(genero: string | null | undefined): TemplateId {
  const g = (genero ?? "").toLowerCase();
  if (g.includes("romance") || g.includes("ficção") || g.includes("conto") || g.includes("suspense") || g.includes("fantasia")) return "literario";
  if (g.includes("autoajuda") || g.includes("negócio") || g.includes("empreend") || g.includes("biografi") || g.includes("memória")) return "nao_ficcao";
  if (g.includes("acadêm") || g.includes("técnico") || g.includes("abnt") || g.includes("científ")) return "abnt";
  if (g.includes("infantil")) return "infantil";
  if (g.includes("jovem") || g.includes("ya") || g.includes("juvenil")) return "juvenil";
  if (g.includes("poesia")) return "poesia";
  if (g.includes("teatro") || g.includes("dramaturgi")) return "teatro";
  if (g.includes("religi") || g.includes("espirit") || g.includes("devoci")) return "religioso";
  return "literario";
}

export type FamiliaEditorial =
  (typeof TEMPLATE_OPTIONS)[number]["familia"];

export function generoParaFamilia(
  genero: string | null | undefined,
): FamiliaEditorial | null {
  const t = suggestTemplate(genero);
  return TEMPLATE_OPTIONS.find(o => o.value === t)?.familia ?? null;
}

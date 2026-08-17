export function isEditableTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[data-konva-text-edit]")) return true;
  return false;
}

/** EDITOR-FIX-1: shift, ctrl e cmd são todos modificadores de
 *  multi-seleção (padrão Figma/Canva). */
export function isMultiSelectClick(evt: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return Boolean(evt.shiftKey || evt.ctrlKey || evt.metaKey);
}

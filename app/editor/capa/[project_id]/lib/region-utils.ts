import type { AnyElement, RegionFills } from "./elements";

export function hasElementsInXRange(
  elements: AnyElement[],
  xMinMm: number,
  xMaxMm: number,
): boolean {
  return elements.some((el) => el.x_mm >= xMinMm && el.x_mm < xMaxMm);
}

// A region label is shown when legendasAtivas is true (user forced all labels on)
// OR when the region has no fill AND no elements positioned inside it.
export function shouldShowLabel(
  hasFill: boolean,
  hasElements: boolean,
  legendasAtivas: boolean,
): boolean {
  if (legendasAtivas) return true;
  return !hasFill && !hasElements;
}

import type { AnyElement, RegionFills } from "./elements";

export function hashElements(elements: AnyElement[]): string {
  return JSON.stringify(
    elements.slice().sort((a, b) => a.id.localeCompare(b.id)),
  );
}

export function hashFills(fills: RegionFills): string {
  return JSON.stringify(fills);
}

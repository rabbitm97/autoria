"use client";

export interface TooltipInfo {
  visible: boolean;
  x: number;
  y: number;
  region: string;
  message: string;
}

export function EditorLegendTooltip({ tooltip }: { tooltip: TooltipInfo }) {
  if (!tooltip.visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-20 max-w-xs rounded-md bg-[#1a1a2e] px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: tooltip.x + 14, top: tooltip.y - 12 }}
    >
      <p className="mb-0.5 font-semibold text-[#e8c96a]">{tooltip.region}</p>
      <p className="leading-relaxed opacity-90">{tooltip.message}</p>
    </div>
  );
}

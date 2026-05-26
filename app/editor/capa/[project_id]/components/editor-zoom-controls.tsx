"use client";

import { useState } from "react";
import { useEditorStore } from "../lib/editor-store";

const PRESET_ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2];

export function EditorZoomControls({
  containerW,
  containerH,
}: {
  containerW: number;
  containerH: number;
}) {
  const { zoom, zoomIn, zoomOut, setZoom, fitToScreen } = useEditorStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div
      className="absolute bottom-4 right-4 z-10 flex flex-col items-center rounded-lg border border-[#e0ddd2] bg-[#fdfcf9] shadow-md"
      style={{ width: 48 }}
    >
      <button
        onClick={zoomIn}
        className="flex h-10 w-full items-center justify-center rounded-t-lg text-lg font-light text-[#1a1a2e] transition-colors hover:bg-zinc-100"
        title="Ampliar (+)"
      >
        +
      </button>

      <div className="relative w-full border-t border-[#e0ddd2]">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex h-9 w-full items-center justify-center text-[10px] font-medium tabular-nums text-[#1a1a2e] transition-colors hover:bg-zinc-100"
          title="Nível de zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        {dropdownOpen && (
          <div className="absolute bottom-full right-0 mb-1 z-20 w-36 rounded-lg border border-[#e0ddd2] bg-[#fdfcf9] py-1 shadow-lg">
            {PRESET_ZOOMS.map((z) => (
              <button
                key={z}
                onClick={() => { setZoom(z); setDropdownOpen(false); }}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-zinc-100 ${
                  Math.abs(zoom - z) < 0.01
                    ? "font-semibold text-[#c9a84c]"
                    : "text-[#1a1a2e]"
                }`}
              >
                {Math.round(z * 100)}%
              </button>
            ))}
            <div className="my-1 border-t border-[#e0ddd2]" />
            <button
              onClick={() => { fitToScreen(containerW, containerH); setDropdownOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-[#1a1a2e] transition-colors hover:bg-zinc-100"
            >
              Ajustar à tela
            </button>
          </div>
        )}
      </div>

      <div className="w-full border-t border-[#e0ddd2]" />

      <button
        onClick={zoomOut}
        className="flex h-10 w-full items-center justify-center text-lg font-light text-[#1a1a2e] transition-colors hover:bg-zinc-100"
        title="Reduzir (-)"
      >
        −
      </button>

      <div className="w-full border-t border-[#e0ddd2]" />

      <button
        onClick={() => fitToScreen(containerW, containerH)}
        className="flex h-10 w-full items-center justify-center rounded-b-lg transition-colors hover:bg-zinc-100"
        title="Ajustar à tela"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1a1a2e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </button>
    </div>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { HexColorPicker } from "react-colorful";
import { COLOR_PALETTES } from "../lib/color-palettes";

interface ColorPickerPopoverProps {
  value: string | null;
  onChange: (color: string | null) => void;
  label: string;
}

export function ColorPickerPopover({ value, onChange, label }: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"palettes" | "custom">("palettes");
  const [customHex, setCustomHex] = useState(value ?? "#1a1a2e");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayColor = value ?? "#ffffff";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-[#e0ddd2] px-2.5 py-2 transition-colors hover:border-zinc-300"
      >
        <div
          className="h-5 w-5 shrink-0 rounded border border-zinc-200"
          style={{ background: displayColor }}
        />
        <span className="flex-1 text-left text-xs text-zinc-600">{label}</span>
        <span className="font-mono text-[10px] text-zinc-400">
          {value ?? "branco"}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-[#e0ddd2] bg-[#fdfcf9] p-3 shadow-lg">
          {/* Tabs */}
          <div className="mb-3 flex gap-1">
            {(["palettes", "custom"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  tab === t
                    ? "bg-[#1a1a2e] text-[#c9a84c]"
                    : "text-zinc-400 hover:text-zinc-600"
                }`}
              >
                {t === "palettes" ? "Paletas" : "Personalizada"}
              </button>
            ))}
          </div>

          {tab === "palettes" && (
            <div className="space-y-2">
              {COLOR_PALETTES.map((palette) => (
                <div key={palette.id}>
                  <p className="mb-1 text-[10px] text-zinc-400">{palette.label}</p>
                  <div className="flex gap-1">
                    {palette.colors.map((color) => (
                      <button
                        key={color}
                        onClick={() => { onChange(color); setOpen(false); }}
                        title={color}
                        className={`h-5 w-5 rounded border-2 transition-all ${
                          value === color ? "border-[#c9a84c] scale-110" : "border-transparent"
                        }`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className="mt-1 w-full rounded-lg border border-dashed border-[#e0ddd2] py-1.5 text-xs text-zinc-400 hover:border-zinc-300 hover:text-zinc-500"
              >
                Remover cor (branco)
              </button>
            </div>
          )}

          {tab === "custom" && (
            <div className="space-y-2">
              <HexColorPicker
                color={customHex}
                onChange={(c) => { setCustomHex(c); onChange(c); }}
                style={{ width: "100%" }}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">#</span>
                <input
                  type="text"
                  value={customHex.replace("#", "")}
                  maxLength={6}
                  onChange={(e) => {
                    const v = `#${e.target.value}`;
                    setCustomHex(v);
                    if (e.target.value.length === 6) onChange(v);
                  }}
                  className="flex-1 rounded border border-[#e0ddd2] px-2 py-1 font-mono text-xs uppercase outline-none focus:border-[#c9a84c]"
                />
              </div>
              <button
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full rounded-lg border border-dashed border-[#e0ddd2] py-1.5 text-xs text-zinc-400 hover:border-zinc-300 hover:text-zinc-500"
              >
                Remover cor (branco)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

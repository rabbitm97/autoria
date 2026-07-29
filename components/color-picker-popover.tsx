"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";

import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";
import { COLOR_PALETTES } from "@/lib/color-palettes";

// EyeDropper API é experimental (Chrome/Edge têm; Firefox/Safari não).
// Ver: https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper
interface EyeDropperResult { sRGBHex: string; }
interface EyeDropperCtor { new (): { open(): Promise<EyeDropperResult> }; }
declare global {
  interface Window { EyeDropper?: EyeDropperCtor; }
}

interface ColorPickerPopoverProps {
  value: string | null;
  onChange: (color: string | null) => void;
  label?: string;
  /**
   * "field" (default): botão largo mostrando swatch + label + hex — para uso
   * em listas de propriedades (editor).
   * "swatch": botão compacto tipo pill com só o swatch + label — para uso em
   * grids de opções (briefing IA "Personalizar").
   */
  variant?: "field" | "swatch";
  /**
   * Estado "selecionado" visual no variant swatch — controlado externamente
   * (o consumer decide o que "selecionado" significa, ex.: cor === "personalizada").
   */
  selected?: boolean;
  /**
   * Botão "Remover cor (branco)" faz sentido no editor (fill nullable), mas
   * no briefing IA a cor sempre existe. Default true; passe false para omitir.
   */
  allowRemove?: boolean;
}

export function ColorPickerPopover({
  value, onChange, label,
  variant = "field",
  selected = false,
  allowRemove = true,
}: ColorPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"palettes" | "custom">("palettes");
  const [customHex, setCustomHex] = useState(value ?? "#1a1a2e");
  // Lazy init — só é lido dentro de `{open && ...}`, então SSR sempre pinta
  // fechado e não há hydration mismatch quando o valor real chega no cliente.
  const [hasEyeDropper] = useState(() =>
    typeof window !== "undefined" && "EyeDropper" in window,
  );
  const anchorRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Posiciona o popover em coordenadas absolutas via portal — evita clipping
  // do overflow-y-auto da sidebar do editor.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideAnchor = anchorRef.current?.contains(target);
      const insidePopover = popoverRef.current?.contains(target);
      if (!insideAnchor && !insidePopover) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openEyeDropper = useCallback(async () => {
    if (typeof window === "undefined" || !window.EyeDropper) return;
    try {
      const dropper = new window.EyeDropper();
      const { sRGBHex } = await dropper.open();
      setCustomHex(sRGBHex);
      onChange(sRGBHex);
    } catch {
      // Autor cancelou (Esc). Silencioso.
    }
  }, [onChange]);

  const displayColor = value ?? "#ffffff";

  const trigger = variant === "swatch" ? (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-medium cursor-pointer transition-all ${
        selected ? "border-brand-gold" : "border-zinc-200 hover:border-zinc-300"
      }`}
    >
      <span
        className="w-4 h-4 rounded-full border border-white/40 shrink-0"
        style={{
          background: selected
            ? displayColor
            : "conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
        }}
      />
      {label ?? "Personalizar"}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="flex w-full items-center gap-2 rounded-lg border border-[#e0ddd2] px-2.5 py-2 transition-colors hover:border-zinc-300"
    >
      <div
        className="h-5 w-5 shrink-0 rounded border border-zinc-200"
        style={{ background: displayColor }}
      />
      <span className="flex-1 text-left text-xs text-zinc-600">{label}</span>
      <span className="font-mono text-[10px] text-zinc-400">{value ?? "branco"}</span>
    </button>
  );

  return (
    <div className="relative" ref={anchorRef}>
      {trigger}

      {open && popoverPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[100] w-64 rounded-xl border border-[#e0ddd2] bg-[#fdfcf9] p-3 shadow-lg"
          style={{ top: popoverPos.top, left: popoverPos.left }}
        >
          <div className="mb-3 flex gap-1">
            {(["palettes", "custom"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  tab === t ? "bg-[#1a1a2e] text-[#c9a84c]" : "text-zinc-400 hover:text-zinc-600"
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
                        type="button"
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
              {allowRemove && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); }}
                  className="mt-1 w-full rounded-lg border border-dashed border-[#e0ddd2] py-1.5 text-xs text-zinc-400 hover:border-zinc-300 hover:text-zinc-500"
                >
                  Remover cor (branco)
                </button>
              )}
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
                {hasEyeDropper && (
                  <button
                    type="button"
                    onClick={openEyeDropper}
                    title="Conta-gotas — pescar cor da tela"
                    className="rounded border border-[#e0ddd2] p-1.5 text-zinc-500 transition-colors hover:border-[#c9a84c] hover:text-[#c9a84c]"
                  >
                    <EyeDropperIcon />
                  </button>
                )}
              </div>
              {allowRemove && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); }}
                  className="w-full rounded-lg border border-dashed border-[#e0ddd2] py-1.5 text-xs text-zinc-400 hover:border-zinc-300 hover:text-zinc-500"
                >
                  Remover cor (branco)
                </button>
              )}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function EyeDropperIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 22 1-1h3l9-9" />
      <path d="M3 21v-3l9-9" />
      <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
    </svg>
  );
}

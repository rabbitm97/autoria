"use client";

import { useEditorStore } from "../lib/editor-store";
import { FONT_CATALOG } from "../lib/fonts";
import { generateBarcodeDataUrl } from "../lib/barcode";
import type { TextElement, ImageElement, LogoElement, BarcodeElement, ShapeElement, AnyElement } from "../lib/elements";
import { MM_TO_PX } from "../lib/dimensions";

const PT_OPTIONS = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72, 96];

function PanelRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px] text-zinc-400">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function TextPanel({ el }: { el: TextElement }) {
  const { updateElement } = useEditorStore();
  const up = (patch: Partial<TextElement>) => updateElement(el.id, patch as any);

  return (
    <div className="space-y-2.5">
      <div>
        <p className="mb-1 text-[10px] text-zinc-400">Conteúdo</p>
        <textarea
          value={el.content}
          onChange={(e) => up({ content: e.target.value })}
          rows={3}
          className="w-full resize-none rounded-lg border border-[#e0ddd2] px-2.5 py-2 text-xs outline-none focus:border-[#c9a84c]"
        />
      </div>

      <PanelRow label="Fonte">
        <select
          value={el.fontId}
          onChange={(e) => up({ fontId: e.target.value as TextElement["fontId"] })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1.5 text-xs outline-none focus:border-[#c9a84c]"
        >
          {FONT_CATALOG.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </PanelRow>

      <PanelRow label="Tamanho">
        <select
          value={el.fontSize_pt}
          onChange={(e) => up({ fontSize_pt: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1.5 text-xs outline-none focus:border-[#c9a84c]"
        >
          {PT_OPTIONS.map((pt) => (
            <option key={pt} value={pt}>{pt}pt</option>
          ))}
        </select>
      </PanelRow>

      <PanelRow label="Estilo">
        <div className="flex gap-1">
          <button
            onClick={() => up({ fontWeight: el.fontWeight === "700" ? "400" : "700" })}
            className={`rounded px-2.5 py-1 text-xs font-bold transition-colors ${
              el.fontWeight === "700" ? "bg-[#1a1a2e] text-white" : "border border-[#e0ddd2] text-zinc-500"
            }`}
          >N</button>
          <button
            onClick={() => up({ fontStyle: el.fontStyle === "italic" ? "normal" : "italic" })}
            className={`rounded px-2.5 py-1 text-xs italic transition-colors ${
              el.fontStyle === "italic" ? "bg-[#1a1a2e] text-white" : "border border-[#e0ddd2] text-zinc-500"
            }`}
          >I</button>
        </div>
      </PanelRow>

      <PanelRow label="Alinhamento">
        <div className="flex gap-1">
          {(
            [
              { value: "left", title: "Esquerda", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg> },
              { value: "center", title: "Centro", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg> },
              { value: "right", title: "Direita", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg> },
              { value: "justify", title: "Justificado", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg> },
            ] as { value: TextElement["textAlign"]; title: string; icon: React.ReactNode }[]
          ).map(({ value, title, icon }) => (
            <button
              key={value}
              onClick={() => up({ textAlign: value })}
              title={title}
              className={`flex flex-1 items-center justify-center rounded py-1.5 transition-colors ${
                el.textAlign === value ? "bg-[#1a1a2e] text-white" : "border border-[#e0ddd2] text-zinc-400"
              }`}
            >{icon}</button>
          ))}
        </div>
      </PanelRow>

      <PanelRow label="Entrelinha">
        <div className="flex items-center gap-2">
          <input type="range" min={0.8} max={2.5} step={0.05} value={el.lineHeight ?? 1.2}
            onChange={(e) => up({ lineHeight: Number(e.target.value) })} className="flex-1" />
          <span className="w-8 text-right font-mono text-xs text-zinc-500">{(el.lineHeight ?? 1.2).toFixed(2)}</span>
        </div>
      </PanelRow>

      <PanelRow label="Cor">
        <div className="flex items-center gap-2">
          <input type="color" value={el.color} onChange={(e) => up({ color: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]" />
          <span className="font-mono text-xs text-zinc-500">{el.color}</span>
        </div>
      </PanelRow>

      <PanelRow label="Opacidade">
        <input type="range" min={0} max={1} step={0.05} value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })} className="w-full" />
      </PanelRow>

      <PanelRow label="Rotação">
        <input type="number" value={Math.round(el.rotation_deg)}
          onChange={(e) => up({ rotation_deg: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1 text-xs outline-none focus:border-[#c9a84c]" />
      </PanelRow>
    </div>
  );
}

function ImagePanel({ el }: { el: ImageElement }) {
  const { updateElement } = useEditorStore();
  const up = (patch: Partial<ImageElement>) => updateElement(el.id, patch as any);
  return (
    <div className="space-y-2.5">
      <PanelRow label="Opacidade">
        <input type="range" min={0} max={1} step={0.05} value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })} className="w-full" />
      </PanelRow>
      <PanelRow label="Ajuste">
        <select value={el.objectFit} onChange={(e) => up({ objectFit: e.target.value as ImageElement["objectFit"] })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1.5 text-xs outline-none focus:border-[#c9a84c]">
          <option value="fill">Preencher</option>
          <option value="cover">Cobrir</option>
          <option value="contain">Conter</option>
        </select>
      </PanelRow>
      <PanelRow label="Rotação">
        <input type="number" value={Math.round(el.rotation_deg)}
          onChange={(e) => up({ rotation_deg: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1 text-xs outline-none focus:border-[#c9a84c]" />
      </PanelRow>
    </div>
  );
}

function LogoPanel({ el }: { el: LogoElement }) {
  const { updateElement } = useEditorStore();
  const up = (patch: Partial<LogoElement>) => updateElement(el.id, patch as any);
  return (
    <div className="space-y-2.5">
      <PanelRow label="Variante">
        <div className="flex gap-1">
          {(["dourado", "azul"] as const).map((v) => (
            <button key={v} onClick={() => up({ variant: v })}
              className={`flex-1 rounded py-1.5 text-xs capitalize transition-colors ${
                el.variant === v ? "bg-[#1a1a2e] text-[#c9a84c]" : "border border-[#e0ddd2] text-zinc-500"
              }`}>{v}</button>
          ))}
        </div>
      </PanelRow>
      <PanelRow label="Opacidade">
        <input type="range" min={0} max={1} step={0.05} value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })} className="w-full" />
      </PanelRow>
    </div>
  );
}

function ShapePanel({ el }: { el: ShapeElement }) {
  const { updateElement } = useEditorStore();
  const up = (patch: Partial<ShapeElement>) => updateElement(el.id, patch as any);
  const isLine = el.shape === "line";
  return (
    <div className="space-y-2.5">
      {!isLine && (
        <PanelRow label="Preenchimento">
          <div className="flex items-center gap-2">
            <input type="color" value={el.fill ?? "#c9a84c"} onChange={(e) => up({ fill: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]" />
            <button onClick={() => up({ fill: null })} title="Remover preenchimento" className="text-xs text-zinc-300 hover:text-zinc-500">×</button>
            <span className="font-mono text-xs text-zinc-500">{el.fill ?? "—"}</span>
          </div>
        </PanelRow>
      )}
      {isLine ? (
        <PanelRow label="Cor">
          <div className="flex items-center gap-2">
            <input type="color" value={el.fill ?? "#c9a84c"} onChange={(e) => up({ fill: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]" />
            <span className="font-mono text-xs text-zinc-500">{el.fill ?? "—"}</span>
          </div>
        </PanelRow>
      ) : (
        <>
          <PanelRow label="Borda">
            <div className="flex items-center gap-2">
              <input type="color" value={el.stroke ?? "#000000"} onChange={(e) => up({ stroke: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]" />
              <button onClick={() => up({ stroke: null, strokeWidth_pt: 0 })} title="Remover borda" className="text-xs text-zinc-300 hover:text-zinc-500">×</button>
              <span className="font-mono text-xs text-zinc-500">{el.stroke ?? "—"}</span>
            </div>
          </PanelRow>
          {el.stroke && (
            <PanelRow label="Espessura">
              <select value={el.strokeWidth_pt} onChange={(e) => up({ strokeWidth_pt: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1.5 text-xs outline-none focus:border-[#c9a84c]">
                {[0.5, 1, 2, 3, 4, 6, 8, 10, 12].map((pt) => (
                  <option key={pt} value={pt}>{pt}pt</option>
                ))}
              </select>
            </PanelRow>
          )}
        </>
      )}
      <PanelRow label="Opacidade">
        <input type="range" min={0} max={1} step={0.05} value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })} className="w-full" />
      </PanelRow>
      <PanelRow label="Rotação">
        <input type="number" value={Math.round(el.rotation_deg)}
          onChange={(e) => up({ rotation_deg: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1 text-xs outline-none focus:border-[#c9a84c]" />
      </PanelRow>
    </div>
  );
}

function BarcodePanel({ el }: { el: BarcodeElement }) {
  const { updateElement } = useEditorStore();
  const up = (patch: Partial<BarcodeElement>) => updateElement(el.id, patch as any);
  async function regenerate(isbn: string) {
    const dataUrl = await generateBarcodeDataUrl(isbn);
    if (dataUrl) up({ isbn, cachedDataUrl: dataUrl });
    else alert("ISBN inválido.");
  }
  return (
    <div className="space-y-2.5">
      <div>
        <p className="mb-1 text-[10px] text-zinc-400">ISBN</p>
        <div className="flex gap-1.5">
          <input type="text" defaultValue={el.isbn} onBlur={(e) => regenerate(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[#e0ddd2] px-2.5 py-1 font-mono text-xs outline-none focus:border-[#c9a84c]" />
        </div>
      </div>
      <PanelRow label="Opacidade">
        <input type="range" min={0} max={1} step={0.05} value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })} className="w-full" />
      </PanelRow>
    </div>
  );
}

// ── Multi-select panel ────────────────────────────────────────────────────────
function MultiPanel({ els }: { els: AnyElement[] }) {
  const { updateElement, deleteElement, bringSelectionToFront, sendSelectionToBack } = useEditorStore();

  const ids = els.map((e) => e.id);
  const opacities = els.map((e) => e.opacity);
  const allSameOpacity = opacities.every((o) => o === opacities[0]);
  const opacityDisplay = allSameOpacity ? opacities[0] : null;

  // Bounding box of the group
  const groupMinX = Math.min(...els.map((e) => e.x_mm));
  const groupMinY = Math.min(...els.map((e) => e.y_mm));
  const groupMaxX = Math.max(...els.map((e) => e.x_mm + e.width_mm));
  const groupMaxY = Math.max(...els.map((e) => e.y_mm + e.height_mm));
  const groupCenterX = (groupMinX + groupMaxX) / 2;
  const groupCenterY = (groupMinY + groupMaxY) / 2;

  function align(dir: "left" | "center-h" | "right" | "top" | "center-v" | "bottom") {
    els.forEach((el) => {
      if (dir === "left")     updateElement(el.id, { x_mm: groupMinX } as any);
      if (dir === "center-h") updateElement(el.id, { x_mm: groupCenterX - el.width_mm / 2 } as any);
      if (dir === "right")    updateElement(el.id, { x_mm: groupMaxX - el.width_mm } as any);
      if (dir === "top")      updateElement(el.id, { y_mm: groupMinY } as any);
      if (dir === "center-v") updateElement(el.id, { y_mm: groupCenterY - el.height_mm / 2 } as any);
      if (dir === "bottom")   updateElement(el.id, { y_mm: groupMaxY - el.height_mm } as any);
    });
  }

  function distribute(axis: "h" | "v") {
    if (els.length < 3) return;
    if (axis === "h") {
      const sorted = [...els].sort((a, b) => a.x_mm - b.x_mm);
      const totalW = sorted.reduce((s, e) => s + e.width_mm, 0);
      const span = groupMaxX - groupMinX;
      const gap = (span - totalW) / (sorted.length - 1);
      let cursor = groupMinX;
      sorted.forEach((el) => {
        updateElement(el.id, { x_mm: cursor } as any);
        cursor += el.width_mm + gap;
      });
    } else {
      const sorted = [...els].sort((a, b) => a.y_mm - b.y_mm);
      const totalH = sorted.reduce((s, e) => s + e.height_mm, 0);
      const span = groupMaxY - groupMinY;
      const gap = (span - totalH) / (sorted.length - 1);
      let cursor = groupMinY;
      sorted.forEach((el) => {
        updateElement(el.id, { y_mm: cursor } as any);
        cursor += el.height_mm + gap;
      });
    }
  }

  const iconBtn = "flex items-center justify-center rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors";
  const canDistribute = els.length >= 3;

  return (
    <div className="space-y-3">
      {/* Opacity */}
      <PanelRow label="Opacidade">
        <input
          type="range" min={0} max={1} step={0.05}
          value={opacityDisplay ?? 0.5}
          onChange={(e) => ids.forEach((id) => updateElement(id, { opacity: Number(e.target.value) } as any))}
          className="w-full"
          title={opacityDisplay === null ? "Valores diferentes" : undefined}
        />
      </PanelRow>

      {/* Align */}
      <div>
        <p className="mb-1.5 text-[10px] text-zinc-400">Alinhar</p>
        <div className="flex gap-1">
          <button onClick={() => align("left")} title="Alinhar à esquerda" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="3" x2="3" y2="21"/><rect x="5" y="6" width="8" height="4" rx="1"/><rect x="5" y="14" width="13" height="4" rx="1"/></svg>
          </button>
          <button onClick={() => align("center-h")} title="Centralizar horizontalmente" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="3" x2="12" y2="21"/><rect x="5" y="6" width="14" height="4" rx="1"/><rect x="7" y="14" width="10" height="4" rx="1"/></svg>
          </button>
          <button onClick={() => align("right")} title="Alinhar à direita" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="3" x2="21" y2="21"/><rect x="11" y="6" width="8" height="4" rx="1"/><rect x="6" y="14" width="13" height="4" rx="1"/></svg>
          </button>
          <button onClick={() => align("top")} title="Alinhar ao topo" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="3" x2="21" y2="3"/><rect x="6" y="5" width="4" height="8" rx="1"/><rect x="14" y="5" width="4" height="13" rx="1"/></svg>
          </button>
          <button onClick={() => align("center-v")} title="Centralizar verticalmente" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="7" width="4" height="10" rx="1"/></svg>
          </button>
          <button onClick={() => align("bottom")} title="Alinhar à base" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="21" x2="21" y2="21"/><rect x="6" y="11" width="4" height="8" rx="1"/><rect x="14" y="6" width="4" height="13" rx="1"/></svg>
          </button>
        </div>
      </div>

      {/* Distribute */}
      <div>
        <p className="mb-1.5 text-[10px] text-zinc-400">Distribuir</p>
        <div className="flex gap-1">
          <button
            onClick={() => distribute("h")}
            disabled={!canDistribute}
            title={canDistribute ? "Distribuir horizontalmente" : "Requer 3 ou mais elementos"}
            className={`${iconBtn} disabled:opacity-30`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="3" x2="3" y2="21"/><line x1="21" y1="3" x2="21" y2="21"/><rect x="9" y="7" width="6" height="10" rx="1"/></svg>
          </button>
          <button
            onClick={() => distribute("v")}
            disabled={!canDistribute}
            title={canDistribute ? "Distribuir verticalmente" : "Requer 3 ou mais elementos"}
            className={`${iconBtn} disabled:opacity-30`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="3" x2="21" y2="3"/><line x1="3" y1="21" x2="21" y2="21"/><rect x="7" y="9" width="10" height="6" rx="1"/></svg>
          </button>
        </div>
      </div>

      {/* Layer */}
      <div>
        <p className="mb-1.5 text-[10px] text-zinc-400">Camada</p>
        <div className="flex gap-1">
          <button onClick={() => bringSelectionToFront(ids)} title="Trazer grupo para frente" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/></svg>
          </button>
          <button onClick={() => sendSelectionToBack(ids)} title="Enviar grupo para trás" className={iconBtn}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="12" height="12" rx="1"/><path d="M8 20h12V8"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function EditorPropertyPanel() {
  const { selectedIds, elements, deleteElement, duplicateElement, moveElementZ, clearSelection, duplicateSelected, bringSelectionToFront, sendSelectionToBack } =
    useEditorStore();

  if (selectedIds.length === 0) return null;

  // Multi-select panel
  if (selectedIds.length >= 2) {
    const selected = elements.filter((e) => selectedIds.includes(e.id));
    if (selected.length === 0) return null;
    return (
      <div className="pointer-events-auto absolute right-4 top-4 z-20 w-64 rounded-xl border border-[#e0ddd2] bg-[#fdfcf9] shadow-lg">
        <div className="flex items-center justify-between border-b border-[#e0ddd2] px-4 py-2.5">
          <span className="text-xs font-medium text-zinc-600">{selected.length} elementos selecionados</span>
          <button onClick={clearSelection} className="text-zinc-300 hover:text-zinc-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <MultiPanel els={selected} />
        </div>
        <div className="flex items-center justify-end border-t border-[#e0ddd2] px-4 py-2.5">
          <button
            onClick={() => { selected.forEach((e) => deleteElement(e.id)); }}
            title="Excluir selecionados (Delete)"
            className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Single-select panel (existing behavior)
  const el = elements.find((e) => e.id === selectedIds[0]);
  if (!el) return null;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-20 w-64 rounded-xl border border-[#e0ddd2] bg-[#fdfcf9] shadow-lg">
      <div className="flex items-center justify-between border-b border-[#e0ddd2] px-4 py-2.5">
        <span className="text-xs font-medium text-zinc-600">
          {el.type === "text" ? "Texto"
            : el.type === "image" ? "Imagem"
            : el.type === "logo" ? "Logo"
            : el.type === "barcode" ? "Código de barras"
            : el.type === "shape" ? ({ rect: "Retângulo", ellipse: "Elipse", line: "Linha", triangle: "Triângulo" } as Record<string, string>)[(el as ShapeElement).shape] ?? "Forma"
            : "Elemento"}
        </span>
        <button onClick={clearSelection} className="text-zinc-300 hover:text-zinc-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {el.type === "text" && <TextPanel el={el as TextElement} />}
        {el.type === "image" && <ImagePanel el={el as ImageElement} />}
        {el.type === "logo" && <LogoPanel el={el as LogoElement} />}
        {el.type === "barcode" && <BarcodePanel el={el as BarcodeElement} />}
        {el.type === "shape" && <ShapePanel el={el as ShapeElement} />}
      </div>

      <div className="flex items-center justify-between border-t border-[#e0ddd2] px-4 py-2.5">
        <div className="flex gap-1">
          <button onClick={() => moveElementZ(el.id, 1)} title="Para frente ([)"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
          </button>
          <button onClick={() => moveElementZ(el.id, -1)} title="Para trás (])"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <button onClick={() => duplicateElement(el.id)} title="Duplicar (Ctrl+D)"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          </button>
        </div>
        <button onClick={() => deleteElement(el.id)} title="Excluir (Delete)"
          className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

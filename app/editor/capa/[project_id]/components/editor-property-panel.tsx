"use client";

import { useEditorStore } from "../lib/editor-store";
import { FONT_CATALOG } from "../lib/fonts";
import { generateBarcodeDataUrl } from "../lib/barcode";
import type { TextElement, ImageElement, LogoElement, BarcodeElement, ShapeElement } from "../lib/elements";

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
  const { updateElement, deleteElement, duplicateElement, setSelectedId, moveElementZ } =
    useEditorStore();
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
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
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
            <option key={pt} value={pt}>
              {pt}pt
            </option>
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
          >
            N
          </button>
          <button
            onClick={() => up({ fontStyle: el.fontStyle === "italic" ? "normal" : "italic" })}
            className={`rounded px-2.5 py-1 text-xs italic transition-colors ${
              el.fontStyle === "italic" ? "bg-[#1a1a2e] text-white" : "border border-[#e0ddd2] text-zinc-500"
            }`}
          >
            I
          </button>
        </div>
      </PanelRow>

      <PanelRow label="Alinhamento">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              onClick={() => up({ textAlign: align })}
              title={align}
              className={`flex-1 rounded py-1 text-xs transition-colors ${
                el.textAlign === align
                  ? "bg-[#1a1a2e] text-white"
                  : "border border-[#e0ddd2] text-zinc-400"
              }`}
            >
              {align === "left" ? "⬅" : align === "center" ? "⬛" : "➡"}
            </button>
          ))}
        </div>
      </PanelRow>

      <PanelRow label="Cor">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={el.color}
            onChange={(e) => up({ color: e.target.value })}
            className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]"
          />
          <span className="font-mono text-xs text-zinc-500">{el.color}</span>
        </div>
      </PanelRow>

      <PanelRow label="Opacidade">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </PanelRow>

      <PanelRow label="Rotação">
        <input
          type="number"
          value={Math.round(el.rotation_deg)}
          onChange={(e) => up({ rotation_deg: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1 text-xs outline-none focus:border-[#c9a84c]"
        />
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
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </PanelRow>
      <PanelRow label="Ajuste">
        <select
          value={el.objectFit}
          onChange={(e) => up({ objectFit: e.target.value as ImageElement["objectFit"] })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1.5 text-xs outline-none focus:border-[#c9a84c]"
        >
          <option value="fill">Preencher</option>
          <option value="cover">Cobrir</option>
          <option value="contain">Conter</option>
        </select>
      </PanelRow>
      <PanelRow label="Rotação">
        <input
          type="number"
          value={Math.round(el.rotation_deg)}
          onChange={(e) => up({ rotation_deg: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1 text-xs outline-none focus:border-[#c9a84c]"
        />
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
            <button
              key={v}
              onClick={() => up({ variant: v })}
              className={`flex-1 rounded py-1.5 text-xs capitalize transition-colors ${
                el.variant === v ? "bg-[#1a1a2e] text-[#c9a84c]" : "border border-[#e0ddd2] text-zinc-500"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </PanelRow>
      <PanelRow label="Opacidade">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })}
          className="w-full"
        />
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
            <input
              type="color"
              value={el.fill ?? "#c9a84c"}
              onChange={(e) => up({ fill: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]"
            />
            <button
              onClick={() => up({ fill: null })}
              title="Remover preenchimento"
              className="text-xs text-zinc-300 hover:text-zinc-500"
            >
              ×
            </button>
            <span className="font-mono text-xs text-zinc-500">{el.fill ?? "—"}</span>
          </div>
        </PanelRow>
      )}

      {isLine ? (
        <PanelRow label="Cor">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={el.fill ?? "#c9a84c"}
              onChange={(e) => up({ fill: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]"
            />
            <span className="font-mono text-xs text-zinc-500">{el.fill ?? "—"}</span>
          </div>
        </PanelRow>
      ) : (
        <>
          <PanelRow label="Borda">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={el.stroke ?? "#000000"}
                onChange={(e) => up({ stroke: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-[#e0ddd2]"
              />
              <button
                onClick={() => up({ stroke: null, strokeWidth_pt: 0 })}
                title="Remover borda"
                className="text-xs text-zinc-300 hover:text-zinc-500"
              >
                ×
              </button>
              <span className="font-mono text-xs text-zinc-500">{el.stroke ?? "—"}</span>
            </div>
          </PanelRow>

          {el.stroke && (
            <PanelRow label="Espessura">
              <select
                value={el.strokeWidth_pt}
                onChange={(e) => up({ strokeWidth_pt: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1.5 text-xs outline-none focus:border-[#c9a84c]"
              >
                {[0.5, 1, 2, 3, 4, 6, 8, 10, 12].map((pt) => (
                  <option key={pt} value={pt}>{pt}pt</option>
                ))}
              </select>
            </PanelRow>
          )}
        </>
      )}

      <PanelRow label="Opacidade">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </PanelRow>

      <PanelRow label="Rotação">
        <input
          type="number"
          value={Math.round(el.rotation_deg)}
          onChange={(e) => up({ rotation_deg: Number(e.target.value) })}
          className="w-full rounded-lg border border-[#e0ddd2] px-2 py-1 text-xs outline-none focus:border-[#c9a84c]"
        />
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
          <input
            type="text"
            defaultValue={el.isbn}
            onBlur={(e) => regenerate(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[#e0ddd2] px-2.5 py-1 font-mono text-xs outline-none focus:border-[#c9a84c]"
          />
        </div>
      </div>
      <PanelRow label="Opacidade">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={el.opacity}
          onChange={(e) => up({ opacity: Number(e.target.value) })}
          className="w-full"
        />
      </PanelRow>
    </div>
  );
}

export function EditorPropertyPanel() {
  const { selectedId, elements, deleteElement, duplicateElement, moveElementZ, setSelectedId } =
    useEditorStore();

  if (!selectedId) return null;
  const el = elements.find((e) => e.id === selectedId);
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
        <button
          onClick={() => setSelectedId(null)}
          className="text-zinc-300 hover:text-zinc-600"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
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
          <button
            onClick={() => moveElementZ(el.id, 1)}
            title="Para frente ([)"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
          <button
            onClick={() => moveElementZ(el.id, -1)}
            title="Para trás (])"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            onClick={() => duplicateElement(el.id)}
            title="Duplicar (Ctrl+D)"
            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
        <button
          onClick={() => deleteElement(el.id)}
          title="Excluir (Delete)"
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

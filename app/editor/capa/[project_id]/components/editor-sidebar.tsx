"use client";

import { useState, useRef, type JSX } from "react";
import { useEditorStore } from "../lib/editor-store";
import { FORMATS, calcularLombada, SANGRIA_MM, ORELHA_MM } from "../lib/dimensions";
import { FONT_CATALOG, FONT_CATALOG_BY_ID } from "../lib/fonts";
import { generateBarcodeDataUrl } from "../lib/barcode";
import { createSmartFieldElement, type SmartFieldContentMap } from "../lib/smart-field-layout";
import { createImageElement, createLogoElement, createBarcodeElement, createShapeElement } from "../lib/elements";
import type { ShapeKind } from "../lib/elements";
import { getContrastColor } from "../lib/color-utils";
import { ColorPickerPopover } from "./color-picker-popover";
import { SmartFieldModal } from "./smart-field-modal";
import { nanoid } from "nanoid";
import type { ProjectData } from "../types";
import type { Region, SmartField } from "../lib/elements";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono uppercase tracking-[0.08em] text-[#6b6b6b]" style={{ fontSize: "11px" }}>
      {children}
    </p>
  );
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#e0ddd2]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-50"
      >
        <SectionHeader>{title}</SectionHeader>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9a9a9a"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ── Seção 1: Formato e estrutura ──────────────────────────────────────────────
function SectionFormato() {
  const { format, pages, comOrelhas, setComOrelhas } = useEditorStore();
  const fmtInfo = FORMATS[format];
  const lombadaMm = calcularLombada(pages);

  const fmtLabel: Record<string, string> = {
    "16x23": "16×23 cm",
    "14x21": "14×21 cm",
    "11x18": "11×18 cm",
    "20x20": "20×20 cm",
    "a4": "A4 (21×29,7 cm)",
  };

  return (
    <Section title="Formato e estrutura">
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-[10px] text-zinc-400">Formato</p>
          <div
            className="flex items-center rounded-lg border border-[#e0ddd2] bg-zinc-50 px-2.5 py-2"
            title="Definido na diagramação"
          >
            <span className="flex-1 text-xs text-zinc-500">{fmtLabel[format] ?? format}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </div>
          <p className="mt-1 text-[10px] text-zinc-300">Definido na diagramação</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] text-zinc-400">Páginas</p>
          <div className="rounded-lg border border-[#e0ddd2] bg-zinc-50 px-2.5 py-2">
            <span className="text-xs text-zinc-500">
              {pages} págs · lombada {lombadaMm.toFixed(1)}mm
            </span>
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-xs text-zinc-600">Orelhas (8cm)</span>
          <button
            type="button"
            role="switch"
            aria-checked={comOrelhas}
            onClick={() => setComOrelhas(!comOrelhas)}
            className={`relative h-5 w-9 rounded-full border-2 transition-colors ${
              comOrelhas ? "border-[#c9a84c] bg-[#c9a84c]" : "border-zinc-300 bg-zinc-200"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                comOrelhas ? "left-4" : "left-0.5"
              }`}
            />
          </button>
        </label>
        {comOrelhas && (
          <p className="text-[10px] text-zinc-400">+2 × 80mm laterais no canvas</p>
        )}
      </div>
    </Section>
  );
}

// ── Seção 2: Cores de fundo ───────────────────────────────────────────────────
function SectionCores({ comOrelhas }: { comOrelhas: boolean }) {
  const { fills, setFill } = useEditorStore();

  const regions: { key: Region; label: string }[] = [
    { key: "capa", label: "Capa (frente)" },
    { key: "contracapa", label: "Contracapa" },
    { key: "lombada", label: "Lombada" },
    ...(comOrelhas
      ? ([
          { key: "orelha_frente" as Region, label: "Orelha frontal" },
          { key: "orelha_verso" as Region, label: "Orelha traseira" },
        ] as const)
      : []),
  ];

  return (
    <Section title="Cores de fundo" defaultOpen={false}>
      <div className="space-y-2">
        {regions.map(({ key, label }) => (
          <ColorPickerPopover
            key={key}
            value={fills[key] ?? null}
            label={label}
            onChange={(color) => setFill(key, color)}
          />
        ))}
      </div>
    </Section>
  );
}

// ── Seção 3: Texto (smart fields) ─────────────────────────────────────────────
function SectionTexto({ projectData }: { projectData: ProjectData }) {
  const { elements, fills, format, pages, comOrelhas, addElement } = useEditorStore();
  const [pendingField, setPendingField] = useState<SmartField | null>(null);

  const lombadaContent = [projectData.title, projectData.authorName]
    .filter(Boolean)
    .join(" · ");

  const contentMap: SmartFieldContentMap = {
    titulo: projectData.title,
    subtitulo: projectData.subtitle,
    autor: projectData.authorName,
    sinopse_curta: projectData.synopsisShort,
    sinopse_longa: projectData.synopsisLong,
    bio: "",
    lombada: lombadaContent,
  };

  const smartFields: { field: SmartField; label: string; preview: string }[] = [
    { field: "titulo", label: "Título", preview: projectData.title || "Sem título" },
    { field: "subtitulo", label: "Subtítulo", preview: projectData.subtitle || "—" },
    { field: "autor", label: "Autor", preview: projectData.authorName || "—" },
    { field: "sinopse_curta", label: "Sinopse curta", preview: (projectData.synopsisShort || "").slice(0, 40) + ((projectData.synopsisShort?.length ?? 0) > 40 ? "…" : "") },
    { field: "sinopse_longa", label: "Sinopse longa", preview: (projectData.synopsisLong || "").slice(0, 40) + ((projectData.synopsisLong?.length ?? 0) > 40 ? "…" : "") || "Orelha traseira" },
    { field: "bio", label: "Bio do autor", preview: "Texto inserido manualmente" },
    { field: "lombada", label: "Lombada", preview: lombadaContent.slice(0, 40) || "Título · Autor (rotacionado 90°)" },
  ];

  function insertElement(field: SmartField, resolvedContent: SmartFieldContentMap) {
    const el = createSmartFieldElement(
      field,
      format,
      pages,
      comOrelhas,
      fills,
      resolvedContent,
      elements.length,
    );
    addElement(el);
  }

  function handleAddSmartField(field: SmartField) {
    const content = contentMap[field];
    if (!content?.trim()) {
      setPendingField(field);
      return;
    }
    insertElement(field, contentMap);
  }

  function handleModalConfirm(text: string) {
    if (!pendingField) return;
    insertElement(pendingField, { ...contentMap, [pendingField]: text });
    setPendingField(null);
  }

  return (
    <>
      {pendingField && (
        <SmartFieldModal
          field={pendingField}
          onConfirm={handleModalConfirm}
          onCancel={() => setPendingField(null)}
        />
      )}
      <Section title="Texto" defaultOpen={false}>
        <div className="space-y-1.5">
          {smartFields.map(({ field, label, preview }) => (
            <button
              key={field}
              onClick={() => handleAddSmartField(field)}
              className="flex w-full flex-col gap-0.5 rounded-lg border border-[#e0ddd2] px-3 py-2.5 text-left transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            >
              <span className="text-xs font-medium text-zinc-600">+ {label}</span>
              <span className="truncate text-[10px] text-zinc-400">{preview}</span>
            </button>
          ))}
          <button
            onClick={() => {
              const { elements, addElement, format, pages, comOrelhas, fills } = useEditorStore.getState();
              const f = FORMATS[format];
              addElement({
                id: nanoid(),
                type: "text",
                x_mm: SANGRIA_MM + (comOrelhas ? ORELHA_MM : 0) + f.width_mm / 4,
                y_mm: SANGRIA_MM + 30,
                width_mm: f.width_mm / 2,
                height_mm: 20,
                rotation_deg: 0,
                opacity: 1,
                visible: true,
                locked: false,
                zIndex: elements.length,
                content: "Texto livre",
                fontId: "inter",
                fontSize_pt: 14,
                fontWeight: "400",
                fontStyle: "normal",
                textAlign: "left",
                color: getContrastColor(fills.capa ?? "#ffffff"),
                smartField: null,
              });
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#e0ddd2] px-3 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-500"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
            + Texto livre
          </button>
        </div>
      </Section>
    </>
  );
}

// ── Seção 4: Imagens ──────────────────────────────────────────────────────────
function SectionImagens({ projectId }: { projectId: string }) {
  const { addElement, format, comOrelhas } = useEditorStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/images`, { method: "POST", body });
      if (!res.ok) throw new Error("Falha no upload");
      const { url } = await res.json();
      const f = FORMATS[format];
      const orelhaMm = comOrelhas ? ORELHA_MM : 0;
      addElement(
        createImageElement({
          id: nanoid(),
          src: url,
          x_mm: SANGRIA_MM + orelhaMm + f.width_mm + 3,
          y_mm: SANGRIA_MM + 3,
          width_mm: f.width_mm - 6,
          height_mm: f.height_mm - 6,
        }),
      );
    } catch (err) {
      alert("Erro ao enviar imagem: " + String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Section title="Imagens" defaultOpen={false}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-3 py-6 text-center transition-colors ${
          dragging
            ? "border-[#c9a84c] bg-[#c9a84c]/5"
            : uploading
            ? "border-zinc-200 opacity-60"
            : "border-[#e0ddd2] hover:border-zinc-300"
        }`}
      >
        {uploading ? (
          <>
            <svg className="mx-auto mb-2 animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p className="text-xs text-zinc-400">Enviando…</p>
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="1.5" className="mx-auto mb-2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-xs text-zinc-400">Clique ou arraste uma imagem</p>
            <p className="mt-0.5 text-[10px] text-zinc-300">PNG, JPG, WebP · máx. 10 MB</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </Section>
  );
}

// ── Seção 5: Elementos da marca ───────────────────────────────────────────────
function SectionMarca({ projectData }: { projectData: ProjectData }) {
  const { addElement, elements, format, comOrelhas, isbn, setIsbn } = useEditorStore();
  const [isbnInput, setIsbnInput] = useState(projectData.isbn ?? "");
  const [generating, setGenerating] = useState(false);

  function addLogo(variant: "dourado" | "azul") {
    const f = FORMATS[format];
    const orelhaMm = comOrelhas ? ORELHA_MM : 0;
    const xCapaStart = SANGRIA_MM + orelhaMm + f.width_mm + 3;
    addElement(
      createLogoElement({
        id: nanoid(),
        variant,
        x_mm: xCapaStart + f.width_mm - 35,
        y_mm: SANGRIA_MM + f.height_mm - 20,
        width_mm: 30,
        height_mm: 12,
      }),
    );
  }

  async function addBarcode() {
    const val = isbnInput.trim();
    if (!val) return;
    setGenerating(true);
    const dataUrl = await generateBarcodeDataUrl(val);
    setGenerating(false);
    if (!dataUrl) {
      alert("ISBN inválido. Use 10 ou 13 dígitos.");
      return;
    }
    const f = FORMATS[format];
    const orelhaMm = comOrelhas ? ORELHA_MM : 0;
    const xContraStart = SANGRIA_MM + orelhaMm;
    addElement(
      createBarcodeElement({
        id: nanoid(),
        isbn: val,
        cachedDataUrl: dataUrl,
        x_mm: xContraStart + f.width_mm - 40,
        y_mm: SANGRIA_MM + f.height_mm - 35,
        width_mm: 35,
        height_mm: 28,
      }),
    );
    setIsbn(val);
  }

  return (
    <Section title="Elementos da marca" defaultOpen={false}>
      <div className="space-y-2">
        <p className="text-[10px] text-zinc-400">Logos</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => addLogo("dourado")}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-[#e0ddd2] p-2 text-center transition-colors hover:border-zinc-300"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-autoria-dourado.png" alt="" className="h-8 w-auto object-contain" />
            <span className="text-[10px] text-zinc-400">Dourado</span>
          </button>
          <button
            onClick={() => addLogo("azul")}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-[#e0ddd2] p-2 text-center transition-colors hover:border-zinc-300"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-autoria-azul.png" alt="" className="h-8 w-auto object-contain" />
            <span className="text-[10px] text-zinc-400">Azul</span>
          </button>
        </div>

        <div className="pt-1">
          <p className="mb-1 text-[10px] text-zinc-400">Código de barras (ISBN)</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={isbnInput}
              onChange={(e) => setIsbnInput(e.target.value)}
              placeholder="978…"
              maxLength={17}
              className="min-w-0 flex-1 rounded-lg border border-[#e0ddd2] px-2.5 py-1.5 font-mono text-xs outline-none focus:border-[#c9a84c]"
            />
            <button
              onClick={addBarcode}
              disabled={generating || !isbnInput.trim()}
              className="rounded-lg bg-[#1a1a2e] px-3 py-1.5 text-xs font-medium text-[#c9a84c] disabled:opacity-40"
            >
              {generating ? "…" : "+ Gerar"}
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Seção 6: Formas ───────────────────────────────────────────────────────────
function SectionFormas() {
  const { addElement, elements, format, pages, comOrelhas, setSelectedId } = useEditorStore();

  function addShape(shape: ShapeKind) {
    const f = FORMATS[format];
    const lombada = calcularLombada(pages);
    const orelha = comOrelhas ? ORELHA_MM : 0;
    const capaStartMm = SANGRIA_MM + orelha + f.width_mm + lombada;
    const centerX = capaStartMm + f.width_mm / 2;
    const centerY = SANGRIA_MM + f.height_mm / 2;
    const W = 40;
    const H = shape === "line" ? 2 : 40;
    const el = createShapeElement({
      id: nanoid(),
      shape,
      x_mm: centerX - W / 2,
      y_mm: centerY - H / 2,
      width_mm: W,
      height_mm: H,
      zIndex: elements.length,
    });
    addElement(el);
    setSelectedId(el.id);
  }

  const shapes: { kind: ShapeKind; label: string; icon: JSX.Element }[] = [
    {
      kind: "rect",
      label: "Retângulo",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="1.5">
          <rect x="3" y="6" width="18" height="12" rx="1" />
        </svg>
      ),
    },
    {
      kind: "ellipse",
      label: "Elipse",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="1.5">
          <ellipse cx="12" cy="12" rx="9" ry="6" />
        </svg>
      ),
    },
    {
      kind: "line",
      label: "Linha",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="2">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      ),
    },
    {
      kind: "triangle",
      label: "Triângulo",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a9a9a" strokeWidth="1.5">
          <polygon points="12,4 21,20 3,20" />
        </svg>
      ),
    },
  ];

  return (
    <Section title="Formas" defaultOpen={false}>
      <div className="grid grid-cols-2 gap-2">
        {shapes.map(({ kind, label, icon }) => (
          <button
            key={kind}
            onClick={() => addShape(kind)}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-[#e0ddd2] px-2 py-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            {icon}
            <span className="text-[10px] text-zinc-400">{label}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

// ── Seção 7: Camadas ──────────────────────────────────────────────────────────
function SectionCamadas() {
  const { elements, selectedId, setSelectedId, deleteElement, moveElementZ, updateElement } =
    useEditorStore();
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const typeLabel: Record<string, string> = {
    text: "T",
    image: "⬜",
    logo: "★",
    barcode: "▦",
    shape: "◆",
  };

  const shapeLabel: Record<string, string> = {
    rect: "Retângulo",
    ellipse: "Elipse",
    line: "Linha",
    triangle: "Triângulo",
  };

  if (sorted.length === 0) {
    return (
      <Section title="Camadas" defaultOpen={false}>
        <p className="py-3 text-center text-xs text-zinc-300">Nenhum elemento adicionado</p>
      </Section>
    );
  }

  return (
    <Section title="Camadas" defaultOpen={true}>
      <div className="space-y-1">
        {sorted.map((el) => (
          <div
            key={el.id}
            onClick={() => setSelectedId(el.id)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors cursor-pointer ${
              selectedId === el.id
                ? "bg-[#c9a84c]/10 text-[#1a1a2e]"
                : "text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            <span className="w-4 shrink-0 text-center font-mono text-[10px]">
              {typeLabel[el.type] ?? el.type[0].toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {el.type === "text"
                ? ((el as any).content || (el as any).smartField || "Texto")
                : el.type === "logo"
                ? `Logo ${(el as any).variant}`
                : el.type === "barcode"
                ? `ISBN ${(el as any).isbn || ""}`
                : el.type === "shape"
                ? (shapeLabel[(el as any).shape] ?? "Forma")
                : "Imagem"}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); updateElement(el.id, { visible: !el.visible }); }}
                title={el.visible ? "Ocultar" : "Mostrar"}
                className="rounded p-0.5 text-zinc-300 hover:text-zinc-600"
              >
                {el.visible ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveElementZ(el.id, 1); }}
                title="Para frente"
                className="rounded p-0.5 text-zinc-300 hover:text-zinc-600"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveElementZ(el.id, -1); }}
                title="Para trás"
                className="rounded p-0.5 text-zinc-300 hover:text-zinc-600"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteElement(el.id); }}
                title="Excluir"
                className="rounded p-0.5 text-zinc-300 hover:text-red-400"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
export function EditorSidebar({ projectData }: { projectData: ProjectData }) {
  const { comOrelhas } = useEditorStore();

  return (
    <div
      className="flex flex-col overflow-y-auto border-r border-[#e0ddd2] bg-[#fdfcf9]"
      style={{ width: 240, flexShrink: 0 }}
    >
      <SectionFormato />
      <SectionCores comOrelhas={comOrelhas} />
      <SectionTexto projectData={projectData} />
      <SectionImagens projectId={projectData.projectId} />
      <SectionMarca projectData={projectData} />
      <SectionFormas />
      <SectionCamadas />
    </div>
  );
}

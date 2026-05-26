"use client";

import { useState } from "react";
import { useEditorStore } from "../lib/editor-store";
import { FORMATS, calcularLombada } from "../lib/dimensions";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-mono uppercase tracking-[0.08em] text-[#6b6b6b]"
      style={{ fontSize: "11px" }}
    >
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

function PlaceholderButton({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <button
      title="Disponível em breve"
      onClick={() => {}}
      className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#e0ddd2] px-3 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-500"
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

function ColorSwatchPlaceholder({ label }: { label: string }) {
  return (
    <button
      title="Disponível em breve"
      className="flex flex-col items-center gap-1.5 rounded-lg border border-[#e0ddd2] p-2 text-center transition-colors hover:border-zinc-300"
    >
      <div className="h-6 w-full rounded bg-zinc-100" />
      <span className="text-[10px] text-zinc-400">{label}</span>
    </button>
  );
}

export function EditorSidebar() {
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
    <div
      className="flex flex-col overflow-y-auto border-r border-[#e0ddd2] bg-[#fdfcf9]"
      style={{ width: 240, flexShrink: 0 }}
    >
      {/* ── Seção 1: Formato e estrutura ── */}
      <Section title="Formato e estrutura">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] text-zinc-400">Formato</p>
            <div
              className="flex items-center rounded-lg border border-[#e0ddd2] bg-zinc-50 px-2.5 py-2"
              title="Definido na diagramação. Para alterar, refaça o miolo."
            >
              <span className="flex-1 text-xs text-zinc-500">
                {fmtLabel[format] ?? format}
              </span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9a9a9a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
            </div>
            <p className="mt-1 text-[10px] text-zinc-300">
              Definido na diagramação
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] text-zinc-400">Páginas</p>
            <div className="rounded-lg border border-[#e0ddd2] bg-zinc-50 px-2.5 py-2">
              <span className="text-xs text-zinc-500">
                {pages} págs · lombada {lombadaMm.toFixed(1)}mm
              </span>
            </div>
          </div>

          <div>
            <label className="flex cursor-pointer items-center justify-between">
              <span className="text-xs text-zinc-600">Orelhas (8cm)</span>
              <button
                type="button"
                role="switch"
                aria-checked={comOrelhas}
                onClick={() => setComOrelhas(!comOrelhas)}
                className={`relative h-5 w-9 rounded-full border-2 transition-colors ${
                  comOrelhas
                    ? "border-[#c9a84c] bg-[#c9a84c]"
                    : "border-zinc-300 bg-zinc-200"
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
              <p className="mt-1.5 text-[10px] text-zinc-400">
                +2 × 80mm laterais no canvas
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* ── Seção 2: Cores de fundo ── */}
      <Section title="Cores de fundo" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <ColorSwatchPlaceholder label="Capa (frente)" />
          <ColorSwatchPlaceholder label="Contracapa" />
          <ColorSwatchPlaceholder label="Lombada" />
          {comOrelhas && <ColorSwatchPlaceholder label="Orelhas" />}
        </div>
        <p className="mt-2 text-center text-[10px] text-zinc-300">
          Disponível em breve
        </p>
      </Section>

      {/* ── Seção 3: Texto ── */}
      <Section title="Texto" defaultOpen={false}>
        <PlaceholderButton
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7V4h16v3M9 20h6M12 4v16" />
            </svg>
          }
        >
          + Adicionar caixa de texto
        </PlaceholderButton>
      </Section>

      {/* ── Seção 4: Imagens ── */}
      <Section title="Imagens" defaultOpen={false}>
        <PlaceholderButton
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          }
        >
          + Adicionar imagem
        </PlaceholderButton>
      </Section>

      {/* ── Seção 5: Elementos da marca ── */}
      <Section title="Elementos da marca" defaultOpen={false}>
        <div className="space-y-2">
          <PlaceholderButton
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            }
          >
            + Logo Autoria
            {/* TODO: use public/brand/logo-autoria-dourado.png when Onda 2 implements this */}
          </PlaceholderButton>
          <PlaceholderButton
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="7" y1="8" x2="7" y2="16" />
                <line x1="11" y1="8" x2="11" y2="16" />
                <line x1="14" y1="8" x2="14" y2="16" />
                <line x1="17" y1="8" x2="17" y2="16" />
              </svg>
            }
          >
            + Código de barras (ISBN)
          </PlaceholderButton>
        </div>
      </Section>

      {/* ── Seção 6: Camadas ── */}
      <Section title="Camadas" defaultOpen={false}>
        <p className="text-center text-xs text-zinc-300 py-3">
          Nenhum elemento adicionado
        </p>
      </Section>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { SmartField } from "../lib/elements";

const FIELD_CONFIG: Record<
  SmartField,
  { title: string; label: string; multiline: boolean; placeholder: string }
> = {
  titulo: {
    title: "Título da obra",
    label: "Como você quer que o título apareça na capa?",
    multiline: false,
    placeholder: "Ex: O Último Horizonte",
  },
  subtitulo: {
    title: "Subtítulo",
    label: "Adicione um subtítulo (opcional)",
    multiline: false,
    placeholder: "Ex: Uma história de aventura e descoberta",
  },
  autor: {
    title: "Nome do autor",
    label: "Como você quer que seu nome apareça na capa?",
    multiline: false,
    placeholder: "Ex: Maria Silva",
  },
  sinopse_curta: {
    title: "Sinopse curta",
    label: "Texto para a contracapa (máx. 400 caracteres recomendado)",
    multiline: true,
    placeholder: "Uma história sobre…",
  },
  bio: {
    title: "Biografia do autor",
    label: "Texto de apresentação para a orelha frontal",
    multiline: true,
    placeholder: "Nascido em…",
  },
  sinopse_longa: {
    title: "Sinopse longa",
    label: "Texto completo para a orelha traseira",
    multiline: true,
    placeholder: "Em um mundo onde…",
  },
};

interface SmartFieldModalProps {
  field: SmartField;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

export function SmartFieldModal({ field, onConfirm, onCancel }: SmartFieldModalProps) {
  const config = FIELD_CONFIG[field];
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    onConfirm(value.trim());
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl bg-[#fdfcf9] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-sm font-semibold text-[#1a1a2e]">{config.title}</p>
        <p className="mb-4 text-xs text-zinc-400">{config.label}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {config.multiline ? (
            <textarea
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.placeholder}
              rows={4}
              className="w-full resize-none rounded-xl border border-[#e0ddd2] px-3 py-2.5 text-sm outline-none focus:border-[#c9a84c]"
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={config.placeholder}
              className="w-full rounded-xl border border-[#e0ddd2] px-3 py-2.5 text-sm outline-none focus:border-[#c9a84c]"
            />
          )}

          <p className="text-[10px] text-zinc-300">
            Este texto ficará apenas na capa. Para editar a fonte de dados,{" "}
            acesse as informações do projeto.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-[#e0ddd2] py-2.5 text-sm text-zinc-500 transition-colors hover:border-zinc-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="flex-1 rounded-xl bg-[#1a1a2e] py-2.5 text-sm font-medium text-[#c9a84c] disabled:opacity-40"
            >
              Inserir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { FORMATOS_LIVRO, type FormatoLivro } from "@/lib/formatos";

interface Props {
  projectId: string;
  initialFormato: FormatoLivro | null;
  sugestao?: FormatoLivro | null;
  locked: boolean;
  onSaved?: (formato: FormatoLivro) => void;
}

export function EscolhaFormato({ projectId, initialFormato, sugestao, locked, onSaved }: Props) {
  const [selected, setSelected] = useState<FormatoLivro | null>(initialFormato);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoCapa, setAvisoCapa] = useState(false);

  async function handleSelect(value: FormatoLivro) {
    if (locked || saving) return;
    if (value === selected) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/formato`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato: value }),
      });

      if (res.status === 409) {
        setError("Formato bloqueado após geração da capa.");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error ?? "Erro ao salvar formato.");
        return;
      }

      const data = await res.json().catch(() => ({})) as {
        capa_pode_estar_desatualizada?: boolean;
      };
      setAvisoCapa(!!data.capa_pode_estar_desatualizada);
      setSelected(value);
      onSaved?.(value);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {FORMATOS_LIVRO.map((fmt) => {
          const isActive = selected === fmt.value;
          const isSugerido = !isActive && selected === null && sugestao === fmt.value;
          return (
            <button
              key={fmt.value}
              onClick={() => handleSelect(fmt.value)}
              disabled={locked || saving}
              className={[
                "relative flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-4 text-sm transition-colors",
                isActive
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : isSugerido
                    ? "border-dashed border-amber-500 bg-amber-50/40 text-gray-700 hover:bg-amber-50"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                locked || saving ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              ].join(" ")}
            >
              {isSugerido && (
                <span className="absolute -top-2 right-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                  Sugerido
                </span>
              )}
              <span className="font-semibold">{fmt.label}</span>
              <span className="text-xs text-gray-500">{fmt.descricao_curta}</span>
            </button>
          );
        })}
      </div>

      {locked && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">
          Formato bloqueado após geração da capa. Para alterar, entre em contato com o suporte.
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {avisoCapa && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Você mudou o formato do livro. Sua capa foi criada no formato
          anterior e pode precisar de ajuste — revise-a na etapa Capa antes
          de gerar a prova.
        </p>
      )}

      {saving && (
        <p className="text-sm text-gray-500">Salvando…</p>
      )}
    </div>
  );
}

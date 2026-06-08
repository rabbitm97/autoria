"use client";

import { useState, useMemo } from "react";

interface CandidatoCapitulo {
  id: string;
  titulo: string;
  pos: number;
  origem:
    | "marcador_explicito"
    | "marcador_divisor"
    | "secao_nomeada"
    | "markdown_heading"
    | "all_caps_isolado"
    | "numero_isolado";
  score: number;
  sugerido: boolean;
  preview_antes: string;
  preview_depois: string;
  palavras_no_segmento: number;
  motivo_descartado?: string;
}

interface Props {
  candidatos: CandidatoCapitulo[];
  onConfirmar: (capitulos: { titulo: string; pos: number }[]) => void;
  onVoltar: () => void;
  loading?: boolean;
}

const ORIGEM_LABEL: Record<CandidatoCapitulo["origem"], string> = {
  marcador_explicito: "Capítulo explícito",
  marcador_divisor: "Cercado por divisores",
  secao_nomeada: "Seção nomeada",
  markdown_heading: "Markdown",
  all_caps_isolado: "ALL CAPS isolado",
  numero_isolado: "Número isolado",
};

const ORIGEM_COR: Record<CandidatoCapitulo["origem"], string> = {
  marcador_explicito: "bg-green-100 text-green-800 border-green-300",
  marcador_divisor: "bg-blue-100 text-blue-800 border-blue-300",
  secao_nomeada: "bg-purple-100 text-purple-800 border-purple-300",
  markdown_heading: "bg-indigo-100 text-indigo-800 border-indigo-300",
  all_caps_isolado: "bg-amber-100 text-amber-800 border-amber-300",
  numero_isolado: "bg-zinc-100 text-zinc-800 border-zinc-300",
};

export function AprovacaoCapitulos({ candidatos, onConfirmar, onVoltar, loading }: Props) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(candidatos.filter(c => c.sugerido).map(c => c.id))
  );

  const [titulos, setTitulos] = useState<Record<string, string>>(
    () => candidatos.reduce((acc, c) => ({ ...acc, [c.id]: c.titulo }), {})
  );

  const totalMarcados = marcados.size;
  const sorted = useMemo(() => [...candidatos].sort((a, b) => a.pos - b.pos), [candidatos]);

  function toggle(id: string) {
    setMarcados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function marcarSugeridos() {
    setMarcados(new Set(candidatos.filter(c => c.sugerido).map(c => c.id)));
  }

  function marcarTodos() {
    setMarcados(new Set(candidatos.map(c => c.id)));
  }

  function limparTodos() {
    setMarcados(new Set());
  }

  function handleConfirmar() {
    const aprovados = sorted
      .filter(c => marcados.has(c.id))
      .map(c => ({
        titulo: (titulos[c.id] ?? c.titulo).trim(),
        pos: c.pos,
      }))
      .filter(c => c.titulo.length > 0);
    onConfirmar(aprovados);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Aprove os capítulos do seu livro</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Detectamos {candidatos.length} candidatos a capítulo no manuscrito.{" "}
          {candidatos.filter(c => c.sugerido).length} foram pré-marcados com base na nossa análise.
          Confirme, ajuste títulos se quiser, e clique em{" "}
          <strong>Confirmar e gerar miolo</strong>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-y border-zinc-200 py-3">
        <button
          type="button"
          onClick={marcarSugeridos}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          Marcar sugeridos
        </button>
        <button
          type="button"
          onClick={marcarTodos}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          Marcar todos
        </button>
        <button
          type="button"
          onClick={limparTodos}
          className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          Limpar
        </button>
        <div className="ml-auto self-center text-sm text-zinc-600">
          <strong>{totalMarcados}</strong> de {candidatos.length} selecionados
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-zinc-200">
        {sorted.length === 0 && (
          <div className="p-6 text-center text-sm text-zinc-500">
            Nenhum candidato a capítulo detectado neste manuscrito.
          </div>
        )}
        {sorted.map(c => {
          const isMarked = marcados.has(c.id);
          return (
            <div
              key={c.id}
              className={`border-b border-zinc-100 px-4 py-3 transition ${
                isMarked ? "bg-amber-50/40" : "bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isMarked}
                  onChange={() => toggle(c.id)}
                  className="mt-1.5 h-4 w-4 rounded border-zinc-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={titulos[c.id] ?? c.titulo}
                      onChange={e => setTitulos(prev => ({ ...prev, [c.id]: e.target.value }))}
                      disabled={!isMarked}
                      className={`min-w-0 flex-1 rounded border border-zinc-200 px-2 py-1 text-sm ${
                        isMarked ? "bg-white" : "bg-zinc-50 text-zinc-500"
                      }`}
                    />
                    <span
                      className={`whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-medium ${ORIGEM_COR[c.origem]}`}
                    >
                      {ORIGEM_LABEL[c.origem]}
                    </span>
                    <span className="whitespace-nowrap text-[10px] text-zinc-400">
                      score {c.score.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] text-zinc-500 sm:grid-cols-2">
                    <div>
                      <span className="font-mono text-zinc-400">…antes:</span> {c.preview_antes}
                    </div>
                    <div>
                      <span className="font-mono text-zinc-400">depois:</span> {c.preview_depois}
                    </div>
                  </div>
                  {c.motivo_descartado && (
                    <div className="mt-1 text-[11px] italic text-zinc-400">
                      {c.motivo_descartado}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
        <button
          type="button"
          onClick={onVoltar}
          disabled={loading}
          className="rounded border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          ← Voltar para configurações
        </button>
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={loading || totalMarcados === 0}
          className="rounded bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading
            ? "Gerando miolo..."
            : `Confirmar ${totalMarcados} capítulos e gerar miolo →`}
        </button>
      </div>
    </div>
  );
}

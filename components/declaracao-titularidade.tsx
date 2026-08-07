"use client";

// LEGAL-1C — Bloco de aceite da Declaração de Titularidade e Originalidade
// (Anexo I do Contrato de Prestação de Serviços). Compartilhado entre o
// upload normal (`app/dashboard/novo-projeto`) e o Express
// (`app/dashboard/livro-pronto`). Os 7 itens ficam VISÍVEIS na expansão,
// espelhando o Anexo I — item 7 destaca art. 299 CP.
//
// O texto dos 7 itens vem do componente compartilhado
// `app/(legal)/contrato-servicos/_anexo-i.tsx`, que é também a fonte-única
// consumida pelo `LEGAL_DOC_SOURCES["declaracao-titularidade"]` para o
// cálculo de hash. Assim página pública e gate NUNCA divergem.

import Link from "next/link";
import { AnexoIContent } from "@/app/(legal)/contrato-servicos/_anexo-i";

type Props = {
  aceita: boolean;
  aberta: boolean;
  disabled?: boolean;
  onAceita: (v: boolean) => void;
  onToggle: () => void;
};

export function DeclaracaoTitularidade({
  aceita,
  aberta,
  disabled,
  onAceita,
  onToggle,
}: Props) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={aberta}
      >
        <span className="text-sm font-semibold text-brand-primary">
          Declaração de Titularidade e Originalidade
        </span>
        <span className="text-xs text-zinc-500">
          {aberta ? "Recolher −" : "Ler os 7 itens +"}
        </span>
      </button>

      {aberta && (
        <div className="px-4 pb-4 pt-1 border-t border-zinc-200 space-y-3 text-sm text-zinc-700 leading-relaxed">
          <AnexoIContent />
          <p className="text-xs text-zinc-500 italic">
            Texto integral no{" "}
            <Link href="/contrato-servicos#anexo-i" target="_blank" rel="noreferrer" className="underline hover:text-brand-primary">
              Anexo I do Contrato de Serviços
            </Link>.
          </p>
        </div>
      )}

      <label className="flex items-start gap-3 px-4 py-3 border-t border-zinc-200 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={aceita}
          onChange={(e) => onAceita(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-brand-gold accent-brand-gold focus:ring-2 focus:ring-brand-gold/40"
        />
        <span className="text-sm text-zinc-700 leading-relaxed">
          Li e concordo com a Declaração de Titularidade e Originalidade acima.
          Estou ciente de que declaração falsa é falsidade ideológica
          (art. 299 do Código Penal).
        </span>
      </label>
    </div>
  );
}

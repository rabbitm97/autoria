"use client";

import Link from "next/link";

// ─── ExpressProgress ──────────────────────────────────────────────────────────
// Barra de progresso da trilha Express (livro pronto para publicar).
// Apenas 3 etapas: Arquivo → Capa → Prova. Substitui EtapasProgress quando
// `dados_pdf.origem === "upload"` — o autor pulou toda a esteira editorial.
// currentStep: 0=Arquivo, 1=Capa, 2=Prova.
//
// Só o passo "Capa" (índice 1) é linkável quando concluído — o passo 0 é o
// próprio upload já persistido em projeto e não tem tela dedicada.

const ETAPAS: { label: string; path: string | null }[] = [
  { label: "Arquivo do livro", path: null   },
  { label: "Capa",             path: "capa" },
  { label: "Conferência final", path: null   },
];

export function ExpressProgress({
  currentStep,
  projectId,
}: {
  currentStep: 0 | 1 | 2;
  projectId?: string;
}) {
  return (
    <div className="bg-brand-primary border-b border-white/5">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <ol className="flex items-center overflow-x-auto">
          {ETAPAS.map((etapa, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;

            const badge = (
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${done   ? "bg-emerald-500 text-white" :
                    active ? "bg-brand-gold text-brand-primary" :
                             "bg-white/10 text-white/30"}`}
              >
                {done ? "✓" : i + 1}
              </span>
            );

            const label = (
              <span
                className={`text-xs
                  ${done   ? "text-emerald-400" :
                    active ? "text-brand-gold font-medium" :
                             "text-white/30"}`}
              >
                {etapa.label}
              </span>
            );

            const inner = (
              <div className="flex items-center gap-2">
                {badge}
                {label}
              </div>
            );

            return (
              <li key={etapa.label} className="flex items-center shrink-0">
                {done && projectId && etapa.path ? (
                  <Link
                    href={`/dashboard/${etapa.path}/${projectId}`}
                    className="hover:opacity-80 transition-opacity"
                    title={`Voltar para ${etapa.label}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
                {i < ETAPAS.length - 1 && (
                  <span className="mx-3 text-white/10 text-xs shrink-0">›</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

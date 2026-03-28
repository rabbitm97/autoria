"use client";

// ─── EtapasProgress ───────────────────────────────────────────────────────────
// Shared horizontal progress indicator used across all editorial-flow pages.
// currentStep: 0=Diagnóstico, 1=Revisão, 2=Elementos, 3=Capa, 4=Diagramação, 5=QA, 6=Publicação

const ETAPAS = [
  "Diagnóstico",
  "Revisão",
  "Elementos",
  "Capa",
  "Diagramação",
  "QA",
  "Publicação",
];

export function EtapasProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="bg-brand-primary border-b border-white/5">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <ol className="flex items-center overflow-x-auto">
          {ETAPAS.map((etapa, i) => {
            const done   = i < currentStep;
            const active = i === currentStep;
            return (
              <li key={etapa} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${done   ? "bg-emerald-500 text-white" :
                        active ? "bg-brand-gold text-brand-primary" :
                                 "bg-white/10 text-white/30"}`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`text-xs
                      ${done   ? "text-emerald-400" :
                        active ? "text-brand-gold font-medium" :
                                 "text-white/30"}`}
                  >
                    {etapa}
                  </span>
                </div>
                {i < ETAPAS.length - 1 && (
                  <span className="mx-3 text-white/10 text-xs">›</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

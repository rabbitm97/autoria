"use client";

import Link from "next/link";

// ─── EtapasProgress ───────────────────────────────────────────────────────────
// Shared horizontal progress indicator used across all editorial-flow pages.
// currentStep: 0=Diagnóstico, 1=Revisão, 2=Elementos, 3=Capa, 4=Créditos, 5=Diagramação, 6=QA, 7=Publicação
//
// Pass projectId to make completed steps clickable links back to each step page.

const ETAPAS: { label: string; path: string }[] = [
  { label: "Diagnóstico",  path: "diagnostico"  },
  { label: "Revisão",      path: "revisao"      },
  { label: "Elementos",    path: "elementos"    },
  { label: "Capa",         path: "capa"         },
  { label: "Créditos",     path: "creditos"     },
  { label: "Diagramação",  path: "miolo"        },
  { label: "QA",           path: "qa"           },
  { label: "Publicação",   path: "publicacao"   },
];

export function EtapasProgress({
  currentStep,
  projectId,
}: {
  currentStep: number;
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
                {done && projectId ? (
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

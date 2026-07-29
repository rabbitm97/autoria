"use client";

// Tela de conversão de plano (D2-05) — componente compartilhado.
// Extraído de app/dashboard/prova/[id]/page.tsx para reuso em outras
// telas que fazem paywall antes de acionar recursos pagos (ex.: capa IA).
// Copy vem de lib/planos.ts — NÃO duplicar frases ou preços aqui.

import { useRouter } from "next/navigation";
import {
  PLANO_LABEL,
  PLANO_TAGLINE,
  PLANO_DESTAQUES,
  formatarPrecoPlano,
} from "@/lib/planos";

export function TelaConversaoPlano({
  eyebrow = "Seu livro está pronto",
  titulo = "Selecione o plano para continuar",
}: {
  eyebrow?: string;
  titulo?: string;
}) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="text-center pt-2">
        <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-2">
          {eyebrow}
        </p>
        <h2 className="font-heading text-2xl text-brand-primary">
          {titulo}
        </h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <PlanoCard
          plano="essencial"
          onContinuar={() => router.push("/dashboard/planos")}
        />
        <PlanoCard
          plano="pro"
          destaque
          onContinuar={() => router.push("/dashboard/planos")}
        />
      </div>
    </div>
  );
}

export function PlanoCard({
  plano,
  destaque = false,
  onContinuar,
}: {
  plano: "essencial" | "pro";
  destaque?: boolean;
  onContinuar: () => void;
}) {
  return (
    <div
      className={`rounded-2xl p-6 flex flex-col relative ${
        destaque
          ? "border-2 border-brand-gold bg-white shadow-lg"
          : "border border-zinc-100 bg-white"
      }`}
    >
      {destaque && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-brand-gold text-brand-primary text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
            Recomendado
          </span>
        </div>
      )}

      <div className="mb-4">
        <p className="font-heading text-xl text-brand-primary mb-2">
          {PLANO_LABEL[plano]}
        </p>
        <p className="font-heading text-3xl text-brand-primary mb-3">
          {formatarPrecoPlano(plano)}
        </p>
        <p className="text-sm text-zinc-500">
          {PLANO_TAGLINE[plano]}
        </p>
      </div>

      <ul className="flex-1 space-y-2 mb-6">
        {PLANO_DESTAQUES[plano].map((d, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c9a84c"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{d}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onContinuar}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
          destaque
            ? "bg-brand-primary text-brand-gold hover:bg-brand-primary/90"
            : "border border-brand-primary text-brand-primary hover:bg-brand-primary/5"
        }`}
      >
        Continuar com {PLANO_LABEL[plano]}
      </button>
    </div>
  );
}

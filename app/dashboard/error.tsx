"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] unhandled error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2 className="font-heading text-xl text-brand-primary mb-2">
        Algo deu errado
      </h2>
      <p className="text-zinc-500 text-sm mb-6 max-w-sm">
        {error.message || "Ocorreu um erro inesperado. Tente novamente."}
      </p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-xl bg-brand-primary text-brand-gold text-sm font-medium hover:bg-brand-primary/90 transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );
}

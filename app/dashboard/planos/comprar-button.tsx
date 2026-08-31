"use client";

import { useState } from "react";

export function ComprarComCreditos({
  projectId,
  plano,
  custo,
  upgrade,
  saldo,
  destaque,
}: {
  projectId: string;
  plano: "essencial" | "pro";
  custo: number;
  upgrade: boolean;
  saldo: number;
  destaque: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const suficiente = saldo >= custo;

  async function comprar() {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plano/comprar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? "Não foi possível concluir. Tente novamente.");
        setLoading(false);
        return;
      }
      window.location.href = `/dashboard?projeto=${projectId}`;
    } catch {
      setErro("Não foi possível concluir. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={comprar}
        disabled={loading || !suficiente}
        className={`w-full py-3.5 rounded-xl font-semibold text-sm text-center transition-all disabled:opacity-60 ${
          destaque
            ? "bg-brand-gold text-brand-primary hover:bg-brand-gold-light"
            : "bg-brand-primary text-brand-surface hover:bg-[#2a2a4e]"
        }`}
      >
        {loading
          ? "Ativando..."
          : upgrade
            ? `Fazer upgrade — ${custo} créditos`
            : `Usar meus créditos — ${custo}`}
      </button>
      <p className={`mt-2 text-center text-[11px] ${destaque ? "text-white/60" : "text-zinc-400"}`}>
        {suficiente
          ? `Debitado do seu saldo (você tem ${saldo}).`
          : `Você tem ${saldo} créditos — insuficiente para este plano.`}
      </p>
      {erro && (
        <p className={`mt-1 text-center text-[11px] ${destaque ? "text-red-300" : "text-red-500"}`}>
          {erro}
        </p>
      )}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { joinWaitlist } from "@/app/actions/waitlist";

export default function WaitlistForm() {
  const [state, action, isPending] = useActionState(joinWaitlist, null);

  if (state?.status === "success") {
    return (
      <div className="bg-brand-gold/10 border border-brand-gold/20 rounded-2xl p-8 text-center">
        <div className="text-5xl mb-3">🎉</div>
        <p className="font-heading text-xl text-brand-gold">{state.message}</p>
        <p className="text-brand-surface/50 text-sm mt-2 leading-relaxed">
          Fique de olho no seu e-mail. Você receberá acesso antecipado com{" "}
          <strong className="text-brand-gold/80">20% de desconto</strong>.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          name="email"
          placeholder="seu@email.com"
          required
          disabled={isPending}
          className="flex-1 bg-white/10 border border-white/20 text-brand-surface placeholder:text-brand-surface/40 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold focus:border-transparent disabled:opacity-50 transition"
        />
        <button
          type="submit"
          disabled={isPending}
          className="bg-brand-gold text-brand-primary px-7 py-3.5 rounded-xl font-semibold text-sm hover:bg-brand-gold-light active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {isPending ? "Enviando…" : "Garantir meu lugar"}
        </button>
      </div>

      {state?.status === "error" && (
        <p className="text-red-400 text-sm text-center">{state.message}</p>
      )}
    </form>
  );
}

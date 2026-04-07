"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function EsqueciSenhaPage() {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
    });

    if (err) {
      setError("Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-brand-primary flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-heading text-2xl text-brand-gold block mb-10">
          Autoria
        </Link>

        {sent ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center mx-auto mb-6">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <h2 className="font-heading text-2xl text-white mb-3">Verifique seu e-mail</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-2">
              Enviamos um link de redefinição para
            </p>
            <p className="text-brand-gold font-semibold text-sm mb-6">{email}</p>
            <p className="text-white/30 text-xs mb-8">
              O link expira em 1 hora. Não encontrou? Verifique o spam.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="text-sm text-brand-gold/70 hover:text-brand-gold underline underline-offset-4 transition-colors"
            >
              Tentar outro e-mail
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="font-heading text-3xl text-white mb-2">Esqueci minha senha</h1>
              <p className="text-white/50 text-sm">
                Informe seu e-mail e enviaremos um link para criar uma nova senha.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold/50 disabled:opacity-50 transition"
                />
              </div>

              {error && (
                <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full bg-brand-gold text-brand-primary rounded-xl py-3.5 px-4 text-sm font-semibold hover:bg-brand-gold-light active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Enviando…" : "Enviar link de redefinição"}
              </button>
            </form>

            <p className="mt-8 text-center text-xs text-white/25">
              Lembrou a senha?{" "}
              <Link href="/login" className="text-brand-gold/60 hover:text-brand-gold underline underline-offset-2 transition-colors">
                Voltar ao login
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

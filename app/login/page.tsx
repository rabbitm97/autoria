"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type LoadingState = "google" | "magic" | null;

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<LoadingState>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setLoading("google");
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError("Não foi possível conectar com o Google. Tente novamente.");
      setLoading(null);
    }
  }

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setLoading("magic");
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError("Não foi possível enviar o link. Verifique o e-mail e tente novamente.");
    } else {
      setSent(true);
    }
    setLoading(null);
  }

  const isDisabled = loading !== null;

  return (
    <main className="min-h-screen bg-brand-primary flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logotipo */}
        <div className="text-center mb-8">
          <p className="text-brand-gold/50 text-xs tracking-[0.25em] uppercase mb-2">
            plataforma
          </p>
          <h1 className="font-heading text-5xl text-brand-gold leading-none">
            Autoria
          </h1>
          <p className="text-brand-gold-light/60 text-sm mt-2 tracking-wide">
            Do manuscrito ao leitor.
          </p>
        </div>

        {/* Card */}
        <div className="bg-brand-surface rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-brand-gold via-brand-gold-light to-brand-gold" />

          <div className="p-8">
            {sent ? (
              <SuccessState email={email} onReset={() => { setSent(false); setEmail(""); }} />
            ) : (
              <>
                <h2 className="font-heading text-2xl text-brand-primary mb-1">
                  Bem-vindo de volta
                </h2>
                <p className="text-zinc-500 text-sm mb-7">
                  Entre para continuar sua obra.
                </p>

                {/* Botão Google */}
                <button
                  onClick={handleGoogle}
                  disabled={isDisabled}
                  className="w-full flex items-center justify-center gap-3 bg-brand-primary text-brand-surface rounded-xl py-3.5 px-4 text-sm font-medium hover:bg-[#2a2a4e] active:bg-[#0f0f1e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <GoogleIcon />
                  {loading === "google" ? "Redirecionando…" : "Entrar com Google"}
                </button>

                {/* Divisor */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-zinc-200" />
                  <span className="text-zinc-400 text-xs font-medium">ou</span>
                  <div className="flex-1 h-px bg-zinc-200" />
                </div>

                {/* Formulário magic link */}
                <form onSubmit={handleMagicLink} className="space-y-3">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-zinc-700 mb-1.5"
                    >
                      E-mail
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      disabled={isDisabled}
                      autoComplete="email"
                      className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isDisabled || !email}
                    className="w-full bg-brand-gold text-brand-primary rounded-xl py-3.5 px-4 text-sm font-semibold hover:bg-brand-gold-light active:bg-brand-gold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading === "magic" ? "Enviando…" : "Enviar link mágico"}
                  </button>
                </form>

                {error && (
                  <p className="mt-4 text-sm text-red-600 text-center leading-relaxed">
                    {error}
                  </p>
                )}

                <p className="mt-7 text-center text-xs text-zinc-400 leading-relaxed">
                  Ao entrar, você concorda com os{" "}
                  <a
                    href="/termos"
                    className="underline underline-offset-2 hover:text-zinc-600 transition-colors"
                  >
                    Termos de Uso
                  </a>{" "}
                  e a{" "}
                  <a
                    href="/privacidade"
                    className="underline underline-offset-2 hover:text-zinc-600 transition-colors"
                  >
                    Política de Privacidade
                  </a>
                  .
                </p>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-brand-gold/30 text-xs mt-6">
          © {new Date().getFullYear()} Autoria. Todos os direitos reservados.
        </p>
      </div>
    </main>
  );
}

/* ---------- Sub-componentes ---------- */

function SuccessState({
  email,
  onReset,
}: {
  email: string;
  onReset: () => void;
}) {
  return (
    <div className="text-center py-4">
      <div className="w-14 h-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
        <EnvelopeIcon />
      </div>
      <h2 className="font-heading text-xl text-brand-primary mb-2">
        Verifique seu e-mail
      </h2>
      <p className="text-zinc-500 text-sm leading-relaxed">
        Enviamos um link de acesso para{" "}
        <span className="font-semibold text-brand-primary">{email}</span>.
        Clique no link para entrar na plataforma.
      </p>
      <p className="text-zinc-400 text-xs mt-3">
        Não encontrou? Verifique a pasta de spam.
      </p>
      <button
        onClick={onReset}
        className="mt-6 text-sm text-brand-gold hover:text-brand-gold-light underline underline-offset-4 transition-colors"
      >
        Usar outro e-mail
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#c9a84c"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

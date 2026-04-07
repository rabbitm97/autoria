"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail]     = useState("");
  const [senha, setSenha]     = useState("");
  const [loading, setLoading] = useState<"password" | "google" | "magic" | null>(null);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [info, setInfo]       = useState<string | null>(null);
  const [showMagic, setShowMagic] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    const ok  = searchParams.get("cadastro");
    if (err === "auth") setError("O link de acesso expirou ou já foi usado. Solicite um novo abaixo.");
    if (ok  === "ok")  setInfo("Conta criada! Verifique seu e-mail para confirmar, depois faça login.");
  }, [searchParams]);

  // ── Email + senha ──────────────────────────────────────────────────────────
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !senha) return;
    setLoading("password");
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (err) {
      setError(
        err.message.includes("Invalid login")
          ? "E-mail ou senha incorretos."
          : `Erro ao entrar: ${err.message}`
      );
      setLoading(null);
      return;
    }

    router.push("/dashboard");
  }

  // ── Google ─────────────────────────────────────────────────────────────────
  async function handleGoogle() {
    setLoading("google");
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError("Não foi possível conectar com o Google. Tente novamente.");
      setLoading(null);
    }
  }

  // ── Magic link ─────────────────────────────────────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading("magic");
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError("Não foi possível enviar o link. Verifique o e-mail.");
    } else {
      setSent(true);
    }
    setLoading(null);
  }

  const isDisabled = loading !== null;

  return (
    <div className="min-h-screen bg-brand-primary flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 border-r border-white/5 p-12">
        <Link href="/" className="font-heading text-2xl text-brand-gold">Autoria</Link>
        <div>
          <div className="w-12 h-1 bg-brand-gold rounded-full mb-8" />
          <blockquote className="text-white/70 text-xl leading-relaxed mb-6">
            &ldquo;Enviei meu manuscrito às 9h e às 17h tinha a capa, o EPUB e a sinopse prontos.&rdquo;
          </blockquote>
          <p className="text-white/40 text-sm">— Fernanda Oliveira, autora de romance contemporâneo</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[{ value: "15+", label: "Plataformas" }, { value: "85%", label: "Royalties" }, { value: "24h", label: "Publicação" }].map(s => (
            <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="font-heading text-2xl text-brand-gold">{s.value}</div>
              <div className="text-white/40 text-xs mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="font-heading text-2xl text-brand-gold block mb-10 lg:hidden">Autoria</Link>

          {sent ? (
            <SuccessState email={email} onReset={() => { setSent(false); setEmail(""); }} />
          ) : (
            <>
              <div className="mb-8">
                <h1 className="font-heading text-3xl text-white mb-2">Bem-vindo de volta</h1>
                <p className="text-white/50 text-sm">
                  Não tem conta?{" "}
                  <Link href="/cadastro" className="text-brand-gold hover:underline">Criar agora</Link>
                </p>
              </div>

              {info && (
                <div className="mb-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm text-emerald-400">
                  {info}
                </div>
              )}

              {/* Email + senha (método principal) */}
              <form onSubmit={handlePassword} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">E-mail</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoComplete="email"
                    disabled={isDisabled}
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold/50 disabled:opacity-50 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/60 mb-1.5">Senha</label>
                  <input
                    type="password"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    placeholder="Sua senha"
                    required
                    autoComplete="current-password"
                    disabled={isDisabled}
                    className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold/50 disabled:opacity-50 transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isDisabled || !email || !senha}
                  className="w-full bg-brand-gold text-brand-primary rounded-xl py-3.5 px-4 text-sm font-semibold hover:bg-brand-gold-light active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading === "password" ? "Entrando…" : "Entrar"}
                </button>
              </form>

              {error && (
                <div className="mt-4 bg-red-400/10 border border-red-400/20 rounded-xl p-3 text-sm text-red-400 text-center">
                  {error}
                </div>
              )}

              {/* Opções secundárias */}
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-white/30 text-xs">ou</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                <button
                  onClick={handleGoogle}
                  disabled={isDisabled}
                  className="w-full flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-white/70 rounded-xl py-3 px-4 text-sm hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <GoogleIcon />
                  {loading === "google" ? "Redirecionando…" : "Continuar com Google"}
                </button>

                {!showMagic ? (
                  <button
                    onClick={() => setShowMagic(true)}
                    className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors py-1"
                  >
                    Entrar com link por e-mail (sem senha)
                  </button>
                ) : (
                  <form onSubmit={handleMagicLink} className="space-y-2">
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      disabled={isDisabled}
                      className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 disabled:opacity-50 transition"
                    />
                    <button
                      type="submit"
                      disabled={isDisabled || !email}
                      className="w-full bg-white/5 border border-white/10 text-white/70 rounded-xl py-3 text-sm hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      {loading === "magic" ? "Enviando…" : "Enviar link de acesso"}
                    </button>
                  </form>
                )}
              </div>

              <p className="mt-8 text-center text-xs text-white/25 leading-relaxed">
                Ao entrar, você concorda com os{" "}
                <a href="/termos" className="underline underline-offset-2 hover:text-white/50 transition-colors">Termos de Uso</a>{" "}
                e a{" "}
                <a href="/privacidade" className="underline underline-offset-2 hover:text-white/50 transition-colors">Política de Privacidade</a>.
              </p>
            </>
          )}

          <p className="text-center text-white/20 text-xs mt-8 pt-8 border-t border-white/5">
            <Link href="/" className="hover:text-white/40 transition-colors">← Voltar para o site</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SuccessState({ email, onReset }: { email: string; onReset: () => void }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center mx-auto mb-6">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
        </svg>
      </div>
      <h2 className="font-heading text-2xl text-white mb-3">Verifique seu e-mail</h2>
      <p className="text-white/50 text-sm leading-relaxed mb-2">Enviamos um link de acesso para</p>
      <p className="text-brand-gold font-semibold text-sm mb-6">{email}</p>
      <p className="text-white/30 text-xs">Clique no link para entrar. Não encontrou? Verifique o spam.</p>
      <button onClick={onReset} className="mt-8 text-sm text-brand-gold/70 hover:text-brand-gold underline underline-offset-4 transition-colors">
        Usar outro e-mail
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function strengthLabel(pw: string): { label: string; color: string; score: number } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { label: "Muito fraca", color: "bg-red-500" },
    { label: "Fraca",       color: "bg-orange-400" },
    { label: "Razoável",    color: "bg-yellow-400" },
    { label: "Boa",         color: "bg-blue-400" },
    { label: "Forte",       color: "bg-emerald-500" },
  ];
  return { ...map[score], score };
}

export default function CadastroPage() {
  const router = useRouter();
  const [nome, setNome]         = useState("");
  const [email, setEmail]       = useState("");
  const [senha, setSenha]       = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const strength = strengthLabel(senha);
  const senhaOk  = strength.score >= 3 && senha.length >= 8;
  const igual    = senha === confirma;
  const formOk   = nome.trim().length >= 2 && email.includes("@") && senhaOk && igual;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formOk) return;
    setLoading(true);
    setError(null);

    // 1. Criar conta no Supabase Auth
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpErr) {
      setError(
        signUpErr.message.includes("already registered")
          ? "Este e-mail já está cadastrado. Faça login."
          : `Erro ao criar conta: ${signUpErr.message}`
      );
      setLoading(false);
      return;
    }

    // 2. Salvar nome no perfil (o trigger cria a linha, aqui só atualiza)
    if (data.user) {
      await supabase
        .from("users")
        .update({ nome: nome.trim() })
        .eq("id", data.user.id);
    }

    // 3. Se Supabase exigir confirmação de e-mail, mostrar aviso;
    //    caso contrário, redirecionar para o dashboard
    if (data.session) {
      router.push("/dashboard");
    } else {
      router.push("/login?cadastro=ok");
    }
  }

  return (
    <div className="min-h-screen bg-brand-primary flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 border-r border-white/5 p-12">
        <Link href="/" className="font-heading text-2xl text-brand-gold">
          Autoria
        </Link>
        <div>
          <div className="w-12 h-1 bg-brand-gold rounded-full mb-8" />
          <h2 className="font-heading text-3xl text-white mb-4">
            Publique seu livro<br />com inteligência.
          </h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Diagnóstico, revisão, diagramação, capa e publicação em 15+ plataformas — tudo em uma ferramenta.
          </p>
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
          <Link href="/" className="font-heading text-2xl text-brand-gold block mb-10 lg:hidden">
            Autoria
          </Link>

          <div className="mb-8">
            <h1 className="font-heading text-3xl text-white mb-2">Criar conta</h1>
            <p className="text-white/50 text-sm">
              Já tem conta?{" "}
              <Link href="/login" className="text-brand-gold hover:underline">
                Faça login
              </Link>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Nome completo
              </label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Seu nome"
                required
                autoComplete="name"
                disabled={loading}
                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold/50 disabled:opacity-50 transition"
              />
            </div>

            {/* E-mail */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                E-mail
              </label>
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

            {/* Senha */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                autoComplete="new-password"
                disabled={loading}
                className="w-full rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold/50 disabled:opacity-50 transition"
              />
              {senha.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i < strength.score ? strength.color : "bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-white/40">{strength.label} — use letras maiúsculas, números e símbolos</p>
                </div>
              )}
            </div>

            {/* Confirmar senha */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">
                Confirmar senha
              </label>
              <input
                type="password"
                value={confirma}
                onChange={e => setConfirma(e.target.value)}
                placeholder="Repita a senha"
                required
                autoComplete="new-password"
                disabled={loading}
                className={`w-full rounded-xl bg-white/5 border text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 disabled:opacity-50 transition ${
                  confirma.length > 0 && !igual
                    ? "border-red-500/50 focus:border-red-500/50"
                    : "border-white/10 focus:border-brand-gold/50"
                }`}
              />
              {confirma.length > 0 && !igual && (
                <p className="mt-1 text-xs text-red-400">As senhas não coincidem</p>
              )}
            </div>

            {error && (
              <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !formOk}
              className="w-full bg-brand-gold text-brand-primary rounded-xl py-3.5 px-4 text-sm font-semibold hover:bg-brand-gold-light active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Criando conta…" : "Criar conta gratuita"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-white/25 leading-relaxed">
            Ao criar sua conta, você concorda com os{" "}
            <a href="/termos" className="underline underline-offset-2 hover:text-white/50 transition-colors">
              Termos de Uso
            </a>{" "}
            e a{" "}
            <a href="/privacidade" className="underline underline-offset-2 hover:text-white/50 transition-colors">
              Política de Privacidade
            </a>.
          </p>

          <p className="text-center text-white/20 text-xs mt-8 pt-8 border-t border-white/5">
            <Link href="/" className="hover:text-white/40 transition-colors">
              ← Voltar para o site
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

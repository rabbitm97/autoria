"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha]       = useState("");
  const [confirma, setConfirma] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [ready, setReady]       = useState(false);

  // Verifica se há uma sessão de recovery ativa (vinda do link de e-mail)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        // Sem sessão — link inválido ou expirado
        setError("Link inválido ou expirado. Solicite um novo link de redefinição.");
      }
    });
  }, []);

  const strength = strengthLabel(senha);
  const senhaOk  = strength.score >= 3 && senha.length >= 8;
  const igual    = senha === confirma;
  const formOk   = senhaOk && igual && confirma.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formOk) return;
    setLoading(true);
    setError(null);

    const { error: err } = await supabase.auth.updateUser({ password: senha });

    if (err) {
      setError(`Não foi possível redefinir a senha: ${err.message}`);
      setLoading(false);
      return;
    }

    // Senha atualizada — redireciona para o dashboard
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-brand-primary flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-heading text-2xl text-brand-gold block mb-10">
          Autoria
        </Link>

        <div className="mb-8">
          <h1 className="font-heading text-3xl text-white mb-2">Nova senha</h1>
          <p className="text-white/50 text-sm">Escolha uma senha forte para sua conta.</p>
        </div>

        {!ready && error ? (
          <div className="space-y-4">
            <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-4 text-sm text-red-400">
              {error}
            </div>
            <Link
              href="/esqueci-senha"
              className="block text-center w-full bg-brand-gold text-brand-primary rounded-xl py-3.5 text-sm font-semibold hover:bg-brand-gold-light transition-all"
            >
              Solicitar novo link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Nova senha */}
            <div>
              <label className="block text-sm font-medium text-white/60 mb-1.5">Nova senha</label>
              <input
                type="password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                autoComplete="new-password"
                disabled={loading || !ready}
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
              <label className="block text-sm font-medium text-white/60 mb-1.5">Confirmar nova senha</label>
              <input
                type="password"
                value={confirma}
                onChange={e => setConfirma(e.target.value)}
                placeholder="Repita a nova senha"
                required
                autoComplete="new-password"
                disabled={loading || !ready}
                className={`w-full rounded-xl bg-white/5 border text-white placeholder:text-white/25 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/50 disabled:opacity-50 transition ${
                  confirma.length > 0 && !igual
                    ? "border-red-500/50"
                    : "border-white/10 focus:border-brand-gold/50"
                }`}
              />
              {confirma.length > 0 && !igual && (
                <p className="mt-1 text-xs text-red-400">As senhas não coincidem</p>
              )}
            </div>

            {error && ready && (
              <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !formOk || !ready}
              className="w-full bg-brand-gold text-brand-primary rounded-xl py-3.5 px-4 text-sm font-semibold hover:bg-brand-gold-light active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";
import BrandLogo from "@/app/_components/brand-logo";

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

function CadastroInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [nome, setNome]         = useState("");
  const [email, setEmail]       = useState("");
  const [senha, setSenha]       = useState("");
  const [confirma, setConfirma] = useState("");
  const [aceite, setAceite]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const strength = strengthLabel(senha);
  const senhaOk  = strength.score >= 3 && senha.length >= 8;
  const igual    = senha === confirma;
  const formOk   = nome.trim().length >= 2 && email.includes("@") && senhaOk && igual && aceite;

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
        emailRedirectTo: `${window.location.origin}/auth/callback${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`,
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
      const { error: nomeErr } = await supabase
        .from("users")
        .update({ nome: nome.trim() })
        .eq("id", data.user.id);
      if (nomeErr) {
        console.error("[cadastro] Falha ao salvar nome no perfil:", nomeErr.message);
      }
    }

    // 3. LEGAL-1C: aceite de termos + privacidade no momento do cadastro.
    // Só é possível registrar via API quando há sessão viva — se confirmação
    // de email estiver ligada, a sessão vem depois e o aceite será feito por
    // outro gate. Falha aqui é logada e NÃO bloqueia o cadastro.
    if (data.session) {
      const slugs = ["termos-de-uso", "politica-privacidade"] as const;
      await Promise.all(
        slugs.map((slug) =>
          fetch("/api/legal/aceite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug, contexto: "cadastro" }),
          }).catch((err) => {
            console.error(`[cadastro] Falha ao registrar aceite ${slug}:`, err);
            return null;
          }),
        ),
      );
    } else {
      console.warn("[cadastro] Sessão ausente após signUp — aceite legal será feito no próximo login.");
    }

    // 4. Se Supabase exigir confirmação de e-mail, mostrar aviso;
    //    caso contrário, redirecionar para o dashboard
    if (data.session) {
      router.push(next ?? "/dashboard");
    } else {
      router.push(
        `/login?cadastro=ok${next ? `&next=${encodeURIComponent(next)}` : ""}`,
      );
    }
  }

  return (
    <div className="min-h-screen bg-brand-primary flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 border-r border-white/5 p-12">
        <Link href="/" aria-label="Autoria — página inicial" className="inline-flex">
          <BrandLogo variant="gold" height={30} />
        </Link>
        <div>
          <div className="w-12 h-1 bg-brand-gold rounded-full mb-8" />
          <h2 className="font-heading text-3xl text-white mb-4">
            Publique seu livro<br />com inteligência.
          </h2>
          <p className="text-white/50 text-sm leading-relaxed">
            Diagnóstico gratuito, revisão, capa e diagramação — do manuscrito ao livro pronto, em uma só ferramenta.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: "R$ 197", label: "a partir de, por obra" },
            { value: "100%",   label: "direitos do autor" },
            { value: "1",      label: "exemplar mínimo de impressão" },
          ].map(s => (
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
          <Link href="/" aria-label="Autoria — página inicial" className="inline-flex mb-10 lg:hidden">
            <BrandLogo variant="gold" height={30} />
          </Link>

          <div className="mb-8">
            <h1 className="font-heading text-3xl text-white mb-2">Criar conta</h1>
            <p className="text-white/50 text-sm">
              Já tem conta?{" "}
              <Link
                href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
                className="text-brand-gold hover:underline"
              >
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

            {/* LEGAL-1C: aceite obrigatório de Termos + Privacidade */}
            <label className="flex items-start gap-3 text-xs text-white/60 leading-relaxed cursor-pointer select-none">
              <input
                type="checkbox"
                checked={aceite}
                onChange={(e) => setAceite(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 text-brand-gold accent-brand-gold focus:ring-2 focus:ring-brand-gold/40"
                aria-describedby="aceite-cadastro-hint"
              />
              <span id="aceite-cadastro-hint">
                Li e aceito os{" "}
                <Link href="/termos" target="_blank" rel="noreferrer" className="text-brand-gold underline underline-offset-2 hover:text-brand-gold-light">
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" target="_blank" rel="noreferrer" className="text-brand-gold underline underline-offset-2 hover:text-brand-gold-light">
                  Política de Privacidade
                </Link>{" "}
                da Autoria.
              </span>
            </label>

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

export default function CadastroPage() {
  return (
    <Suspense>
      <CadastroInner />
    </Suspense>
  );
}

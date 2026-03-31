"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PerfilPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [plano, setPlano] = useState("gratuito");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setNome("Dev Author");
      setEmail("dev@autoria.com");
      setPlano("profissional");
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push("/login"); return; }
      setEmail(user.email ?? "");
      supabase
        .from("users")
        .select("nome, plano")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setNome(data?.nome ?? "");
          setPlano(data?.plano ?? "gratuito");
          setLoading(false);
        });
    });
  }, [router]);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (process.env.NODE_ENV !== "development") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sessão expirada");
        const { error: err } = await supabase
          .from("users")
          .update({ nome: nome.trim() })
          .eq("id", user.id);
        if (err) throw err;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSair() {
    if (process.env.NODE_ENV !== "development") {
      await supabase.auth.signOut();
    }
    router.push("/");
  }

  const PLANO_LABEL: Record<string, { label: string; color: string }> = {
    gratuito:     { label: "Gratuito",     color: "text-zinc-500" },
    basico:       { label: "Essencial",    color: "text-blue-600" },
    profissional: { label: "Completo",     color: "text-violet-600" },
    premium:      { label: "Pro",          color: "text-brand-gold" },
  };
  const planoInfo = PLANO_LABEL[plano] ?? PLANO_LABEL["gratuito"];

  return (
    <div>

      <main className="max-w-2xl mx-auto px-8 py-10">

        <div className="mb-8">
          <h1 className="font-heading text-3xl text-brand-primary">Meu perfil</h1>
          <p className="text-zinc-500 text-sm mt-1">Gerencie suas informações e plano.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Plano atual */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Plano atual</p>
              <div className="flex items-center justify-between">
                <p className={`font-heading text-2xl ${planoInfo.color}`}>{planoInfo.label}</p>
                <Link
                  href="/dashboard/planos"
                  className="text-xs text-brand-gold hover:underline underline-offset-4"
                >
                  Fazer upgrade →
                </Link>
              </div>
            </div>

            {/* Dados pessoais */}
            <form onSubmit={handleSalvar} className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Dados pessoais</p>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2">E-mail</label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full px-4 py-3 rounded-xl border border-zinc-100 text-sm text-zinc-400 bg-zinc-50 cursor-not-allowed"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}

              {saved && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  Perfil salvo com sucesso.
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </form>

            {/* Sair */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">Sessão</p>
              <button
                onClick={handleSair}
                className="w-full py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-red-300 hover:text-red-600 transition-colors"
              >
                Sair da conta
              </button>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

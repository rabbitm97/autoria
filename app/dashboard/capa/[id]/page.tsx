"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { CapaResult, OpcaoCapa } from "@/app/api/agentes/gerar-capa/route";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [titulo, setTitulo] = useState("");
  const [sinopse, setSinopse] = useState("");
  const [genero, setGenero] = useState("ficção");
  const [qtd, setQtd] = useState<1 | 2 | 3>(3);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capaResult, setCapaResult] = useState<CapaResult | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);

  // ── Load project data ────────────────────────────────────────────────────
  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("dados_elementos, dados_capa, etapa_atual")
        .eq("id", id)
        .single();

      if (data?.dados_elementos) {
        const el = data.dados_elementos as Record<string, unknown>;
        setTitulo((el.titulo_escolhido as string) ?? (el.opcoes_titulo as string[])?.[0] ?? "");
        setSinopse((el.sinopse_curta as string) ?? "");
      }

      if (data?.dados_capa) {
        const c = data.dados_capa as CapaResult;
        setCapaResult(c);
        setEscolhida(c.url_escolhida);
      }
    } catch {
      // ignore — user will fill in manually
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // ── Generate ─────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/gerar-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, titulo, sinopse, genero, qtd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar capa");
      setCapaResult(data as CapaResult);
      setEscolhida(data.opcoes[0]?.url ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGenerating(false);
    }
  }

  // ── Save choice and proceed ───────────────────────────────────────────────
  async function handleSalvar() {
    if (!escolhida) return;
    setSaving(true);
    try {
      const novosDados = capaResult
        ? { ...capaResult, url_escolhida: escolhida }
        : { url_escolhida: escolhida, opcoes: [], prompt_usado: "" };

      await supabase
        .from("projects")
        .update({ dados_capa: novosDados, etapa_atual: "diagramacao" })
        .eq("id", id);

      router.push(`/dashboard`);
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>

      <EtapasProgress currentStep={3} />

      <main className="max-w-4xl mx-auto px-4 py-10">

        {/* Title */}
        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 4 — Capa
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Geração de capa com IA
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed">
            A IA gera opções de capa a partir do título e sinopse do seu livro.
            As imagens são geradas em alta resolução com qualidade para impressão CMYK.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Form */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-8 space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                  Título do livro
                </label>
                <input
                  type="text"
                  value={titulo}
                  onChange={e => setTitulo(e.target.value)}
                  placeholder="Ex: O Último Manuscrito"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                  Sinopse curta <span className="text-zinc-400 normal-case">(max 300 caracteres)</span>
                </label>
                <textarea
                  value={sinopse}
                  onChange={e => setSinopse(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Descreva brevemente a história ou tema do livro…"
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                />
                <p className="text-right text-xs text-zinc-400 mt-1">{sinopse.length}/300</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                    Gênero literário
                  </label>
                  <select
                    value={genero}
                    onChange={e => setGenero(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 bg-white"
                  >
                    <option>ficção</option>
                    <option>romance</option>
                    <option>suspense</option>
                    <option>fantasia</option>
                    <option>biografia</option>
                    <option>autoajuda</option>
                    <option>negócios</option>
                    <option>poesia</option>
                    <option>infantil</option>
                    <option>literatura</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                    Número de opções
                  </label>
                  <div className="flex gap-2">
                    {([1, 2, 3] as const).map(n => (
                      <button
                        key={n}
                        onClick={() => setQtd(n)}
                        className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors
                          ${qtd === n
                            ? "bg-brand-gold text-brand-primary border-brand-gold"
                            : "bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-brand-gold/40"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !titulo.trim() || !sinopse.trim()}
                className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                  hover:bg-brand-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                    Gerando {qtd} capa{qtd > 1 ? "s" : ""}… pode levar até 30s
                  </span>
                ) : (
                  `Gerar ${qtd} opção${qtd > 1 ? "ões" : ""} de capa`
                )}
              </button>
            </div>

            {/* Results */}
            {capaResult && capaResult.opcoes.length > 0 && (
              <div className="mb-8">
                <h2 className="font-heading text-xl text-brand-primary mb-4">
                  Escolha a capa
                </h2>
                <div className={`grid gap-6 ${capaResult.opcoes.length === 1 ? "grid-cols-1 max-w-xs" : capaResult.opcoes.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {capaResult.opcoes.map((opcao: OpcaoCapa, i: number) => (
                    <button
                      key={i}
                      onClick={() => setEscolhida(opcao.url)}
                      className={`relative rounded-2xl overflow-hidden border-4 transition-all
                        ${escolhida === opcao.url
                          ? "border-brand-gold shadow-lg scale-[1.02]"
                          : "border-zinc-200 hover:border-brand-gold/40"}`}
                    >
                      <div className="relative aspect-[6/9] bg-zinc-100">
                        <Image
                          src={opcao.url}
                          alt={`Opção de capa ${i + 1}`}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      {escolhida === opcao.url && (
                        <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-brand-gold flex items-center justify-center text-brand-primary font-bold text-xs shadow">
                          ✓
                        </div>
                      )}
                      <div className="p-3 bg-white text-left">
                        <p className="text-xs text-zinc-400">Opção {i + 1}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex items-center gap-4">
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="px-6 py-3 rounded-xl border border-zinc-300 text-zinc-600 text-sm hover:border-brand-gold/40 transition-colors disabled:opacity-50"
                  >
                    Gerar novas opções
                  </button>
                  <button
                    onClick={handleSalvar}
                    disabled={saving || !escolhida}
                    className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm
                      hover:bg-brand-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? "Salvando…" : "Usar esta capa → Diagramação"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

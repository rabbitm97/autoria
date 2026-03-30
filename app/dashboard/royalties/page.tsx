"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Royalty, Plataforma } from "@/app/api/royalties/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATAFORMA_INFO = {
  amazon_kdp:    { label: "Amazon KDP",    cor: "bg-orange-50 text-orange-700 border-orange-100" },
  draft2digital: { label: "Draft2Digital", cor: "bg-blue-50 text-blue-700 border-blue-100"       },
  kobo:          { label: "Kobo",          cor: "bg-red-50 text-red-700 border-red-100"           },
  apple_books:   { label: "Apple Books",   cor: "bg-zinc-50 text-zinc-700 border-zinc-200"        },
  google_play:   { label: "Google Play",   cor: "bg-green-50 text-green-700 border-green-100"     },
  outros:        { label: "Outros",        cor: "bg-zinc-50 text-zinc-500 border-zinc-100"        },
} as const;

const PLATAFORMAS: Plataforma[] = ["amazon_kdp", "draft2digital", "kobo", "apple_books", "google_play", "outros"];

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtNum(n: number) {
  return n.toLocaleString("pt-BR");
}

// ─── New entry form ───────────────────────────────────────────────────────────

interface NovoLancamento {
  project_id: string; plataforma: Plataforma; periodo: string;
  unidades: string; preco_venda: string; royalty_pct: string; moeda: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoyaltiesPage() {
  const [royalties, setRoyalties] = useState<Royalty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projetos, setProjetos] = useState<{ id: string; nome: string }[]>([]);

  const hoje = new Date();
  const periodoAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [form, setForm] = useState<NovoLancamento>({
    project_id: "", plataforma: "amazon_kdp", periodo: periodoAtual,
    unidades: "", preco_venda: "", royalty_pct: "70", moeda: "BRL",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/royalties"),
        fetch("/api/agentes/gerar-pdf?project_id=all").catch(() => null), // ignore
      ]);
      if (rRes.ok) setRoyalties(await rRes.json());

      // Load projects from dashboard data (reuse supabase client via separate call)
      const projRes = await fetch("/api/royalties"); // will return mock with manuscript_nome
      if (projRes.ok) {
        const data: Royalty[] = await projRes.json();
        const seen = new Set<string>();
        const lista: { id: string; nome: string }[] = [];
        for (const r of data) {
          if (!seen.has(r.project_id)) {
            seen.add(r.project_id);
            lista.push({ id: r.project_id, nome: r.manuscript_nome ?? r.project_id.slice(0, 8) });
          }
        }
        setProjetos(lista);
        if (lista.length > 0 && !form.project_id) {
          setForm(f => ({ ...f, project_id: lista[0].id }));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalRecebido = royalties.reduce((s, r) => s + (r.valor_recebido ?? 0), 0);
  const totalUnidades = royalties.reduce((s, r) => s + r.unidades, 0);

  const porPlataforma = PLATAFORMAS
    .map(p => ({
      p,
      valor: royalties.filter(r => r.plataforma === p).reduce((s, r) => s + (r.valor_recebido ?? 0), 0),
      unidades: royalties.filter(r => r.plataforma === p).reduce((s, r) => s + r.unidades, 0),
    }))
    .filter(x => x.valor > 0);

  const porPeriodo = [...new Set(royalties.map(r => r.periodo))].sort().reverse().slice(0, 6).map(p => ({
    periodo: p,
    valor: royalties.filter(r => r.periodo === p).reduce((s, r) => s + (r.valor_recebido ?? 0), 0),
    unidades: royalties.filter(r => r.periodo === p).reduce((s, r) => s + r.unidades, 0),
  }));

  const maxValor = Math.max(...porPeriodo.map(p => p.valor), 1);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/royalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          unidades: parseInt(form.unidades),
          preco_venda: parseFloat(form.preco_venda),
          royalty_pct: parseFloat(form.royalty_pct),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar");
      setShowForm(false);
      setForm(f => ({ ...f, unidades: "", preco_venda: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/royalties?id=${id}`, { method: "DELETE" });
    setRoyalties(prev => prev.filter(r => r.id !== id));
  }

  return (
    <div className="min-h-screen bg-brand-surface">

      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-brand-gold/60 hover:text-brand-gold transition-colors">
              Dashboard
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-brand-gold/80">Royalties</span>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-gold text-brand-primary text-sm font-medium hover:bg-brand-gold/90 transition-colors"
          >
            <PlusIcon />
            Novo lançamento
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Financeiro</p>
          <h1 className="font-heading text-3xl text-brand-primary">Painel de Royalties</h1>
          <p className="text-zinc-500 mt-1 text-sm">Acompanhe vendas e receitas por plataforma e período.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-2xl border border-zinc-100 p-5">
                <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Total recebido</p>
                <p className="font-heading text-2xl text-brand-primary">{fmt(totalRecebido)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 p-5">
                <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Unidades vendidas</p>
                <p className="font-heading text-2xl text-brand-primary">{fmtNum(totalUnidades)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 p-5 col-span-2 sm:col-span-1">
                <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Ticket médio</p>
                <p className="font-heading text-2xl text-brand-primary">
                  {totalUnidades > 0 ? fmt(totalRecebido / totalUnidades) : "—"}
                </p>
              </div>
            </div>

            {/* Bar chart by period */}
            {porPeriodo.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-5">Receita por mês</p>
                <div className="flex items-end gap-3 h-28">
                  {porPeriodo.map(p => (
                    <div key={p.periodo} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-zinc-500">{fmt(p.valor).replace("R$\u00a0", "")}</span>
                      <div
                        className="w-full rounded-t-lg bg-brand-gold/80 hover:bg-brand-gold transition-colors"
                        style={{ height: `${Math.max(4, (p.valor / maxValor) * 80)}px` }}
                      />
                      <span className="text-[10px] text-zinc-400">{p.periodo.slice(5)}/{p.periodo.slice(2, 4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By platform */}
            {porPlataforma.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">Por plataforma</p>
                <div className="space-y-3">
                  {porPlataforma.sort((a, b) => b.valor - a.valor).map(({ p, valor, unidades }) => {
                    const info = PLATAFORMA_INFO[p];
                    const pct = totalRecebido > 0 ? (valor / totalRecebido) * 100 : 0;
                    return (
                      <div key={p} className="flex items-center gap-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${info.cor} shrink-0 w-32 text-center`}>
                          {info.label}
                        </span>
                        <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-gold rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-zinc-800">{fmt(valor)}</p>
                          <p className="text-xs text-zinc-400">{fmtNum(unidades)} un.</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Form */}
            {showForm && (
              <form onSubmit={handleSalvar} className="bg-white rounded-2xl border border-brand-gold/20 p-6 mb-6 shadow-sm">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-5">Novo lançamento</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Plataforma</label>
                    <select
                      value={form.plataforma}
                      onChange={e => {
                        const p = e.target.value as Plataforma;
                        const padrao = { amazon_kdp: 70, draft2digital: 60, kobo: 70, apple_books: 70, google_play: 52, outros: 50 }[p] ?? 70;
                        setForm(f => ({ ...f, plataforma: p, royalty_pct: String(padrao) }));
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    >
                      {PLATAFORMAS.map(p => (
                        <option key={p} value={p}>{PLATAFORMA_INFO[p].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Período (YYYY-MM)</label>
                    <input
                      type="month"
                      value={form.periodo}
                      onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))}
                      required
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Unidades vendidas</label>
                    <input
                      type="number" min="0" value={form.unidades}
                      onChange={e => setForm(f => ({ ...f, unidades: e.target.value }))}
                      placeholder="0" required
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Preço de venda (R$)</label>
                    <input
                      type="number" min="0" step="0.01" value={form.preco_venda}
                      onChange={e => setForm(f => ({ ...f, preco_venda: e.target.value }))}
                      placeholder="29.90" required
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Royalty (%)</label>
                    <input
                      type="number" min="0" max="100" step="0.1" value={form.royalty_pct}
                      onChange={e => setForm(f => ({ ...f, royalty_pct: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                    />
                  </div>
                  {form.unidades && form.preco_venda && form.royalty_pct && (
                    <div className="col-span-2 bg-brand-gold/5 rounded-xl border border-brand-gold/20 px-4 py-3">
                      <p className="text-xs text-zinc-500">Valor estimado</p>
                      <p className="font-heading text-xl text-brand-primary">
                        {fmt(parseInt(form.unidades || "0") * parseFloat(form.preco_venda || "0") * parseFloat(form.royalty_pct || "0") / 100)}
                      </p>
                    </div>
                  )}
                </div>
                {error && (
                  <p className="text-sm text-red-600 mt-3">{error}</p>
                )}
                <div className="flex gap-3 mt-5">
                  <button type="button" onClick={() => setShowForm(false)}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-zinc-300 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-brand-primary text-brand-gold text-sm font-medium hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
                    {saving ? "Salvando…" : "Salvar lançamento"}
                  </button>
                </div>
              </form>
            )}

            {/* Transactions table */}
            <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-50">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Lançamentos</p>
              </div>
              {royalties.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-zinc-400 text-sm">Nenhum lançamento ainda.</p>
                  <button onClick={() => setShowForm(true)}
                    className="mt-3 text-brand-gold text-sm hover:underline underline-offset-4">
                    Adicionar primeiro lançamento →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {royalties.map(r => {
                    const info = PLATAFORMA_INFO[r.plataforma];
                    return (
                      <div key={r.id} className="px-6 py-4 flex items-center gap-4 hover:bg-zinc-50/50 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${info.cor}`}>{info.label}</span>
                            <span className="text-xs text-zinc-400">{r.periodo}</span>
                            {r.manuscript_nome && (
                              <span className="text-xs text-zinc-400 truncate hidden sm:block">· {r.manuscript_nome}</span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-600">
                            {fmtNum(r.unidades)} un. × {r.preco_venda ? fmt(r.preco_venda) : "—"} · {r.royalty_pct}% royalty
                          </p>
                        </div>
                        <p className="font-heading text-lg text-brand-primary shrink-0">{fmt(r.valor_recebido)}</p>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-400 transition-all shrink-0"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { ConfigImpressao } from "@/lib/impressao-pricing";

interface CartItemMinimo {
  id: string;
  project_id?: string | null;
  preco_centavos: number;
  config: ConfigImpressao;
  projects?: {
    id?: string;
    manuscripts?: { titulo?: string } | null;
  };
}

export default function CheckoutPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartItemMinimo[]>([]);
  const [aceite, setAceite] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/carrinho");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const total = items.reduce((s, i) => s + i.preco_centavos, 0) / 100;

  // LEGAL-1C: quando o pagamento for ligado (D.3/D.4), a rota do provedor
  // chama esta função antes de disparar a intent. Um POST por projectId
  // distinto — a rota é idempotente. Falha aqui bloqueia o pagamento.
  async function registrarAceitesCheckout(): Promise<boolean> {
    const projectIds = Array.from(
      new Set(
        items
          .map((i) => i.project_id ?? i.projects?.id ?? null)
          .filter((x): x is string => !!x),
      ),
    );
    if (projectIds.length === 0) return true;
    const results = await Promise.all(
      projectIds.map((projectId) =>
        fetch("/api/legal/aceite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "contrato-servicos",
            contexto: "checkout",
            projectId,
          }),
        })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    return results.every(Boolean);
  }
  // Evita warning de "declared but never used" enquanto o pagamento não é ligado.
  void registrarAceitesCheckout;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <Link href="/carrinho" className="text-xs text-zinc-500 hover:text-zinc-800">
          ← Voltar ao carrinho
        </Link>
        <h1 className="font-heading text-3xl text-brand-primary mt-3">Checkout</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-zinc-100 rounded-2xl p-10 text-center">
          <p className="text-zinc-500 mb-4">Não há produtos no carrinho.</p>
          <Link href="/dashboard" className="text-sm text-brand-gold hover:underline">
            Voltar ao dashboard →
          </Link>
        </div>
      ) : (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex items-start gap-3">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-amber-700 shrink-0 mt-0.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  Sistema de pagamento em implementação
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Você pode simular o checkout, mas ainda não é possível finalizar a compra.
                  Assim que ativarmos os pagamentos, você será notificado por email.
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs uppercase tracking-wide text-zinc-400 mb-3">
                Endereço de entrega
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                />
                <input
                  type="text"
                  placeholder="CEP"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                />
                <input
                  type="text"
                  placeholder="Rua"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Número"
                    className="px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                  />
                  <input
                    type="text"
                    placeholder="Complemento"
                    className="px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Cidade"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                />
                <input
                  type="text"
                  placeholder="Estado"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-md text-sm focus:outline-none focus:border-brand-primary"
                />
              </div>
            </div>

            <div className="bg-brand-primary text-white rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-brand-gold mb-3">
                Resumo do pedido
              </p>
              <div className="space-y-2 mb-4">
                {items.map(i => (
                  <div key={i.id} className="flex justify-between text-xs text-white/85">
                    <span>
                      {i.projects?.manuscripts?.titulo ?? "Livro"}{" "}
                      × {i.config.tiragem}
                    </span>
                    <span>
                      R$ {(i.preco_centavos / 100).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/15 pt-3">
                <div className="flex justify-between">
                  <span className="text-xs uppercase tracking-wide text-white/50">Total</span>
                  <span className="font-heading text-2xl text-brand-gold">
                    R$ {total.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* LEGAL-1C: destaques + aceite obrigatório do Contrato de Serviços */}
              <div className="mt-5 rounded-lg bg-white/5 border border-white/10 p-3 text-[11px] leading-relaxed text-white/80 space-y-2">
                <p>
                  <strong className="text-brand-gold">Cláusula 5 —</strong>{" "}
                  ao aprovar a pré-visualização, o risco editorial (erros de texto,
                  ortografia, ordem de capítulos, dados da página de créditos)
                  passa a ser seu.
                </p>
                <p>
                  <strong className="text-brand-gold">Cláusula 7 —</strong>{" "}
                  arrependimento em 7 dias corridos; após esse prazo, etapas
                  já executadas não são reembolsadas.
                </p>
              </div>

              <label className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-white/85 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={aceite}
                  onChange={(e) => setAceite(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/25 bg-white/10 text-brand-gold accent-brand-gold focus:ring-2 focus:ring-brand-gold/40"
                />
                <span>
                  Li e aceito o{" "}
                  <Link href="/contrato-servicos" target="_blank" rel="noreferrer" className="text-brand-gold underline underline-offset-2">
                    Contrato de Prestação de Serviços Editoriais
                  </Link>
                  {" "}(inclusive as{" "}
                  <Link href="/contrato-servicos#clausula-5" target="_blank" rel="noreferrer" className="text-brand-gold underline underline-offset-2">
                    Cláusulas 5
                  </Link>{" "}e{" "}
                  <Link href="/contrato-servicos#clausula-7" target="_blank" rel="noreferrer" className="text-brand-gold underline underline-offset-2">
                    7
                  </Link>).
                </span>
              </label>

              <div className="mt-5 space-y-2">
                <button
                  disabled={!aceite}
                  className="w-full bg-brand-gold text-brand-primary font-bold py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Pagar com PIX (em breve)
                </button>
                <button
                  disabled={!aceite}
                  className="w-full border border-white/20 text-white/80 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Pagar com cartão (em breve)
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

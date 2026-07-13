"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { ConfigImpressao } from "@/lib/impressao-pricing";
import { PAPEL_LABELS, ACABAMENTO_LABELS } from "@/lib/impressao-pricing";

interface CartItem {
  id: string;
  tipo: "impressao_livro";
  project_id: string;
  config: ConfigImpressao;
  preco_centavos: number;
  adicionado_em: string;
  updated_at: string;
  projects?: {
    id: string;
    formato: string;
    dados_capa: { exports?: { jpeg_ebook?: { storage_path?: string } } } | null;
    manuscripts?: { titulo?: string; autor_primeiro_nome?: string; autor_sobrenome?: string } | null;
    dados_elementos?: { titulo_escolhido?: string } | null;
  };
}

export default function CarrinhoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CartItem[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/carrinho");
      if (res.ok) {
        const data = await res.json();
        const list: CartItem[] = data.items ?? [];
        setItems(list);

        const urls: Record<string, string> = {};
        for (const item of list) {
          const path = item.projects?.dados_capa?.exports?.jpeg_ebook?.storage_path;
          if (path) {
            const { data: signed } = await supabase.storage
              .from("editor-assets")
              .createSignedUrl(path, 3600);
            if (signed?.signedUrl) urls[item.id] = signed.signedUrl;
          }
        }
        setThumbUrls(urls);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const remover = async (itemId: string) => {
    setRemovendo(itemId);
    try {
      const res = await fetch(`/api/carrinho/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== itemId));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cart:updated"));
        }
      }
    } finally {
      setRemovendo(null);
    }
  };

  const totalCentavos = items.reduce((sum, i) => sum + i.preco_centavos, 0);
  const totalReais = totalCentavos / 100;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Carrinho</p>
        <h1 className="font-heading text-3xl text-brand-primary">Seus produtos selecionados</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-zinc-100 rounded-2xl p-10 text-center">
          <p className="text-zinc-500 mb-4">Seu carrinho está vazio.</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-gold hover:underline"
          >
            ← Voltar ao dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(item => {
            const ms = item.projects?.manuscripts;
            const titulo =
              item.projects?.dados_elementos?.titulo_escolhido ??
              ms?.titulo ??
              "Sem título";
            const autor =
              [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") ||
              "Autor";
            const preco = item.preco_centavos / 100;
            return (
              <div
                key={item.id}
                className="bg-white border border-zinc-100 rounded-2xl p-5 flex gap-5"
              >
                {thumbUrls[item.id] ? (
                  <img
                    src={thumbUrls[item.id]}
                    alt={titulo}
                    className="w-20 h-28 object-contain rounded-lg shadow-md shrink-0"
                  />
                ) : (
                  <div className="w-20 h-28 bg-brand-primary rounded-lg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-xs text-zinc-400 uppercase tracking-wide">
                        Impressão física
                      </p>
                      <h3 className="font-heading text-xl text-brand-primary leading-tight">
                        {titulo}
                      </h3>
                      <p className="text-sm text-zinc-500">{autor}</p>
                    </div>
                    <p className="font-heading text-xl text-brand-primary shrink-0">
                      R$ {preco.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="text-xs text-zinc-500 space-y-0.5">
                    <p>
                      {item.config.tiragem} exemplar{item.config.tiragem > 1 ? "es" : ""} ·{" "}
                      {item.config.paginas} páginas
                    </p>
                    <p>
                      {PAPEL_LABELS[item.config.papel_miolo]} ·{" "}
                      {item.config.cor_miolo === "pb" ? "Preto e branco" : "Colorido"}
                    </p>
                    <p>
                      {ACABAMENTO_LABELS[item.config.acabamento_capa]}
                      {item.config.com_orelhas ? " · com orelhas" : ""}
                    </p>
                  </div>
                  <div className="flex gap-3 mt-3">
                    <Link
                      href={`/dashboard/publicacao/${item.project_id}/impressao`}
                      className="text-xs text-brand-gold hover:underline"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => remover(item.id)}
                      disabled={removendo === item.id}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      {removendo === item.id ? "Removendo…" : "Remover"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="bg-brand-primary text-white rounded-2xl p-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-white/50">Total</p>
              <p className="font-heading text-3xl text-brand-gold">
                R$ {totalReais.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <button
              onClick={() => router.push("/checkout")}
              className="bg-brand-gold text-brand-primary font-bold px-6 py-3 rounded-xl hover:bg-brand-gold/90 transition-colors"
            >
              Finalizar compra →
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

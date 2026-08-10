"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  FORMATO_LABELS,
  PAPEL_LABELS,
  ACABAMENTO_LABELS,
  REGIAO_LABELS,
  type ConfigImpressao,
  type PapelMiolo,
  type CorMiolo,
  type AcabamentoCapa,
  type ResultadoOrcamento,
} from "@/lib/impressao-pricing";
import type { FormatoLivro } from "@/lib/formatos";

// ─── Format helpers ───────────────────────────────────────────────────────────

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mascaraCep(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return digits.slice(0, 5) + "-" + digits.slice(5);
}

const ENCADERNACAO_LABELS: Record<"grampeado" | "brochura_pur", string> = {
  grampeado: "Grampeado",
  brochura_pur: "Brochura PUR",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimuladorImpressaoTool() {
  // Estado do formulário
  const [formato, setFormato] = useState<FormatoLivro>("compacto");
  const [paginas, setPaginas] = useState<number>(100);
  const [corMiolo, setCorMiolo] = useState<CorMiolo>("pb");
  const [papelMiolo, setPapelMiolo] = useState<PapelMiolo>("offset_75g");
  const [acabamento, setAcabamento] = useState<AcabamentoCapa>("fosca_bopp");
  const [comOrelhas, setComOrelhas] = useState<boolean>(false);
  const [tiragem, setTiragem] = useState<number>(1);
  const [cep, setCep] = useState<string>("");

  // Estado do resultado
  const [resultado, setResultado] = useState<ResultadoOrcamento | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);

  const config: ConfigImpressao = useMemo(() => {
    const cepClean = cep.replace(/\D/g, "");
    return {
      formato,
      papel_miolo: papelMiolo,
      cor_miolo: corMiolo,
      acabamento_capa: acabamento,
      com_orelhas: comOrelhas,
      paginas,
      tiragem,
      cep_entrega: cepClean.length === 8 ? cepClean : undefined,
    };
  }, [formato, papelMiolo, corMiolo, acabamento, comOrelhas, paginas, tiragem, cep]);

  // Debounce + fetch
  useEffect(() => {
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      fetch("/api/ferramentas/simulador-impressao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: controller.signal,
      })
        .then(r => r.json() as Promise<ResultadoOrcamento>)
        .then(data => {
          if (!controller.signal.aborted) {
            setResultado(data);
            setLoading(false);
          }
        })
        .catch(err => {
          if (err?.name !== "AbortError") setLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [config]);

  return (
    <main className="max-w-5xl mx-auto px-8 py-10">

      {/* Header */}
      <div className="mb-8">
        <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
          Ferramenta
        </p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">
          Simulador de preço de impressão
        </h1>
        <p className="text-zinc-500 text-sm">
          Descubra na hora quanto custa imprimir seu livro. Sem tiragem mínima —
          a partir de 1 exemplar.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 items-start">

        {/* Coluna de configuração */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6">
          <h2 className="font-heading text-lg text-brand-primary mb-5">Configuração</h2>

          {/* Formato */}
          <div className="mb-5">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Formato</label>
            <select
              value={formato}
              onChange={(e) => setFormato(e.target.value as FormatoLivro)}
              className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 bg-white"
            >
              {(Object.keys(FORMATO_LABELS) as FormatoLivro[]).map((f) => (
                <option key={f} value={f}>{FORMATO_LABELS[f]}</option>
              ))}
            </select>
          </div>

          {/* Páginas */}
          <div className="mb-5">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
              Quantidade de páginas
            </label>
            <input
              type="number"
              min={4}
              max={500}
              inputMode="numeric"
              value={paginas}
              onChange={(e) => setPaginas(parseInt(e.target.value, 10) || 0)}
              className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
              placeholder="100"
            />
            <p className="text-xs text-zinc-400 mt-1">
              Não sabe?{" "}
              <Link
                href="/ferramentas/lombada-paginas"
                className="text-brand-gold hover:underline underline-offset-2"
              >
                Estime com a calculadora →
              </Link>
            </p>
          </div>

          {/* Miolo (PB / Colorido) */}
          <div className="mb-5">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Miolo</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([
                { value: "pb", label: "Preto-e-branco" },
                { value: "cor", label: "Colorido" },
              ] as { value: CorMiolo; label: string }[]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCorMiolo(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    corMiolo === opt.value
                      ? "border-brand-gold bg-brand-gold/10 text-brand-primary font-semibold"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Papel */}
          <div className="mb-5">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Papel do miolo</label>
            <select
              value={papelMiolo}
              onChange={(e) => setPapelMiolo(e.target.value as PapelMiolo)}
              className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/40 bg-white"
            >
              {(Object.keys(PAPEL_LABELS) as PapelMiolo[]).map((p) => (
                <option
                  key={p}
                  value={p}
                  disabled={p === "couche_fosco_90g" && corMiolo === "pb"}
                >
                  {PAPEL_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Acabamento da capa */}
          <div className="mb-5">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Acabamento da capa</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(Object.keys(ACABAMENTO_LABELS) as AcabamentoCapa[]).map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAcabamento(a)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    acabamento === a
                      ? "border-brand-gold bg-brand-gold/10 text-brand-primary font-semibold"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {a === "fosca_bopp" ? "Fosca" : "Brilho"}
                </button>
              ))}
            </div>
          </div>

          {/* Orelhas */}
          <div className="mb-5">
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Orelhas</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {[
                { value: false, label: "Sem orelhas" },
                { value: true, label: "Com orelhas" },
              ].map(opt => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setComOrelhas(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                    comOrelhas === opt.value
                      ? "border-brand-gold bg-brand-gold/10 text-brand-primary font-semibold"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tiragem */}
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Tiragem</label>
              <input
                type="number"
                min={1}
                max={300}
                inputMode="numeric"
                value={tiragem}
                onChange={(e) => setTiragem(Math.max(1, Math.min(300, parseInt(e.target.value, 10) || 1)))}
                className="w-20 text-right rounded border border-zinc-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
              />
            </div>
            <input
              type="range"
              min={1}
              max={300}
              value={tiragem}
              onChange={(e) => setTiragem(parseInt(e.target.value, 10))}
              className="w-full mt-3 h-2 rounded-full appearance-none cursor-pointer bg-zinc-200 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-gold [&::-webkit-slider-thumb]:shadow-sm"
            />
            <p className="text-xs text-zinc-400 mt-1">A partir de 1 exemplar. Até 300 no simulador; acima disso é orçamento personalizado.</p>
          </div>

          {/* CEP */}
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">
              CEP de entrega (opcional) — refina o frete
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={cep}
              onChange={(e) => setCep(mascaraCep(e.target.value))}
              maxLength={9}
              className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
              placeholder="00000-000"
            />
          </div>
        </div>

        {/* Card de resultado (sticky em desktop) */}
        <div className="md:sticky md:top-24">
          <ResultadoView
            resultado={resultado}
            loading={loading}
            tiragem={tiragem}
          />

          {/* CTAs */}
          <div className="mt-4 space-y-2">
            <Link
              href="/cadastro"
              className="block text-center bg-brand-gold text-brand-primary text-sm font-bold px-5 py-3 rounded-xl hover:bg-brand-gold-light active:scale-95 transition-all tracking-wide"
            >
              Imprimir meu livro
            </Link>
            <Link
              href="/#servicos"
              className="block text-center border border-zinc-200 text-zinc-600 text-sm font-medium px-5 py-3 rounded-xl hover:border-zinc-300 hover:bg-zinc-50 transition-all"
            >
              Ainda estou preparando meu livro
            </Link>
          </div>

          {/* Faixa de confiança */}
          <p className="text-xs text-zinc-500 text-center mt-4 leading-relaxed">
            Impressão pela Graphium Editora, gráfica parceira fundada em 1985.
          </p>
        </div>
      </div>
    </main>
  );
}

// ─── Resultado view ───────────────────────────────────────────────────────────

function ResultadoView({
  resultado,
  loading,
  tiragem,
}: {
  resultado: ResultadoOrcamento | null;
  loading: boolean;
  tiragem: number;
}) {
  // Estado inicial (nunca renderizou nada)
  if (!resultado) {
    return (
      <div className="bg-white rounded-2xl border border-zinc-100 p-6 min-h-[320px] flex items-center justify-center">
        <p className="text-sm text-zinc-400">Calculando…</p>
      </div>
    );
  }

  // Erro de negócio
  if (!resultado.ok) {
    const isTiragemAlta = resultado.codigo === "TIRAGEM_INVALIDA" && /300/.test(resultado.erro);
    if (isTiragemAlta) {
      return (
        <div className={`bg-white rounded-2xl border border-brand-gold/40 p-6 transition-opacity ${loading ? "opacity-70" : ""}`}>
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-2">Orçamento personalizado</p>
          <h3 className="font-heading text-xl text-brand-primary mb-3 leading-tight">
            Tiragens acima de 300 têm orçamento sob medida
          </h3>
          <p className="text-sm text-zinc-600 leading-relaxed mb-4">
            Nos escreva com o formato, número de páginas e quantidade que precisa —
            a gente responde com o preço em dias úteis.
          </p>
          <a
            href="mailto:contato@useautoria.com?subject=Or%C3%A7amento%20de%20impress%C3%A3o%20%E2%80%94%20tiragem%20personalizada"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-gold hover:underline underline-offset-4"
          >
            contato@useautoria.com →
          </a>
        </div>
      );
    }
    return (
      <div className={`bg-white rounded-2xl border border-zinc-100 p-6 transition-opacity ${loading ? "opacity-70" : ""}`}>
        <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-2">Não deu pra calcular</p>
        <p className="text-sm text-zinc-600 leading-relaxed">{resultado.erro}</p>
      </div>
    );
  }

  const o = resultado.orcamento;

  return (
    <div className={`bg-white rounded-2xl border border-zinc-100 p-6 transition-opacity ${loading ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-zinc-400 uppercase tracking-wide font-medium">Custo por exemplar</p>
        <span className="text-[10px] text-brand-gold font-semibold uppercase tracking-wide bg-brand-gold/10 rounded-full px-2 py-0.5">
          Sem tiragem mínima
        </span>
      </div>
      <p className="font-heading text-4xl text-brand-primary leading-none mb-1">
        {brl(o.custo_por_exemplar_reais)}
      </p>
      <p className="text-xs text-zinc-500 mb-5">por exemplar</p>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">
            Subtotal ({tiragem} {tiragem === 1 ? "exemplar" : "exemplares"})
          </span>
          <span className="text-zinc-700 font-mono">{brl(o.subtotal_produtos_reais)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">
            Frete estimado ({REGIAO_LABELS[o.regiao_frete]})
          </span>
          <span className="text-zinc-700 font-mono">{brl(o.frete_estimado_reais)}</span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
          <span className="font-heading text-brand-primary">Total</span>
          <span className="font-heading text-lg text-brand-primary font-mono">{brl(o.total_reais)}</span>
        </div>
      </div>

      <div className="bg-brand-primary/5 rounded-xl border border-brand-primary/10 px-4 py-3 mb-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-0.5">Produção</p>
        <p className="text-sm text-brand-primary font-semibold">Até 15 dias úteis</p>
      </div>

      <details className="group">
        <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-700 select-none">
          Ver composição do preço →
        </summary>
        <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
          <div className="flex items-center justify-between">
            <span>Miolo</span>
            <span className="font-mono">{brl(o.custo_miolo_unit_reais)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Capa</span>
            <span className="font-mono">{brl(o.custo_capa_unit_reais)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Encadernação ({ENCADERNACAO_LABELS[o.encadernacao_tecnica]})</span>
            <span className="font-mono">{brl(o.custo_encadernacao_unit_reais)}</span>
          </div>
          {tiragem > 1 && (
            <div className="flex items-center justify-between text-emerald-600">
              <span>Desconto por quantidade</span>
              <span className="font-mono">
                −{brl(o.subtotal_unit_reais - o.custo_unit_com_multiplicador_reais)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Preparação do título (rateada)</span>
            <span className="font-mono">{brl(o.setup_rateado_unit_reais)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-zinc-100 text-zinc-700">
            <span>Por exemplar</span>
            <span className="font-mono">{brl(o.custo_por_exemplar_reais)}</span>
          </div>
        </div>
      </details>

      <p className="text-[11px] text-zinc-400 leading-relaxed mt-4">
        Valores válidos para pedido feito pela plataforma. Frete estimado; o valor final é confirmado no pedido.
      </p>
    </div>
  );
}

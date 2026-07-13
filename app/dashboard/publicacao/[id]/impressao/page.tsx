"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  PapelMiolo,
  CorMiolo,
  AcabamentoCapa,
  OrcamentoImpressao,
} from "@/lib/impressao-pricing";

/**
 * BLOCO-02-C — Orçamento de impressão POD.
 *
 * Usuário escolhe papel, cor, acabamento, orelhas, tiragem e CEP.
 * O preço é calculado server-side (rota /orcamento) e refeito com debounce.
 * O botão "Adicionar ao carrinho" dispara `cart:updated` para a sidebar.
 */

type Papel = PapelMiolo;
type Cor = CorMiolo;
type Acab = AcabamentoCapa;

interface FormState {
  papel_miolo: Papel;
  cor_miolo: Cor;
  acabamento_capa: Acab;
  com_orelhas: boolean;
  tiragem: number;
  cep_entrega: string;
}

const PAPEL_OPTIONS: Array<{ value: Papel; label: string; hint: string }> = [
  { value: "offset_75g", label: "Offset branco 75g", hint: "Padrão econômico" },
  { value: "avena_80g", label: "Avena creme 80g", hint: "Tom creme, leitura confortável" },
  { value: "polen_bold_90g", label: "Pólen Bold 90g", hint: "Premium, ideal para livros literários" },
  { value: "couche_fosco_90g", label: "Couché fosco 90g", hint: "Só para miolo colorido" },
];

const ACABAMENTO_OPTIONS: Array<{ value: Acab; label: string }> = [
  { value: "fosca_bopp", label: "Laminação fosca" },
  { value: "brilho_bopp", label: "Laminação brilho" },
  { value: "verniz_uv", label: "Verniz UV total" },
];

const TIRAGEM_PRESETS = [1, 5, 10, 25, 50, 100, 200, 500];

const DEFAULTS: FormState = {
  papel_miolo: "offset_75g",
  cor_miolo: "pb",
  acabamento_capa: "fosca_bopp",
  com_orelhas: false,
  tiragem: 10,
  cep_entrega: "",
};

interface ProjectMeta {
  titulo: string;
  autor: string;
  paginas: number;
  formato: string;
  capa_thumb_url: string | null;
  qa_grafica_aprovado: boolean;
  qa_grafica_pendencias: string[];
}

function formatBRL(reais: number): string {
  return reais.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export default function ImpressaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaErro, setMetaErro] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [orcamento, setOrcamento] = useState<OrcamentoImpressao | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [erroOrc, setErroOrc] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState<"idle" | "loading" | "ok" | "erro">("idle");
  const debounceRef = useRef<number | null>(null);

  // Carrega meta do projeto
  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoadingMeta(true);
      const { data, error } = await supabase
        .from("projects")
        .select(`
          formato, dados_capa, dados_miolo, dados_elementos, dados_qa,
          manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)
        `)
        .eq("id", id)
        .single();

      if (cancel) return;

      if (error || !data) {
        setMetaErro("Projeto não encontrado.");
        setLoadingMeta(false);
        return;
      }

      const ms = data.manuscripts as unknown as {
        titulo?: string;
        autor_primeiro_nome?: string;
        autor_sobrenome?: string;
      } | null;
      const el = data.dados_elementos as { titulo_escolhido?: string } | null;
      const capa = data.dados_capa as {
        editor_data?: { orelhaMm?: number; comOrelhas?: boolean };
        orelha_mm?: number;
        usar_orelhas?: boolean;
        exports?: { jpeg_ebook?: { storage_path?: string } };
      } | null;
      const miolo = data.dados_miolo as { paginas_reais?: number } | null;
      const qa = data.dados_qa as {
        grafica?: { aprovado?: boolean; pendencias?: Array<{ mensagem: string }> };
      } | null;

      const paginas = miolo?.paginas_reais ?? 0;
      if (!paginas) {
        setMetaErro("Miolo ainda não foi gerado. Gere o PDF do miolo antes de orçar impressão.");
        setLoadingMeta(false);
        return;
      }

      const titulo = el?.titulo_escolhido ?? ms?.titulo ?? "Sem título";
      const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome]
        .filter(Boolean).join(" ") || "Autor";

      const orelhaMmEditor = capa?.editor_data?.orelhaMm ?? 0;
      const comOrelhasEditor = capa?.editor_data?.comOrelhas ?? false;
      const comOrelhasUpload = capa?.usar_orelhas ?? (capa?.orelha_mm ?? 0) > 0;
      const comOrelhasDefault = orelhaMmEditor > 0 || comOrelhasEditor || comOrelhasUpload;

      let capaThumbUrl: string | null = null;
      const ebookPath = capa?.exports?.jpeg_ebook?.storage_path;
      if (ebookPath) {
        const { data: signed } = await supabase.storage
          .from("editor-assets")
          .createSignedUrl(ebookPath, 3600);
        capaThumbUrl = signed?.signedUrl ?? null;
      }

      if (cancel) return;

      setMeta({
        titulo,
        autor,
        paginas,
        formato: (data.formato as string) ?? "padrao_br",
        capa_thumb_url: capaThumbUrl,
        qa_grafica_aprovado: qa?.grafica?.aprovado ?? false,
        qa_grafica_pendencias: qa?.grafica?.pendencias?.map(p => p.mensagem) ?? [],
      });
      setForm(prev => ({ ...prev, com_orelhas: comOrelhasDefault }));
      setLoadingMeta(false);
    })();
    return () => { cancel = true; };
  }, [id]);

  // Debounced fetch do orçamento sempre que o form muda
  const fetchOrcamento = useCallback(async (state: FormState) => {
    setCalculando(true);
    setErroOrc(null);
    try {
      const res = await fetch(`/api/publicacao/${id}/impressao/orcamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErroOrc(json.error ?? "Não foi possível calcular o orçamento.");
        setOrcamento(null);
      } else {
        setOrcamento(json.orcamento as OrcamentoImpressao);
      }
    } catch {
      setErroOrc("Falha de rede ao calcular orçamento.");
      setOrcamento(null);
    } finally {
      setCalculando(false);
    }
  }, [id]);

  useEffect(() => {
    if (!meta) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchOrcamento(form);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [form, meta, fetchOrcamento]);

  // Ajuste automático: se selecionar Couché sem estar em cor, força cor.
  useEffect(() => {
    if (form.papel_miolo === "couche_fosco_90g" && form.cor_miolo === "pb") {
      setForm(prev => ({ ...prev, cor_miolo: "cor" }));
    }
  }, [form.papel_miolo, form.cor_miolo]);

  const handleAddCarrinho = useCallback(async () => {
    if (!orcamento) return;
    setAddStatus("loading");
    try {
      const res = await fetch("/api/carrinho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "impressao_livro",
          project_id: id,
          config: form,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setAddStatus("erro");
        setErroOrc(json.error ?? "Falha ao adicionar ao carrinho.");
        return;
      }
      setAddStatus("ok");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cart:updated"));
      }
      setTimeout(() => {
        router.push("/carrinho");
      }, 400);
    } catch {
      setAddStatus("erro");
      setErroOrc("Falha de rede ao adicionar ao carrinho.");
    }
  }, [orcamento, id, form, router]);

  const papelDisabled = useCallback((p: Papel): boolean => {
    return p === "couche_fosco_90g" && form.cor_miolo === "pb" ? false : false;
  }, [form.cor_miolo]);

  const summaryText = useMemo(() => {
    if (!orcamento) return "";
    const parts = [
      `${form.tiragem} exemplar${form.tiragem > 1 ? "es" : ""}`,
      `${orcamento.encadernacao_tecnica === "grampeado" ? "grampeado" : "brochura PUR"}`,
      form.com_orelhas ? "com orelhas" : "sem orelhas",
    ];
    return parts.join(" • ");
  }, [orcamento, form]);

  if (loadingMeta) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="animate-pulse text-slate-500">Carregando projeto…</div>
      </div>
    );
  }

  if (metaErro || !meta) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Orçamento de impressão</h1>
        <div className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
          {metaErro ?? "Erro desconhecido."}
        </div>
        <Link
          href={`/dashboard/publicacao/${id}`}
          className="inline-block mt-6 text-sm text-emerald-700 hover:underline"
        >
          ← Voltar para Publicação
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-8">
      <div className="mb-6">
        <Link
          href={`/dashboard/publicacao/${id}`}
          className="text-sm text-emerald-700 hover:underline"
        >
          ← Voltar para Publicação
        </Link>
        <h1 className="text-2xl lg:text-3xl font-semibold text-slate-900 mt-2">
          Orçamento de impressão
        </h1>
        <p className="text-slate-600 mt-1">
          <span className="font-medium">{meta.titulo}</span> • {meta.autor} • {meta.paginas} páginas • formato {meta.formato}
        </p>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Configure a tiragem e o acabamento do seu livro. O orçamento é calculado em tempo real. Adicione ao carrinho quando estiver pronto.
        </p>
      </div>

      {!meta.qa_grafica_aprovado && meta.qa_grafica_pendencias.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-700 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                Sua capa tem pontos de atenção
              </p>
              <p className="text-xs text-amber-800 mb-2 leading-relaxed">
                Você pode adicionar ao carrinho mesmo assim, mas pode haver problemas na impressão. Recomendamos ajustar antes:
              </p>
              <ul className="text-xs text-amber-800 pl-4 list-disc space-y-0.5 marker:text-amber-500 mb-2">
                {meta.qa_grafica_pendencias.slice(0, 3).map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
              <Link
                href={`/dashboard/prova/${id}`}
                className="text-xs font-medium text-amber-900 hover:underline"
              >
                Ir para a Prova →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        {/* Coluna esquerda: opções */}
        <div className="space-y-8">
          {/* Papel do miolo */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Papel do miolo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PAPEL_OPTIONS.map(opt => {
                const disabled = papelDisabled(opt.value);
                const selected = form.papel_miolo === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setForm(prev => ({ ...prev, papel_miolo: opt.value }))}
                    className={`text-left p-3 rounded-lg border-2 transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="font-medium text-slate-900 text-sm">{opt.label}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Cor do miolo */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Cor do miolo</h2>
            <div className="flex gap-3">
              {(["pb", "cor"] as Cor[]).map(c => {
                const selected = form.cor_miolo === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, cor_miolo: c }))}
                    className={`px-5 py-2.5 rounded-lg border-2 text-sm font-medium transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {c === "pb" ? "Preto e branco" : "Colorido"}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Acabamento da capa */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Acabamento da capa</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {ACABAMENTO_OPTIONS.map(opt => {
                const selected = form.acabamento_capa === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, acabamento_capa: opt.value }))}
                    className={`p-3 rounded-lg border-2 text-sm font-medium transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Orelhas */}
          <section>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.com_orelhas}
                onChange={e => setForm(prev => ({ ...prev, com_orelhas: e.target.checked }))}
                className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">Capa com orelhas</span>
                <span className="text-slate-600 ml-2">(+ R$ 6 a 8 por exemplar)</span>
              </span>
            </label>
          </section>

          {/* Tiragem */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Tiragem</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              {TIRAGEM_PRESETS.map(n => {
                const selected = form.tiragem === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, tiragem: n }))}
                    className={`px-4 py-2 rounded-md border text-sm font-medium transition ${
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 hover:border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Personalizado:</label>
              <input
                type="number"
                min={1}
                max={5000}
                value={form.tiragem}
                onChange={e => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n >= 1) {
                    setForm(prev => ({ ...prev, tiragem: n }));
                  }
                }}
                className="w-24 px-3 py-1.5 rounded-md border border-slate-300 text-sm"
              />
              <span className="text-sm text-slate-600">exemplares</span>
            </div>
          </section>

          {/* CEP */}
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mb-3">CEP de entrega</h2>
            <input
              type="text"
              inputMode="numeric"
              placeholder="00000-000"
              value={form.cep_entrega}
              onChange={e => setForm(prev => ({ ...prev, cep_entrega: e.target.value }))}
              maxLength={9}
              className="w-40 px-3 py-2 rounded-md border border-slate-300 text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              Frete estimado por região. Valor exato definido no checkout.
            </p>
          </section>
        </div>

        {/* Coluna direita: sidebar sticky com orçamento */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">Orçamento</h3>
            <p className="text-xs text-slate-500 mb-4">{summaryText || "Configurando…"}</p>

            {calculando && (
              <div className="text-sm text-slate-500 animate-pulse">Calculando…</div>
            )}

            {!calculando && erroOrc && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                {erroOrc}
              </div>
            )}

            {!calculando && !erroOrc && orcamento && (
              <>
                <dl className="text-sm space-y-1.5 mb-4">
                  <div className="flex justify-between text-slate-700">
                    <dt>Custo por exemplar</dt>
                    <dd className="font-medium">{formatBRL(orcamento.custo_por_exemplar_reais)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <dt>Subtotal ({form.tiragem}×)</dt>
                    <dd className="font-medium">{formatBRL(orcamento.subtotal_produtos_reais)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <dt>Frete estimado</dt>
                    <dd className="font-medium">{formatBRL(orcamento.frete_estimado_reais)}</dd>
                  </div>
                </dl>
                <div className="border-t border-slate-200 pt-3 mb-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-slate-700">Total</span>
                    <span className="text-2xl font-semibold text-emerald-700">
                      {formatBRL(orcamento.total_reais)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Prazo de produção: {orcamento.prazo_producao_dias} dias úteis
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddCarrinho}
                  disabled={addStatus === "loading"}
                  className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium text-sm transition"
                >
                  {addStatus === "loading" ? "Adicionando…"
                    : addStatus === "ok" ? "Adicionado ✓"
                    : "Adicionar ao carrinho"}
                </button>

                <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                  Valores estimados. O total definitivo é confirmado no checkout,
                  após validação técnica pela gráfica parceira.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

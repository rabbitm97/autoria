"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { EtapasProgress } from "@/components/etapas-progress";
import { ImageUploadRef } from "@/components/image-upload-ref";
import { supabase } from "@/lib/supabase";
import type { Elemento } from "@/app/api/agentes/gerar-elemento-capa/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMATOS = [
  { id: "16x23", label: "16×23 cm", sub: "Padrão editorial", w: 16, h: 23   },
  { id: "14x21", label: "14×21 cm", sub: "Formato compacto", w: 14, h: 21   },
  { id: "11x18", label: "11×18 cm", sub: "Bolso",            w: 11, h: 18   },
  { id: "20x20", label: "20×20 cm", sub: "Quadrado",         w: 20, h: 20   },
  { id: "a4",    label: "A4",       sub: "21×29,7 cm",       w: 21, h: 29.7 },
] as const;

type FormatoId = typeof FORMATOS[number]["id"];

const ELEMENTOS_INFO: { id: Elemento; label: string; desc: string }[] = [
  { id: "frente",        label: "Frente",       desc: "A capa da frente — primeira impressão do leitor" },
  { id: "contra",        label: "Contra-capa",  desc: "O verso do livro — sinopse e informações editoriais" },
  { id: "lombada",       label: "Lombada",      desc: "A espinha do livro — título e autor na prateleira" },
  { id: "orelha_frente", label: "Orelha frente", desc: "Dobra da frente — biografia do autor" },
  { id: "orelha_verso",  label: "Orelha verso", desc: "Dobra do verso — informações adicionais" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Etapa = "setup" | Elemento | "montagem";

interface ElementoLocal {
  descricao: string;
  imagemRef: string | null;
  opcoes: Array<{ url: string; storage_path: string }>;
  escolhida: string | null;
}

const BLANK_ELEMENTO: ElementoLocal = {
  descricao: "",
  imagemRef: null,
  opcoes: [],
  escolhida: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcLombadaMm(paginas: number) {
  return Math.round(paginas * 0.07 * 10) / 10;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // ── Setup state ──────────────────────────────────────────────────────────
  const [etapa, setEtapa] = useState<Etapa>("setup");
  const [usarCapa, setUsarCapa] = useState<boolean | null>(null);
  const [formato, setFormato] = useState<FormatoId | "">("");
  const [paginas, setPaginas] = useState<number>(200);
  const [usarOrelhas, setUsarOrelhas] = useState(false);

  // ── Project metadata ─────────────────────────────────────────────────────
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [genero, setGenero] = useState("ficção");

  // ── Per-element state ────────────────────────────────────────────────────
  const [elementos, setElementos] = useState<Record<Elemento, ElementoLocal>>({
    frente:        { ...BLANK_ELEMENTO },
    contra:        { ...BLANK_ELEMENTO },
    lombada:       { ...BLANK_ELEMENTO },
    orelha_frente: { ...BLANK_ELEMENTO },
    orelha_verso:  { ...BLANK_ELEMENTO },
  });

  // ── Global UI state ──────────────────────────────────────────────────────
  const [pageLoading, setPageLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [montando, setMontando] = useState(false);
  const [montagem, setMontagem] = useState<{ url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Load project ─────────────────────────────────────────────────────────
  const loadProject = useCallback(async () => {
    setPageLoading(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("dados_elementos, dados_capa, manuscript:manuscript_id(texto)")
        .eq("id", id)
        .single();

      if (data?.dados_elementos) {
        const el = data.dados_elementos as Record<string, unknown>;
        setTitulo((el.titulo_escolhido as string) ?? (el.opcoes_titulo as string[])?.[0] ?? "");
        setSinopse?.(el.sinopse_curta as string ?? "");
      }

      // Estimate page count from manuscript word count
      const texto = (data?.manuscript as { texto?: string } | null)?.texto ?? "";
      if (texto) {
        const words = texto.trim().split(/\s+/).length;
        setPaginas(Math.max(100, Math.round(words / 275)));
      }

      // Restore saved state
      if (data?.dados_capa) {
        const c = data.dados_capa as Record<string, unknown>;
        if (typeof c.usar_capa === "boolean") setUsarCapa(c.usar_capa);
        if (c.formato_capa) setFormato(c.formato_capa as FormatoId);
        if (typeof c.paginas === "number") setPaginas(c.paginas);
        if (typeof c.usar_orelhas === "boolean") setUsarOrelhas(c.usar_orelhas);
        if (c.genero) setGenero(c.genero as string);
        if (c.montagem) setMontagem(c.montagem as { url: string });

        // Restore elements
        const restored: Partial<Record<Elemento, ElementoLocal>> = {};
        for (const key of ["frente", "contra", "lombada", "orelha_frente", "orelha_verso"] as Elemento[]) {
          if (c[key]) {
            const el = c[key] as { descricao?: string; opcoes?: unknown[]; url_escolhida?: string };
            restored[key] = {
              descricao: el.descricao ?? "",
              imagemRef: null,
              opcoes: (el.opcoes ?? []) as Array<{ url: string; storage_path: string }>,
              escolhida: el.url_escolhida ?? null,
            };
          }
        }
        if (Object.keys(restored).length > 0) {
          setElementos(prev => ({ ...prev, ...restored }));
        }

        // Resume at the right step
        if (c.usar_capa === false) setEtapa("setup");
        else if (c.formato_capa) {
          if (c.montagem) setEtapa("montagem");
          else setEtapa("setup");
        }
      }
    } finally {
      setPageLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // ── Persist progress to Supabase ─────────────────────────────────────────
  async function saveProgress(extra: Record<string, unknown> = {}) {
    const payload: Record<string, unknown> = {
      usar_capa: usarCapa,
      formato_capa: formato,
      paginas,
      usar_orelhas: usarOrelhas,
      genero,
    };
    for (const key of ["frente", "contra", "lombada", "orelha_frente", "orelha_verso"] as Elemento[]) {
      const el = elementos[key];
      if (el.opcoes.length > 0 || el.escolhida) {
        payload[key] = { descricao: el.descricao, opcoes: el.opcoes, url_escolhida: el.escolhida };
      }
    }
    await supabase
      .from("projects")
      .update({ dados_capa: { ...payload, ...extra } })
      .eq("id", id);
  }

  // ── Generate a single element ─────────────────────────────────────────────
  async function gerarElemento(el: Elemento) {
    setGerando(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/gerar-elemento-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          elemento: el,
          titulo,
          autor,
          descricao: elementos[el].descricao,
          imagemRef: elementos[el].imagemRef,
          genero,
          lombada_mm: calcLombadaMm(paginas),
          qtd: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar");

      setElementos(prev => ({
        ...prev,
        [el]: { ...prev[el], opcoes: data.opcoes, escolhida: data.opcoes[0]?.url ?? null },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGerando(false);
    }
  }

  // ── Assemble final cover ──────────────────────────────────────────────────
  async function montarCapa() {
    if (!elementos.frente.escolhida || !elementos.contra.escolhida) return;
    setMontando(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/montar-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          formato,
          paginas,
          usar_orelhas: usarOrelhas,
          elementos: {
            frente_url:        elementos.frente.escolhida,
            contra_url:        elementos.contra.escolhida,
            lombada_url:       elementos.lombada.escolhida ?? undefined,
            orelha_frente_url: usarOrelhas ? elementos.orelha_frente.escolhida ?? undefined : undefined,
            orelha_verso_url:  usarOrelhas ? elementos.orelha_verso.escolhida ?? undefined : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro na montagem");
      setMontagem({ url: data.url });
      await saveProgress({ montagem: { url: data.url, storage_path: data.storage_path, gerado_em: new Date().toISOString() } });
      setEtapa("montagem");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na montagem");
    } finally {
      setMontando(false);
    }
  }

  // ── Skip cover ────────────────────────────────────────────────────────────
  async function skipCapa() {
    setSaving(true);
    await supabase
      .from("projects")
      .update({ dados_capa: { usar_capa: false }, etapa_atual: "diagramacao" })
      .eq("id", id);
    router.push("/dashboard");
  }

  // ── Save & proceed ────────────────────────────────────────────────────────
  async function handleSalvar() {
    setSaving(true);
    await saveProgress();
    await supabase.from("projects").update({ etapa_atual: "diagramacao" }).eq("id", id);
    router.push("/dashboard");
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const lombadaMm = calcLombadaMm(paginas);
  const fmtInfo = FORMATOS.find(f => f.id === formato);

  const elementosAtivos: Elemento[] = [
    "frente", "contra", "lombada",
    ...(usarOrelhas ? ["orelha_frente", "orelha_verso"] as Elemento[] : []),
  ];

  const todosGerados = elementosAtivos.every(el => !!elementos[el].escolhida);

  // ── Render ────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <EtapasProgress currentStep={3} />
      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Passo 4 — Capa</p>
          <h1 className="font-heading text-3xl text-brand-primary">Criação da capa</h1>
          <p className="text-zinc-500 mt-1.5 text-sm">
            Gere cada elemento da capa com IA — frente, contra-capa, lombada e orelhas — e monte a arte-final completa.
          </p>
        </div>

        {/* ── SETUP ──────────────────────────────────────────────────────── */}
        {etapa === "setup" && (
          <div className="bg-white rounded-2xl border border-zinc-100 p-8 space-y-8">

            {/* Mandatory: want cover? */}
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Deseja uma capa para este projeto? <span className="text-red-400 normal-case font-normal">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {([true, false] as const).map(val => (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => setUsarCapa(val)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      usarCapa === val
                        ? "border-brand-gold bg-brand-gold/5"
                        : "border-zinc-200 hover:border-zinc-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${usarCapa === val ? "border-brand-gold" : "border-zinc-300"}`}>
                        {usarCapa === val && <span className="w-2 h-2 rounded-full bg-brand-gold block" />}
                      </span>
                      <span className="text-sm font-semibold text-zinc-800">
                        {val ? "Sim, quero gerar a capa" : "Não, já tenho minha capa"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 pl-6">
                      {val
                        ? "A IA cria cada elemento da capa do zero."
                        : "Pular esta etapa e avançar para diagramação."}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* If no cover wanted → skip button */}
            {usarCapa === false && (
              <div className="flex justify-end">
                <button
                  onClick={skipCapa}
                  disabled={saving}
                  className="px-8 py-3 rounded-xl bg-zinc-200 text-zinc-700 font-semibold text-sm hover:bg-zinc-300 transition-all disabled:opacity-50"
                >
                  {saving ? "Salvando…" : "Pular — ir para Diagramação →"}
                </button>
              </div>
            )}

            {/* If yes → format + settings */}
            {usarCapa === true && (
              <>
                <hr className="border-zinc-100" />

                {/* Format */}
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
                    Formato do livro
                  </p>
                  <div className="grid grid-cols-5 gap-3">
                    {FORMATOS.map(fmt => {
                      const BOOK_H = 68;
                      const bookW = Math.round((fmt.w / fmt.h) * BOOK_H);
                      const sel = formato === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setFormato(fmt.id)}
                          className={`flex flex-col items-center gap-2.5 py-3 px-2 rounded-xl border-2 transition-all ${
                            sel ? "border-brand-gold bg-brand-gold/5" : "border-zinc-200 hover:border-zinc-300 bg-white"
                          }`}
                        >
                          <div className="flex items-end justify-center" style={{ height: BOOK_H + 6 }}>
                            <div
                              style={{ width: bookW, height: BOOK_H }}
                              className={`rounded-sm shadow-sm border transition-colors ${sel ? "bg-brand-primary border-brand-primary" : "bg-zinc-100 border-zinc-300"}`}
                            >
                              <div className={`w-[3px] h-full rounded-l-sm ${sel ? "bg-brand-gold/40" : "bg-zinc-200"}`} />
                            </div>
                          </div>
                          <div className="text-center">
                            <p className={`text-[11px] font-semibold ${sel ? "text-brand-gold" : "text-zinc-700"}`}>{fmt.label}</p>
                            <p className="text-[10px] text-zinc-400">{fmt.sub}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <hr className="border-zinc-100" />

                {/* Pages + spine + flaps */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Número de páginas do manuscrito
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      value={paginas}
                      onChange={e => setPaginas(Math.max(10, parseInt(e.target.value) || 100))}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
                    />
                    <p className="text-[11px] text-zinc-400 mt-1.5">
                      Lombada calculada: <strong>{lombadaMm}mm</strong>
                      {lombadaMm < 10 && <span className="text-amber-500 ml-1">· texto na lombada pode não ser visível</span>}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Gênero literário
                    </label>
                    <select
                      value={genero}
                      onChange={e => setGenero(e.target.value)}
                      className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 bg-white"
                    >
                      {["ficção","romance","suspense","fantasia","biografia","autoajuda","negócios","poesia","infantil","literatura"].map(g => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Nome do autor (para lombada e cabeçalhos)
                  </label>
                  <input
                    value={autor}
                    onChange={e => setAutor(e.target.value)}
                    placeholder="Como deve aparecer na capa"
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-200 bg-zinc-50">
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">Orelhas (flaps)</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Dobras na frente e verso — comum em livros de livraria</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUsarOrelhas(v => !v)}
                    className={`w-11 h-6 rounded-full transition-colors relative ${usarOrelhas ? "bg-brand-gold" : "bg-zinc-300"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${usarOrelhas ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>

                <button
                  onClick={() => { if (formato) setEtapa("frente"); }}
                  disabled={!formato}
                  className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold text-sm uppercase tracking-wide hover:bg-[#2a2a4e] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Começar criação da capa →
                </button>
              </>
            )}
          </div>
        )}

        {/* ── ELEMENT STEPS ──────────────────────────────────────────────── */}
        {etapa !== "setup" && etapa !== "montagem" && (() => {
          const el = etapa as Elemento;
          const info = ELEMENTOS_INFO.find(e => e.id === el)!;
          const state = elementos[el];
          const elIdx = elementosAtivos.indexOf(el);
          const isLast = elIdx === elementosAtivos.length - 1;
          const nextEl = isLast ? null : elementosAtivos[elIdx + 1];

          return (
            <div>
              {/* Progress stepper */}
              <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
                {elementosAtivos.map((e, i) => {
                  const done = elementos[e].escolhida !== null && i < elementosAtivos.indexOf(el);
                  const active = e === el;
                  return (
                    <div key={e} className="flex items-center gap-2 shrink-0">
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        done   ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                        active ? "bg-brand-primary border-brand-primary text-brand-gold" :
                                 "bg-white border-zinc-200 text-zinc-400"
                      }`}>
                        <span>{done ? "✓" : i + 1}</span>
                        <span>{ELEMENTOS_INFO.find(x => x.id === e)!.label}</span>
                      </div>
                      {i < elementosAtivos.length - 1 && <span className="text-zinc-300 text-xs">›</span>}
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-zinc-300 text-xs">›</span>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-zinc-200 text-zinc-400 bg-white">
                    Montagem
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-100 p-8 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] bg-brand-primary/10 text-brand-primary font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                      {fmtInfo?.label}
                    </span>
                    <span className="text-[11px] text-zinc-400">·</span>
                    <span className="text-[11px] text-zinc-400">Lombada {lombadaMm}mm</span>
                  </div>
                  <h2 className="font-heading text-2xl text-brand-primary">{info.label}</h2>
                  <p className="text-zinc-500 text-sm mt-0.5">{info.desc}</p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Descreva o que você quer neste elemento
                  </label>
                  <textarea
                    value={state.descricao}
                    onChange={e => setElementos(prev => ({ ...prev, [el]: { ...prev[el], descricao: e.target.value } }))}
                    placeholder={
                      el === "frente"        ? "Ex: fundo escuro com névoa, silhueta de uma floresta misteriosa, tons azul e dourado…" :
                      el === "contra"        ? "Ex: fundo suave que combine com a frente, tons neutros para facilitar a leitura da sinopse…" :
                      el === "lombada"       ? "Ex: fundo escuro com o mesmo padrão da frente, texto dourado…" :
                      el === "orelha_frente" ? "Ex: foto do autor com fundo desfocado, tons da capa…" :
                                              "Ex: foto do logo da editora, informações de contato, tom clean…"
                    }
                    rows={4}
                    className="w-full resize-none border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30"
                  />
                </div>

                {/* Reference image */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Imagem de referência <span className="text-zinc-300 normal-case font-normal">(opcional)</span>
                  </label>
                  <ImageUploadRef
                    onImage={img => setElementos(prev => ({ ...prev, [el]: { ...prev[el], imagemRef: img } }))}
                  />
                </div>

                {/* Generate button */}
                <button
                  onClick={() => gerarElemento(el)}
                  disabled={gerando}
                  className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-[#2a2a4e] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {gerando ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                      Gerando…
                    </span>
                  ) : state.opcoes.length > 0 ? "Gerar novamente" : `Gerar ${info.label} com IA`}
                </button>

                {error && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">{error}</div>
                )}

                {/* Options grid */}
                {state.opcoes.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                      Escolha uma opção
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      {state.opcoes.map((opt, i) => (
                        <button
                          key={i}
                          onClick={() => setElementos(prev => ({ ...prev, [el]: { ...prev[el], escolhida: opt.url } }))}
                          className={`relative rounded-xl overflow-hidden border-4 transition-all ${
                            state.escolhida === opt.url
                              ? "border-brand-gold shadow-lg scale-[1.01]"
                              : "border-zinc-200 hover:border-brand-gold/40"
                          }`}
                        >
                          <div
                            className="relative bg-zinc-100"
                            style={{ aspectRatio: fmtInfo ? `${fmtInfo.w}/${fmtInfo.h}` : "2/3" }}
                          >
                            <Image src={opt.url} alt={`Opção ${i + 1}`} fill className="object-cover" unoptimized />
                          </div>
                          {state.escolhida === opt.url && (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-gold flex items-center justify-center text-brand-primary text-xs font-bold shadow">
                              ✓
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      setError(null);
                      const prevIdx = elIdx - 1;
                      if (prevIdx < 0) setEtapa("setup");
                      else setEtapa(elementosAtivos[prevIdx]);
                    }}
                    className="px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-zinc-300 transition-colors"
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={async () => {
                      await saveProgress();
                      if (nextEl) setEtapa(nextEl);
                      else setEtapa("montagem");
                    }}
                    disabled={!state.escolhida}
                    className="flex-1 py-2.5 rounded-xl bg-brand-gold text-brand-primary font-semibold text-sm hover:bg-brand-gold/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isLast ? "Ver montagem →" : `Próximo: ${nextEl ? ELEMENTOS_INFO.find(x => x.id === nextEl)!.label : "Montagem"} →`}
                  </button>
                </div>
              </div>

              {/* Thumbnails of completed elements */}
              {elementosAtivos.filter(e => e !== el && elementos[e].escolhida).length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Elementos concluídos</p>
                  <div className="flex gap-3 flex-wrap">
                    {elementosAtivos
                      .filter(e => e !== el && elementos[e].escolhida)
                      .map(e => (
                        <button
                          key={e}
                          onClick={() => setEtapa(e)}
                          className="group relative"
                          title={`Editar ${ELEMENTOS_INFO.find(x => x.id === e)!.label}`}
                        >
                          <div className="w-16 h-20 rounded-lg overflow-hidden border-2 border-emerald-200 relative">
                            <Image src={elementos[e].escolhida!} alt={e} fill className="object-cover" unoptimized />
                          </div>
                          <p className="text-[9px] text-zinc-400 mt-1 text-center">{ELEMENTOS_INFO.find(x => x.id === e)!.label}</p>
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[8px]">✓</div>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── MONTAGEM ───────────────────────────────────────────────────── */}
        {etapa === "montagem" && (
          <div className="space-y-6">

            {/* Element thumbnails */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6">
              <h2 className="font-heading text-xl text-brand-primary mb-4">Revisão dos elementos</h2>
              <div className="flex gap-4 flex-wrap">
                {elementosAtivos.map(el => {
                  const info = ELEMENTOS_INFO.find(x => x.id === el)!;
                  const url = elementos[el].escolhida;
                  return (
                    <div key={el} className="text-center">
                      <button
                        onClick={() => setEtapa(el)}
                        className="block w-20 rounded-lg overflow-hidden border-2 border-zinc-200 hover:border-brand-gold/40 transition-colors relative"
                        style={{ aspectRatio: fmtInfo ? `${fmtInfo.w}/${fmtInfo.h}` : "2/3" }}
                      >
                        {url ? (
                          <Image src={url} alt={info.label} fill className="object-cover" unoptimized />
                        ) : (
                          <div className="w-full h-full bg-zinc-100 flex items-center justify-center text-zinc-400 text-xs">Sem imagem</div>
                        )}
                      </button>
                      <p className="text-[10px] text-zinc-500 mt-1">{info.label}</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-zinc-400 mt-4">Clique em qualquer elemento para editar antes de montar.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">{error}</div>
            )}

            {/* Assemble button */}
            {!montagem && (
              <button
                onClick={montarCapa}
                disabled={montando || !todosGerados}
                className="w-full py-4 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm uppercase tracking-wide hover:bg-[#2a2a4e] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {montando ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                    Montando capa completa…
                  </span>
                ) : !todosGerados ? "Complete todos os elementos antes de montar" : "Montar capa completa →"}
              </button>
            )}

            {/* Assembled cover */}
            {montagem && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
                <h2 className="font-heading text-xl text-brand-primary">Capa completa montada</h2>
                <div className="rounded-xl overflow-hidden border border-zinc-200">
                  <Image
                    src={montagem.url}
                    alt="Capa completa"
                    width={1200}
                    height={600}
                    className="w-full h-auto"
                    unoptimized
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <a
                    href={montagem.url}
                    download="capa-completa.png"
                    className="px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-sm font-medium hover:border-zinc-300 transition-colors"
                  >
                    ↓ Baixar PNG
                  </a>
                  <button
                    onClick={montarCapa}
                    disabled={montando}
                    className="px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-sm hover:border-zinc-300 transition-colors disabled:opacity-50"
                  >
                    Remontar
                  </button>
                  <button
                    onClick={handleSalvar}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-brand-gold text-brand-primary font-semibold text-sm hover:bg-brand-gold/90 transition-all disabled:opacity-50"
                  >
                    {saving ? "Salvando…" : "Salvar e ir para Diagramação →"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

// Fix: setSinopse placeholder (we don't actually use sinopse here, but keep for loadProject)
function setSinopse(_: string) { /* unused */ }

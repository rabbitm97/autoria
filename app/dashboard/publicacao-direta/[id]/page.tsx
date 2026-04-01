"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { QAPublicacaoResult, PlataformaAlvo, QAChecagem } from "@/app/api/agentes/qa-publicacao/route";

// ─── Plataformas disponíveis ──────────────────────────────────────────────────

const PLATAFORMAS_DISPONIVEIS: { id: PlataformaAlvo; nome: string; icon: string; desc: string }[] = [
  { id: "amazon_kdp_ebook",    nome: "Amazon Kindle",    icon: "A",  desc: "eBook Kindle" },
  { id: "amazon_kdp_print",    nome: "Amazon KDP Print", icon: "A",  desc: "Impresso Print on Demand" },
  { id: "kobo",                nome: "Kobo",             icon: "K",  desc: "Rakuten Kobo" },
  { id: "apple_books",         nome: "Apple Books",      icon: "🍎", desc: "iOS e Mac" },
  { id: "google_play",         nome: "Google Play",      icon: "G",  desc: "Google Play Books" },
  { id: "spotify_audiobooks",  nome: "Spotify",          icon: "S",  desc: "Spotify Audiobooks" },
];

type Etapa = "plataformas" | "arquivos" | "metadados" | "qa" | "publicar";

const ETAPAS: { key: Etapa; label: string }[] = [
  { key: "plataformas", label: "Plataformas" },
  { key: "arquivos",    label: "Arquivos"    },
  { key: "metadados",   label: "Metadados"   },
  { key: "qa",          label: "Verificação QA" },
  { key: "publicar",    label: "Publicar"    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicacaoDiretaPage() {
  const { id } = useParams<{ id: string }>();

  const [etapa, setEtapa] = useState<Etapa>("plataformas");
  const [plataformasSel, setPlataformasSel] = useState<PlataformaAlvo[]>(["amazon_kdp_ebook", "kobo"]);
  const [mioloPdf,    setMioloPdf]    = useState<File | null>(null);
  const [capaPdf,     setCapaPdf]     = useState<File | null>(null);
  const [epubFile,    setEpubFile]    = useState<File | null>(null);
  const [audioFile,   setAudioFile]   = useState<File | null>(null);
  const [isbn,        setIsbn]        = useState("");
  const [paginas,     setPaginas]     = useState("");
  const [qaResult,    setQaResult]    = useState<QAPublicacaoResult | null>(null);
  const [loadingQA,   setLoadingQA]   = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const etapaIdx = ETAPAS.findIndex(e => e.key === etapa);

  function togglePlataforma(id: PlataformaAlvo) {
    setPlataformasSel(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  async function runQA() {
    setLoadingQA(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/qa-publicacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id,
          plataformas: plataformasSel,
          dados: {
            tem_miolo_pdf: !!mioloPdf,
            tem_capa_pdf: !!capaPdf,
            tem_epub: !!epubFile,
            tem_audiolivro: !!audioFile,
            tem_isbn: isbn.length >= 10,
            paginas: paginas ? parseInt(paginas) : undefined,
            resolucao_capa: 2560, // TODO: extrair real da imagem
          },
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Erro no QA");
      }
      const result: QAPublicacaoResult = await res.json();
      setQaResult(result);
      setEtapa("qa");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoadingQA(false);
    }
  }

  async function publicar() {
    setSubmitting(true);
    setError(null);
    // TODO: chamar API de distribuição real (Draft2Digital / KDP API)
    await new Promise(r => setTimeout(r, 2000));
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-full bg-brand-surface flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 max-w-lg w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h2 className="font-heading text-2xl text-brand-primary mb-3">Publicação enviada!</h2>
          <p className="text-zinc-500 text-sm leading-relaxed mb-6">
            Seu livro foi enviado para distribuição nas plataformas selecionadas. O prazo de aprovação é de 24–72h por plataforma.
          </p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-bold px-6 py-2.5 rounded-lg hover:bg-brand-gold/90 transition-colors">
            Voltar ao dashboard →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-brand-surface">

      {/* Header */}
      <div className="bg-white border-b border-zinc-100 px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">
            ← Dashboard
          </Link>
          <div className="w-px h-4 bg-zinc-200" />
          <h1 className="font-heading text-xl text-brand-primary">Publicação Direta</h1>
          <span className="bg-emerald-50 text-emerald-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-emerald-200 ml-auto">
            100% grátis
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-8 py-8">

        {/* Stepper */}
        <div className="flex items-center gap-0 mb-10 bg-white rounded-xl border border-zinc-100 p-1">
          {ETAPAS.map((e, i) => {
            const done   = i < etapaIdx;
            const active = e.key === etapa;
            return (
              <button
                key={e.key}
                onClick={() => done && setEtapa(e.key)}
                disabled={!done && !active}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  active ? "bg-brand-primary text-white" :
                  done   ? "text-emerald-600 hover:bg-emerald-50 cursor-pointer" :
                           "text-zinc-400 cursor-default"
                }`}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                ) : (
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${active ? "bg-white/20" : "bg-zinc-100"}`}>{i + 1}</span>
                )}
                {e.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-600 text-sm">
            {error}
          </div>
        )}

        {/* ── Etapa 1: Plataformas ─────────────────────────────────────────── */}
        {etapa === "plataformas" && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8">
            <h2 className="font-heading text-2xl text-brand-primary mb-2">Onde você quer publicar?</h2>
            <p className="text-zinc-500 text-sm mb-8">Selecione todas as plataformas. O QA vai verificar os requisitos específicos de cada uma.</p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {PLATAFORMAS_DISPONIVEIS.map(p => {
                const sel = plataformasSel.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlataforma(p.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                      sel ? "border-brand-gold bg-brand-gold/5" : "border-zinc-100 hover:border-zinc-200"
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                      sel ? "bg-brand-gold text-brand-primary" : "bg-zinc-100 text-zinc-500"
                    }`}>{p.icon}</span>
                    <div>
                      <div className="font-semibold text-sm text-zinc-800">{p.nome}</div>
                      <div className="text-xs text-zinc-400">{p.desc}</div>
                    </div>
                    {sel && (
                      <svg className="ml-auto shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setEtapa("arquivos")}
              disabled={plataformasSel.length === 0}
              className="bg-brand-gold text-brand-primary font-bold px-8 py-3 rounded-xl hover:bg-brand-gold/90 active:scale-95 transition-all disabled:opacity-40"
            >
              Continuar →
            </button>
          </div>
        )}

        {/* ── Etapa 2: Arquivos ────────────────────────────────────────────── */}
        {etapa === "arquivos" && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 space-y-6">
            <div>
              <h2 className="font-heading text-2xl text-brand-primary mb-2">Seus arquivos</h2>
              <p className="text-zinc-500 text-sm">Envie os arquivos já diagramados e prontos para publicação. O QA verificará se atendem aos requisitos.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FileDropZone label="Miolo diagramado (PDF)" accept=".pdf" file={mioloPdf} onChange={setMioloPdf}
                hint="PDF/X-1a, fonte embutida, sangria 3mm" required={plataformasSel.includes("amazon_kdp_print")} />
              <FileDropZone label="Capa completa (PDF)" accept=".pdf" file={capaPdf} onChange={setCapaPdf}
                hint="Frente + lombada + contra-capa, CMYK, 300 DPI" required={plataformasSel.includes("amazon_kdp_print")} />
              <FileDropZone label="eBook (EPUB)" accept=".epub" file={epubFile} onChange={setEpubFile}
                hint="EPUB 3.0 válido" required={plataformasSel.some(p => ["amazon_kdp_ebook","kobo","apple_books"].includes(p))} />
              <FileDropZone label="Audiolivro (MP3 ou M4B)" accept=".mp3,.m4b" file={audioFile} onChange={setAudioFile}
                hint="Mín. 192kbps, narração completa" required={plataformasSel.includes("spotify_audiobooks")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-1.5">ISBN <span className="text-zinc-400 font-normal">(recomendado)</span></label>
                <input
                  type="text"
                  value={isbn}
                  onChange={e => setIsbn(e.target.value)}
                  placeholder="978-85-XXXXX-XX-X"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold/50 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Número de páginas</label>
                <input
                  type="number"
                  value={paginas}
                  onChange={e => setPaginas(e.target.value)}
                  placeholder="ex: 280"
                  min={1}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold/50 transition"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEtapa("plataformas")} className="border border-zinc-200 text-zinc-600 font-semibold px-6 py-3 rounded-xl hover:border-zinc-300 transition">
                ← Voltar
              </button>
              <button onClick={() => setEtapa("metadados")} className="bg-brand-gold text-brand-primary font-bold px-8 py-3 rounded-xl hover:bg-brand-gold/90 active:scale-95 transition-all">
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* ── Etapa 3: Metadados ───────────────────────────────────────────── */}
        {etapa === "metadados" && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 space-y-5">
            <div>
              <h2 className="font-heading text-2xl text-brand-primary mb-2">Informações do livro</h2>
              <p className="text-zinc-500 text-sm">Esses dados serão carregados do seu projeto. Verifique se estão corretos antes de prosseguir.</p>
            </div>

            <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-5 space-y-3">
              <InfoRow label="Esses metadados" value="serão carregados automaticamente do projeto ao rodar o QA" />
              <InfoRow label="Título, autor, sinopse, gênero, palavras-chave" value="provenientes das etapas anteriores do fluxo editorial" />
              <InfoRow label="Para editar" value="volte à etapa de Elementos Editoriais no fluxo principal" />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
              <strong>Dica:</strong> Certifique-se de que a etapa de Elementos Editoriais foi concluída no fluxo principal.
              O QA vai verificar se todos os campos obrigatórios estão preenchidos.
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setEtapa("arquivos")} className="border border-zinc-200 text-zinc-600 font-semibold px-6 py-3 rounded-xl hover:border-zinc-300 transition">
                ← Voltar
              </button>
              <button
                onClick={runQA}
                disabled={loadingQA}
                className="flex items-center gap-3 bg-brand-primary text-white font-bold px-8 py-3 rounded-xl hover:bg-[#2a2a4e] active:scale-95 transition-all disabled:opacity-60"
              >
                {loadingQA ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    Verificando requisitos…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    Verificar requisitos com QA
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Etapa 4: QA ─────────────────────────────────────────────────── */}
        {etapa === "qa" && qaResult && (
          <div className="space-y-6">

            {/* Score card */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8">
              <div className="flex items-center gap-6 mb-6">
                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center font-heading text-3xl font-bold shrink-0 ${
                  qaResult.aprovado ? "bg-emerald-50 border-2 border-emerald-200 text-emerald-600" : "bg-red-50 border-2 border-red-200 text-red-500"
                }`}>
                  {qaResult.score}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-heading text-2xl text-brand-primary">
                      {qaResult.aprovado ? "Pronto para publicar" : "Corrija os itens bloqueantes"}
                    </h2>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      qaResult.aprovado ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    }`}>
                      {qaResult.aprovado ? "✓ Aprovado" : "✗ Reprovado"}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-sm leading-relaxed max-w-lg">{qaResult.recomendacao}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${qaResult.aprovado ? "bg-emerald-400" : qaResult.score >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${qaResult.score}%` }}
                />
              </div>
            </div>

            {/* Checagens agrupadas por plataforma */}
            {(["geral", ...plataformasSel] as (PlataformaAlvo | "geral")[]).map(plat => {
              const items = qaResult.checagens.filter(c => c.plataforma === plat);
              if (items.length === 0) return null;
              const info = PLATAFORMAS_DISPONIVEIS.find(p => p.id === plat);
              return (
                <div key={plat} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-50 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-600">
                      {info?.icon ?? "✦"}
                    </span>
                    <span className="font-semibold text-zinc-700">{info?.nome ?? "Geral"}</span>
                    <QASummaryBadge items={items} />
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {items.map((item, i) => (
                      <QAItemRow key={i} item={item} />
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3">
              <button onClick={() => setEtapa("metadados")} className="border border-zinc-200 text-zinc-600 font-semibold px-6 py-3 rounded-xl hover:border-zinc-300 transition">
                ← Corrigir e reverificar
              </button>
              {qaResult.aprovado && (
                <button
                  onClick={() => setEtapa("publicar")}
                  className="flex items-center gap-2 bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4 20-7z"/></svg>
                  Publicar nas plataformas →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Etapa 5: Publicar ────────────────────────────────────────────── */}
        {etapa === "publicar" && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8">
            <h2 className="font-heading text-2xl text-brand-primary mb-2">Tudo pronto para publicar</h2>
            <p className="text-zinc-500 text-sm mb-8">Confirme as plataformas e envie. A aprovação é feita individualmente por cada loja (24–72h).</p>

            <div className="space-y-3 mb-8">
              {plataformasSel.map(p => {
                const info = PLATAFORMAS_DISPONIVEIS.find(pl => pl.id === p)!;
                return (
                  <div key={p} className="flex items-center gap-4 bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-3.5">
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 shrink-0">{info.icon}</span>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-zinc-800">{info.nome}</div>
                      <div className="text-xs text-zinc-400">{info.desc}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                  </div>
                );
              })}
            </div>

            <div className="bg-brand-gold/10 border border-brand-gold/20 rounded-xl p-4 text-sm text-brand-primary mb-6">
              <strong>Royalties:</strong> 100% dos ganhos são seus. A Autoria não cobra comissão sobre suas vendas.
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEtapa("qa")} className="border border-zinc-200 text-zinc-600 font-semibold px-6 py-3 rounded-xl hover:border-zinc-300 transition">
                ← Voltar
              </button>
              <button
                onClick={publicar}
                disabled={submitting}
                className="flex items-center gap-3 bg-brand-gold text-brand-primary font-bold px-10 py-3 rounded-xl hover:bg-brand-gold/90 active:scale-95 transition-all disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/></svg>
                    Enviando para distribuição…
                  </>
                ) : "Publicar agora →"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FileDropZone({ label, accept, file, onChange, hint, required }: {
  label: string; accept: string; file: File | null;
  onChange: (f: File | null) => void; hint?: string; required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="block text-sm font-semibold text-zinc-700 mb-1.5">
        {label}
        {required && <span className="text-brand-gold ml-1">*</span>}
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
          file ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 hover:border-brand-gold/50 bg-zinc-50 hover:bg-zinc-50"
        }`}
      >
        <input ref={inputRef} type="file" accept={accept} className="sr-only"
          onChange={e => onChange(e.target.files?.[0] ?? null)} />
        {file ? (
          <div className="flex items-center gap-2 justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            <span className="text-emerald-700 text-xs font-semibold truncate max-w-[160px]">{file.name}</span>
          </div>
        ) : (
          <>
            <div className="text-zinc-400 text-xs font-medium">Clique para enviar</div>
            {hint && <div className="text-zinc-300 text-[10px] mt-0.5">{hint}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="font-semibold text-zinc-600 shrink-0">{label}:</span>
      <span className="text-zinc-500">{value}</span>
    </div>
  );
}

function QASummaryBadge({ items }: { items: QAChecagem[] }) {
  const erros  = items.filter(i => i.status === "erro").length;
  const avisos = items.filter(i => i.status === "aviso").length;
  const oks    = items.filter(i => i.status === "ok").length;
  return (
    <div className="ml-auto flex items-center gap-2">
      {erros  > 0 && <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">{erros} erro{erros > 1 ? "s" : ""}</span>}
      {avisos > 0 && <span className="text-xs bg-amber-100 text-amber-600 font-semibold px-2 py-0.5 rounded-full">{avisos} aviso{avisos > 1 ? "s" : ""}</span>}
      {oks    > 0 && erros === 0 && avisos === 0 && <span className="text-xs bg-emerald-100 text-emerald-600 font-semibold px-2 py-0.5 rounded-full">✓ OK</span>}
    </div>
  );
}

function QAItemRow({ item }: { item: QAChecagem }) {
  const colors = {
    ok:    "text-emerald-600 bg-emerald-50",
    aviso: "text-amber-600 bg-amber-50",
    erro:  "text-red-600 bg-red-50",
  };
  const icons = {
    ok:    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>,
    aviso: <><path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.5"/></>,
    erro:  <><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></>,
  };
  return (
    <div className="flex items-start gap-4 px-6 py-3.5">
      <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colors[item.status]}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">{icons[item.status]}</svg>
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{item.campo}</span>
        </div>
        <p className="text-sm text-zinc-600 leading-relaxed">{item.mensagem}</p>
      </div>
    </div>
  );
}

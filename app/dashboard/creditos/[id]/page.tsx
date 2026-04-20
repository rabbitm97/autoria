"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import type { CreditosConfig, CreditosResult, CreditosFormato } from "@/app/api/agentes/creditos/route";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

type Step = "config" | "processing" | "preview";

const FORMATOS: { id: CreditosFormato; label: string; dim: string }[] = [
  { id: "bolso",     label: "Bolso",     dim: "11×18 cm"   },
  { id: "a5",        label: "A5",        dim: "14,8×21 cm" },
  { id: "padrao_br", label: "Padrão BR", dim: "16×23 cm"   },
  { id: "quadrado",  label: "Quadrado",  dim: "20×20 cm"   },
  { id: "a4",        label: "A4",        dim: "21×29,7 cm" },
];

const PROCESSING_MSGS = [
  "Verificando normas ABNT NBR 6029…",
  "Estruturando equipe técnica…",
  "Gerando ficha catalográfica (CIP-BRASIL)…",
  "Montando página de créditos…",
  "Finalizando visualização…",
];

// ─── Field row helper ─────────────────────────────────────────────────────────

function Field({
  label, hint, value, onChange, placeholder, multiline,
}: {
  label: string; hint?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
        {label}
      </label>
      {hint && <p className="text-xs text-zinc-400 mb-1.5">{hint}</p>}
      {multiline ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold resize-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold"
        />
      )}
    </div>
  );
}

function SectionToggle({
  title, hint, open, onToggle, children,
}: {
  title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-zinc-100 overflow-hidden mb-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
      >
        <div>
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{title}</span>
          {hint && <p className="text-xs text-zinc-400 mt-0.5 normal-case font-normal">{hint}</p>}
        </div>
        <span className="text-zinc-400 text-sm shrink-0 ml-4">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-zinc-100 pt-5 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreditosPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [manuscritoNome, setManuscritoNome] = useState("Manuscrito");
  const [loading, setLoading] = useState(true);

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("config");
  const [creditos, setCreditos] = useState<CreditosResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [processingMsg, setProcessingMsg] = useState(PROCESSING_MSGS[0]);
  const [processingPct, setProcessingPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Section open state ──────────────────────────────────────────────────────
  const [secEquipe, setSecEquipe] = useState(true);
  const [secEditora, setSecEditora] = useState(false);
  const [secFicha, setSecFicha] = useState(true);

  // ── Config form — Direitos ──────────────────────────────────────────────────
  const [formato, setFormato] = useState<CreditosFormato>("padrao_br");
  const [anoCopyright, setAnoCopyright] = useState(new Date().getFullYear().toString());
  const [titularDireitos, setTitularDireitos] = useState("");
  const [numeroEdicao, setNumeroEdicao] = useState("1ª edição");
  const [anoEdicao, setAnoEdicao] = useState(new Date().getFullYear().toString());
  const [tituloOriginal, setTituloOriginal] = useState("");
  const [idiomaOriginal, setIdiomaOriginal] = useState("");

  // ── Config form — Equipe ────────────────────────────────────────────────────
  const [traducao, setTraducao] = useState("");
  const [revisaoTecnica, setRevisaoTecnica] = useState("");
  const [revisao, setRevisao] = useState("");
  const [preparacao, setPreparacao] = useState("");
  const [diagramacao, setDiagramacao] = useState("Autoria — plataforma de autopublicação");
  const [projetoCapa, setProjetoCapa] = useState("");
  const [ilustracaoCapa, setIlustracaoCapa] = useState("");
  const [producaoEditorial, setProducaoEditorial] = useState("");
  const [outrosCreditos, setOutrosCreditos] = useState("");

  // ── Config form — Editora ───────────────────────────────────────────────────
  const [nomeEditora, setNomeEditora] = useState("");
  const [localEdicao, setLocalEdicao] = useState("São Paulo");
  const [enderecoEditora, setEnderecoEditora] = useState("");
  const [cidadeEstado, setCidadeEstado] = useState("");
  const [cep, setCep] = useState("");
  const [siteEditora, setSiteEditora] = useState("");
  const [emailEditora, setEmailEditora] = useState("");

  // ── Config form — Ficha ─────────────────────────────────────────────────────
  const [incluirFicha, setIncluirFicha] = useState(true);
  const [isbn, setIsbn] = useState("");
  const [assuntosLivres, setAssuntosLivres] = useState("");
  const [cdd, setCdd] = useState("");
  const [cdu, setCdu] = useState("");

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_creditos, dados_capa, dados_elementos, manuscripts(nome, autor_primeiro_nome, autor_sobrenome)")
      .eq("id", projectId)
      .single();

    if (project) {
      const ms = project.manuscripts as unknown as {
        nome?: string;
        autor_primeiro_nome?: string;
        autor_sobrenome?: string;
      } | null;

      const nomeCompleto = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ");
      setManuscritoNome(ms?.nome ?? "Manuscrito");
      if (nomeCompleto && !titularDireitos) setTitularDireitos(nomeCompleto);

      // Inherit format from Capa step (single source of truth)
      const capaData = project.dados_capa as { formato?: string } | null;
      if (capaData?.formato) setFormato(capaData.formato as CreditosFormato);

      const existing = project.dados_creditos as CreditosResult | null;
      if (existing) {
        setCreditos(existing);
        restoreConfig(existing.config);
        // Fetch fresh signed URL
        const res = await fetch(`/api/agentes/creditos?project_id=${projectId}`);
        if (res.ok) {
          const data = await res.json() as { creditos: CreditosResult; preview_url: string | null; html?: string };
          if (data?.html) {
            const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
            setPreviewUrl(URL.createObjectURL(blob));
            setHtmlContent(data.html);
            setStep("preview");
          } else if (data?.preview_url) {
            setPreviewUrl(data.preview_url);
            setStep("preview");
          }
        }
      }
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  function restoreConfig(c: CreditosConfig) {
    setFormato(c.formato);
    setAnoCopyright(c.ano_copyright.toString());
    setTitularDireitos(c.titular_direitos);
    if (c.numero_edicao)    setNumeroEdicao(c.numero_edicao);
    if (c.ano_edicao)       setAnoEdicao(c.ano_edicao.toString());
    if (c.titulo_original)  setTituloOriginal(c.titulo_original);
    if (c.idioma_original)  setIdiomaOriginal(c.idioma_original);
    if (c.traducao)         setTraducao(c.traducao);
    if (c.revisao_tecnica)  setRevisaoTecnica(c.revisao_tecnica);
    if (c.revisao)          setRevisao(c.revisao);
    if (c.preparacao)       setPreparacao(c.preparacao);
    if (c.diagramacao)      setDiagramacao(c.diagramacao);
    if (c.projeto_capa)     setProjetoCapa(c.projeto_capa);
    if (c.ilustracao_capa)  setIlustracaoCapa(c.ilustracao_capa);
    if (c.producao_editorial) setProducaoEditorial(c.producao_editorial);
    if (c.outros_creditos)  setOutrosCreditos(c.outros_creditos);
    if (c.nome_editora)     setNomeEditora(c.nome_editora);
    if (c.local_edicao)     setLocalEdicao(c.local_edicao);
    if (c.endereco_editora) setEnderecoEditora(c.endereco_editora);
    if (c.cidade_estado)    setCidadeEstado(c.cidade_estado);
    if (c.cep)              setCep(c.cep);
    if (c.site_editora)     setSiteEditora(c.site_editora);
    if (c.email_editora)    setEmailEditora(c.email_editora);
    setIncluirFicha(c.incluir_ficha);
    if (c.isbn)             setIsbn(c.isbn);
    if (c.assuntos_livres)  setAssuntosLivres(c.assuntos_livres);
    if (c.cdd)              setCdd(c.cdd);
    if (c.cdu)              setCdu(c.cdu);
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function handleGerar() {
    if (!titularDireitos.trim()) {
      setError("Informe o titular dos direitos autorais.");
      return;
    }
    setStep("processing");
    setError(null);
    setProcessingPct(0);

    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, PROCESSING_MSGS.length - 1);
      setProcessingMsg(PROCESSING_MSGS[msgIdx]);
      setProcessingPct(Math.round((msgIdx / (PROCESSING_MSGS.length - 1)) * 90));
    }, 1800);

    const config: CreditosConfig = {
      formato,
      ano_copyright: parseInt(anoCopyright) || new Date().getFullYear(),
      titular_direitos: titularDireitos.trim(),
      numero_edicao: numeroEdicao.trim() || undefined,
      ano_edicao: anoEdicao ? parseInt(anoEdicao) : undefined,
      titulo_original: tituloOriginal.trim() || undefined,
      idioma_original: idiomaOriginal.trim() || undefined,
      traducao:         traducao.trim()         || undefined,
      revisao_tecnica:  revisaoTecnica.trim()   || undefined,
      revisao:          revisao.trim()           || undefined,
      preparacao:       preparacao.trim()        || undefined,
      diagramacao:      diagramacao.trim()       || undefined,
      projeto_capa:     projetoCapa.trim()       || undefined,
      ilustracao_capa:  ilustracaoCapa.trim()    || undefined,
      producao_editorial: producaoEditorial.trim() || undefined,
      outros_creditos:  outrosCreditos.trim()    || undefined,
      nome_editora:     nomeEditora.trim()       || undefined,
      local_edicao:     localEdicao.trim()       || undefined,
      endereco_editora: enderecoEditora.trim()   || undefined,
      cidade_estado:    cidadeEstado.trim()      || undefined,
      cep:              cep.trim()               || undefined,
      site_editora:     siteEditora.trim()       || undefined,
      email_editora:    emailEditora.trim()      || undefined,
      incluir_ficha: incluirFicha,
      isbn:           isbn.trim()  || undefined,
      assuntos_livres: assuntosLivres.trim() || undefined,
      cdd:            cdd.trim()   || undefined,
      cdu:            cdu.trim()   || undefined,
    };

    try {
      const res = await fetch("/api/agentes/creditos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, config }),
      });
      const data = await res.json() as { ok?: boolean; creditos?: CreditosResult; preview_url?: string; html?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar página de créditos.");
      setProcessingPct(100);
      setCreditos(data.creditos!);
      if (data.html) {
        const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
        setPreviewUrl(URL.createObjectURL(blob));
        setHtmlContent(data.html);
      } else {
        setPreviewUrl(data.preview_url ?? null);
      }
      setTimeout(() => setStep("preview"), 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("config");
    } finally {
      clearInterval(interval);
    }
  }

  // ── Downloads ─────────────────────────────────────────────────────────────

  const safeName = manuscritoNome.replace(/\s+/g, "_");

  function downloadHtml() {
    if (!htmlContent) return;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `creditos_${safeName}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  }

  function downloadPdf() {
    if (!htmlContent) return;
    const htmlWithPrint = htmlContent.replace(
      "</body>",
      "<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body>"
    );
    const blob = new Blob([htmlWithPrint], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 15_000);
  }

  async function downloadDocx() {
    if (!creditos) return;
    setDownloadingDocx(true);
    try {
      const res = await fetch("/api/creditos/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: creditos.config,
          ficha: creditos.ficha_catalografica ?? null,
          titulo: manuscritoNome,
          autor: creditos.config.titular_direitos,
        }),
      });
      if (!res.ok) { setError("Erro ao gerar DOCX."); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `creditos_${safeName}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
    } catch {
      setError("Erro ao gerar DOCX.");
    } finally {
      setDownloadingDocx(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <EtapasProgress currentStep={4} projectId={projectId} />

      {loading ? (
        <div className="flex justify-center items-center py-32">
          <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
        </div>

      ) : step === "config" ? (
        /* ── CONFIG ─────────────────────────────────────────────────────────── */
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="mb-8">
            <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Página de Créditos</p>
            <h1 className="font-heading text-3xl text-brand-primary">Verso da folha de rosto</h1>
            <p className="text-zinc-500 text-sm mt-2 max-w-xl">
              A segunda página do livro — copyright, equipe técnica, ficha catalográfica (CIP-BRASIL)
              e dados da editora. Posição obrigatória conforme <strong>ABNT NBR 6029</strong>.
            </p>
          </div>

          {/* Formato — inherited from Capa step */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Formato do livro</p>
                <p className="text-sm font-medium text-brand-primary mt-0.5">
                  {FORMATOS.find(f => f.id === formato)?.label} — {FORMATOS.find(f => f.id === formato)?.dim}
                </p>
              </div>
              <p className="text-xs text-zinc-400">Definido na etapa de Capa</p>
            </div>
          </section>

          {/* Direitos */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-4">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-5">Direitos autorais</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Ano do copyright *" value={anoCopyright} onChange={setAnoCopyright} placeholder="2024" />
              <Field label="Titular dos direitos *" value={titularDireitos} onChange={setTitularDireitos} placeholder="Nome do autor ou editora" />
              <Field label="Número da edição" value={numeroEdicao} onChange={setNumeroEdicao} placeholder="1ª edição" />
              <Field label="Ano da edição" value={anoEdicao} onChange={setAnoEdicao} placeholder="2024" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-100">
              <Field
                label="Título original"
                hint="Preencha apenas se for tradução"
                value={tituloOriginal}
                onChange={setTituloOriginal}
                placeholder="El título original"
              />
              <Field
                label="Idioma original"
                value={idiomaOriginal}
                onChange={setIdiomaOriginal}
                placeholder="Espanhol"
              />
            </div>
          </section>

          {/* Equipe técnica */}
          <SectionToggle
            title="Equipe técnica"
            hint="Tradutores, revisores, diagramador, designer de capa…"
            open={secEquipe}
            onToggle={() => setSecEquipe(v => !v)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Tradução" value={traducao} onChange={setTraducao} placeholder="Nome do tradutor" />
              <Field label="Revisão técnica" value={revisaoTecnica} onChange={setRevisaoTecnica} placeholder="Nome(s)" />
              <Field label="Revisão" value={revisao} onChange={setRevisao} placeholder="Nome do revisor" />
              <Field label="Preparação de texto" value={preparacao} onChange={setPreparacao} placeholder="Nome" />
              <Field label="Diagramação" value={diagramacao} onChange={setDiagramacao} placeholder="Nome ou empresa" />
              <Field label="Projeto gráfico de capa" value={projetoCapa} onChange={setProjetoCapa} placeholder="Nome ou empresa" />
              <Field label="Ilustração de capa" value={ilustracaoCapa} onChange={setIlustracaoCapa} placeholder="Ex: Foto: Acervo do autor" />
              <Field label="Produção editorial" value={producaoEditorial} onChange={setProducaoEditorial} placeholder="Nome" />
            </div>
            <Field
              label="Outros créditos"
              hint="Um crédito por linha (ex: Impressão: Gráfica XYZ)"
              value={outrosCreditos}
              onChange={setOutrosCreditos}
              placeholder={"Impressão: Gráfica XYZ\nAcabamento: Encadernações Ltda."}
              multiline
            />
          </SectionToggle>

          {/* Editora */}
          <SectionToggle
            title="Editora / publicadora"
            hint="Dados da editora que aparecem na parte inferior da página"
            open={secEditora}
            onToggle={() => setSecEditora(v => !v)}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome da editora" value={nomeEditora} onChange={setNomeEditora} placeholder="Editora Autoria Ltda." />
              <Field label="Local de edição" value={localEdicao} onChange={setLocalEdicao} placeholder="São Paulo" />
              <Field label="Endereço" value={enderecoEditora} onChange={setEnderecoEditora} placeholder="Rua das Flores, 123" />
              <Field label="Cidade — Estado" value={cidadeEstado} onChange={setCidadeEstado} placeholder="São Paulo — SP" />
              <Field label="CEP" value={cep} onChange={setCep} placeholder="01310-100" />
              <Field label="Site" value={siteEditora} onChange={setSiteEditora} placeholder="www.minhaedotira.com.br" />
              <Field label="E-mail" value={emailEditora} onChange={setEmailEditora} placeholder="contato@editora.com.br" />
            </div>
          </SectionToggle>

          {/* Ficha catalográfica */}
          <SectionToggle
            title="Ficha catalográfica (CIP-BRASIL)"
            hint="Gerada automaticamente pela IA seguindo normas AACR2/RDA"
            open={secFicha}
            onToggle={() => setSecFicha(v => !v)}
          >
            {/* Toggle incluir ficha */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setIncluirFicha(v => !v)}
                className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${incluirFicha ? "bg-brand-primary" : "bg-zinc-200"}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${incluirFicha ? "translate-x-4" : "translate-x-0"}`} />
              </div>
              <span className="text-sm text-zinc-600">Incluir ficha catalográfica no verso da folha de rosto</span>
            </label>

            {incluirFicha && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
                  A IA gerará uma ficha catalográfica aproximada com base nos dados do manuscrito. Para publicação formal, solicite ao SNEL (Sindicato Nacional dos Editores de Livros) ou a um bibliotecário credenciado.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="ISBN" value={isbn} onChange={setIsbn} placeholder="978-65-XXXXX-XX-X" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CDD" value={cdd} onChange={setCdd} placeholder="869.3" />
                    <Field label="CDU" value={cdu} onChange={setCdu} placeholder="821.134.3-3" />
                  </div>
                </div>
                <Field
                  label="Assuntos (opcional)"
                  hint="Deixe em branco para a IA sugerir com base no gênero. Um assunto por linha."
                  value={assuntosLivres}
                  onChange={setAssuntosLivres}
                  placeholder={"1. Romance brasileiro. I. Título.\n2. Ficção."}
                  multiline
                />
              </div>
            )}
          </SectionToggle>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm mb-4">{error}</div>
          )}

          <button
            type="button"
            onClick={handleGerar}
            className="w-full bg-brand-primary text-brand-surface py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all"
          >
            Gerar página de créditos →
          </button>
          <p className="text-center text-xs text-zinc-400 mt-3">
            {incluirFicha ? "30–45 segundos (ficha catalográfica gerada por IA)" : "Apenas alguns segundos"}
          </p>
        </main>

      ) : step === "processing" ? (
        /* ── PROCESSING ──────────────────────────────────────────────────────── */
        <main className="max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mx-auto mb-8" />
          <h2 className="font-heading text-2xl text-brand-primary mb-3">Montando página de créditos…</h2>
          <p className="text-zinc-500 text-sm mb-8">{processingMsg}</p>
          <div className="bg-zinc-100 rounded-full h-2 mb-3 overflow-hidden">
            <div
              className="h-full bg-brand-gold rounded-full transition-all duration-700"
              style={{ width: `${processingPct}%` }}
            />
          </div>
          <p className="text-zinc-400 text-xs">{processingPct}% concluído</p>
        </main>

      ) : (
        /* ── PREVIEW ─────────────────────────────────────────────────────────── */
        <main className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
          {/* Top bar */}
          <div className="bg-white border-b border-zinc-100 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="text-brand-gold text-xs font-semibold uppercase tracking-wide">Página de créditos</span>
              <h1 className="font-heading text-xl text-brand-primary">{manuscritoNome}</h1>
            </div>
            <span className="text-xs bg-zinc-100 text-zinc-500 px-3 py-1.5 rounded-lg">
              Verso da folha de rosto · ABNT NBR 6029
            </span>
          </div>

          {/* Preview area */}
          <div className="flex-1 bg-zinc-300 flex items-stretch gap-0 overflow-hidden" style={{ minHeight: "560px" }}>

            {/* Left panel */}
            <div
              className="bg-white shadow-xl flex flex-col shrink-0 overflow-y-auto"
              style={{ width: "260px", padding: "28px 22px", margin: "24px 0 24px 24px", borderRadius: "4px 0 0 4px" }}
            >
              <h3 className="font-heading text-sm text-brand-primary mb-4">Confira a página de créditos</h3>

              {/* Checklist */}
              <div className="mb-5">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Verifique:</p>
                <ul className="space-y-1.5 text-xs text-zinc-600">
                  <li>• Copyright com nome e ano corretos</li>
                  <li>• Equipe técnica sem omissões</li>
                  {creditos?.config.incluir_ficha && (
                    <>
                      <li>• Ficha catalográfica completa</li>
                      <li>• ISBN (se já disponível)</li>
                      <li>• CDD e CDU corretos</li>
                    </>
                  )}
                  {creditos?.config.nome_editora && (
                    <li>• Dados da editora sem erros</li>
                  )}
                </ul>
              </div>

              {/* Ficha info */}
              {creditos?.ficha_catalografica && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-xs">
                  <p className="font-semibold text-blue-700 mb-1">Ficha gerada pela IA</p>
                  <p className="text-blue-600">CDD: {creditos.ficha_catalografica.cdd}</p>
                  <p className="text-blue-600">CDU: {creditos.ficha_catalografica.cdu}</p>
                  <p className="text-blue-500 mt-1 text-[10px]">Valide com bibliotecário para publicação formal.</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-auto space-y-2">
                <button
                  onClick={downloadHtml}
                  disabled={!htmlContent}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-40"
                >
                  ⬇ HTML
                </button>
                <button
                  onClick={downloadPdf}
                  disabled={!htmlContent}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-40"
                >
                  ⬇ PDF
                </button>
                <button
                  onClick={downloadDocx}
                  disabled={!creditos || downloadingDocx}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-40"
                >
                  {downloadingDocx ? "Gerando…" : "⬇ DOCX"}
                </button>
                <button
                  onClick={() => setStep("config")}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors"
                >
                  ↺ Ajustar informações
                </button>
              </div>
            </div>

            {/* Iframe */}
            <div
              className="bg-white shadow-xl flex-1 flex flex-col overflow-hidden"
              style={{ margin: "24px 24px 24px 0", borderRadius: "0 4px 4px 0" }}
            >
              {previewUrl ? (
                <iframe
                  ref={iframeRef}
                  src={previewUrl}
                  title="Prévia da página de créditos"
                  className="flex-1 border-0 w-full"
                  style={{ minHeight: "500px" }}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
                  Prévia não disponível — baixe o HTML para visualizar.
                </div>
              )}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="bg-white border-t border-zinc-100 px-6 py-4 flex flex-wrap items-center gap-3">
            <button
              onClick={downloadHtml}
              disabled={!htmlContent}
              className="inline-flex items-center gap-2 border border-zinc-200 text-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              ⬇ HTML
            </button>
            <button
              onClick={downloadPdf}
              disabled={!htmlContent}
              className="inline-flex items-center gap-2 border border-zinc-200 text-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              ⬇ PDF
            </button>
            <button
              onClick={downloadDocx}
              disabled={!creditos || downloadingDocx}
              className="inline-flex items-center gap-2 border border-zinc-200 text-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              {downloadingDocx ? "Gerando…" : "⬇ DOCX"}
            </button>

            <div className="ml-auto flex items-center gap-3">
              <p className="text-zinc-400 text-xs hidden sm:block">Próxima etapa: diagramação do miolo.</p>
              <button
                onClick={async () => {
                  await supabase.from("projects").update({ etapa_atual: "diagramacao" }).eq("id", projectId);
                  router.push(`/dashboard/miolo/${projectId}`);
                }}
                className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-3 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all whitespace-nowrap"
              >
                Aceitar e continuar para Diagramação →
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

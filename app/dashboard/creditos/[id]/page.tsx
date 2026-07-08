"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import type { CreditosConfig, CreditosResult, PropositoPublicacao } from "@/app/api/agentes/creditos/route";
import { FORMATOS_LIVRO, type FormatoLivro } from "@/lib/formatos";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

type Step = "config" | "processing" | "preview";

const PROCESSING_MSGS = [
  "Estruturando equipe técnica…",
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
  const [secFicha, setSecFicha] = useState(false);

  // ── Propósito da publicação (Bloco 1f) ──────────────────────────────────────
  const [proposito, setProposito] = useState<PropositoPublicacao>("digital");

  // ── Config form — Direitos ──────────────────────────────────────────────────
  const [formato, setFormato] = useState<FormatoLivro>("padrao_br");
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

  // ── ISBN (opcional em digital, obrigatório em livrarias) ────────────────────
  const [isbn, setIsbn] = useState("");

  // ── Ficha oficial CRB (Bloco 1f — só usada no modo livrarias) ───────────────
  const [foNumeroChamada, setFoNumeroChamada] = useState("");
  const [foEntradaAutor, setFoEntradaAutor] = useState("");
  const [foDescricao, setFoDescricao] = useState("");
  const [foNotasGerais, setFoNotasGerais] = useState("");
  const [foAssuntos, setFoAssuntos] = useState("");
  const [foCdd, setFoCdd] = useState("");
  const [foCdu, setFoCdu] = useState("");
  const [bibliotecarioNome, setBibliotecarioNome] = useState("");
  const [bibliotecarioCrb, setBibliotecarioCrb] = useState("");
  const [declaracaoAceita, setDeclaracaoAceita] = useState(false);

  const CRB_REGEX_CLIENT = /^CRB-([1-9]|1[0-5])\/\d{1,6}$/;
  const crbValido = CRB_REGEX_CLIENT.test(bibliotecarioCrb.trim());
  const modoOficialValido =
    foNumeroChamada.trim().length > 0 &&
    foEntradaAutor.trim().length > 0 &&
    foDescricao.trim().length > 0 &&
    foAssuntos.trim().length > 0 &&
    foCdd.trim().length > 0 &&
    foCdu.trim().length > 0 &&
    bibliotecarioNome.trim().length > 0 &&
    crbValido &&
    declaracaoAceita;

  const isPessoal   = proposito === "pessoal";
  const isLivrarias = proposito === "livrarias";

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_creditos, dados_capa, dados_elementos, manuscripts(nome, titulo, autor_primeiro_nome, autor_sobrenome)")
      .eq("id", projectId)
      .single();

    if (project) {
      const ms = project.manuscripts as unknown as {
        nome?: string;
        titulo?: string | null;
        autor_primeiro_nome?: string;
        autor_sobrenome?: string;
      } | null;

      const nomeCompleto = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ");
      setManuscritoNome((ms?.titulo?.trim()) || ms?.nome || "Manuscrito");
      if (nomeCompleto && !titularDireitos) setTitularDireitos(nomeCompleto);

      const fmtRes = await fetch(`/api/projects/${projectId}/formato`).then(r => r.ok ? r.json() : null);
      if (fmtRes?.formato) setFormato(fmtRes.formato as FormatoLivro);

      const existing = project.dados_creditos as CreditosResult | null;
      if (existing) {
        setCreditos(existing);
        restoreConfig(existing.config);

        // Hidratar ficha oficial CRB se já foi salva antes.
        if (existing.ficha_oficial) {
          setFoNumeroChamada(existing.ficha_oficial.numero_chamada);
          setFoEntradaAutor(existing.ficha_oficial.entrada_autor);
          setFoDescricao(existing.ficha_oficial.descricao_bibliografica);
          setFoNotasGerais(existing.ficha_oficial.notas_gerais ?? "");
          setFoAssuntos(existing.ficha_oficial.assuntos);
          setFoCdd(existing.ficha_oficial.cdd);
          setFoCdu(existing.ficha_oficial.cdu);
          setBibliotecarioNome(existing.ficha_oficial.bibliotecario_nome);
          setBibliotecarioCrb(existing.ficha_oficial.bibliotecario_crb);
          setDeclaracaoAceita(true);
        }

        // Modo pessoal: nada foi gerado, mantém a tela de config aberta.
        if (existing.config.proposito !== "pessoal") {
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
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  function restoreConfig(c: CreditosConfig) {
    setProposito(c.proposito ?? "digital");
    setFormato(c.formato);
    if (typeof c.ano_copyright === "number") setAnoCopyright(c.ano_copyright.toString());
    if (c.titular_direitos) setTitularDireitos(c.titular_direitos);
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
    if (c.isbn)             setIsbn(c.isbn);
  }

  // ── Generate ─────────────────────────────────────────────────────────────────

  async function handleGerar() {
    if (!isPessoal && !titularDireitos.trim()) {
      setError("Informe o titular dos direitos autorais.");
      return;
    }
    if (isLivrarias && !modoOficialValido) {
      setError("Preencha todos os campos da ficha oficial, o CRB no formato CRB-X/YYYY e aceite a declaração.");
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
    }, 400);

    const config: CreditosConfig = {
      formato,
      proposito,
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
      isbn:             isbn.trim()              || undefined,
    };

    try {
      const res = await fetch("/api/agentes/creditos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          config,
          ...(isLivrarias ? {
            ficha_oficial_input: {
              numero_chamada:          foNumeroChamada.trim(),
              entrada_autor:           foEntradaAutor.trim(),
              descricao_bibliografica: foDescricao.trim(),
              notas_gerais:            foNotasGerais.trim() || undefined,
              assuntos:                foAssuntos.trim(),
              cdd:                     foCdd.trim(),
              cdu:                     foCdu.trim(),
              bibliotecario_nome:      bibliotecarioNome.trim(),
              bibliotecario_crb:       bibliotecarioCrb.trim(),
              declaracao_aceita:       declaracaoAceita,
            }
          } : {}),
        }),
      });
      const data = await res.json() as { ok?: boolean; creditos?: CreditosResult; preview_url?: string | null; html?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar página de créditos.");
      setProcessingPct(100);
      setCreditos(data.creditos!);

      // Modo pessoal: nada foi gerado — vai direto para diagramação.
      if (isPessoal) {
        setTimeout(async () => {
          await supabase.from("projects").update({ etapa_atual: "diagramacao" }).eq("id", projectId);
          router.push(`/dashboard/miolo/${projectId}`);
        }, 400);
        return;
      }

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
          fichaOficial: creditos.ficha_oficial ?? null,
          titulo: manuscritoNome,
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
          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">{error}</div>
          )}
          <div className="mb-8">
            <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Página de Créditos</p>
            <h1 className="font-heading text-3xl text-brand-primary">Verso da folha de rosto</h1>
            <p className="text-zinc-500 text-sm mt-2 max-w-xl">
              A segunda página do livro — copyright, equipe técnica e (se aplicável) ficha catalográfica CRB.
              O que aparece aqui depende de para onde o livro vai.
            </p>
          </div>

          {/* Propósito da publicação — Bloco 1f */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Para onde vai este livro?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setProposito("digital")}
                className={`text-left rounded-xl border-2 p-4 transition-all ${
                  proposito === "digital"
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <p className="text-sm font-semibold text-brand-primary mb-1">Digital</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  KDP, Apple Books, Kobo, Kiwify. Nenhum registro CRB obrigatório.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setProposito("livrarias")}
                className={`text-left rounded-xl border-2 p-4 transition-all ${
                  proposito === "livrarias"
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <p className="text-sm font-semibold text-brand-primary mb-1">Livrarias & prêmios</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Livrarias físicas, editais, Jabuti, bibliotecas. Exige ficha CRB oficial.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setProposito("pessoal")}
                className={`text-left rounded-xl border-2 p-4 transition-all ${
                  proposito === "pessoal"
                    ? "border-brand-primary bg-brand-primary/5"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <p className="text-sm font-semibold text-brand-primary mb-1">Uso pessoal / presente</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Distribuição gratuita, sem folha de rosto nem créditos.
                </p>
              </button>
            </div>
          </section>

          {isPessoal ? (
            /* ── Modo pessoal: nada é gerado ─────────────────────────────── */
            <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-brand-primary mb-1">Sem folha de rosto, verso ou créditos</p>
                  <p className="text-sm text-zinc-600 leading-relaxed">
                    Para uso pessoal, presente ou distribuição gratuita o miolo pula essas páginas iniciais e começa
                    direto no sumário/prólogo. Nada de copyright, equipe ou ficha catalográfica.
                  </p>
                  <p className="text-xs text-zinc-400 mt-3">
                    Se depois quiser vender em livraria ou concorrer a prêmio, volte aqui e escolha outro propósito.
                  </p>
                </div>
              </div>
            </section>
          ) : (
            <>
              {/* Formato — inherited from Capa step */}
              <section className="bg-white rounded-2xl border border-zinc-100 p-5 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Formato do livro</p>
                    <p className="text-sm font-medium text-brand-primary mt-0.5">
                      {FORMATOS_LIVRO.find(f => f.value === formato)?.label} — {FORMATOS_LIVRO.find(f => f.value === formato)?.dimensoes}
                    </p>
                  </div>
                  <p className="text-xs text-zinc-400">Definido na etapa de Capa</p>
                </div>
              </section>

              {/* Direitos */}
              <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-4">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-5">Direitos autorais</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field
                    label="Ano do copyright *"
                    hint="Ano em que a obra foi criada (não confundir com ano da edição)"
                    value={anoCopyright}
                    onChange={setAnoCopyright}
                    placeholder="2024"
                  />
                  <Field
                    label="Titular dos direitos *"
                    hint="Pré-preenchido com o nome do autor. Altere se os direitos pertencerem a outra pessoa/editora."
                    value={titularDireitos}
                    onChange={setTitularDireitos}
                    placeholder="Nome do autor ou editora"
                  />
                  <Field
                    label="Número da edição"
                    hint="1ª edição para a primeira publicação. 2ª em diante para relançamentos com mudanças."
                    value={numeroEdicao}
                    onChange={setNumeroEdicao}
                    placeholder="1ª edição"
                  />
                  <Field
                    label="Ano da edição"
                    hint="Ano em que esta edição específica foi publicada (pode diferir do copyright)"
                    value={anoEdicao}
                    onChange={setAnoEdicao}
                    placeholder="2024"
                  />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-100">
                  <Field
                    label={isLivrarias ? "ISBN *" : "ISBN"}
                    hint={isLivrarias
                      ? "Obrigatório para livrarias. Registre em cblservicos.org.br"
                      : "Opcional. Se preenchido, aparece na página de créditos."}
                    value={isbn}
                    onChange={setIsbn}
                    placeholder="978-65-XXXXX-XX-X"
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
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Texto</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Tradução" value={traducao} onChange={setTraducao} placeholder="Nome do tradutor" />
                    <Field label="Revisão técnica" value={revisaoTecnica} onChange={setRevisaoTecnica} placeholder="Nome(s)" />
                    <Field label="Revisão" value={revisao} onChange={setRevisao} placeholder="Nome do revisor" />
                    <Field label="Preparação de texto" value={preparacao} onChange={setPreparacao} placeholder="Nome" />
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Design</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Diagramação" value={diagramacao} onChange={setDiagramacao} placeholder="Nome ou empresa" />
                    <Field label="Projeto gráfico de capa" value={projetoCapa} onChange={setProjetoCapa} placeholder="Nome ou empresa" />
                    <Field label="Ilustração de capa" value={ilustracaoCapa} onChange={setIlustracaoCapa} placeholder="Ex: Foto: Acervo do autor" />
                  </div>
                </div>
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Coordenação</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Produção editorial" value={producaoEditorial} onChange={setProducaoEditorial} placeholder="Nome" />
                  </div>
                  <div className="mt-4">
                    <Field
                      label="Outros créditos"
                      hint="Um crédito por linha (ex: Impressão: Gráfica XYZ)"
                      value={outrosCreditos}
                      onChange={setOutrosCreditos}
                      placeholder={"Impressão: Gráfica XYZ\nAcabamento: Encadernações Ltda."}
                      multiline
                    />
                  </div>
                </div>
              </SectionToggle>

              {/* Editora */}
              <SectionToggle
                title="Editora / publicadora"
                hint="Dados da editora que aparecem na parte inferior da página"
                open={secEditora}
                onToggle={() => setSecEditora(v => !v)}
              >
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-900 leading-relaxed">
                  <strong>Autopublicando?</strong> Deixe o nome da editora em branco. A CBL reconhece
                  <em> Edição do Autor</em> como forma legítima de publicação.
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Identificação</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Nome da editora"
                      hint="Deixe em branco para aparecer como 'Edição do Autor'"
                      value={nomeEditora}
                      onChange={setNomeEditora}
                      placeholder="Editora Autoria Ltda."
                    />
                    <Field label="Local de edição" value={localEdicao} onChange={setLocalEdicao} placeholder="São Paulo" />
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Endereço</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Endereço" value={enderecoEditora} onChange={setEnderecoEditora} placeholder="Rua das Flores, 123" />
                    <Field label="Cidade — Estado" value={cidadeEstado} onChange={setCidadeEstado} placeholder="São Paulo — SP" />
                    <Field label="CEP" value={cep} onChange={setCep} placeholder="01310-100" />
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Contatos</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Site" value={siteEditora} onChange={setSiteEditora} placeholder="www.minhaeditora.com.br" />
                    <Field label="E-mail" value={emailEditora} onChange={setEmailEditora} placeholder="contato@editora.com.br" />
                  </div>
                </div>
              </SectionToggle>

              {/* Ficha oficial CRB — só aparece em modo livrarias */}
              {isLivrarias && (
                <SectionToggle
                  title="Ficha catalográfica oficial (CRB)"
                  hint="Cole os campos exatamente como recebidos do bibliotecário"
                  open={secFicha}
                  onToggle={() => setSecFicha(v => !v)}
                >
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                    Ficha catalográfica é <strong>atividade privativa de bibliotecário com CRB ativo</strong>
                    (Lei 10.753/2003, Res. CFB 184/2017). Solicite em{" "}
                    <a
                      href="https://www.cblservicos.org.br/catalogacao/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      cblservicos.org.br
                    </a>{" "}
                    (R$ 60–100, ~5 dias úteis) e cole os campos abaixo.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Número de chamada *"
                      hint="Cutter-Sanborn ou PHA (ex: C672e, M854i)"
                      value={foNumeroChamada}
                      onChange={setFoNumeroChamada}
                      placeholder="C672e"
                    />
                    <Field
                      label="Entrada do autor *"
                      hint="Formato: SOBRENOME, Nome[, YYYY-]"
                      value={foEntradaAutor}
                      onChange={setFoEntradaAutor}
                      placeholder="COELHO, Mateus, 1985-"
                    />
                  </div>

                  <Field
                    label="Descrição bibliográfica *"
                    hint="Título : Subtítulo / Autor. – Edição – Local : Editora, Ano."
                    value={foDescricao}
                    onChange={setFoDescricao}
                    placeholder="O empreendedor aumentado : subtítulo / Mateus Coelho. – São Paulo : Edição do Autor, 2026."
                    multiline
                  />

                  <Field
                    label="Notas gerais (opcional)"
                    hint='Características especiais. Ex: "Inclui bibliografia", "Ilustrado", "Contém mapas"'
                    value={foNotasGerais}
                    onChange={setFoNotasGerais}
                    placeholder="Inclui bibliografia."
                  />

                  <Field
                    label="Assuntos *"
                    hint="Um assunto por linha (com numeração, ex: '1. Administração. I. Título.')"
                    value={foAssuntos}
                    onChange={setFoAssuntos}
                    placeholder={"1. Administração. I. Título.\n2. Empreendedorismo."}
                    multiline
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="CDD *" value={foCdd} onChange={setFoCdd} placeholder="658.421" />
                    <Field label="CDU *" value={foCdu} onChange={setFoCdu} placeholder="658.012.4:004.8" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-200">
                    <Field
                      label="Nome do bibliotecário *"
                      value={bibliotecarioNome}
                      onChange={setBibliotecarioNome}
                      placeholder="Maria Silva"
                    />
                    <div>
                      <Field
                        label="Registro CRB *"
                        value={bibliotecarioCrb}
                        onChange={setBibliotecarioCrb}
                        placeholder="CRB-8/12345"
                      />
                      {bibliotecarioCrb.trim() && !crbValido && (
                        <p className="text-xs text-red-600 mt-1">
                          Formato: CRB-X/YYYY (regiões de 1 a 15). Ex: CRB-8/12345
                        </p>
                      )}
                    </div>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer pt-2">
                    <input
                      type="checkbox"
                      checked={declaracaoAceita}
                      onChange={e => setDeclaracaoAceita(e.target.checked)}
                      className="mt-1"
                    />
                    <span className="text-xs text-zinc-700 leading-relaxed">
                      Declaro, sob as penas do art. 299 do Código Penal (falsidade ideológica), que a ficha catalográfica acima foi elaborada e assinada por bibliotecário com CRB ativo, e que os dados fornecidos são verdadeiros. Ciente de que declaração falsa gera responsabilidade civil e criminal integral pelo uso indevido da ficha.
                    </span>
                  </label>
                </SectionToggle>
              )}
            </>
          )}

          <button
            type="button"
            onClick={handleGerar}
            disabled={isLivrarias && !modoOficialValido}
            className="w-full bg-brand-primary text-brand-surface py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all disabled:bg-zinc-300 disabled:cursor-not-allowed"
          >
            {isPessoal
              ? "Continuar sem página de créditos →"
              : "Gerar página de créditos →"}
          </button>
          <p className="text-center text-xs text-zinc-400 mt-3">
            {isPessoal ? "Vai direto para a diagramação do miolo." : "Apenas alguns segundos."}
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
                  {creditos?.ficha_oficial && (
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

              {/* Ficha oficial info */}
              {creditos?.ficha_oficial && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-4 text-xs">
                  <p className="font-semibold text-emerald-800 mb-1">Ficha oficial CRB</p>
                  <p className="text-emerald-700">CDD: {creditos.ficha_oficial.cdd}</p>
                  <p className="text-emerald-700">CDU: {creditos.ficha_oficial.cdu}</p>
                  <p className="text-emerald-600 mt-1 text-[10px]">
                    {creditos.ficha_oficial.bibliotecario_crb}
                  </p>
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

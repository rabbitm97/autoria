"use client";

import { useState } from "react";
import type { CreditosConfig, CreditosFormato } from "@/app/api/ferramentas/creditos/route";
import type { FichaOficialCRB, PropositoPublicacao } from "@/app/api/agentes/creditos/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMATOS: { id: CreditosFormato; label: string; dim: string }[] = [
  { id: "bolso",     label: "Bolso",     dim: "11×18 cm"   },
  { id: "compacto",  label: "Compacto",  dim: "14×21 cm"   },
  { id: "padrao_br", label: "Padrão BR", dim: "16×23 cm"   },
  { id: "quadrado",  label: "Quadrado",  dim: "20×20 cm"   },
  { id: "a4",        label: "A4",        dim: "21×29,7 cm" },
];

const PROPOSITOS: { id: PropositoPublicacao; label: string }[] = [
  { id: "digital",  label: "Digital (KDP/Apple/Kobo)" },
  { id: "completa", label: "Publicação completa (exige ficha CRB)" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({
  label, hint, value, onChange, placeholder, multiline, half,
}: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean; half?: boolean;
}) {
  return (
    <div className={half ? "col-span-1" : ""}>
      <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">{label}</label>
      {hint && <p className="text-xs text-zinc-400 mb-1.5">{hint}</p>}
      {multiline ? (
        <textarea
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={3}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold resize-none"
        />
      ) : (
        <input
          type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold"
        />
      )}
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!value)}
        className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 mt-0.5 ${value ? "bg-brand-primary" : "bg-zinc-200"}`}
      >
        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
      </div>
      <div>
        <span className="text-sm text-zinc-700">{label}</span>
        {hint && <p className="text-xs text-zinc-400 mt-0.5">{hint}</p>}
      </div>
    </label>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreditosFerramenta() {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // ── Obra info ────────────────────────────────────────────────────────────
  const [titulo, setTitulo]   = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [autorNome, setAutorNome] = useState("");

  // ── Formato + propósito ──────────────────────────────────────────────────
  const [formato, setFormato] = useState<CreditosFormato>("padrao_br");
  const [proposito, setProposito] = useState<PropositoPublicacao>("digital");

  // ── Direitos ─────────────────────────────────────────────────────────────
  const [anoCopyright,    setAnoCopyright]    = useState(new Date().getFullYear().toString());
  const [titularDireitos, setTitularDireitos] = useState("");
  const [numeroEdicao,    setNumeroEdicao]    = useState("1ª edição");
  const [anoEdicao,       setAnoEdicao]       = useState(new Date().getFullYear().toString());
  const [tituloOriginal,  setTituloOriginal]  = useState("");
  const [idiomaOriginal,  setIdiomaOriginal]  = useState("");

  // ── Equipe ────────────────────────────────────────────────────────────────
  const [traducao,          setTraducao]          = useState("");
  const [revisaoTecnica,    setRevisaoTecnica]    = useState("");
  const [revisao,           setRevisao]           = useState("");
  const [preparacao,        setPreparacao]        = useState("");
  const [diagramacao,       setDiagramacao]       = useState("");
  const [projetoCapa,       setProjetoCapa]       = useState("");
  const [ilustracaoCapa,    setIlustracaoCapa]    = useState("");
  const [producaoEditorial, setProducaoEditorial] = useState("");
  const [outrosCreditos,    setOutrosCreditos]    = useState("");

  // ── Editora ───────────────────────────────────────────────────────────────
  const [nomeEditora,     setNomeEditora]     = useState("");
  const [localEdicao,     setLocalEdicao]     = useState("São Paulo");
  const [enderecoEditora, setEnderecoEditora] = useState("");
  const [cidadeEstado,    setCidadeEstado]    = useState("");
  const [cep,             setCep]             = useState("");
  const [siteEditora,     setSiteEditora]     = useState("");
  const [emailEditora,    setEmailEditora]    = useState("");

  // ── ISBN (opcional) ──────────────────────────────────────────────────────
  const [isbn, setIsbn] = useState("");

  // ── Ficha oficial CRB (opcional, para preview) ───────────────────────────
  const [incluirFicha,        setIncluirFicha]        = useState(false);
  const [foNumeroChamada,     setFoNumeroChamada]     = useState("");
  const [foEntradaAutor,      setFoEntradaAutor]      = useState("");
  const [foDescricao,         setFoDescricao]         = useState("");
  const [foNotasGerais,       setFoNotasGerais]       = useState("");
  const [foAssuntos,          setFoAssuntos]          = useState("");
  const [foCdd,               setFoCdd]               = useState("");
  const [foCdu,               setFoCdu]               = useState("");
  const [foBibliotecarioNome, setFoBibliotecarioNome] = useState("");
  const [foBibliotecarioCrb,  setFoBibliotecarioCrb]  = useState("");

  // ── Open sections ─────────────────────────────────────────────────────────
  const [openEquipe,  setOpenEquipe]  = useState(true);
  const [openEditora, setOpenEditora] = useState(false);
  const [openFicha,   setOpenFicha]   = useState(false);

  function buildConfig(): CreditosConfig {
    return {
      formato,
      proposito,
      ano_copyright:   parseInt(anoCopyright) || new Date().getFullYear(),
      titular_direitos: titularDireitos.trim(),
      numero_edicao:   numeroEdicao.trim()   || undefined,
      ano_edicao:      anoEdicao ? parseInt(anoEdicao) : undefined,
      titulo_original: tituloOriginal.trim() || undefined,
      idioma_original: idiomaOriginal.trim() || undefined,
      traducao:         traducao.trim()         || undefined,
      revisao_tecnica:  revisaoTecnica.trim()   || undefined,
      revisao:          revisao.trim()          || undefined,
      preparacao:       preparacao.trim()       || undefined,
      diagramacao:      diagramacao.trim()      || undefined,
      projeto_capa:     projetoCapa.trim()      || undefined,
      ilustracao_capa:  ilustracaoCapa.trim()   || undefined,
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
  }

  function buildFichaOficial(): FichaOficialCRB | undefined {
    if (!incluirFicha) return undefined;
    if (!foNumeroChamada.trim()) return undefined;
    return {
      numero_chamada:          foNumeroChamada.trim(),
      entrada_autor:           foEntradaAutor.trim(),
      descricao_bibliografica: foDescricao.trim(),
      notas_gerais:            foNotasGerais.trim() || undefined,
      assuntos:                foAssuntos.trim(),
      cdd:                     foCdd.trim(),
      cdu:                     foCdu.trim(),
      bibliotecario_nome:      foBibliotecarioNome.trim(),
      bibliotecario_crb:       foBibliotecarioCrb.trim(),
      declaracao_aceita_em:    new Date().toISOString(),
      declaracao_ip:           "dev-tool",
    };
  }

  async function handleGerar(e: React.FormEvent) {
    e.preventDefault();
    if (!titularDireitos.trim()) { setError("Informe o titular dos direitos autorais."); return; }
    setLoading(true);
    setError(null);
    setPreviewUrl(null);

    const config = buildConfig();
    const fichaOficial = buildFichaOficial();

    try {
      const res = await fetch("/api/ferramentas/creditos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          fichaOficial,
          titulo:    titulo.trim() || "Meu Livro",
          subtitulo: subtitulo.trim() || "",
          autor:     autorNome.trim() || titularDireitos.trim(),
        }),
      });
      const data = await res.json() as { ok?: boolean; html?: string; error?: string };
      if (!res.ok || !data.html) throw new Error(data.error ?? "Erro ao gerar créditos.");

      const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
      setPreviewUrl(URL.createObjectURL(blob));
      setHtmlContent(data.html);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function downloadHtml() {
    if (!htmlContent) return;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pagina_de_creditos.html`;
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
    if (!htmlContent) return;
    setDownloadingDocx(true);
    try {
      const res = await fetch("/api/creditos/docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: buildConfig(),
          fichaOficial: buildFichaOficial() ?? null,
          titulo: titulo.trim() || "Meu Livro",
        }),
      });
      if (!res.ok) { setError("Erro ao gerar DOCX."); return; }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pagina_de_creditos.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
    } catch {
      setError("Erro ao gerar DOCX.");
    } finally {
      setDownloadingDocx(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Página de Créditos</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Preview do verso da folha de rosto com copyright, equipe técnica e (opcionalmente)
          ficha catalográfica oficial CRB — seguindo <strong>ABNT NBR 6029</strong>.
        </p>
      </div>

      <form onSubmit={handleGerar} className="space-y-4">

        {/* Obra */}
        <section className="bg-white rounded-2xl border border-zinc-100 p-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Dados da obra</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Título do livro" value={titulo} onChange={setTitulo} placeholder="O Título do Livro" />
            <Field label="Subtítulo" value={subtitulo} onChange={setSubtitulo} placeholder="(opcional)" />
            <Field label="Autor(a)" value={autorNome} onChange={setAutorNome} placeholder="Nome Sobrenome" />
          </div>
        </section>

        {/* Formato + propósito */}
        <section className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Formato do livro</h2>
            <div className="flex flex-wrap gap-2">
              {FORMATOS.map(f => (
                <button key={f.id} type="button" onClick={() => setFormato(f.id)}
                  className={`px-4 py-2 rounded-xl border-2 text-sm transition-all ${
                    formato === f.id
                      ? "border-brand-gold bg-brand-gold/5 text-brand-primary font-semibold"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {f.label} <span className="text-xs font-normal text-zinc-400">{f.dim}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Propósito</h2>
            <div className="flex flex-wrap gap-2">
              {PROPOSITOS.map(p => (
                <button key={p.id} type="button" onClick={() => setProposito(p.id)}
                  className={`px-4 py-2 rounded-xl border-2 text-sm transition-all ${
                    proposito === p.id
                      ? "border-brand-gold bg-brand-gold/5 text-brand-primary font-semibold"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Direitos */}
        <section className="bg-white rounded-2xl border border-zinc-100 p-6">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Direitos autorais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Ano do copyright *" value={anoCopyright} onChange={setAnoCopyright} placeholder="2024" />
            <Field label="Titular dos direitos *" value={titularDireitos} onChange={setTitularDireitos} placeholder="Nome do autor ou editora" />
            <Field label="Número da edição" value={numeroEdicao} onChange={setNumeroEdicao} placeholder="1ª edição" />
            <Field label="Ano da edição" value={anoEdicao} onChange={setAnoEdicao} placeholder="2024" />
            <Field label="Título original" hint="Apenas para traduções" value={tituloOriginal} onChange={setTituloOriginal} placeholder="El título original" />
            <Field label="Idioma original" value={idiomaOriginal} onChange={setIdiomaOriginal} placeholder="Espanhol" />
            <Field label="ISBN" value={isbn} onChange={setIsbn} placeholder="978-65-XXXXX-XX-X" />
          </div>
        </section>

        {/* Equipe */}
        <section className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <button type="button" onClick={() => setOpenEquipe(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Equipe técnica</span>
            <span className="text-zinc-400 text-sm">{openEquipe ? "▲" : "▼"}</span>
          </button>
          {openEquipe && (
            <div className="px-6 pb-6 border-t border-zinc-100 pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Tradução" value={traducao} onChange={setTraducao} placeholder="Nome" />
                <Field label="Revisão técnica" value={revisaoTecnica} onChange={setRevisaoTecnica} placeholder="Nome(s)" />
                <Field label="Revisão" value={revisao} onChange={setRevisao} placeholder="Nome" />
                <Field label="Preparação de texto" value={preparacao} onChange={setPreparacao} placeholder="Nome" />
                <Field label="Diagramação" value={diagramacao} onChange={setDiagramacao} placeholder="Nome ou empresa" />
                <Field label="Projeto gráfico de capa" value={projetoCapa} onChange={setProjetoCapa} placeholder="Nome" />
                <Field label="Ilustração de capa" value={ilustracaoCapa} onChange={setIlustracaoCapa} placeholder="Ex: Foto: Acervo do autor" />
                <Field label="Produção editorial" value={producaoEditorial} onChange={setProducaoEditorial} placeholder="Nome" />
              </div>
              <Field label="Outros créditos" hint="Um por linha" value={outrosCreditos} onChange={setOutrosCreditos}
                placeholder={"Impressão: Gráfica XYZ\nAcabamento: Encadernações Ltda."} multiline />
            </div>
          )}
        </section>

        {/* Editora */}
        <section className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <button type="button" onClick={() => setOpenEditora(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Editora / publicadora</span>
            <span className="text-zinc-400 text-sm">{openEditora ? "▲" : "▼"}</span>
          </button>
          {openEditora && (
            <div className="px-6 pb-6 border-t border-zinc-100 pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nome da editora" value={nomeEditora} onChange={setNomeEditora} placeholder="Editora XYZ Ltda." />
                <Field label="Local de edição" value={localEdicao} onChange={setLocalEdicao} placeholder="São Paulo" />
                <Field label="Endereço" value={enderecoEditora} onChange={setEnderecoEditora} placeholder="Rua das Flores, 123" />
                <Field label="Cidade — Estado" value={cidadeEstado} onChange={setCidadeEstado} placeholder="São Paulo — SP" />
                <Field label="CEP" value={cep} onChange={setCep} placeholder="01310-100" />
                <Field label="Site" value={siteEditora} onChange={setSiteEditora} placeholder="www.editora.com.br" />
                <Field label="E-mail" value={emailEditora} onChange={setEmailEditora} placeholder="contato@editora.com.br" />
              </div>
            </div>
          )}
        </section>

        {/* Ficha oficial CRB */}
        <section className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
          <button type="button" onClick={() => setOpenFicha(v => !v)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors text-left"
          >
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Ficha catalográfica oficial (CRB)</span>
            <span className="text-zinc-400 text-sm shrink-0 ml-4">{openFicha ? "▲" : "▼"}</span>
          </button>
          {openFicha && (
            <div className="px-6 pb-6 border-t border-zinc-100 pt-5 space-y-4">
              <Toggle
                label="Incluir ficha catalográfica oficial no preview"
                hint="Preencha manualmente com os dados fornecidos pelo bibliotecário CRB."
                value={incluirFicha}
                onChange={setIncluirFicha}
              />
              {incluirFicha && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Número de chamada" value={foNumeroChamada} onChange={setFoNumeroChamada} placeholder="M854i" />
                  <Field label="Entrada de autor" value={foEntradaAutor} onChange={setFoEntradaAutor} placeholder="SOBRENOME, Nome, 1980-" />
                  <div className="sm:col-span-2">
                    <Field label="Descrição bibliográfica" value={foDescricao} onChange={setFoDescricao}
                      placeholder="Título / Autor. – 1. ed. – São Paulo : Editora, 2024. – 200p." multiline />
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Notas gerais (opcional)" value={foNotasGerais} onChange={setFoNotasGerais}
                      placeholder="Inclui bibliografia." />
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Assuntos" hint="Um por linha" value={foAssuntos} onChange={setFoAssuntos}
                      placeholder={"1. Romance brasileiro. I. Título.\n2. Ficção."} multiline />
                  </div>
                  <Field label="CDD" value={foCdd} onChange={setFoCdd} placeholder="869.3" />
                  <Field label="CDU" value={foCdu} onChange={setFoCdu} placeholder="821.134.3-3" />
                  <Field label="Bibliotecário — nome" value={foBibliotecarioNome} onChange={setFoBibliotecarioNome} placeholder="Nome do bibliotecário" />
                  <Field label="CRB" value={foBibliotecarioCrb} onChange={setFoBibliotecarioCrb} placeholder="CRB-8/12345" />
                </div>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-primary text-brand-surface py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              Montando página de créditos…
            </span>
          ) : "Gerar página de créditos →"}
        </button>
      </form>

      {/* Preview */}
      {previewUrl && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-heading text-xl text-brand-primary">Pré-visualização</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Verso da folha de rosto — posição 2 no livro</p>
            </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadHtml}
              disabled={!htmlContent}
              className="inline-flex items-center gap-1.5 border border-zinc-200 text-zinc-700 px-4 py-2 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              ⬇ HTML
            </button>
            <button
              onClick={downloadPdf}
              disabled={!htmlContent}
              className="inline-flex items-center gap-1.5 border border-zinc-200 text-zinc-700 px-4 py-2 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              ⬇ PDF
            </button>
            <button
              onClick={downloadDocx}
              disabled={!htmlContent || downloadingDocx}
              className="inline-flex items-center gap-1.5 border border-zinc-200 text-zinc-700 px-4 py-2 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              {downloadingDocx ? "Gerando…" : "⬇ DOCX"}
            </button>
          </div>
        </div>

          <div className="bg-zinc-200 rounded-2xl p-6 flex justify-center">
            <div className="bg-white shadow-2xl" style={{ width: "100%", maxWidth: "640px" }}>
              <iframe
                src={previewUrl}
                title="Página de créditos"
                className="w-full border-0"
                style={{ height: "760px" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import type { MioloConfig, MioloResult, TemplateId, FormatoId } from "@/app/api/agentes/miolo/route";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

type Step = "config" | "processing" | "preview";

interface Template { id: TemplateId; nome: string; desc: string; generos: string[]; icon: string }
interface Formato  { id: FormatoId;  label: string; dim: string; desc: string; popular?: boolean }

const TEMPLATES: Template[] = [
  { id: "literario",  nome: "Literário Clássico",    desc: "Garamond, margens generosas, capitular", generos: ["Romance","Ficção","Contos","Suspense"], icon: "📖" },
  { id: "nao_ficcao", nome: "Não-ficção Moderna",    desc: "Source Serif, subtítulos hierárquicos, caixas de destaque", generos: ["Autoajuda","Negócios","Biografia","Memórias"], icon: "💡" },
  { id: "abnt",       nome: "Técnico / ABNT",         desc: "Times New Roman, normas ABNT, notas de rodapé", generos: ["Acadêmico","TCC","Manual Técnico"], icon: "🎓" },
  { id: "infantil",   nome: "Infantil / Juvenil",     desc: "Lora, entrelinha espaçosa, diálogos destacados", generos: ["Infantil","YA","Conto Infantil"], icon: "🌟" },
  { id: "poesia",     nome: "Poesia / Teatro",        desc: "Crimson Text, estrofes, numeração de versos", generos: ["Poesia","Teatro","Crônicas"], icon: "✍️" },
  { id: "religioso",  nome: "Religioso / Espiritual", desc: "Gentium, compacto, referências cruzadas", generos: ["Religioso","Espiritual","Devocional"], icon: "🕊️" },
];

const FORMATOS: Formato[] = [
  { id: "bolso",     label: "Bolso",       dim: "11 × 18 cm", desc: "Livros de bolso" },
  { id: "a5",        label: "A5",          dim: "14,8 × 21 cm", desc: "Formato europeu" },
  { id: "padrao_br", label: "Padrão BR",   dim: "16 × 23 cm", desc: "Mais usado no Brasil", popular: true },
  { id: "quadrado",  label: "Quadrado",    dim: "20 × 20 cm", desc: "Arte, fotografia" },
  { id: "a4",        label: "A4",          dim: "21 × 29,7 cm", desc: "Acadêmico, técnico" },
];

// Map genre → template
function suggestTemplate(genero: string | null): TemplateId {
  const g = (genero ?? "").toLowerCase();
  if (g.includes("romance") || g.includes("ficção") || g.includes("conto") || g.includes("suspense") || g.includes("fantasia")) return "literario";
  if (g.includes("autoajuda") || g.includes("negócio") || g.includes("empreend") || g.includes("biografi") || g.includes("memória")) return "nao_ficcao";
  if (g.includes("acadêm") || g.includes("técnico") || g.includes("abnt") || g.includes("científ")) return "abnt";
  if (g.includes("infantil") || g.includes("jovem") || g.includes("ya")) return "infantil";
  if (g.includes("poesia") || g.includes("teatro")) return "poesia";
  if (g.includes("religi") || g.includes("espirit") || g.includes("devoci")) return "religioso";
  return "literario";
}

// ─── Processing steps ─────────────────────────────────────────────────────────

const PROCESSING_MSGS = [
  "Analisando estrutura do manuscrito…",
  "Detectando capítulos e seções…",
  "Aplicando tipografia profissional…",
  "Gerando sumário automático…",
  "Corrigindo vírgulas e travessões…",
  "Montando páginas de abertura…",
  "Finalizando visualização…",
];

// ─── Config Form ──────────────────────────────────────────────────────────────

function RadioCard({ selected, onClick, children }: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-4 transition-all w-full ${
        selected ? "border-brand-gold bg-brand-gold/5" : "border-zinc-200 hover:border-zinc-300 bg-white"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MioloPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const newFileRef = useRef<HTMLInputElement>(null);

  // ── Data state ──────────────────────────────────────────────────────────────
  const [genero, setGenero] = useState<string | null>(null);
  const [manuscritoNome, setManuscritoNome] = useState("Manuscrito");
  const [palavrasTotal, setPalavrasTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("config");
  const [miolo, setMiolo] = useState<MioloResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [currentCapIdx, setCurrentCapIdx] = useState(0);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // ── Config form state ───────────────────────────────────────────────────────
  const [template, setTemplate] = useState<TemplateId>("literario");
  const [formato, setFormato] = useState<FormatoId>("padrao_br");
  const [corpoPt, setCorpoPt] = useState<10 | 11 | 12>(11);
  const [capitular, setCapitular] = useState(true);
  const [ornamentos, setOrnamentos] = useState(true);
  const [sumario, setSumario] = useState(true);
  const [dedicatoria, setDedicatoria] = useState("");
  const [epigrafeTexto, setEpigrafeTexto] = useState("");
  const [epigrafeAutor, setEpigrafeAutor] = useState("");
  const [bioAutor, setBioAutor] = useState("");
  const [marcasCorte, setMarcasCorte] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPretextual, setShowPretextual] = useState(false);

  // ── Processing state ────────────────────────────────────────────────────────
  const [processingMsg, setProcessingMsg] = useState(PROCESSING_MSGS[0]);
  const [processingPct, setProcessingPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Upload state ────────────────────────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState<"idle" | "parsing" | "processing">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_miolo, dados_capa, manuscripts(nome, texto, genero_principal)")
      .eq("id", projectId)
      .single();

    if (project) {
      const ms = project.manuscripts as unknown as { nome?: string; texto?: string; genero_principal?: string } | null;
      const g = ms?.genero_principal ?? null;
      setGenero(g);
      setManuscritoNome(ms?.nome ?? "Manuscrito");
      const wc = ms?.texto?.split(/\s+/).filter(Boolean).length ?? 0;
      setPalavrasTotal(wc);

      // Pre-select template from genre
      setTemplate(suggestTemplate(g));

      // Inherit format from Capa step (single source of truth)
      const capaData = project.dados_capa as { formato?: string } | null;
      if (capaData?.formato) setFormato(capaData.formato as FormatoId);

      // If already generated, show preview directly
      const existingMiolo = project.dados_miolo as MioloResult | null;
      if (existingMiolo) {
        setMiolo(existingMiolo);
        // Fetch fresh signed URL
        const res = await fetch(`/api/agentes/miolo?project_id=${projectId}`);
        if (res.ok) {
          const data = await res.json() as { miolo: MioloResult; preview_url: string | null; html?: string };
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
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Process book ─────────────────────────────────────────────────────────────

  async function handleGenerate() {
    setStep("processing");
    setError(null);
    setProcessingPct(0);

    // Animate progress messages
    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, PROCESSING_MSGS.length - 1);
      setProcessingMsg(PROCESSING_MSGS[msgIdx]);
      setProcessingPct(Math.min(95, Math.round((msgIdx / (PROCESSING_MSGS.length - 1)) * 95)));
    }, 2500);

    const config: MioloConfig = {
      template, formato, corpo_pt: corpoPt,
      capitular, ornamentos, sumario,
      dedicatoria, epigrafe_texto: epigrafeTexto,
      epigrafe_autor: epigrafeAutor, bio_autor: bioAutor,
      marcas_corte: marcasCorte,
    };

    try {
      const res = await fetch("/api/agentes/miolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, config }),
      });
      const data = await res.json() as { ok?: boolean; miolo?: MioloResult; preview_url?: string; html?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar miolo.");

      setProcessingPct(100);
      setMiolo(data.miolo!);
      if (data.html) {
        const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
        setPreviewUrl(URL.createObjectURL(blob));
        setHtmlContent(data.html);
      } else {
        setPreviewUrl(data.preview_url ?? null);
      }
      setCurrentCapIdx(0);
      setTimeout(() => setStep("preview"), 400);
    } catch (e) {
      clearInterval(interval);
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("config");
    } finally {
      clearInterval(interval);
    }
  }

  // ── Chapter navigation ────────────────────────────────────────────────────

  function navigateToChapter(idx: number) {
    if (!miolo) return;
    const cap = miolo.capitulos[idx];
    if (!cap) return;
    setCurrentCapIdx(idx);

    // Scroll inside iframe
    const iframe = iframeRef.current;
    if (iframe?.contentDocument) {
      const el = iframe.contentDocument.getElementById(cap.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // ── New file upload ──────────────────────────────────────────────────────

  async function handleNewFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    try {
      setUploadStatus("parsing");
      const fd = new FormData();
      fd.append("file", file);
      const parseRes = await fetch("/api/ferramentas/parse-file", { method: "POST", body: fd });
      const parseData = await parseRes.json() as { texto?: string; error?: string };
      if (!parseRes.ok) throw new Error(parseData.error ?? "Erro ao processar arquivo.");

      // Save new text and clear texto_revisado so Diagramação uses the new upload, not stale revision
      const { data: proj } = await supabase.from("projects").select("manuscript_id").eq("id", projectId).single();
      if (proj?.manuscript_id) {
        await supabase.from("manuscripts")
          .update({ texto: parseData.texto, texto_revisado: null })
          .eq("id", proj.manuscript_id as string);
      }

      // Re-generate miolo
      setUploadStatus("processing");
      setStep("processing");
      await handleGenerate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploadStatus("idle");
      if (newFileRef.current) newFileRef.current.value = "";
    }
  }

  // ── Downloads ────────────────────────────────────────────────────────────

  const safeName = manuscritoNome.replace(/\s+/g, "_");

  function downloadHtml() {
    if (!htmlContent) return;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}_miolo.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  }

  function downloadPdf() {
    if (!htmlContent) return;
    // Opens a new tab with auto-print → browser "Save as PDF"
    // Crop marks (if any) are included via @media print CSS already in the HTML
    const htmlWithPrint = htmlContent.replace(
      "</body>",
      "<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body>"
    );
    const blob = new Blob([htmlWithPrint], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  function downloadDocx() {
    if (!htmlContent) return;
    setDownloadingDocx(true);
    try {
      // Word HTML format: opens natively in Microsoft Word and LibreOffice
      // Retains all typographic styling, chapters, and layout
      const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
${htmlContent.match(/<style[\s\S]*?<\/style>/)?.[0] ?? ""}
</head>
<body>
${htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? htmlContent}
</body>
</html>`;
      const blob = new Blob([wordHtml], { type: "application/vnd.ms-word;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}_miolo.doc`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
    } finally {
      setDownloadingDocx(false);
    }
  }

  async function handleEpub() {
    try {
      const res = await fetch("/api/agentes/gerar-epub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json() as { url_download?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar EPUB.");
      if (data.url_download) window.open(data.url_download, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar EPUB.");
    }
  }

  // ── Estimated pages ──────────────────────────────────────────────────────

  const wpps: Record<FormatoId, number> = { bolso: 200, a5: 230, padrao_br: 260, quadrado: 300, a4: 380 };
  const paginasEst = palavrasTotal > 0 ? Math.max(1, Math.round(palavrasTotal / wpps[formato])) : null;

  const selectedTemplate = TEMPLATES.find(t => t.id === template);
  const selectedFormato  = FORMATOS.find(f => f.id === formato);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <EtapasProgress currentStep={5} projectId={projectId} />

      {loading ? (
        <div className="flex justify-center items-center py-32">
          <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
        </div>
      ) : step === "config" ? (
        /* ── CONFIG ── */
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="mb-8">
            <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Diagramação do Miolo</p>
            <h1 className="font-heading text-3xl text-brand-primary">Configure o interior do livro</h1>
            <p className="text-zinc-500 text-sm mt-2">
              A IA irá tipografar seu manuscrito com padrões editoriais profissionais.
              {genero && <span className="text-brand-gold"> Gênero detectado: {genero}.</span>}
            </p>
          </div>

          {/* Template */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">
              Template de diagramação
              {selectedTemplate && (
                <span className="normal-case text-brand-gold font-normal ml-2">— {selectedTemplate.nome} selecionado</span>
              )}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {TEMPLATES.map(t => (
                <RadioCard key={t.id} selected={template === t.id} onClick={() => setTemplate(t.id)}>
                  <div className="text-xl mb-2">{t.icon}</div>
                  <p className={`text-sm font-semibold ${template === t.id ? "text-brand-primary" : "text-zinc-800"}`}>
                    {t.nome}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t.desc}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.generos.map(g => (
                      <span key={g} className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">{g}</span>
                    ))}
                  </div>
                  {template === t.id && genero && t.generos.some(g => genero.toLowerCase().includes(g.toLowerCase())) && (
                    <p className="text-[10px] text-brand-gold mt-1.5">✦ Recomendado para seu gênero</p>
                  )}
                </RadioCard>
              ))}
            </div>
          </section>

          {/* Format — inherited from Capa step, display only */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-5 mb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Formato do livro</p>
                <p className="text-sm font-medium text-brand-primary mt-0.5">
                  {selectedFormato?.label ?? "Padrão BR"} — {selectedFormato?.dim}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">Definido na etapa de Capa</p>
              </div>
              {paginasEst && (
                <p className="text-xs text-zinc-400 text-right">
                  ~<strong className="text-zinc-600">{paginasEst} páginas</strong><br />
                  com {palavrasTotal.toLocaleString("pt-BR")} palavras
                </p>
              )}
            </div>
          </section>

          {/* Advanced options */}
          <section className="bg-white rounded-2xl border border-zinc-100 overflow-hidden mb-5">
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Opções tipográficas</span>
              <span className="text-zinc-400 text-sm">{showAdvanced ? "▲" : "▼"}</span>
            </button>
            {showAdvanced && (
              <div className="px-6 pb-6 space-y-4 border-t border-zinc-100 pt-4">
                {/* Font size */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-2">Tamanho do corpo</label>
                  <div className="flex gap-2">
                    {([10, 11, 12] as const).map(sz => (
                      <button
                        key={sz}
                        onClick={() => setCorpoPt(sz)}
                        className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                          corpoPt === sz ? "border-brand-gold bg-brand-gold/5 text-brand-primary font-medium" : "border-zinc-200 text-zinc-600"
                        }`}
                      >
                        {sz}pt
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">11pt é o padrão editorial para leitura confortável.</p>
                </div>
                {/* Toggles */}
                {[
                  { label: "Capitular (letra inicial grande) no início de cada capítulo", val: capitular, set: setCapitular },
                  { label: "Ornamentos tipográficos entre seções (* * *)", val: ornamentos, set: setOrnamentos },
                  { label: "Gerar sumário automático", val: sumario, set: setSumario },
                ].map(({ label, val, set }) => (
                  <label key={label} className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => set(!val)}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${val ? "bg-brand-primary" : "bg-zinc-200"}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${val ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    <span className="text-sm text-zinc-600">{label}</span>
                  </label>
                ))}

                {/* Crop marks / bleed */}
                <div className="border-t border-zinc-100 pt-4 mt-1">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div
                      onClick={() => setMarcasCorte(v => !v)}
                      className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 mt-0.5 ${marcasCorte ? "bg-brand-primary" : "bg-zinc-200"}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${marcasCorte ? "translate-x-4" : "translate-x-0"}`} />
                    </div>
                    <div>
                      <span className="text-sm text-zinc-600">Marcas de corte e sangria (impressão profissional)</span>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Adiciona sangria de 3 mm e marcas de corte em cada página — necessário para gráficas e impressão sob demanda.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* Pre-textual elements */}
          <section className="bg-white rounded-2xl border border-zinc-100 overflow-hidden mb-5">
            <button
              onClick={() => setShowPretextual(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
            >
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Elementos pré e pós-textuais</span>
              <span className="text-zinc-400 text-sm">{showPretextual ? "▲" : "▼"}</span>
            </button>
            {showPretextual && (
              <div className="px-6 pb-6 space-y-4 border-t border-zinc-100 pt-4">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-1.5">Dedicatória</label>
                  <textarea
                    value={dedicatoria}
                    onChange={e => setDedicatoria(e.target.value)}
                    placeholder="Ex.: Para minha mãe, que sempre acreditou em mim."
                    rows={2}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-1.5">Epígrafe</label>
                  <textarea
                    value={epigrafeTexto}
                    onChange={e => setEpigrafeTexto(e.target.value)}
                    placeholder="Texto da citação"
                    rows={2}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold resize-none"
                  />
                  <input
                    value={epigrafeAutor}
                    onChange={e => setEpigrafeAutor(e.target.value)}
                    placeholder="Autor da epígrafe"
                    className="mt-2 w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide block mb-1.5">Sobre o autor (página final)</label>
                  <textarea
                    value={bioAutor}
                    onChange={e => setBioAutor(e.target.value)}
                    placeholder="Breve bio do autor para o final do livro (opcional)"
                    rows={3}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-brand-gold resize-none"
                  />
                </div>
              </div>
            )}
          </section>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm mb-5">{error}</div>
          )}

          <button
            onClick={handleGenerate}
            className="w-full bg-brand-primary text-brand-surface py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all"
          >
            Iniciar diagramação →
          </button>
          <p className="text-center text-xs text-zinc-400 mt-3">
            Leva {(paginasEst ?? 0) > 200 ? "60–90" : "30–60"} segundos dependendo do tamanho do manuscrito.
          </p>
        </main>

      ) : step === "processing" ? (
        /* ── PROCESSING ── */
        <main className="max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mx-auto mb-8" />
          <h2 className="font-heading text-2xl text-brand-primary mb-3">Diagramando seu livro…</h2>
          <p className="text-zinc-500 text-sm mb-8 leading-relaxed">{processingMsg}</p>

          {/* Progress bar */}
          <div className="bg-zinc-100 rounded-full h-2 mb-3 overflow-hidden">
            <div
              className="h-full bg-brand-gold rounded-full transition-all duration-700"
              style={{ width: `${processingPct}%` }}
            />
          </div>
          <p className="text-zinc-400 text-xs">{processingPct}% completo</p>

          <div className="mt-8 bg-white rounded-xl border border-zinc-100 p-4 text-left">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Configurações aplicadas</p>
            <p className="text-sm text-zinc-700">
              Template: <strong>{TEMPLATES.find(t => t.id === template)?.nome}</strong> ·
              Formato: <strong>{FORMATOS.find(f => f.id === formato)?.label}</strong> ·
              Fonte: <strong>{corpoPt}pt</strong>
            </p>
          </div>
        </main>

      ) : (
        /* ── PREVIEW ── */
        <main className="flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
          {/* Top bar */}
          <div className="bg-white border-b border-zinc-100 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <span className="text-brand-gold text-xs font-semibold uppercase tracking-wide">Miolo pronto</span>
              <h1 className="font-heading text-xl text-brand-primary">{manuscritoNome}</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-zinc-100 text-zinc-500 px-3 py-1.5 rounded-lg">
                {miolo?.capitulos.length ?? 0} cap. · ~{miolo?.paginas_estimadas ?? 0} pág. · {miolo?.palavras?.toLocaleString("pt-BR")} palavras
              </span>
            </div>
          </div>

          {/* Spread area */}
          <div className="flex-1 bg-zinc-300 flex items-stretch gap-0 overflow-hidden" style={{ minHeight: "560px" }}>

            {/* Left "page" — info panel */}
            <div
              className="bg-white shadow-xl flex flex-col shrink-0 overflow-y-auto"
              style={{ width: "260px", padding: "28px 22px", margin: "24px 0 24px 24px", borderRadius: "4px 0 0 4px" }}
            >
              <h3 className="font-heading text-sm text-brand-primary mb-4">Confira o miolo do seu livro</h3>

              {/* File info */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-xs">
                <p className="font-semibold text-blue-700 mb-1.5">📄 Configurações do arquivo</p>
                <p className="text-blue-600">Formato: <strong>{selectedFormato?.dim}</strong></p>
                <p className="text-blue-600">Template: <strong>{selectedTemplate?.nome}</strong></p>
                <p className="text-blue-600">Páginas: <strong>{miolo?.paginas_reais ?? miolo?.paginas_estimadas}</strong></p>
                {miolo?.lombada_mm && (
                  <p className="text-blue-600">Lombada: <strong>{miolo.lombada_mm}mm</strong></p>
                )}
                <p className="text-blue-600">Capítulos: <strong>{miolo?.capitulos.length}</strong></p>
              </div>

              {/* Chapter navigation */}
              {(miolo?.capitulos?.length ?? 0) > 1 && (
                <div className="mb-4">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Capítulos</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {miolo!.capitulos.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => navigateToChapter(i)}
                        className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${
                          currentCapIdx === i ? "bg-brand-primary text-white" : "text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        {c.titulo.length > 30 ? c.titulo.slice(0, 30) + "…" : c.titulo}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Checklist */}
              <div className="mb-4">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">📋 Verifique nesta etapa:</p>
                <ul className="space-y-1.5 text-xs text-zinc-600">
                  <li>• Folheie até o final</li>
                  <li>• Confira margens e tipografia</li>
                  <li>• Verifique os títulos de capítulos</li>
                  <li>• Confirme dedicatória e epígrafe</li>
                </ul>
              </div>

              {/* Actions */}
              <div className="mt-auto space-y-2">
                <input ref={newFileRef} type="file" accept=".docx,.pdf,.txt" className="hidden" onChange={handleNewFile} />
                <button
                  onClick={() => newFileRef.current?.click()}
                  disabled={uploadStatus !== "idle"}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors disabled:opacity-50"
                >
                  {uploadStatus !== "idle" ? "Processando…" : "↑ Novo arquivo"}
                </button>
                <button
                  onClick={() => setStep("config")}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors"
                >
                  ↺ Alterar configurações
                </button>
                {uploadError && <p className="text-red-500 text-[10px]">{uploadError}</p>}
              </div>
            </div>

            {/* Right "page" — iframe preview */}
            <div
              className="bg-white shadow-xl flex-1 flex flex-col overflow-hidden"
              style={{ margin: "24px 24px 24px 0", borderRadius: "0 4px 4px 0" }}
            >
              {previewUrl ? (
                <>
                  <iframe
                    ref={iframeRef}
                    src={previewUrl}
                    title="Prévia do miolo"
                    className="flex-1 border-0 w-full"
                    style={{ minHeight: "500px" }}
                  />
                  {/* Chapter pagination */}
                  {(miolo?.capitulos?.length ?? 0) > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-100 bg-white">
                      <button
                        onClick={() => navigateToChapter(Math.max(0, currentCapIdx - 1))}
                        disabled={currentCapIdx === 0}
                        className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 transition-colors"
                      >
                        ‹ Anterior
                      </button>
                      <span className="text-xs text-zinc-400">
                        {miolo!.capitulos[currentCapIdx]?.titulo.slice(0, 35) ?? ""} ({currentCapIdx + 1} / {miolo!.capitulos.length})
                      </span>
                      <button
                        onClick={() => navigateToChapter(Math.min(miolo!.capitulos.length - 1, currentCapIdx + 1))}
                        disabled={currentCapIdx === (miolo?.capitulos.length ?? 1) - 1}
                        className="text-zinc-400 hover:text-zinc-700 disabled:opacity-30 transition-colors"
                      >
                        Próximo ›
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
                  Prévia não disponível — baixe o PDF para visualizar.
                </div>
              )}
            </div>
          </div>

          {/* Bottom CTA bar */}
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
              className="inline-flex items-center gap-2 bg-zinc-800 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-zinc-900 transition-colors disabled:opacity-40"
              title={miolo?.config.marcas_corte ? "PDF com marcas de corte e sangria de 3mm" : "PDF pronto para impressão"}
            >
              ⬇ PDF{miolo?.config.marcas_corte ? " ✂" : ""}
            </button>
            <button
              onClick={downloadDocx}
              disabled={!htmlContent || downloadingDocx}
              className="inline-flex items-center gap-2 border border-zinc-200 text-zinc-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:border-zinc-400 transition-colors disabled:opacity-40"
            >
              {downloadingDocx ? "Gerando…" : "⬇ DOCX"}
            </button>
            <button
              onClick={handleEpub}
              className="inline-flex items-center gap-2 border border-violet-200 text-violet-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:border-violet-400 transition-colors"
            >
              ⬇ EPUB
            </button>

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <div className="ml-auto flex items-center gap-3">
              <p className="text-zinc-400 text-xs hidden sm:block">Próxima etapa: QA dos arquivos.</p>
              <button
                onClick={async () => {
                  await supabase.from("projects").update({ etapa_atual: "preview" }).eq("id", projectId);
                  router.push(`/dashboard/qa/${projectId}`);
                }}
                className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-3 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all whitespace-nowrap"
              >
                Continuar para QA →
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

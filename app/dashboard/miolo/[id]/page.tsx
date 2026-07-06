"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import type { MioloConfig, MioloResult, TemplateId, FormatoLivro } from "@/app/api/agentes/miolo/route";
import { FORMATOS_LIVRO, estimarPaginas, LIMITE_DIVERGENCIA_LOMBADA_MM } from "@/lib/formatos";
import {
  TEMPLATE_OPTIONS,
  getDefaultCorpoPt,
  getDefaultSumario,
  clampCorpoPt,
  type TemplateOption,
} from "@/lib/miolo-builder";
import { supabase } from "@/lib/supabase";
import { DocxDisclaimer } from "./docx-disclaimer";
import { Printer, Laptop, FileText, BookOpen, Download, Info } from "lucide-react";
import { AprovacaoCapitulos } from "@/components/aprovacao-capitulos";

// ─── Constants ────────────────────────────────────────────────────────────────

type Step = "config" | "capitulos" | "processing" | "preview";

// Map genre → template (sugestão inicial; o autor pode alterar na UI)
function suggestTemplate(genero: string | null): TemplateId {
  const g = (genero ?? "").toLowerCase();
  if (g.includes("romance") || g.includes("ficção") || g.includes("conto") || g.includes("suspense") || g.includes("fantasia")) return "literario";
  if (g.includes("autoajuda") || g.includes("negócio") || g.includes("empreend") || g.includes("biografi") || g.includes("memória")) return "nao_ficcao";
  if (g.includes("acadêm") || g.includes("técnico") || g.includes("abnt") || g.includes("científ")) return "abnt";
  if (g.includes("infantil")) return "infantil";
  if (g.includes("jovem") || g.includes("ya") || g.includes("juvenil")) return "juvenil";
  if (g.includes("poesia")) return "poesia";
  if (g.includes("teatro") || g.includes("dramaturgi")) return "teatro";
  if (g.includes("religi") || g.includes("espirit") || g.includes("devoci")) return "religioso";
  return "literario";
}

const FAMILIA_STYLES: Record<
  TemplateOption["familia"],
  { bg: string; text: string; label: string }
> = {
  literaria:        { bg: "bg-blue-50",   text: "text-blue-700",   label: "Literária" },
  nao_ficcao:       { bg: "bg-amber-50",  text: "text-amber-700",  label: "Não-Ficção" },
  poesia_teatro:    { bg: "bg-purple-50", text: "text-purple-700", label: "Poesia/Teatro" },
  infantil_juvenil: { bg: "bg-green-50",  text: "text-green-700",  label: "Inf./Juvenil" },
  espiritual:       { bg: "bg-rose-50",   text: "text-rose-700",   label: "Espiritual" },
};

const fontePrimariaPorTemplate: Record<TemplateId, string> = {
  literario:         "EB Garamond",
  literario_moderno: "Spectral",
  memorial:          "Source Serif 4",
  nao_ficcao:        "Source Serif 4",
  academico:         "Crimson Pro",
  abnt:              "Times New Roman",
  poesia:            "Crimson Text",
  teatro:            "Crimson Text",
  infantil:          "Andika",
  juvenil:           "Lora",
  religioso:         "Gentium Book Plus",
};

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
  const [caracteresTotal, setCaracteresTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("config");
  const [miolo, setMiolo] = useState<MioloResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [currentCapIdx, setCurrentCapIdx] = useState(0);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingPdfDigital, setDownloadingPdfDigital] = useState(false);
  const [docxModalOpen, setDocxModalOpen] = useState(false);

  // ── Config form state ───────────────────────────────────────────────────────
  const [template, setTemplate] = useState<TemplateId>("literario");
  const [formato, setFormato] = useState<FormatoLivro>("padrao_br");
  const [corpoPt, setCorpoPt] = useState<number>(getDefaultCorpoPt("literario"));
  const [sumario, setSumario] = useState(getDefaultSumario("literario"));
  const [temCapitulos, setTemCapitulos] = useState(true);
  const [dedicatoria, setDedicatoria] = useState("");
  const [epigrafeTexto, setEpigrafeTexto] = useState("");
  const [epigrafeAutor, setEpigrafeAutor] = useState("");
  const [bioAutor, setBioAutor] = useState("");
  // ── Processing state ────────────────────────────────────────────────────────
  const [processingMsg, setProcessingMsg] = useState(PROCESSING_MSGS[0]);
  const [processingPct, setProcessingPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Capitulos state ─────────────────────────────────────────────────────────
  interface CandidatoCapitulo {
    id: string; titulo: string; pos: number;
    origem: "marcador_explicito" | "marcador_divisor" | "secao_nomeada" | "markdown_heading" | "all_caps_isolado" | "numero_isolado";
    score: number; sugerido: boolean;
    preview_antes: string; preview_depois: string;
    palavras_no_segmento: number; motivo_descartado?: string;
  }
  const [candidatos, setCandidatos] = useState<CandidatoCapitulo[]>([]);
  const [loadingCandidatos, setLoadingCandidatos] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<MioloConfig | null>(null);
  interface StatusAprovacao { aprovado: boolean; total: number; hash_valido: boolean; }
  const [statusAprovacao, setStatusAprovacao] = useState<StatusAprovacao | null>(null);

  // ── Upload state ────────────────────────────────────────────────────────────
  const [uploadStatus, setUploadStatus] = useState<"idle" | "parsing" | "processing">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Capítulos aprovados (lista para exibição) ────────────────────────────────
  const [capitulosList, setCapitulosList] = useState<{ titulo: string; pos: number }[] | null>(null);

  // ── Lombada divergence state ─────────────────────────────────────────────────
  const [dadosCapa, setDadosCapa] = useState<{ lombada_mm?: number; lombada_mm_na_validacao?: number; modo?: string } | null>(null);
  const [lombadaAjusteDisponivel, setLombadaAjusteDisponivel] = useState<{ anterior: number; nova: number; diff: number } | null>(null);
  const [lombadaUploadAvisoAtivo, setLombadaUploadAvisoAtivo] = useState<{ anterior: number; nova: number; diff: number } | null>(null);
  const [ajustando, setAjustando] = useState(false);

  // ── PDF sync state (auto-chain após gerar miolo) ────────────────────────────
  // Sincroniza dados_pdf.storage_path silenciosamente após diagramação, para
  // que a etapa Prova encontre o PDF gráfico pronto sem precisar gerá-lo lá.
  const [syncingPdf, setSyncingPdf] = useState(false);
  const [syncPdfError, setSyncPdfError] = useState<string | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_miolo, dados_capa, manuscripts(nome, titulo, texto, genero_principal, capitulos_aprovados)")
      .eq("id", projectId)
      .single();

    if (project) {
      const ms = project.manuscripts as unknown as {
        nome?: string; titulo?: string | null; texto?: string; genero_principal?: string;
        capitulos_aprovados?: { titulo: string; pos: number }[] | null;
      } | null;
      const g = ms?.genero_principal ?? null;
      setGenero(g);
      setManuscritoNome((ms?.titulo?.trim()) || ms?.nome || "Manuscrito");
      const wc = ms?.texto?.split(/\s+/).filter(Boolean).length ?? 0;
      setPalavrasTotal(wc);
      setCaracteresTotal(ms?.texto?.length ?? 0);

      if (ms?.capitulos_aprovados && ms.capitulos_aprovados.length > 0) {
        setCapitulosList([...ms.capitulos_aprovados].sort((a, b) => a.pos - b.pos));
      }

      // Pre-select template from genre
      const suggestedTemplate = suggestTemplate(g);
      setTemplate(suggestedTemplate);

      const capaData = project.dados_capa as { lombada_mm?: number; lombada_mm_na_validacao?: number; modo?: string } | null;
      setDadosCapa(capaData);
      const [fmtRes, aprRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/formato`).then(r => r.ok ? r.json() : null),
        fetch(`/api/agentes/miolo/aprovar-capitulos?project_id=${projectId}`)
          .then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (fmtRes?.formato) setFormato(fmtRes.formato as FormatoLivro);
      if (aprRes) {
        setStatusAprovacao({
          aprovado: !!aprRes.aprovado,
          total: aprRes.total ?? 0,
          hash_valido: !!aprRes.hash_valido,
        });
      }

      // If already generated, show preview directly
      const existingMiolo = project.dados_miolo as MioloResult | null;
      // Restaurar configuração salva
      const existingConfig = (project.dados_miolo as { config?: { corpo_pt?: unknown; sumario?: unknown; tem_capitulos?: unknown } } | null)?.config;
      // formato já foi resolvido acima via fmtRes (linha 197)
      const formatoResolvido = (fmtRes && (fmtRes as { formato: FormatoLivro | null }).formato) ?? formato;
      if (existingConfig) {
        const savedCorpoPt = clampCorpoPt(existingConfig.corpo_pt);
        if (savedCorpoPt !== undefined) setCorpoPt(savedCorpoPt);
        else setCorpoPt(getDefaultCorpoPt(suggestedTemplate, formatoResolvido));
        if (typeof existingConfig.sumario === "boolean") setSumario(existingConfig.sumario);
        if (existingConfig.tem_capitulos === false) setTemCapitulos(false);
      } else {
        setCorpoPt(getDefaultCorpoPt(suggestedTemplate, formatoResolvido));
      }

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

  async function abrirTelaAprovacao() {
    setStep("capitulos");
    setLoadingCandidatos(true);
    try {
      const res = await fetch("/api/agentes/miolo/propor-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json() as { candidatos?: CandidatoCapitulo[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Erro ao detectar capítulos");
        setStep("config");
        return;
      }
      setCandidatos(data.candidatos ?? []);
    } catch {
      setError("Erro de rede ao detectar capítulos");
      setStep("config");
    } finally {
      setLoadingCandidatos(false);
    }
  }

  async function executarGeracaoMiolo(cfg: MioloConfig) {
    setError(null);
    setStep("processing");
    setProcessingPct(0);

    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, PROCESSING_MSGS.length - 1);
      setProcessingMsg(PROCESSING_MSGS[msgIdx]);
      setProcessingPct(Math.min(95, Math.round((msgIdx / (PROCESSING_MSGS.length - 1)) * 95)));
    }, 2500);

    try {
      const res = await fetch("/api/agentes/miolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, config: cfg }),
      });
      const data = await res.json() as {
        ok?: boolean; miolo?: MioloResult; preview_url?: string;
        html?: string; error?: string; action?: string; reason?: string;
      };

      // 422 com action=approve_chapters → forçar re-aprovação
      if (!res.ok && data.action === "approve_chapters") {
        const motivo = data.reason === "text_changed"
          ? "O texto do manuscrito mudou. Confirme os capítulos novamente."
          : "Aprove os capítulos antes de gerar o miolo.";
        setError(motivo);
        setStatusAprovacao({ aprovado: false, total: 0, hash_valido: false });
        await abrirTelaAprovacao();
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Erro ao gerar miolo.");
        setStep("config");
        return;
      }

      setProcessingPct(100);
      setMiolo(data.miolo!);

      // Check lombada divergence
      const lombadaMiolo = data.miolo!.lombada_mm;
      if (dadosCapa?.modo === "ia" && dadosCapa?.lombada_mm) {
        const diff = Math.abs(dadosCapa.lombada_mm - lombadaMiolo);
        setLombadaAjusteDisponivel(diff > LIMITE_DIVERGENCIA_LOMBADA_MM ? { anterior: dadosCapa.lombada_mm, nova: lombadaMiolo, diff } : null);
      } else if (dadosCapa?.modo === "upload" && dadosCapa?.lombada_mm_na_validacao) {
        const diff = Math.abs(dadosCapa.lombada_mm_na_validacao - lombadaMiolo);
        setLombadaUploadAvisoAtivo(diff > LIMITE_DIVERGENCIA_LOMBADA_MM ? { anterior: dadosCapa.lombada_mm_na_validacao, nova: lombadaMiolo, diff } : null);
      }

      if (data.html) {
        const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
        setPreviewUrl(URL.createObjectURL(blob));
        setHtmlContent(data.html);
      } else {
        setPreviewUrl(data.preview_url ?? null);
      }
      setCurrentCapIdx(0);
      setTimeout(() => setStep("preview"), 400);
      void syncPdfMiolo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStep("config");
    } finally {
      clearInterval(interval);
    }
  }

  // Chama /api/agentes/gerar-pdf sem bloquear o autor. Garante que quando
  // ele chegar na Prova, dados_pdf.storage_path já esteja populado — evita
  // que a Prova precise gerar o PDF gráfico ela mesma.
  async function syncPdfMiolo() {
    setSyncingPdf(true);
    setSyncPdfError(null);
    try {
      const res = await fetch("/api/agentes/gerar-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setSyncPdfError(e instanceof Error ? e.message : "Falha ao sincronizar PDF.");
    } finally {
      setSyncingPdf(false);
    }
  }

  async function handleGenerate() {
    const config: MioloConfig = {
      template, formato, corpo_pt: corpoPt,
      tem_capitulos: temCapitulos,
      sumario: temCapitulos ? sumario : false,
      dedicatoria, epigrafe_texto: epigrafeTexto,
      epigrafe_autor: epigrafeAutor, bio_autor: bioAutor,
    };
    setError(null);
    setPendingConfig(config);

    // Livro sem capítulos pula aprovação inteiramente
    if (!temCapitulos) {
      return executarGeracaoMiolo(config);
    }

    // Atalho: aprovação válida (hash bate) → pula tela de aprovação
    if (statusAprovacao?.aprovado && statusAprovacao?.hash_valido) {
      return executarGeracaoMiolo(config);
    }

    // Caminho longo: mostra tela de aprovação primeiro
    await abrirTelaAprovacao();
  }

  async function handleConfirmCapitulos(aprovados: { titulo: string; pos: number }[]) {
    if (!pendingConfig) return;
    setError(null);

    try {
      // 1. Salvar capítulos aprovados (com hash)
      const resApr = await fetch("/api/agentes/miolo/aprovar-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, capitulos_aprovados: aprovados }),
      });
      if (!resApr.ok) {
        const d = await resApr.json() as { error?: string };
        setError(d.error ?? "Erro ao salvar capítulos aprovados");
        return;
      }

      // 2. Atualizar status local (aprovação fresca, hash válido)
      setStatusAprovacao({ aprovado: true, total: aprovados.length, hash_valido: true });

      // 3. Gerar o miolo
      await executarGeracaoMiolo(pendingConfig);
    } catch {
      setError("Erro de rede ao salvar aprovação");
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

  async function downloadPdf() {
    if (!miolo) return;
    setDownloadingPdf(true);
    setError(null);
    try {
      // Servidor gera PDF via Puppeteer + Sparticuz Chromium, respeitando CSS Paged Media completo.
      // Demora 10-30s. Retorna signed URL do Supabase Storage com PDF binário.
      const res = await fetch("/api/agentes/gerar-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      // Defesa contra retorno não-JSON (rota quebrada retorna HTML do Vercel).
      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Servidor retornou ${ctype || "resposta desconhecida"} (status ${res.status}). Resposta: ${text.slice(0, 200)}`);
      }

      const data = await res.json() as { url_download?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status} ao gerar PDF`);
      if (!data.url_download) throw new Error("URL de download não retornada pelo servidor");

      // Download via blob: força salvar como arquivo PDF, não abre no Chrome.
      const pdfRes = await fetch(data.url_download);
      if (!pdfRes.ok) throw new Error(`Falha ao baixar PDF do Storage (${pdfRes.status})`);

      const pdfCtype = pdfRes.headers.get("content-type") ?? "";
      if (!pdfCtype.includes("pdf")) {
        throw new Error(`Storage retornou ${pdfCtype}, esperado PDF. Geração falhou silenciosamente no servidor.`);
      }

      const blob = await pdfRes.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 5_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function downloadPdfDigital() {
    if (!miolo) return;
    setDownloadingPdfDigital(true);
    setError(null);
    try {
      const res = await fetch("/api/agentes/gerar-pdf-digital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      const ctype = res.headers.get("content-type") ?? "";
      if (!ctype.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Servidor retornou ${ctype || "resposta desconhecida"} (status ${res.status}). Resposta: ${text.slice(0, 200)}`);
      }

      const data = await res.json() as { url_download?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status} ao gerar PDF digital`);
      if (!data.url_download) throw new Error("URL de download não retornada pelo servidor");

      const pdfRes = await fetch(data.url_download);
      if (!pdfRes.ok) throw new Error(`Falha ao baixar PDF do Storage (${pdfRes.status})`);

      const pdfCtype = pdfRes.headers.get("content-type") ?? "";
      if (!pdfCtype.includes("pdf")) {
        throw new Error(`Storage retornou ${pdfCtype}, esperado PDF. Geração falhou silenciosamente no servidor.`);
      }

      const blob = await pdfRes.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${safeName}_digital.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 5_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar PDF digital");
    } finally {
      setDownloadingPdfDigital(false);
    }
  }

  function handleDocxClick() {
    const seen = typeof window !== "undefined"
      && localStorage.getItem("autoria:docx-disclaimer-seen-v1") === "true";
    if (seen) {
      performDocxDownload();
    } else {
      setDocxModalOpen(true);
    }
  }

  async function performDocxDownload() {
    setDownloadingDocx(true);
    try {
      const res = await fetch("/api/agentes/gerar-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) throw new Error("Falha ao gerar DOCX");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingDocx(false);
    }
  }

  function handleDocxConfirm(dontShowAgain: boolean) {
    if (dontShowAgain) {
      localStorage.setItem("autoria:docx-disclaimer-seen-v1", "true");
    }
    setDocxModalOpen(false);
    performDocxDownload();
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

  const selectedTemplate = TEMPLATE_OPTIONS.find(t => t.value === template);
  const selectedFormato = FORMATOS_LIVRO.find(f => f.value === formato);

  const paginasEst = (caracteresTotal > 0 && selectedFormato)
    ? estimarPaginas(selectedFormato.specs, corpoPt, caracteresTotal)
    : null;

  function handleTemplateChange(novo: TemplateId) {
    setTemplate(novo);
    setCorpoPt(getDefaultCorpoPt(novo, formato));
    setSumario(getDefaultSumario(novo));
  }

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
        <main className="max-w-3xl mx-auto px-4 pt-10 pb-36">
          {error && (
            <div className="mb-5 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">{error}</div>
          )}
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
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {TEMPLATE_OPTIONS.map(t => {
                const fam = FAMILIA_STYLES[t.familia];
                return (
                  <RadioCard key={t.value} selected={template === t.value} onClick={() => handleTemplateChange(t.value)}>
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${fam.bg} ${fam.text} mb-1.5`}>
                      {fam.label}
                    </span>
                    <p className={`text-sm font-semibold leading-tight ${template === t.value ? "text-brand-primary" : "text-zinc-800"}`}>
                      {t.label}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">{fontePrimariaPorTemplate[t.value]}</p>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t.descricao}</p>
                  </RadioCard>
                );
              })}
            </div>
          </section>

          {/* Formato + tamanho de fonte — 2 colunas */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-5">
            <div className="grid grid-cols-2 gap-6">
              {/* Formato — display puro, imutável após etapa de Elementos */}
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Formato do livro
                </div>
                <div className="font-heading text-base text-zinc-900 mb-1 leading-tight">
                  {selectedFormato?.label} · {selectedFormato?.dimensoes}
                </div>
                {paginasEst && (
                  <div className="text-[12px] text-zinc-500 mb-2">
                    ~{paginasEst} páginas · {palavrasTotal.toLocaleString("pt-BR")} palavras
                  </div>
                )}
                <div className="text-[11px] text-zinc-400 italic">
                  Definido na etapa de Elementos editoriais. Para alterar, é necessário refazer essa etapa.
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Tamanho da fonte</label>
                  <span className="text-sm font-mono text-zinc-600">{corpoPt} pt</span>
                </div>
                <input
                  type="range"
                  min={9}
                  max={14}
                  step={0.5}
                  value={corpoPt}
                  onChange={e => setCorpoPt(Number(e.target.value))}
                  className="w-full"
                />
                <p className="text-[11px] text-zinc-400 mt-1">Recomendado: {getDefaultCorpoPt(template, formato)} pt</p>
              </div>
            </div>
          </section>

          {/* Estrutura do livro */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Estrutura do livro</h2>
            <div className="space-y-5">
              {/* tem_capitulos */}
              <div>
                <p className="text-sm font-medium text-zinc-700 mb-1">O livro tem capítulos?</p>
                <p className="text-xs text-zinc-400 mb-3">Desative para poesia, contos únicos ou textos corridos sem divisão em capítulos.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTemCapitulos(true)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-all ${temCapitulos ? "border-brand-primary bg-brand-primary/5 text-brand-primary font-medium" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}
                  >Sim</button>
                  <button
                    type="button"
                    onClick={() => setTemCapitulos(false)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-all ${!temCapitulos ? "border-brand-primary bg-brand-primary/5 text-brand-primary font-medium" : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}
                  >Não</button>
                </div>
              </div>

              {/* sumário */}
              <label className={`flex items-center gap-3 ${temCapitulos ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}>
                <div
                  onClick={() => { if (temCapitulos) setSumario(v => !v); }}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 shrink-0 ${sumario && temCapitulos ? "bg-brand-primary" : "bg-zinc-200"}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${sumario && temCapitulos ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-700">Gerar sumário automático</p>
                  <p className="text-xs text-zinc-400">
                    {temCapitulos ? "Montado com os capítulos aprovados e numeração de páginas real." : "Indisponível para livros sem capítulos."}
                  </p>
                </div>
              </label>
            </div>
          </section>

          {/* Capítulos aprovados — card próprio com acesso à edição */}
          {temCapitulos && statusAprovacao?.aprovado && capitulosList && capitulosList.length > 0 && (
            <section className="bg-white rounded-2xl border border-zinc-100 p-5 mb-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                    Capítulos do livro
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 flex-shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-emerald-700">
                      <strong>{capitulosList.length} capítulos</strong>
                      {statusAprovacao.hash_valido ? " aprovados" : " — texto mudou, reconfirmação necessária"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={abrirTelaAprovacao}
                  className="text-[12px] font-medium text-zinc-600 hover:text-zinc-900 hover:underline underline-offset-4 whitespace-nowrap transition-colors"
                >
                  Editar capítulos →
                </button>
              </div>
              <ul className="space-y-1 text-[12px] text-zinc-600">
                {capitulosList.slice(0, 6).map((cap, idx) => (
                  <li key={idx} className="flex items-baseline gap-2">
                    <span className="font-mono text-zinc-400 text-[10px] w-4 text-right shrink-0">{idx + 1}.</span>
                    <span className="truncate">{cap.titulo}</span>
                  </li>
                ))}
                {capitulosList.length > 6 && (
                  <li className="text-[11px] text-zinc-400 italic pl-6">
                    + {capitulosList.length - 6} capítulo{capitulosList.length - 6 > 1 ? "s" : ""} restante{capitulosList.length - 6 > 1 ? "s" : ""}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Elementos pré e pós-textuais — sempre visíveis */}
          <section className="bg-white rounded-2xl border border-zinc-100 p-6 mb-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Elementos pré e pós-textuais</h2>
            <div className="space-y-4">
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
          </section>

          {/* Sticky action bar — apenas o botão */}
          <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-zinc-100 px-4 py-4 z-20">
            <div className="max-w-3xl mx-auto">
              <button
                onClick={handleGenerate}
                className="w-full bg-brand-primary text-brand-surface py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all"
              >
                Iniciar diagramação →
              </button>
              <p className="text-center text-xs text-zinc-400 mt-2">
                Leva {(paginasEst ?? 0) > 200 ? "60–90" : "30–60"} segundos.
              </p>
            </div>
          </div>
        </main>

      ) : step === "capitulos" ? (
        /* ── CAPITULOS ── */
        <main className="mx-auto max-w-4xl px-6 py-8">
          {error && (
            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          )}
          {loadingCandidatos ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
              <p className="mt-4 text-sm text-zinc-500">Detectando capítulos no manuscrito...</p>
            </div>
          ) : (
            <AprovacaoCapitulos
              candidatos={candidatos}
              onConfirmar={handleConfirmCapitulos}
              onVoltar={() => setStep("config")}
            />
          )}
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
              Template: <strong>{TEMPLATE_OPTIONS.find(t => t.value === template)?.label}</strong> ·
              Formato: <strong>{FORMATOS_LIVRO.find(f => f.value === formato)?.label}</strong> ·
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
                {miolo?.capitulos.length ?? 0} cap. · {miolo?.palavras?.toLocaleString("pt-BR")} palavras
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
                <p className="text-blue-600">Formato: <strong>{selectedFormato?.dimensoes}</strong></p>
                <p className="text-blue-600">Template: <strong>{selectedTemplate?.label}</strong></p>
                <p className="text-blue-600">Capítulos: <strong>{miolo?.capitulos.length}</strong></p>
                {miolo?.paginas_reais != null ? (
                  <>
                    <p className="text-blue-600">Páginas: <strong>{miolo.paginas_reais}</strong></p>
                    {miolo?.lombada_mm && (
                      <p className="text-blue-600">Lombada: <strong>{miolo.lombada_mm}mm</strong></p>
                    )}
                  </>
                ) : (
                  <p className="text-blue-400 italic mt-1">Páginas e lombada disponíveis após gerar o PDF.</p>
                )}
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
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">📋 No PDF baixado, verifique:</p>
                <ul className="space-y-1.5 text-xs text-zinc-600">
                  <li>• Folheie o livro até o final</li>
                  <li>• Margens e tipografia</li>
                  <li>• Títulos de capítulos</li>
                  <li>• Dedicatória e epígrafe</li>
                  <li>• Marcas de corte (se ativadas)</li>
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
                <button
                  onClick={() => {
                    setPendingConfig({
                      template, formato, corpo_pt: corpoPt,
                      sumario,
                      dedicatoria, epigrafe_texto: epigrafeTexto,
                      epigrafe_autor: epigrafeAutor, bio_autor: bioAutor,
                    });
                    abrirTelaAprovacao();
                  }}
                  className="w-full text-xs border border-zinc-200 rounded-lg px-3 py-2 text-zinc-500 hover:border-zinc-300 transition-colors"
                >
                  ✎ Editar capítulos
                </button>
                {uploadError && <p className="text-red-500 text-[10px]">{uploadError}</p>}
              </div>
            </div>

            {/* Right "page" — download card (substitui iframe preview) */}
            <div
              className="bg-white shadow-xl flex-1 flex flex-col items-center justify-center overflow-hidden p-8 sm:p-12"
              style={{ margin: "24px 24px 24px 0", borderRadius: "0 4px 4px 0" }}
            >
              <div className="max-w-xl w-full">
                {/* Cabeçalho */}
                <div className="text-center mb-8">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-white border border-zinc-200 flex items-center justify-center">
                    <BookOpen className="w-7 h-7 text-brand-primary" strokeWidth={1.5} />
                  </div>
                  <h2 className="font-heading text-2xl sm:text-3xl text-brand-primary mb-2">
                    Seu livro está pronto
                  </h2>
                  <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
                    Quatro formatos para quatro propósitos: imprimir, vender online, editar e ler em e-reader.
                  </p>
                </div>

                {/* Grupo 1 — Para publicar */}
                <p className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 mb-2.5">
                  Para publicar
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                  {/* PDF Impressão — protagonista (dark) */}
                  <button
                    onClick={downloadPdf}
                    disabled={!htmlContent || downloadingPdf}
                    className="group bg-brand-primary border border-brand-primary rounded-xl p-4 text-left transition-all hover:bg-[#2a2a4e] disabled:opacity-50 disabled:cursor-not-allowed"
                    title="PDF com sangria de 3mm e marcas de corte — formato exigido por gráficas para impressão profissional"
                  >
                    <div className="flex items-center justify-between mb-3">
                      {downloadingPdf ? (
                        <span className="inline-block w-[22px] h-[22px] rounded-full border-2 border-brand-gold/40 border-t-brand-gold animate-spin" />
                      ) : (
                        <Printer className="w-[22px] h-[22px] text-brand-gold" strokeWidth={1.75} />
                      )}
                      <Download className="w-4 h-4 text-brand-gold/50" strokeWidth={1.75} />
                    </div>
                    <p className="text-sm font-semibold text-brand-gold mb-1">
                      {downloadingPdf ? "Gerando…" : "PDF Impressão"}
                    </p>
                    <p className="text-xs text-brand-gold/60 leading-snug">
                      Com sangria e marcas de corte. Para gráficas.
                    </p>
                  </button>

                  {/* PDF Digital — secundário (branco) */}
                  <button
                    onClick={downloadPdfDigital}
                    disabled={!htmlContent || downloadingPdfDigital}
                    className="group bg-white border border-zinc-200 rounded-xl p-4 text-left transition-all hover:border-brand-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    title="PDF sem sangria e sem marcas de corte — formato exigido pelas plataformas digitais (Amazon KDP, Apple Books, Google Play Books, Kobo)"
                  >
                    <div className="flex items-center justify-between mb-3">
                      {downloadingPdfDigital ? (
                        <span className="inline-block w-[22px] h-[22px] rounded-full border-2 border-brand-gold/40 border-t-brand-gold animate-spin" />
                      ) : (
                        <Laptop className="w-[22px] h-[22px] text-brand-gold" strokeWidth={1.75} />
                      )}
                      <Download className="w-4 h-4 text-zinc-300" strokeWidth={1.75} />
                    </div>
                    <p className="text-sm font-semibold text-brand-primary mb-1">
                      {downloadingPdfDigital ? "Gerando…" : "PDF Digital"}
                    </p>
                    <p className="text-xs text-zinc-500 leading-snug">
                      Sem marcas. Para Amazon, Apple, Kobo.
                    </p>
                  </button>
                </div>

                {/* Grupo 2 — Para editar e ler */}
                <p className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400 mb-2.5">
                  Para editar e ler
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
                  {/* DOCX — terciário, com ressalva */}
                  <button
                    onClick={handleDocxClick}
                    disabled={!miolo || downloadingDocx}
                    className="border border-zinc-200 rounded-lg px-4 py-3 text-left transition-all hover:border-zinc-400 disabled:opacity-40 flex items-center gap-2.5"
                    title="Para revisar e editar o texto. O PDF é a versão fiel da diagramação."
                  >
                    <FileText className="w-5 h-5 text-zinc-400 flex-shrink-0" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-brand-primary leading-tight">
                        {downloadingDocx ? "Gerando…" : "DOCX"}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-tight truncate">
                        Editar texto · layout aproximado
                      </p>
                    </div>
                  </button>

                  {/* EPUB — terciário */}
                  <button
                    onClick={handleEpub}
                    className="border border-zinc-200 rounded-lg px-4 py-3 text-left transition-all hover:border-violet-400 flex items-center gap-2.5"
                    title="Formato para leitura em e-readers (Kindle, Kobo, Apple Books)"
                  >
                    <BookOpen className="w-5 h-5 text-violet-400 flex-shrink-0" strokeWidth={1.5} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-brand-primary leading-tight">EPUB</p>
                      <p className="text-[11px] text-zinc-400 leading-tight truncate">
                        Leitura em e-reader
                      </p>
                    </div>
                  </button>
                </div>

                {/* Mensagem de verificação */}
                <div className="flex gap-2.5 items-start px-4 py-3 bg-white rounded-lg border border-zinc-200">
                  <Info className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Abra o arquivo baixado e confira margens, tipografia, títulos de capítulos, dedicatória e epígrafe.
                    Se algo não estiver como esperado, ajuste no painel ao lado e baixe novamente.
                  </p>
                </div>

                {/* Erro */}
                {error && (
                  <div className="mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                    {error}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lombada divergence — IA cover: offer auto-adjust */}
          {lombadaAjusteDisponivel && (
            <div className="mx-6 mt-4 p-5 bg-amber-50 border border-amber-200 rounded-2xl">
              <h3 className="font-semibold text-amber-900 text-sm mb-2">
                Lombada da capa precisa de ajuste
              </h3>
              <p className="text-xs text-amber-800 leading-relaxed mb-4">
                O miolo final ficou com <strong>{lombadaAjusteDisponivel.nova}mm</strong> de lombada, mas sua capa foi gerada
                com <strong>{lombadaAjusteDisponivel.anterior}mm</strong> (diferença
                de {lombadaAjusteDisponivel.diff.toFixed(1)}mm). Posso ajustar automaticamente — regenero só a lombada
                e recomponho a capa, sem custo de créditos.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setAjustando(true);
                    try {
                      const res = await fetch("/api/agentes/ajustar-lombada", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ project_id: projectId }),
                      });
                      if (res.ok) {
                        setLombadaAjusteDisponivel(null);
                        await loadData();
                      }
                    } finally {
                      setAjustando(false);
                    }
                  }}
                  disabled={ajustando}
                  className="px-4 py-2 bg-amber-700 text-white rounded-lg text-xs font-medium hover:bg-amber-800 transition-colors disabled:opacity-50"
                >
                  {ajustando ? "Ajustando…" : "Ajustar automaticamente"}
                </button>
                <button
                  onClick={() => setLombadaAjusteDisponivel(null)}
                  className="px-4 py-2 bg-transparent text-amber-800 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )}

          {/* Lombada divergence — upload cover: must re-upload */}
          {lombadaUploadAvisoAtivo && (
            <div className="mx-6 mt-4 p-5 bg-red-50 border border-red-200 rounded-2xl">
              <h3 className="font-semibold text-red-900 text-sm mb-2">
                Capa enviada por upload está fora de medida
              </h3>
              <p className="text-xs text-red-800 leading-relaxed mb-4">
                O miolo final ficou com <strong>{lombadaUploadAvisoAtivo.nova}mm</strong> de lombada, mas sua capa enviada
                foi calibrada para <strong>{lombadaUploadAvisoAtivo.anterior}mm</strong> (diferença
                de {lombadaUploadAvisoAtivo.diff.toFixed(1)}mm). Como você enviou a capa pronta, é necessário refazer
                o upload com a lombada correta.
              </p>
              <div className="flex gap-2">
                <a
                  href={`/dashboard/capa/${projectId}`}
                  className="inline-block px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-medium hover:bg-red-800 transition-colors"
                >
                  Refazer upload da capa
                </a>
                <button
                  onClick={() => setLombadaUploadAvisoAtivo(null)}
                  className="px-4 py-2 bg-transparent text-red-800 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                >
                  Ignorar
                </button>
              </div>
            </div>
          )}

          {/* Bottom CTA bar — apenas avançar para próxima etapa */}
          <div className="bg-white border-t border-zinc-100 px-6 py-4 flex items-center justify-end gap-4 flex-wrap">
            {syncingPdf ? (
              <p className="text-zinc-400 text-xs hidden sm:flex items-center gap-2">
                <span className="w-3 h-3 rounded-full border-2 border-zinc-300 border-t-transparent animate-spin" />
                Preparando PDF gráfico em background…
              </p>
            ) : syncPdfError ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-amber-700">PDF gráfico não sincronizou.</span>
                <button
                  onClick={syncPdfMiolo}
                  className="text-brand-gold underline hover:text-brand-gold/80"
                >
                  Tentar novamente
                </button>
              </div>
            ) : (
              <p className="text-zinc-400 text-xs hidden sm:block">Próxima etapa: Prova final.</p>
            )}
            <button
              onClick={async () => {
                await supabase.from("projects").update({ etapa_atual: "preview" }).eq("id", projectId);
                router.push(`/dashboard/prova/${projectId}`);
              }}
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-3 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all whitespace-nowrap"
            >
              Continuar para Prova →
            </button>
          </div>
        </main>
      )}

      <DocxDisclaimer
        open={docxModalOpen}
        onClose={() => setDocxModalOpen(false)}
        onConfirm={handleDocxConfirm}
      />
    </div>
  );
}

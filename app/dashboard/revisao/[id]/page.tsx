"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { EtapasProgress } from "@/components/etapas-progress";
import type { SugestaoRevisao, RevisaoResult, RevisaoProcessingState } from "@/app/api/agentes/revisao/route";
import { supabase } from "@/lib/supabase";

// ─── Tipo labels ──────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<SugestaoRevisao["tipo"], { label: string; color: string; bg: string }> = {
  ortografia:  { label: "Ortografia",   color: "text-orange-700", bg: "bg-orange-50 border-orange-200"  },
  gramatica:   { label: "Gramática",    color: "text-red-700",    bg: "bg-red-50 border-red-200"         },
  coesao:      { label: "Coesão",       color: "text-blue-700",   bg: "bg-blue-50 border-blue-200"       },
  consistencia:{ label: "Consistência", color: "text-violet-700", bg: "bg-violet-50 border-violet-200"   },
  ritmo:       { label: "Ritmo",        color: "text-teal-700",   bg: "bg-teal-50 border-teal-200"       },
};

const SEVERIDADE_LABEL: Record<SugestaoRevisao["severidade"], { label: string; dot: string }> = {
  critico:     { label: "Crítico",     dot: "bg-red-500"    },
  recomendado: { label: "Recomendado", dot: "bg-amber-400"  },
  opcional:    { label: "Opcional",    dot: "bg-zinc-300"   },
};

// ─── DOCX builder (via JSZip) ─────────────────────────────────────────────────

async function buildDocxBlob(text: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const paragraphs = text
    .split(/\r?\n/)
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`)
    .join("\n");

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );

  const rels = zip.folder("_rels")!;
  rels.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );

  const word = zip.folder("word")!;
  word.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`
  );
  word.folder("_rels")!.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Apply accepted changes to text ──────────────────────────────────────────

function buildRevisedText(
  originalText: string,
  sugestoes: SugestaoRevisao[],
  aceitas: Set<string>
): string {
  let text = originalText;
  for (const s of sugestoes) {
    if (aceitas.has(s.id)) {
      text = text.replace(s.trecho_original, s.sugestao);
    }
  }
  return text;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SugestaoCard({
  sugestao,
  aceita,
  rejeitada,
  onAceitar,
  onRejeitar,
}: {
  sugestao: SugestaoRevisao;
  aceita: boolean;
  rejeitada: boolean;
  onAceitar: () => void;
  onRejeitar: () => void;
}) {
  const tipo = TIPO_LABEL[sugestao.tipo] ?? TIPO_LABEL.coesao;
  const sev  = SEVERIDADE_LABEL[sugestao.severidade] ?? SEVERIDADE_LABEL.recomendado;
  const { capitulo, paragrafo, linha_aproximada } = sugestao.localizacao ?? {};

  return (
    <div
      className={`rounded-2xl border p-5 transition-all ${
        aceita    ? "border-emerald-200 bg-emerald-50/60"  :
        rejeitada ? "border-zinc-100 bg-zinc-50/60 opacity-50" :
                    "border-zinc-100 bg-white hover:border-zinc-200"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-3 flex-wrap">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${tipo.bg} ${tipo.color}`}>
          {tipo.label}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
          {sev.label}
        </span>
        {capitulo !== undefined && (
          <span className="text-[11px] text-zinc-300 ml-auto">
            Cap.{capitulo} · §{paragrafo} · L.{linha_aproximada}
          </span>
        )}
        {aceita && (
          <span className="text-emerald-600 text-xs font-medium flex items-center gap-1 ml-auto">
            <CheckIcon /> Aceita
          </span>
        )}
        {rejeitada && (
          <span className="text-zinc-400 text-xs ml-auto">Rejeitada</span>
        )}
      </div>

      {/* Diff */}
      <div className="space-y-1.5 mb-3">
        <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2">
          <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wide mb-1">Original</p>
          <p className="text-sm text-red-800 line-through leading-relaxed break-words">
            {sugestao.trecho_original}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wide mb-1">Sugestão</p>
          <p className="text-sm text-emerald-800 leading-relaxed break-words">{sugestao.sugestao}</p>
        </div>
      </div>

      <p className="text-xs text-zinc-500 leading-relaxed mb-1">{sugestao.explicacao}</p>
      {sugestao.referencia_norma && (
        <p className="text-[11px] text-zinc-300 mb-4">Ref.: {sugestao.referencia_norma}</p>
      )}

      {!aceita && !rejeitada ? (
        <div className="flex gap-2">
          <button
            onClick={onAceitar}
            className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors"
          >
            Aceitar
          </button>
          <button
            onClick={onRejeitar}
            className="flex-1 py-2 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-semibold hover:border-zinc-300 hover:text-zinc-700 transition-colors"
          >
            Rejeitar
          </button>
        </div>
      ) : (
        <button
          onClick={aceita ? onRejeitar : onAceitar}
          className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 transition-colors"
        >
          {aceita ? "Desfazer aceitação" : "Aceitar afinal"}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RevisaoPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const newFileRef = useRef<HTMLInputElement>(null);

  const [usarRevisao, setUsarRevisao] = useState<boolean | null>(null);
  const [manuscriptId, setManuscriptId] = useState<string>("");
  const [manuscritoNome, setManuscritoNome] = useState<string>("");
  const [manuscritoTexto, setManuscritoTexto] = useState<string>("");
  const [revisao, setRevisao] = useState<RevisaoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aceitas, setAceitas] = useState<Set<string>>(new Set());
  const [rejeitadas, setRejeitadas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"todas" | "critico" | "recomendado" | "opcional">("todas");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "parsing" | "analyzing">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Progresso do batch: { done, total } enquanto Anthropic processa; null quando inativo
  const [pollProgress, setPollProgress] = useState<{ done: number; total: number } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Polling ───────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearTimeout(pollingRef.current); pollingRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    async function poll() {
      try {
        const res = await fetch(`/api/agentes/revisao?project_id=${projectId}`);
        if (!res.ok) { setError("Erro ao verificar status da revisão."); return; }
        const data = await res.json() as {
          status: string; done?: number; total?: number; revisao?: RevisaoResult;
        };
        if (data.status === "done") {
          setPollProgress(null);
          setRevisao(data.revisao!);
          setAceitas(new Set());
          setRejeitadas(new Set());
        } else if (data.status === "processing") {
          setPollProgress({ done: data.done ?? 0, total: data.total ?? 1 });
          pollingRef.current = setTimeout(poll, 5_000);
        } else {
          setError("Estado inesperado da revisão. Tente novamente.");
        }
      } catch (e) {
        // Retry on network error
        pollingRef.current = setTimeout(poll, 10_000);
        console.warn("[revisao] poll error:", e);
      }
    }
    poll();
  }, [projectId, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const { data: project } = await supabase
      .from("projects")
      .select("usar_revisao, manuscript_id, dados_revisao, manuscripts(nome, texto)")
      .eq("id", projectId)
      .single();

    if (project) {
      setUsarRevisao(project.usar_revisao as boolean | null);
      setManuscriptId((project.manuscript_id as string | null) ?? "");
      const ms = project.manuscripts as unknown as { nome: string; texto: string | null } | null;
      setManuscritoNome(ms?.nome ?? "Manuscrito");
      setManuscritoTexto(ms?.texto ?? "");

      const raw = project.dados_revisao as RevisaoProcessingState | RevisaoResult | null;
      if (raw && (raw as RevisaoProcessingState).status === "processing") {
        // Batch em andamento — retoma polling (ex: usuário recarregou a página)
        const ps = raw as RevisaoProcessingState;
        setPollProgress({ done: 0, total: ps.total_chunks });
      } else if (raw) {
        const rev = raw as RevisaoResult;
        setRevisao(rev);
        if (rev.aceitas) setAceitas(new Set(rev.aceitas));
        if (rev.rejeitadas) setRejeitadas(new Set(rev.rejeitadas));
      }
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Inicia polling automaticamente se loadData detectou um batch em andamento
  useEffect(() => {
    if (!loading && pollProgress !== null && revisao === null) startPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // ── Save progress (called after every aceitar/rejeitar) ───────────────────

  async function saveProgress(newAceitas: Set<string>, newRejeitadas: Set<string>) {
    if (!revisao) return;
    await supabase
      .from("projects")
      .update({
        dados_revisao: {
          ...revisao,
          aceitas: Array.from(newAceitas),
          rejeitadas: Array.from(newRejeitadas),
        },
      })
      .eq("id", projectId);
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function triggerRevisao() {
    setTriggering(true);
    setError(null);
    stopPolling();
    try {
      const res = await fetch("/api/agentes/revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Erro ao iniciar revisão.");
        return;
      }

      const data = await res.json() as { status: string; revisao?: RevisaoResult; total_chunks?: number };

      if (data.status === "done") {
        // Mock ou livro muito curto processado instantaneamente
        setRevisao(data.revisao!);
        setAceitas(new Set());
        setRejeitadas(new Set());
      } else if (data.status === "processing") {
        setPollProgress({ done: 0, total: data.total_chunks ?? 1 });
        startPolling();
      } else {
        setError("Resposta inesperada do servidor.");
      }
    } catch (e: unknown) {
      setError("Erro de conexão: " + (e instanceof Error ? e.message : "tente novamente."));
    } finally {
      setTriggering(false);
    }
  }

  function toggle(id: string, type: "aceitar" | "rejeitar") {
    let newAceitas = new Set(aceitas);
    let newRejeitadas = new Set(rejeitadas);

    if (type === "aceitar") {
      newAceitas.add(id);
      newRejeitadas.delete(id);
    } else {
      newRejeitadas.add(id);
      newAceitas.delete(id);
    }

    setAceitas(newAceitas);
    setRejeitadas(newRejeitadas);
    saveProgress(newAceitas, newRejeitadas);
  }

  function aceitarTodas() {
    if (!revisao) return;
    const all = new Set(sugestoesArr.map((s) => s.id));
    const empty = new Set<string>();
    setAceitas(all);
    setRejeitadas(empty);
    saveProgress(all, empty);
  }

  function rejeitarTodas() {
    if (!revisao) return;
    const empty = new Set<string>();
    const all = new Set(sugestoesArr.map((s) => s.id));
    setAceitas(empty);
    setRejeitadas(all);
    saveProgress(empty, all);
  }

  async function finalizarRevisao() {
    if (!revisao) return;
    setSaving(true);
    try {
      // Save revision choices
      const { error: saveErr } = await supabase
        .from("projects")
        .update({
          dados_revisao: {
            ...revisao,
            aceitas: Array.from(aceitas),
            rejeitadas: Array.from(rejeitadas),
            finalizado_em: new Date().toISOString(),
          },
          etapa_atual: "elementos",
        })
        .eq("id", projectId);

      if (saveErr) throw saveErr;

      // Persist revised text to manuscript so Diagramação uses the corrected version
      await fetch("/api/agentes/prova-revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      router.push(`/dashboard/elementos/${projectId}`);
    } catch {
      setError("Falha ao salvar revisão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function gerarProva() {
    if (!manuscritoTexto) {
      setError("Texto do manuscrito não carregado. Recarregue a página.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const revised = buildRevisedText(manuscritoTexto, sugestoesArr, aceitas);
      const blob = await buildDocxBlob(revised);
      triggerDownload(blob, `${manuscritoNome}_prova_revisao.docx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar prova");
    } finally {
      setSaving(false);
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────

  async function downloadTxt() {
    if (!revisao || !manuscritoTexto) return;
    const revised = buildRevisedText(manuscritoTexto, sugestoesArr, aceitas);
    const blob = new Blob([revised], { type: "text/plain;charset=utf-8" });
    triggerDownload(blob, `${manuscritoNome}_revisado.txt`);
  }

  async function downloadDocx() {
    if (!revisao || !manuscritoTexto) return;
    const revised = buildRevisedText(manuscritoTexto, sugestoesArr, aceitas);
    const blob = await buildDocxBlob(revised);
    triggerDownload(blob, `${manuscritoNome}_revisado.docx`);
  }

  // ── New file upload ──────────────────────────────────────────────────────

  async function handleNewFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    try {
      // Step 1: parse file
      setUploadStatus("parsing");
      const fd = new FormData();
      fd.append("file", file);
      const parseRes = await fetch("/api/ferramentas/parse-file", { method: "POST", body: fd });
      const parseData = await parseRes.json() as { texto?: string; error?: string };
      if (!parseRes.ok) throw new Error(parseData.error ?? "Erro ao processar arquivo.");

      // Step 2: save texto to manuscripts
      if (manuscriptId) {
        await supabase
          .from("manuscripts")
          .update({ texto: parseData.texto })
          .eq("id", manuscriptId);
        setManuscritoTexto(parseData.texto ?? "");
      }

      // Step 3: submete novo batch para o texto actualizado
      setUploadStatus("analyzing");
      const trigRes = await fetch("/api/agentes/revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!trigRes.ok) {
        const d = await trigRes.json() as { error?: string };
        throw new Error(d.error ?? "Erro ao iniciar revisão.");
      }
      const trigData = await trigRes.json() as { status: string; revisao?: RevisaoResult; total_chunks?: number };
      if (trigData.status === "done") {
        setRevisao(trigData.revisao!);
        setAceitas(new Set()); setRejeitadas(new Set());
      } else if (trigData.status === "processing") {
        setPollProgress({ done: 0, total: trigData.total_chunks ?? 1 });
        startPolling();
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setUploadStatus("idle");
      if (newFileRef.current) newFileRef.current.value = "";
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const sugestoesArr: SugestaoRevisao[] = Array.isArray(revisao?.sugestoes) ? revisao!.sugestoes : [];

  const total     = sugestoesArr.length;
  const reviewed  = aceitas.size + rejeitadas.size;
  const pendentes = total - reviewed;
  const canFinish = pendentes === 0;

  const filtradas = sugestoesArr.filter(
    (s) => filtro === "todas" || s.severidade === filtro
  );

  const countBySev = (sev: SugestaoRevisao["severidade"]) =>
    sugestoesArr.filter((s) => s.severidade === sev).length;

  const isUploading = uploadStatus !== "idle";

  // ── Dev mock ──────────────────────────────────────────────────────────────

  const isDev = typeof window !== "undefined" && process.env.NODE_ENV === "development";

  useEffect(() => {
    if (!isDev || !loading) return;
    // In dev with no real data, show mock after loadData finishes
  }, [isDev, loading]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <EtapasProgress currentStep={1} projectId={projectId} />

      <main className="max-w-4xl mx-auto px-4 py-10">
        {loading ? (
          /* Loading */
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mb-4" />
            <p className="text-zinc-400 text-sm">Carregando…</p>
          </div>

        ) : usarRevisao === false ? (
          /* Skipped */
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-6">
              <SkipIcon />
            </div>
            <h1 className="font-heading text-3xl text-brand-primary mb-3">Revisão não selecionada</h1>
            <p className="text-zinc-500 leading-relaxed mb-8">
              Você optou por pular a revisão textual ao criar o projeto. Quando quiser, pode avançar diretamente para os elementos editoriais.
            </p>
            <button
              onClick={() => router.push(`/dashboard/elementos/${projectId}`)}
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all"
            >
              Continuar para Elementos Editoriais →
            </button>
          </div>

        ) : pollProgress !== null ? (
          /* Batch em processamento */
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mx-auto mb-6">
              <span className="w-8 h-8 rounded-full border-4 border-brand-primary border-t-transparent animate-spin" />
            </div>
            <h1 className="font-heading text-3xl text-brand-primary mb-3">Revisão em andamento</h1>
            <p className="text-zinc-500 leading-relaxed mb-6">
              A Autoria está analisando seu manuscrito em paralelo. Você pode fechar esta página — o resultado será salvo automaticamente.
            </p>
            {/* Progress bar */}
            <div className="w-full bg-zinc-100 rounded-full h-2 mb-2">
              <div
                className="bg-brand-primary h-2 rounded-full transition-all duration-500"
                style={{ width: pollProgress.total > 0 ? `${Math.round((pollProgress.done / pollProgress.total) * 100)}%` : "5%" }}
              />
            </div>
            <p className="text-zinc-400 text-sm mb-8">
              {pollProgress.done > 0
                ? `${pollProgress.done} de ${pollProgress.total} partes concluídas`
                : `0 de ${pollProgress.total} partes — aguardando início…`}
            </p>
            {error && (
              <div className="mb-4 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm text-left">
                {error}
              </div>
            )}
          </div>

        ) : !revisao ? (
          /* Not yet run */
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mx-auto mb-6">
              <EditIcon />
            </div>
            <h1 className="font-heading text-3xl text-brand-primary mb-3">Revisão Editorial</h1>
            <p className="text-zinc-500 leading-relaxed mb-2">
              A Autoria irá revisar ortografia, gramática, coesão e consistência narrativa — preservando completamente sua voz como autor.
            </p>
            <p className="text-zinc-400 text-sm mb-8">Todas as sugestões são opcionais. Você decide o que aceitar.</p>
            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm text-left">
                {error}
              </div>
            )}
            <button
              onClick={triggerRevisao}
              disabled={triggering}
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all disabled:opacity-50"
            >
              {triggering ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Enviando para análise…
                </>
              ) : "Iniciar revisão →"}
            </button>
            <p className="text-zinc-400 text-xs mt-4">
              A análise é processada em paralelo pela Anthropic. Manuscritos grandes levam alguns minutos.
            </p>
          </div>

        ) : (
          /* Review UI */
          <>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
              <div>
                <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Revisão completa</p>
                <h1 className="font-heading text-3xl text-brand-primary">{manuscritoNome}</h1>
                <p className="text-zinc-400 text-sm mt-1">
                  {total} sugestões · {aceitas.size} aceitas · {rejeitadas.size} rejeitadas
                  {pendentes > 0 && <span className="text-amber-500"> · {pendentes} pendentes</span>}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  onClick={aceitarTodas}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
                >
                  ✓ Aceitar todas
                </button>
                <button
                  onClick={rejeitarTodas}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
                >
                  ✕ Rejeitar todas
                </button>
                <button
                  onClick={downloadTxt}
                  disabled={!manuscritoTexto}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-40"
                  title="Baixar texto revisado como .txt"
                >
                  ↓ TXT
                </button>
                <button
                  onClick={downloadDocx}
                  disabled={!manuscritoTexto}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-40"
                  title="Baixar texto revisado como .docx"
                >
                  ↓ DOCX
                </button>
                <button
                  onClick={triggerRevisao}
                  disabled={triggering}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-xl text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  {triggering ? "Enviando…" : "↺ Nova análise"}
                </button>
              </div>
            </div>

            {/* Severity filter tabs */}
            <div className="flex gap-1.5 mb-6 flex-wrap">
              {(["todas", "critico", "recomendado", "opcional"] as const).map((f) => {
                const count =
                  f === "todas" ? total :
                  f === "critico" ? countBySev("critico") :
                  f === "recomendado" ? countBySev("recomendado") :
                  countBySev("opcional");
                const labels: Record<typeof f, string> = {
                  todas: "Todas",
                  critico: "Críticas",
                  recomendado: "Recomendadas",
                  opcional: "Opcionais",
                };
                if (f !== "todas" && count === 0) return null;
                return (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      filtro === f
                        ? "bg-brand-primary text-white"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    {labels[f]} ({count})
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-4 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Cards */}
            <div className="grid md:grid-cols-2 gap-4 mb-10">
              {filtradas.map((s) => (
                <SugestaoCard
                  key={s.id}
                  sugestao={s}
                  aceita={aceitas.has(s.id)}
                  rejeitada={rejeitadas.has(s.id)}
                  onAceitar={() => toggle(s.id, "aceitar")}
                  onRejeitar={() => toggle(s.id, "rejeitar")}
                />
              ))}
            </div>

            {/* Bottom CTA bar */}
            <div className="border-t border-zinc-200 pt-6 space-y-4">

              {/* Upload new file */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <input
                  ref={newFileRef}
                  type="file"
                  accept=".docx,.pdf,.txt"
                  className="hidden"
                  onChange={handleNewFile}
                />
                <button
                  onClick={() => newFileRef.current?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-2 text-zinc-500 text-sm border border-zinc-200 px-5 py-2.5 rounded-xl hover:border-zinc-400 hover:text-zinc-700 transition-all disabled:opacity-50"
                >
                  {isUploading && (
                    <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  {uploadStatus === "parsing" ? "Extraindo texto…" :
                   uploadStatus === "analyzing" ? "Re-analisando…" :
                   "↑ Enviar arquivo revisado"}
                </button>
                <span className="text-xs text-zinc-400">Aceita .docx, .pdf ou .txt</span>
                {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
              </div>

              {/* Finalize */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  {!canFinish ? (
                    <p className="text-amber-600 text-sm font-medium">
                      ⚠ {pendentes} sugestão{pendentes !== 1 ? "ões" : ""} ainda não{pendentes !== 1 ? " foram avaliadas" : " foi avaliada"}
                    </p>
                  ) : (
                    <p className="text-emerald-600 text-sm font-medium">
                      ✓ Todas as sugestões foram avaliadas
                    </p>
                  )}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 leading-relaxed">
                  <strong>Nota:</strong> A prova mostra o texto com as revisões aplicadas em formato simples — não representa o layout final diagramado. O PDF definitivo é gerado na etapa de Diagramação.
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={gerarProva}
                    disabled={saving}
                    className="px-5 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-brand-gold/40 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    Ver prova (texto revisado)
                  </button>
                  <button
                    onClick={finalizarRevisao}
                    disabled={saving || !canFinish}
                    title={!canFinish ? `Avalie todas as ${pendentes} sugestões pendentes para continuar` : ""}
                    className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving ? "Salvando…" : "Finalizar revisão →"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 8 16 12 12 16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

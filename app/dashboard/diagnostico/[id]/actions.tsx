"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ProcessingStatus =
  | "idle"
  | "parsing"
  | "starting"
  | "processando_capitulos"
  | "consolidando"
  | "concluido"
  | "erro";

interface PollResponse {
  status: "processando_capitulos" | "consolidando" | "concluido" | "erro" | "ausente";
  progresso?: { atual: number; total: number };
  diagnostico?: unknown;
  erro?: string;
}

export function DiagnosticoActions({
  projectId,
  usarRevisao,
}: {
  projectId: string;
  usarRevisao: boolean | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempoDecorrido, setTempoDecorrido] = useState(0);

  // ─── Polling loop ──────────────────────────────────────────────────────────
  const pollDiagnostico = useCallback(async () => {
    try {
      const res = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });

      const data = await res.json() as PollResponse;

      if (!res.ok) {
        setStatus("erro");
        setError(data.erro ?? `Erro HTTP ${res.status}`);
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        return;
      }

      if (data.progresso) setProgresso(data.progresso);

      if (data.status === "concluido") {
        setStatus("concluido");
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        router.refresh();
      } else if (data.status === "erro") {
        setStatus("erro");
        setError(data.erro ?? "Erro desconhecido no diagnóstico.");
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      } else if (data.status === "processando_capitulos" || data.status === "consolidando") {
        setStatus(data.status);
      }
    } catch (err) {
      console.error("[poll] Erro:", err);
      // Continua tentando — pode ser instabilidade de rede
    }
  }, [projectId, router]);

  // ─── Timer de tempo decorrido ──────────────────────────────────────────────
  useEffect(() => {
    if (status === "processando_capitulos" || status === "consolidando") {
      const id = setInterval(() => setTempoDecorrido(t => t + 1), 1000);
      return () => clearInterval(id);
    } else {
      setTempoDecorrido(0);
    }
  }, [status]);

  // ─── Início do polling ────────────────────────────────────────────────────
  const iniciarPolling = useCallback(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    // Primeira chamada imediata, depois a cada 5s
    pollDiagnostico();
    pollIntervalRef.current = setInterval(pollDiagnostico, 5000);
  }, [pollDiagnostico]);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // ─── Upload + início ──────────────────────────────────────────────────────
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setProgresso(null);

    try {
      setStatus("parsing");
      const fd = new FormData();
      fd.append("file", file);
      const parseRes = await fetch("/api/ferramentas/parse-file", { method: "POST", body: fd });
      const parseData = await parseRes.json() as { texto?: string; error?: string };
      if (!parseRes.ok) throw new Error(parseData.error ?? "Erro ao processar arquivo.");

      setStatus("starting");
      const diagRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: parseData.texto, project_id: projectId }),
      });
      const diagData = await diagRes.json() as PollResponse;
      if (!diagRes.ok) throw new Error(diagData.erro ?? "Erro ao iniciar diagnóstico.");

      if (diagData.progresso) setProgresso(diagData.progresso);
      setStatus("processando_capitulos");
      iniciarPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
      setStatus("erro");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  const isLoading = status !== "idle" && status !== "concluido" && status !== "erro";

  const statusLabel = (() => {
    if (status === "parsing") return "Extraindo texto…";
    if (status === "starting") return "Iniciando análise…";
    if (status === "processando_capitulos" && progresso) {
      return `Analisando capítulo ${progresso.atual} de ${progresso.total}…`;
    }
    if (status === "consolidando") return "Consolidando análise…";
    return "↑ Enviar novo arquivo";
  })();

  const nextHref =
    usarRevisao === false
      ? `/dashboard/elementos/${projectId}`
      : `/dashboard/revisao/${projectId}`;
  const nextLabel =
    usarRevisao === false
      ? "Continuar para Elementos Editoriais →"
      : "Continuar para revisão →";

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200">
      <div className="flex flex-col items-start gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf,.txt"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 text-zinc-500 text-sm border border-zinc-200 px-5 py-2.5 rounded-xl hover:border-zinc-400 hover:text-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading && (
            <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          )}
          {statusLabel}
        </button>
        <p className="text-xs text-zinc-400">Aceita .docx, .pdf ou .txt</p>
        {isLoading && tempoDecorrido > 0 && (
          <p className="text-xs text-zinc-400">Tempo decorrido: {tempoDecorrido}s</p>
        )}
        {error && <p className="text-red-500 text-xs max-w-xs">{error}</p>}
      </div>

      <Link
        href={nextHref}
        className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] active:scale-[0.99] transition-all whitespace-nowrap"
      >
        {nextLabel}
      </Link>
    </div>
  );
}

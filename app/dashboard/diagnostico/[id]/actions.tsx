"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function DiagnosticoActions({
  projectId,
  usarRevisao,
}: {
  projectId: string;
  usarRevisao: boolean | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "analyzing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    try {
      setStatus("parsing");
      const fd = new FormData();
      fd.append("file", file);
      const parseRes = await fetch("/api/ferramentas/parse-file", { method: "POST", body: fd });
      const parseData = await parseRes.json() as { texto?: string; error?: string };
      if (!parseRes.ok) throw new Error(parseData.error ?? "Erro ao processar arquivo.");

      setStatus("analyzing");
      const diagRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: parseData.texto, project_id: projectId }),
      });
      const diagData = await diagRes.json() as { ok?: boolean; error?: string };
      if (!diagRes.ok) throw new Error(diagData.error ?? "Erro ao gerar diagnóstico.");

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      setStatus("idle");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const isLoading = status !== "idle";
  const statusLabel =
    status === "parsing"   ? "Extraindo texto…" :
    status === "analyzing" ? "Analisando com IA…" :
    "↑ Enviar novo arquivo";

  // Route to revision if selected, otherwise skip straight to elements
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

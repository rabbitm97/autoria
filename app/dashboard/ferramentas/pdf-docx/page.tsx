"use client";

import { useRef, useState } from "react";

const MAX_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Status = "idle" | "converting" | "done" | "error";

export default function PdfDocxPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  // ── File handling ───────────────────────────────────────────────────────────

  function pickFile(f: File) {
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      setError("Apenas arquivos PDF são aceitos.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Arquivo muito grande. Máximo: 50 MB.");
      return;
    }
    setError(null);
    setFile(f);
    setStatus("idle");
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  // ── Convert ─────────────────────────────────────────────────────────────────

  async function handleConvert() {
    if (!file) return;
    setStatus("converting");
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/ferramentas/pdf-para-docx", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erro na conversão.");
      }

      // Trigger download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.pdf$/i, ".docx");
      a.click();
      URL.revokeObjectURL(url);

      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido.");
      setStatus("error");
    }
  }

  const isConverting = status === "converting";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">

      {/* Header */}
      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">
          Ferramentas / Conversão
        </p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">
          PDF para DOCX
        </h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Converta qualquer PDF com texto em um arquivo Word editável (.docx).
          Capítulos e parágrafos são detectados e preservados automaticamente.
        </p>
      </div>

      {/* Badges */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Texto preservado",  desc: "Parágrafos e capítulos" },
          { label: "Word editável",     desc: "Compatível com Office e Google Docs" },
          { label: "Sem nuvem",         desc: "Processamento local no servidor" },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-white rounded-xl border border-zinc-100 p-3 text-center"
          >
            <p className="text-xs font-semibold text-brand-primary">{item.label}</p>
            <p className="text-zinc-400 text-[11px] mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-8 space-y-6">

        {/* Drop zone */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
            }}
            disabled={isConverting}
          />

          {!file ? (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                isDragging
                  ? "border-brand-gold bg-brand-gold/5 scale-[1.01]"
                  : "border-zinc-200 hover:border-brand-gold/40 hover:bg-zinc-50"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-brand-primary/5 flex items-center justify-center">
                  <PdfIcon />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-600 uppercase tracking-wider">
                    {isDragging ? "Solte o PDF aqui" : "Arraste o PDF ou clique para selecionar"}
                  </p>
                  <p className="text-zinc-400 text-xs mt-1">.pdf · máx. 50 MB</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-zinc-200 bg-zinc-50">
              <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                <span className="text-white text-[10px] font-bold">PDF</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{file.name}</p>
                <p className="text-zinc-400 text-xs mt-0.5">{formatBytes(file.size)}</p>
              </div>
              {!isConverting && (
                <button
                  onClick={() => { setFile(null); setStatus("idle"); setError(null); }}
                  className="text-zinc-300 hover:text-zinc-500 transition-colors p-1"
                  aria-label="Remover arquivo"
                >
                  <RemoveIcon />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Arrow */}
        {file && !isConverting && status !== "done" && (
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3 text-zinc-400 text-xs">
              <span className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-red-400 font-bold text-[10px]">
                PDF
              </span>
              <span className="text-zinc-300">→</span>
              <span className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-400 font-bold text-[10px]">
                DOC
              </span>
            </div>
          </div>
        )}

        {/* Loading */}
        {isConverting && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-zinc-500">Convertendo… aguarde</p>
          </div>
        )}

        {/* Success */}
        {status === "done" && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <span className="text-emerald-500 text-lg shrink-0">✓</span>
            <div className="flex-1">
              <p className="text-emerald-700 text-sm font-medium">Conversão concluída!</p>
              <p className="text-emerald-600 text-xs mt-0.5">
                {file?.name.replace(/\.pdf$/i, ".docx")} foi baixado automaticamente.
              </p>
            </div>
            <button
              onClick={() => { setFile(null); setStatus("idle"); }}
              className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-800 shrink-0"
            >
              Converter outro
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
            <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
            <div>
              <p className="text-red-700 text-sm font-medium">{error}</p>
              {status === "error" && (
                <button
                  onClick={() => { setStatus("idle"); setError(null); }}
                  className="text-red-500 text-xs underline underline-offset-2 mt-1 hover:text-red-700"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          </div>
        )}

        {/* CTA */}
        {status !== "done" && (
          <button
            onClick={handleConvert}
            disabled={!file || isConverting}
            className="w-full bg-brand-primary text-white py-3.5 rounded-xl font-semibold text-sm uppercase tracking-wide hover:bg-[#2a2a4e] active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isConverting ? "Convertendo…" : "Converter para DOCX"}
          </button>
        )}

        {/* Note */}
        <p className="text-center text-zinc-400 text-xs">
          PDFs escaneados (somente imagem) não possuem texto extraível e não são suportados.
        </p>

      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PdfIcon() {
  return (
    <svg
      width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

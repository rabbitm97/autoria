"use client";

import { useRef, useState } from "react";

interface Props {
  onText: (texto: string) => void;
}

const ACCEPT = ".pdf,.docx,.txt";

export function ManuscriptUpload({ onText }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/ferramentas/parse-file", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao processar arquivo");
      setFileName(file.name);
      onText(data.texto as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao processar arquivo");
    } finally {
      setLoading(false);
      // reset so same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/40 hover:text-brand-primary disabled:opacity-50 transition-all"
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <UploadIcon />
        )}
        {loading ? "Extraindo texto…" : "Enviar arquivo"}
        <span className="text-xs text-zinc-400">PDF, DOCX, TXT</span>
      </button>

      {fileName && !loading && (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <span className="text-emerald-500">✓</span>
          {fileName}
        </span>
      )}

      {error && (
        <span className="text-xs text-red-600">{error}</span>
      )}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

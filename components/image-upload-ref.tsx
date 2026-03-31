"use client";

import { useRef, useState } from "react";
import Image from "next/image";

interface Props {
  onImage: (dataUrl: string | null) => void;
}

export function ImageUploadRef({ onImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`Imagem muito grande. Máximo ${MAX_MB} MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreview(dataUrl);
      onImage(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    setPreview(null);
    onImage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (preview) {
    return (
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-24 rounded-xl overflow-hidden border border-zinc-200 shrink-0">
          <Image src={preview} alt="Referência" fill className="object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-zinc-600 mb-0.5">Imagem de referência</p>
          <p className="text-xs text-zinc-400 leading-relaxed">A IA usará este estilo/atmosfera como inspiração para a capa.</p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="shrink-0 text-xs text-zinc-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-red-200"
        >
          Remover
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 text-sm text-zinc-500 hover:border-brand-gold/40 hover:bg-brand-gold/3 hover:text-zinc-700 transition-all group"
      >
        <span className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center shrink-0 group-hover:border-brand-gold/30 transition-colors">
          <ImageIcon />
        </span>
        <div className="text-left">
          <p className="text-sm font-medium text-zinc-600">Adicionar imagem de referência</p>
          <p className="text-xs text-zinc-400">Opcional — JPG, PNG ou WebP, até 8 MB</p>
        </div>
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function ImageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}

"use client";

import { useState, useRef } from "react";
import { VOZES as VOZES_TOOL } from "@/lib/voices";

export default function AudiolivroPage() {
  const [texto, setTexto] = useState("");
  const [voz, setVoz] = useState(VOZES_TOOL[0].id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [devMsg, setDevMsg] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const MAX = 4500;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setDevMsg(null);
    try {
      const res = await fetch("/api/ferramentas/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.slice(0, MAX), voz }),
      });

      // Dev mode returns JSON
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const data = await res.json();
        if (data.dev) { setDevMsg(data.msg); return; }
        if (!res.ok) throw new Error(data.error ?? "Erro");
        return;
      }

      if (!res.ok) throw new Error("Erro ao gerar áudio");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar áudio");
    } finally {
      setLoading(false);
    }
  }

  const vozInfo = VOZES_TOOL.find(v => v.id === voz);

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">

      <div className="mb-8">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Ferramentas / Mídia</p>
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Narração com IA</h1>
        <p className="text-zinc-500 text-sm max-w-xl">
          Converta até 4.500 caracteres de texto em áudio com vozes neurais em português. Ideal para testar a narração do seu audiolivro.
        </p>
      </div>

      {/* Credit warning */}
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 mb-6 flex gap-3 items-start">
        <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
        <p className="text-xs text-amber-700 leading-relaxed">
          Esta ferramenta usa créditos da ElevenLabs. O limite por geração é de <strong>4.500 caracteres</strong>. Use com moderação — para audiolivros completos, acesse o fluxo do projeto.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
        {/* Voice selector */}
        <div>
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">Selecione a voz</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {VOZES_TOOL.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVoz(v.id)}
                className={`p-3 rounded-xl border text-left transition-all ${voz === v.id ? "border-brand-gold bg-brand-gold/5" : "border-zinc-200 hover:border-zinc-300"}`}
              >
                <p className={`text-sm font-semibold ${voz === v.id ? "text-brand-primary" : "text-zinc-700"}`}>{v.nome}</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-tight">{v.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wide">Texto para narrar</label>
            <span className={`text-xs font-mono ${texto.length > MAX * 0.9 ? "text-amber-600" : "text-zinc-400"}`}>
              {texto.length.toLocaleString("pt-BR")} / {MAX.toLocaleString("pt-BR")}
            </span>
          </div>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Cole o texto que deseja narrar. O excedente a 4.500 caracteres será ignorado..."
            rows={10}
            maxLength={MAX}
            className="w-full resize-none px-4 py-3 rounded-xl border border-zinc-200 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 font-mono leading-relaxed"
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

        {devMsg && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
            <p className="text-xs text-zinc-500 font-mono">{devMsg}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-400">Voz: <span className="font-semibold">{vozInfo?.nome}</span> — {vozInfo?.desc}</p>
          <button
            type="submit"
            disabled={loading || !texto.trim()}
            className="flex items-center gap-2 px-7 py-3 rounded-xl bg-brand-primary text-brand-gold font-semibold text-sm hover:bg-brand-primary/90 disabled:opacity-40 transition-all"
          >
            {loading ? <Spinner /> : <MicIcon />}
            {loading ? "Gerando áudio…" : "Narrar com IA"}
          </button>
        </div>
      </form>

      {/* Audio player */}
      {audioUrl && (
        <div className="mt-6 bg-white rounded-2xl border border-zinc-100 p-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-4">Narração gerada</p>
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
          <div className="flex justify-end mt-3">
            <a
              href={audioUrl}
              download="narração.mp3"
              className="text-xs text-brand-gold hover:underline font-medium"
            >
              ↓ Baixar MP3
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="w-4 h-4 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />;
}
function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import type { CapituloAudio, VOZES } from "@/app/api/agentes/gerar-audio/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CapituloTexto { index: number; titulo: string; caracteres: number }

type VozInfo = (typeof VOZES)[number];

// ─── Audio Player ─────────────────────────────────────────────────────────────

function AudioPlayer({ url, titulo }: { url: string; titulo: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 mt-3 bg-zinc-50 rounded-xl p-3">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el && el.duration) setProgress(el.currentTime / el.duration * 100);
        }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center shrink-0 hover:bg-brand-primary/90 transition-colors"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-600 truncate mb-1">{titulo}</p>
        <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
          <div className="h-full bg-brand-gold rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <span className="text-xs text-zinc-400 shrink-0">{duration ? fmt(duration) : "--:--"}</span>
      <a href={url} download className="text-zinc-400 hover:text-brand-gold transition-colors shrink-0">
        <DownloadIcon />
      </a>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VOZES_UI = [
  { id: "21m00Tcm4TlvDq8ikWAM", nome: "Rachel",  desc: "Feminina — narrativa clara" },
  { id: "AZnzlk1XvdvUeBnXmlld", nome: "Domi",    desc: "Feminina — energética" },
  { id: "ErXwobaYiN019PkySvjV", nome: "Antoni",  desc: "Masculina — suave" },
  { id: "VR6AewLTigWG4xSOukaG", nome: "Arnold",  desc: "Masculina — grave" },
  { id: "pNInz6obpgDQGcFmaJgB", nome: "Adam",    desc: "Masculina — profissional" },
];

export default function AudiolivroPage() {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [capitulosTexto, setCapitulosTexto] = useState<CapituloTexto[]>([]);
  const [capitulosAudio, setCapitulosAudio] = useState<CapituloAudio[]>([]);
  const [voz, setVoz] = useState(VOZES_UI[0].id);
  const [generating, setGenerating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agentes/gerar-audio?project_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setCapitulosTexto(data.capitulos_texto ?? []);
        setCapitulosAudio(data.capitulos_audio ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleGerar(capitulo_index: number) {
    setGenerating(capitulo_index);
    setError(null);
    try {
      const res = await fetch("/api/agentes/gerar-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, capitulo_index, voice_id: voz }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar áudio");
      const novo = data as CapituloAudio;
      setCapitulosAudio(prev => [
        ...prev.filter(c => c.index !== capitulo_index),
        novo,
      ].sort((a, b) => a.index - b.index));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGenerating(null);
    }
  }

  const audioMap = Object.fromEntries(capitulosAudio.map(c => [c.index, c]));
  const totalGerados = capitulosAudio.length;
  const vozInfo = VOZES_UI.find(v => v.id === voz);

  return (
    <div className="min-h-screen bg-brand-surface">

      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3 text-sm">
          <Link href="/dashboard" className="text-brand-gold/60 hover:text-brand-gold transition-colors">
            Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-brand-gold/80">Audiolivro</span>
        </div>
      </header>

      {/* EtapasProgress is outside the editorial pipeline — audiolivro is a feature extra */}
      <div className="bg-brand-primary border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          <span className="text-brand-gold/60 text-xs">Recurso adicional:</span>
          <span className="text-brand-gold text-xs font-medium">Audiolivro com ElevenLabs</span>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 6.1 — Audiolivro
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">
            Narração com IA
          </h1>
          <p className="text-zinc-500 mt-2 text-sm leading-relaxed max-w-2xl">
            Gera narração profissional capítulo por capítulo usando ElevenLabs.
            Cada capítulo é gerado individualmente para preservar seus créditos.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* Voice selector */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-4">
                Voz do narrador
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOZES_UI.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setVoz(v.id)}
                    className={`flex flex-col items-start px-4 py-3 rounded-xl border text-left transition-colors
                      ${voz === v.id
                        ? "border-brand-gold bg-brand-gold/5"
                        : "border-zinc-200 hover:border-brand-gold/30"}`}
                  >
                    <p className={`text-sm font-medium ${voz === v.id ? "text-brand-primary" : "text-zinc-700"}`}>
                      {v.nome}
                    </p>
                    <p className="text-xs text-zinc-400">{v.desc}</p>
                  </button>
                ))}
              </div>
              {totalGerados > 0 && (
                <p className="text-xs text-amber-600 mt-3">
                  ⚠ Trocar de voz afeta apenas capítulos gerados a partir de agora.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-6">
                {error}
              </div>
            )}

            {/* Progress summary */}
            {capitulosTexto.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-zinc-500">
                  {totalGerados} de {capitulosTexto.length} capítulo{capitulosTexto.length !== 1 ? "s" : ""} gerado{totalGerados !== 1 ? "s" : ""}
                </p>
                <div className="flex gap-1">
                  {capitulosTexto.map(c => (
                    <span
                      key={c.index}
                      className={`w-2 h-2 rounded-full ${audioMap[c.index] ? "bg-brand-gold" : "bg-zinc-200"}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Chapter list */}
            <div className="space-y-3">
              {capitulosTexto.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-zinc-200 p-8 text-center">
                  <p className="text-zinc-400 text-sm">
                    Nenhum capítulo encontrado. Certifique-se de que o manuscrito foi processado.
                  </p>
                </div>
              ) : (
                capitulosTexto.map((cap) => {
                  const audio = audioMap[cap.index];
                  const isGen = generating === cap.index;
                  return (
                    <div key={cap.index} className="bg-white rounded-2xl border border-zinc-100 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                            ${audio ? "bg-brand-gold text-brand-primary" : "bg-zinc-100 text-zinc-400"}`}>
                            {audio ? "♪" : cap.index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-800 truncate">{cap.titulo}</p>
                            <p className="text-xs text-zinc-400">
                              ~{cap.caracteres.toLocaleString("pt-BR")} caracteres
                              {cap.caracteres >= 4500 && (
                                <span className="text-amber-500 ml-1">(truncado em 4.500)</span>
                              )}
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleGerar(cap.index)}
                          disabled={isGen || generating !== null}
                          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                            ${audio
                              ? "border border-zinc-200 text-zinc-500 hover:border-brand-gold/30"
                              : "bg-brand-primary text-brand-gold hover:bg-brand-primary/90"}`}
                        >
                          {isGen ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                              Gerando…
                            </span>
                          ) : audio ? "Regenerar" : "Gerar"}
                        </button>
                      </div>

                      {audio && (
                        <AudioPlayer url={audio.url} titulo={audio.titulo} />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* ElevenLabs credit notice */}
            <div className="mt-6 bg-amber-50 border border-amber-100 rounded-xl p-4">
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Créditos ElevenLabs:</strong> cada geração consome ~{(4500 / 1000).toFixed(1)}K caracteres.
                Plano gratuito: 10K/mês. Plano Creator: 100K/mês.
                Voz atual: <strong>{vozInfo?.nome}</strong> · Modelo: eleven_multilingual_v2 (suporta português).
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-brand-gold ml-0.5">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-brand-gold">
      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

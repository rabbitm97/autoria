"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CmykResult {
  c: number;
  m: number;
  y: number;
  k: number;
  hex: string;
}

// ─── Pure math (client-side, no API needed) ───────────────────────────────────

function rgbToCmyk(r: number, g: number, b: number): CmykResult {
  const rp = r / 255;
  const gp = g / 255;
  const bp = b / 255;
  const k = 1 - Math.max(rp, gp, bp);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100, hex: rgbToHex(r, g, b) };
  const denom = 1 - k;
  return {
    c: Math.round(((1 - rp - k) / denom) * 100),
    m: Math.round(((1 - gp - k) / denom) * 100),
    y: Math.round(((1 - bp - k) / denom) * 100),
    k: Math.round(k * 100),
    hex: rgbToHex(r, g, b),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return null;
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RgbCmykToolProps {
  /** Quando true, exibe a seção de conversão de arquivo (JPG/PNG → JPEG CMYK).
   *  Requer usuário logado. Default false = versão pública com teaser. */
  permitirArquivo?: boolean;
}

export default function RgbCmykTool({ permitirArquivo = false }: RgbCmykToolProps = {}) {
  const [hex, setHex] = useState("#1A1A2E");
  const [r, setR] = useState(26);
  const [g, setG] = useState(26);
  const [b, setB] = useState(46);
  const [copied, setCopied] = useState<string | null>(null);

  const result = rgbToCmyk(r, g, b);

  const syncFromHex = useCallback((value: string) => {
    setHex(value);
    const rgb = hexToRgb(value);
    if (rgb) { setR(rgb.r); setG(rgb.g); setB(rgb.b); }
  }, []);

  const syncFromRgb = useCallback((nr: number, ng: number, nb: number) => {
    setR(nr); setG(ng); setB(nb);
    setHex(rgbToHex(nr, ng, nb));
  }, []);

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const cmykString = `C:${result.c}% M:${result.m}% Y:${result.y}% K:${result.k}%`;

  // ─── Conversão de arquivo (só quando permitirArquivo === true) ─────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [convertendo, setConvertendo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);

  function validarArquivoLocal(f: File): string | null {
    const nome = f.name.toLowerCase();
    const tipoOk = f.type === "image/jpeg" || f.type === "image/png";
    const nomeOk = nome.endsWith(".jpg") || nome.endsWith(".jpeg") || nome.endsWith(".png");
    if (!tipoOk && !nomeOk) return "Apenas JPG ou PNG são aceitos.";
    if (f.size > 4 * 1024 * 1024) return "Arquivo muito grande. Máximo: 4 MB.";
    return null;
  }

  function onSelecionarArquivo(f: File | null) {
    setErroArquivo(null);
    if (!f) { setArquivoSelecionado(null); return; }
    const erro = validarArquivoLocal(f);
    if (erro) { setArquivoSelecionado(null); setErroArquivo(erro); return; }
    setArquivoSelecionado(f);
  }

  async function converterArquivo() {
    if (!arquivoSelecionado) return;
    setConvertendo(true);
    setErroArquivo(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivoSelecionado);
      const res = await fetch("/api/ferramentas/rgb-cmyk-arquivo", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erro desconhecido." }));
        setErroArquivo(body.error ?? "Falha ao converter.");
        return;
      }
      const blob = await res.blob();
      const nomeBase = arquivoSelecionado.name.replace(/\.(jpe?g|png)$/i, "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nomeBase}-CMYK-fogra39.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setArquivoSelecionado(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setErroArquivo(e instanceof Error ? e.message : "Falha ao converter.");
    } finally {
      setConvertendo(false);
    }
  }

  return (
    <div>

      <main className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Ferramenta
          </p>
          <h1 className="font-heading text-3xl text-brand-primary mb-2">
            Conversor RGB → CMYK
          </h1>
          <p className="text-zinc-500 text-sm">
            Converta cores para impressão. CMYK é exigido em capas para Amazon KDP e gráficas.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">

          {/* Input card */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <h2 className="font-heading text-lg text-brand-primary mb-5">Entrada RGB</h2>

            {/* Color picker */}
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-16 h-16 rounded-xl border border-zinc-200 shrink-0 cursor-pointer relative overflow-hidden"
                style={{ backgroundColor: hex }}
              >
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => syncFromHex(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Escolher cor"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-zinc-400 uppercase tracking-wide font-medium">HEX</label>
                <input
                  type="text"
                  value={hex}
                  onChange={(e) => {
                    const v = e.target.value;
                    setHex(v);
                    const rgb = hexToRgb(v);
                    if (rgb) { setR(rgb.r); setG(rgb.g); setB(rgb.b); }
                  }}
                  maxLength={7}
                  className="w-full mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-gold/40 uppercase"
                  placeholder="#RRGGBB"
                />
              </div>
            </div>

            {/* RGB sliders */}
            {(
              [
                { label: "R", value: r, color: "bg-red-500",   setter: (v: number) => syncFromRgb(v, g, b) },
                { label: "G", value: g, color: "bg-emerald-500", setter: (v: number) => syncFromRgb(r, v, b) },
                { label: "B", value: b, color: "bg-blue-500",  setter: (v: number) => syncFromRgb(r, g, v) },
              ] as { label: string; value: number; color: string; setter: (v: number) => void }[]
            ).map(({ label, value, color, setter }) => (
              <div key={label} className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-zinc-600">{label}</span>
                  <input
                    type="number"
                    value={value}
                    min={0}
                    max={255}
                    onChange={(e) => setter(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
                    className="w-14 text-right rounded border border-zinc-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-gold/40"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={255}
                  value={value}
                  onChange={(e) => setter(parseInt(e.target.value))}
                  className={`w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-zinc-400 [&::-webkit-slider-thumb]:shadow-sm ${color}`}
                />
              </div>
            ))}
          </div>

          {/* Result card */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <h2 className="font-heading text-lg text-brand-primary mb-5">Resultado CMYK</h2>

            {/* Color preview */}
            <div
              className="w-full h-24 rounded-xl mb-6 border border-zinc-100"
              style={{ backgroundColor: hex }}
            />

            {/* CMYK values */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {(
                [
                  { label: "Cyan",    value: result.c, accent: "text-cyan-600",    bg: "bg-cyan-50 border-cyan-200"    },
                  { label: "Magenta", value: result.m, accent: "text-pink-600",    bg: "bg-pink-50 border-pink-200"    },
                  { label: "Yellow",  value: result.y, accent: "text-yellow-700",  bg: "bg-yellow-50 border-yellow-200" },
                  { label: "Key (K)", value: result.k, accent: "text-zinc-700",    bg: "bg-zinc-50 border-zinc-200"    },
                ] as { label: string; value: number; accent: string; bg: string }[]
              ).map(({ label, value, accent, bg }) => (
                <div
                  key={label}
                  className={`rounded-xl border p-4 flex flex-col ${bg}`}
                >
                  <span className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</span>
                  <span className={`font-heading text-3xl leading-none ${accent}`}>{value}%</span>
                </div>
              ))}
            </div>

            {/* Copy buttons */}
            <div className="space-y-2">
              <button
                onClick={() => copyText(cmykString, "cmyk")}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-200 hover:border-brand-gold/40 hover:bg-zinc-50 transition-all group"
              >
                <span className="text-sm font-mono text-zinc-600">{cmykString}</span>
                <span className="text-xs text-zinc-400 group-hover:text-brand-gold transition-colors">
                  {copied === "cmyk" ? "✓ Copiado!" : "Copiar"}
                </span>
              </button>
              <button
                onClick={() => copyText(hex, "hex")}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-200 hover:border-brand-gold/40 hover:bg-zinc-50 transition-all group"
              >
                <span className="text-sm font-mono text-zinc-600">{hex.toUpperCase()}</span>
                <span className="text-xs text-zinc-400 group-hover:text-brand-gold transition-colors">
                  {copied === "hex" ? "✓ Copiado!" : "Copiar HEX"}
                </span>
              </button>
              <button
                onClick={() => copyText(`rgb(${r}, ${g}, ${b})`, "rgb")}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-zinc-200 hover:border-brand-gold/40 hover:bg-zinc-50 transition-all group"
              >
                <span className="text-sm font-mono text-zinc-600">rgb({r}, {g}, {b})</span>
                <span className="text-xs text-zinc-400 group-hover:text-brand-gold transition-colors">
                  {copied === "rgb" ? "✓ Copiado!" : "Copiar RGB"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Info note */}
        <div className="mt-6 bg-brand-primary/5 rounded-xl border border-brand-primary/10 px-5 py-4">
          <p className="text-sm text-zinc-600 leading-relaxed">
            <strong className="text-brand-primary">Dica para capas:</strong> Ao exportar para impressão, certifique-se
            de usar o perfil de cor <strong>ISO Coated v2</strong> ou <strong>FOGRA39</strong>. O conversor
            acima usa a fórmula padrão — para resultados profissionais de gráfica, use o Adobe InDesign ou a
            funcionalidade de Diagramação da Autoria.
          </p>
        </div>

        {/* ─── Conversão de arquivo (logado) OU teaser (público) ─────────── */}
        {permitirArquivo ? (
          <div className="mt-8 bg-white rounded-2xl border border-zinc-100 p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-heading text-lg text-brand-primary">Converter arquivo</h2>
              <span className="text-xs text-zinc-400">3 conversões por dia</span>
            </div>
            <p className="text-sm text-zinc-500 mb-5">
              Envie um JPG ou PNG (até 4 MB). Devolvemos um JPEG CMYK com perfil{" "}
              <strong>Coated FOGRA39</strong> embutido — a mesma conversão do editor de capa da Autoria.
            </p>

            <label
              htmlFor="rgb-cmyk-arquivo-input"
              className="block border-2 border-dashed border-zinc-200 rounded-xl px-6 py-8 text-center cursor-pointer hover:border-brand-gold/50 hover:bg-zinc-50 transition-colors"
            >
              <input
                ref={fileInputRef}
                id="rgb-cmyk-arquivo-input"
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => onSelecionarArquivo(e.target.files?.[0] ?? null)}
                disabled={convertendo}
              />
              {arquivoSelecionado ? (
                <div>
                  <p className="text-sm text-zinc-700 font-medium">{arquivoSelecionado.name}</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {(arquivoSelecionado.size / 1024 / 1024).toFixed(2)} MB — clique para trocar
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-zinc-600">Clique para escolher um arquivo</p>
                  <p className="text-xs text-zinc-400 mt-1">JPG ou PNG, até 4 MB</p>
                </div>
              )}
            </label>

            {erroArquivo && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{erroArquivo}</p>
              </div>
            )}

            <button
              type="button"
              onClick={converterArquivo}
              disabled={!arquivoSelecionado || convertendo}
              className="mt-4 w-full rounded-xl bg-brand-primary text-white font-medium py-3 hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {convertendo ? "Convertendo…" : "Converter e baixar JPEG CMYK"}
            </button>

            <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
              Arte vetorial (PDF/AI) deve ser convertida no software de origem —
              rasterizar aqui degradaria seu arquivo.
            </p>
          </div>
        ) : (
          <div className="mt-8 bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="font-heading text-base text-brand-primary mb-1">
                Converter arquivo JPG ou PNG para CMYK
              </h2>
              <p className="text-sm text-zinc-500">
                JPEG CMYK com perfil FOGRA39 embutido — grátis com conta (3 por dia).
              </p>
            </div>
            <Link
              href="/cadastro?next=%2Fdashboard%2Fferramentas%2Frgb-cmyk"
              className="shrink-0 rounded-xl bg-brand-primary text-white text-sm font-medium px-5 py-2.5 hover:bg-brand-primary/90 transition-colors"
            >
              Criar conta grátis
            </Link>
          </div>
        )}

      </main>
    </div>
  );
}

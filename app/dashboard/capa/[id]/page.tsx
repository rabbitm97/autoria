"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { CapaGeradaResult, EstiloCapa } from "@/app/api/agentes/gerar-capa/route";
import type { CapaUploadResult, CapaValidacao } from "@/app/api/agentes/upload-capa/route";

// ─── Constants ────────────────────────────────────────────────────────────────

type Modo = "escolha" | "upload" | "ia" | "manual";

const FORMATOS = [
  { id: "16x23",   label: "16×23 cm",    sub: "Padrão editorial", w: 160, h: 230 },
  { id: "14x21",   label: "14×21 cm",    sub: "Formato compacto", w: 148, h: 210 },
  { id: "11x18",   label: "11×18 cm",    sub: "Bolso",            w: 110, h: 180 },
  { id: "20x20",   label: "20×20 cm",    sub: "Quadrado",         w: 200, h: 200 },
  { id: "a4",      label: "A4",          sub: "21×29,7 cm",       w: 210, h: 297 },
] as const;

type FormatoId = typeof FORMATOS[number]["id"];

const ESTILOS: { id: EstiloCapa; label: string; emoji: string }[] = [
  { id: "minimalista",   label: "Minimalista",   emoji: "◻️" },
  { id: "cartoon",       label: "Cartoon",       emoji: "🎨" },
  { id: "aquarela",      label: "Aquarela",      emoji: "💧" },
  { id: "fotorrealista", label: "Fotorrealista", emoji: "📷" },
  { id: "abstrato",      label: "Abstrato",      emoji: "🔷" },
  { id: "vintage",       label: "Vintage",       emoji: "📜" },
  { id: "geometrico",    label: "Geométrico",    emoji: "🔺" },
];

const CORES_PRESET = [
  { label: "Azul escuro",   value: "azul escuro",   hex: "#1e3a5f" },
  { label: "Vinho",         value: "vinho",         hex: "#7b2d42" },
  { label: "Verde floresta",value: "verde floresta",hex: "#2d5a27" },
  { label: "Preto",         value: "preto",         hex: "#111111" },
  { label: "Dourado",       value: "dourado",       hex: "#c9a227" },
  { label: "Terracota",     value: "terracota",     hex: "#c0614a" },
  { label: "Azul cinza",    value: "azul acinzentado", hex: "#4a6fa5" },
  { label: "Roxo",          value: "roxo",          hex: "#5a3d7a" },
];

type PainelId = "frente" | "lombada" | "contra" | "orelha_frente" | "orelha_verso";

interface PainelState {
  bgUrl: string | null;       // object URL for preview
  bgBase64: string | null;    // base64 for upload
  bgMime: string | null;
  titulo: string;
  subtitulo: string;
  autor: string;
}

function emptyPainel(): PainelState {
  return { bgUrl: null, bgBase64: null, bgMime: null, titulo: "", subtitulo: "", autor: "" };
}

function calcLombadaMm(paginas: number) {
  return Math.round(paginas * 0.07 * 10) / 10;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModoCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border border-zinc-200
        hover:border-brand-gold/60 hover:shadow-sm transition-all text-left group"
    >
      <div className="w-12 h-12 rounded-xl bg-brand-gold/10 flex items-center justify-center
        group-hover:bg-brand-gold/20 transition-colors">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-brand-primary text-sm">{title}</p>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{desc}</p>
      </div>
      <span className="text-xs font-medium text-brand-gold mt-auto">Selecionar →</span>
    </button>
  );
}

function RadioBtn({
  checked,
  onChange,
  label,
  sub,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-colors
        ${checked ? "border-brand-gold bg-brand-gold/5" : "border-zinc-200 hover:border-zinc-300"}`}
    >
      <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
        ${checked ? "border-brand-gold" : "border-zinc-300"}`}>
        {checked && <span className="w-2 h-2 rounded-full bg-brand-gold block" />}
      </span>
      <div>
        <p className={`text-sm font-medium ${checked ? "text-brand-primary" : "text-zinc-700"}`}>{label}</p>
        {sub && <p className="text-xs text-zinc-400">{sub}</p>}
      </div>
    </button>
  );
}

// ─── Upload mode ──────────────────────────────────────────────────────────────

function ModoUpload({
  projectId,
  formatoInicial,
  lombadaReal,
  onSalvo,
  onVoltar,
}: {
  projectId: string;
  formatoInicial: FormatoId;
  lombadaReal: number | null;
  onSalvo: (result: CapaUploadResult) => void;
  onVoltar: () => void;
}) {
  const formato = formatoInicial; // inherited from page-level selector
  const [paginas, setPaginas] = useState(200);
  const [usarOrelhas, setUsarOrelhas] = useState(false);
  const [dpi, setDpi] = useState<300 | 150>(300);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [validacao, setValidacao] = useState<CapaValidacao | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use real lombada from diagramação if available, otherwise estimate
  const lombada = lombadaReal ?? calcLombadaMm(paginas);
  const fmtInfo = FORMATOS.find(f => f.id === formato)!;
  const sangria = 3;
  const orelha = usarOrelhas ? 80 : 0;
  const espWMm = sangria + orelha + fmtInfo.w + lombada + fmtInfo.w + orelha + sangria;
  const espHMm = sangria + fmtInfo.h + sangria;
  const mm2px = dpi / 25.4;
  const espWPx = Math.round(espWMm * mm2px);
  const espHPx = Math.round(espHMm * mm2px);

  function handleFileChange(f: File) {
    setFile(f);
    setValidacao(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new window.Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }

  function checkDims() {
    if (!dims) return;
    const tolPx = Math.round(2 * mm2px);
    const wOk = Math.abs(dims.w - espWPx) <= tolPx;
    const hOk = Math.abs(dims.h - espHPx) <= tolPx;
    const rW = Math.round((dims.w / mm2px) * 10) / 10;
    const rH = Math.round((dims.h / mm2px) * 10) / 10;
    const detalhes: string[] = [];
    if (!wOk) detalhes.push(`Largura: ${rW}mm (esperado ${espWMm}mm ±2mm)`);
    if (!hOk) detalhes.push(`Altura: ${rH}mm (esperado ${espHMm}mm ±2mm)`);
    if (wOk && hOk) detalhes.push("Dimensões dentro da tolerância ±2mm.");
    setValidacao({ ok: wOk && hOk, largura_esperada_mm: espWMm, altura_esperada_mm: espHMm,
      largura_recebida_mm: rW, altura_recebida_mm: rH, tolerancia_mm: 2, detalhes });
  }

  async function handleUpload() {
    if (!file || !dims) return;
    setUploading(true);
    setError(null);
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const r = await fetch("/api/agentes/upload-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          imagem_base64: b64,
          mime_type: file.type,
          largura_px: dims.w,
          altura_px: dims.h,
          dpi,
          formato,
          paginas,
          usar_orelhas: usarOrelhas,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao enviar");
      onSalvo(data as CapaUploadResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={onVoltar} className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
        ← Voltar
      </button>

      <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-6">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Configurar dimensões</p>

        {/* Format — inherited from page-level selector */}
        <div className="flex items-center gap-3 py-2 px-3 bg-zinc-50 rounded-xl">
          <p className="text-xs text-zinc-500">Formato:</p>
          <p className="text-sm font-medium text-brand-primary">{fmtInfo?.label} ({fmtInfo?.sub})</p>
          <p className="text-xs text-zinc-400 ml-auto">Alterável na tela anterior</p>
        </div>
        <div className="hidden">
        </div>

        {/* Pages + orelhas + DPI */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Páginas</label>
            <input type="number" min={10} max={1500} value={paginas}
              onChange={e => setPaginas(Number(e.target.value))}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold" />
            <p className="text-[10px] text-zinc-400 mt-1">Lombada: {lombada}mm</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Resolução</label>
            <select value={dpi} onChange={e => setDpi(Number(e.target.value) as 300 | 150)}
              className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
              <option value={300}>300 DPI (impresso)</option>
              <option value={150}>150 DPI (digital)</option>
            </select>
          </div>
          <div className="flex flex-col justify-center">
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <div onClick={() => setUsarOrelhas(!usarOrelhas)}
                className={`w-10 h-5 rounded-full border-2 transition-colors relative
                  ${usarOrelhas ? "bg-brand-gold border-brand-gold" : "bg-zinc-200 border-zinc-300"}`}>
                <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
                  ${usarOrelhas ? "left-5" : "left-0.5"}`} />
              </div>
              <span className="text-xs text-zinc-600">Orelhas (8cm)</span>
            </label>
          </div>
        </div>

        {/* Expected size */}
        <div className="bg-zinc-50 rounded-xl p-4 text-xs text-zinc-600">
          <p className="font-medium mb-1">Dimensões esperadas para sua capa:</p>
          <p>{espWMm}mm × {espHMm}mm ({espWPx}px × {espHPx}px @ {dpi}dpi)</p>
          <p className="text-zinc-400 mt-1">
            = {sangria}mm sangria + {usarOrelhas ? `${orelha}mm orelha + ` : ""}{fmtInfo.w}mm frente + {lombada}mm lombada{lombadaReal !== null ? " ✓ real" : " (estimativa)"} + {fmtInfo.w}mm verso{usarOrelhas ? ` + ${orelha}mm orelha` : ""} + {sangria}mm sangria
          </p>
        </div>
      </div>

      {/* Upload zone */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Arquivo da capa</p>

        {preview ? (
          <div className="space-y-4">
            <div className="relative w-full max-h-48 overflow-hidden rounded-xl border border-zinc-200 flex items-center justify-center bg-zinc-50">
              <img src={preview} alt="Preview" className="max-h-48 object-contain" />
            </div>
            <p className="text-xs text-zinc-500">{file?.name} — {dims ? `${dims.w}×${dims.h}px` : "detectando…"}</p>
            <div className="flex gap-2">
              {dims && !validacao && (
                <button onClick={checkDims}
                  className="px-4 py-2 rounded-lg bg-brand-primary text-brand-gold text-xs font-medium hover:bg-brand-primary/90 transition-colors">
                  Verificar dimensões
                </button>
              )}
              <button onClick={() => { setFile(null); setPreview(null); setDims(null); setValidacao(null); }}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-xs hover:border-zinc-300 transition-colors">
                Remover
              </button>
            </div>

            {validacao && (
              <div className={`rounded-xl p-4 border text-sm ${validacao.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                <p className="font-semibold mb-1">{validacao.ok ? "✓ Dimensões corretas" : "⚠ Dimensões fora do esperado"}</p>
                {validacao.detalhes.map((d, i) => <p key={i} className="text-xs">{d}</p>)}
                {!validacao.ok && (
                  <p className="text-xs mt-2 text-amber-600">
                    Você ainda pode aceitar e continuar, mas a capa pode não se adequar ao formato de impressão.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed
            border-zinc-300 rounded-xl cursor-pointer hover:border-brand-gold/50 hover:bg-zinc-50 transition-colors">
            <UploadIcon />
            <p className="text-sm font-medium text-zinc-600 mt-2">Clique para selecionar</p>
            <p className="text-xs text-zinc-400 mt-1">PNG ou JPEG, alta resolução</p>
            <input type="file" accept="image/png,image/jpeg" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]); }} />
          </label>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {file && dims && (
        <button onClick={handleUpload} disabled={uploading}
          className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
            hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
          {uploading ? "Salvando…" : "Aceitar e continuar →"}
        </button>
      )}
    </div>
  );
}

// ─── IA mode ──────────────────────────────────────────────────────────────────

function ModoIA({
  projectId,
  titulo,
  autor,
  sinopse,
  genero,
  onSalvo,
  onVoltar,
}: {
  projectId: string;
  titulo: string;
  autor: string;
  sinopse: string;
  genero: string;
  onSalvo: (result: CapaGeradaResult, escolhida: string) => void;
  onVoltar: () => void;
}) {
  const [estilo, setEstilo] = useState<EstiloCapa>("minimalista");
  const [cor, setCor] = useState(CORES_PRESET[0].value);
  const [corHex, setCorHex] = useState(CORES_PRESET[0].hex);
  const [usarOrelhas, setUsarOrelhas] = useState(false);
  const [quartaTexto, setQuartaTexto] = useState(sinopse?.slice(0, 500) ?? "");
  const [imgRef, setImgRef] = useState<string | null>(null);

  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<CapaGeradaResult | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegen, setIsRegen] = useState(false);

  async function handleGerar(regen = false) {
    setGerando(true);
    setError(null);
    setIsRegen(regen);
    try {
      const r = await fetch("/api/agentes/gerar-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          titulo,
          autor,
          sinopse,
          genero,
          estilo,
          cor_predominante: cor,
          usar_orelhas: usarOrelhas,
          quarta_capa_texto: quartaTexto,
          imagemRef: imgRef ?? undefined,
          is_regeneracao: regen,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao gerar");
      setResultado(data as CapaGeradaResult);
      setEscolhida(data.opcoes[0]?.url ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGerando(false);
    }
  }

  function handleRefImg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setImgRef(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  return (
    <div className="space-y-6">
      <button onClick={onVoltar} className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
        ← Voltar
      </button>

      {!resultado ? (
        <>
          {/* Style */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Estilo visual</p>
            <div className="grid grid-cols-4 gap-2">
              {ESTILOS.map(s => (
                <button key={s.id} type="button" onClick={() => setEstilo(s.id)}
                  className={`py-3 px-2 rounded-xl border-2 text-center transition-all
                    ${estilo === s.id ? "border-brand-gold bg-brand-gold/5" : "border-zinc-200 hover:border-zinc-300"}`}>
                  <p className="text-lg mb-1">{s.emoji}</p>
                  <p className={`text-xs font-medium ${estilo === s.id ? "text-brand-primary" : "text-zinc-600"}`}>
                    {s.label}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Cor predominante</p>
            <div className="flex flex-wrap gap-2">
              {CORES_PRESET.map(c => (
                <button key={c.value} type="button"
                  onClick={() => { setCor(c.value); setCorHex(c.hex); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all
                    ${cor === c.value ? "border-brand-gold" : "border-zinc-200 hover:border-zinc-300"}`}>
                  <span className="w-4 h-4 rounded-full border border-white/40 shrink-0" style={{ background: c.hex }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Orelhas + quarta capa + ref */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Opções adicionais</p>

            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setUsarOrelhas(!usarOrelhas)}
                className={`w-10 h-5 rounded-full border-2 transition-colors relative
                  ${usarOrelhas ? "bg-brand-gold border-brand-gold" : "bg-zinc-200 border-zinc-300"}`}>
                <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
                  ${usarOrelhas ? "left-5" : "left-0.5"}`} />
              </div>
              <div>
                <p className="text-sm text-zinc-700 font-medium">Incluir orelhas (8cm)</p>
                <p className="text-xs text-zinc-400">Dobras laterais — espaço para bio do autor</p>
              </div>
            </label>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                Texto da quarta capa (gerado automaticamente, editável)
              </label>
              <textarea value={quartaTexto} onChange={e => setQuartaTexto(e.target.value)} rows={4}
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm resize-none
                  focus:outline-none focus:border-brand-gold" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                Imagem de referência (opcional)
              </label>
              {imgRef ? (
                <div className="flex items-center gap-3">
                  <img src={imgRef} alt="ref" className="w-16 h-16 object-cover rounded-lg border border-zinc-200" />
                  <button onClick={() => setImgRef(null)}
                    className="text-xs text-red-500 hover:text-red-700">Remover</button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-zinc-300
                  cursor-pointer hover:border-brand-gold/50 text-xs text-zinc-500 w-fit">
                  <UploadIcon size={14} />
                  Selecionar imagem
                  <input type="file" accept="image/*" className="hidden" onChange={handleRefImg} />
                </label>
              )}
              <p className="text-[11px] text-zinc-400 mt-1">
                Use como guia de estilo e composição. A IA não copia — adapta a atmosfera.
              </p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          )}

          <button onClick={() => handleGerar(false)} disabled={gerando}
            className="w-full py-4 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
              hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
            {gerando ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                Gerando 4 opções de capa… pode levar ~1 minuto
              </span>
            ) : "Gerar capas com IA →"}
          </button>
        </>
      ) : (
        <>
          {/* Options grid */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Escolha uma capa ({resultado.opcoes.length} opções geradas)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {resultado.opcoes.map((op, i) => (
                <button key={op.url} onClick={() => setEscolhida(op.url)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-[2/3]
                    ${escolhida === op.url ? "border-brand-gold shadow-md" : "border-zinc-200 hover:border-zinc-300"}`}>
                  <Image src={op.url} alt={`Opção ${i + 1}`} fill className="object-cover" />
                  {escolhida === op.url && (
                    <div className="absolute inset-0 bg-brand-gold/10 flex items-center justify-center">
                      <span className="bg-brand-gold text-brand-primary text-xs font-bold px-2 py-1 rounded-full">
                        Selecionada
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => handleGerar(true)} disabled={gerando}
              className="px-5 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
                hover:border-amber-300 transition-colors disabled:opacity-50">
              {gerando && isRegen ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
                  Regerando…
                </span>
              ) : (
                <span>
                  Gerar novamente <span className="text-amber-600 font-medium">(20 créditos)</span>
                </span>
              )}
            </button>
            <button
              onClick={() => escolhida && onSalvo(resultado, escolhida)}
              disabled={!escolhida}
              className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm
                hover:bg-brand-gold/90 transition-colors disabled:opacity-50">
              Aceitar esta capa →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Manual editor ────────────────────────────────────────────────────────────

interface PainelEditorProps {
  id: PainelId;
  widthMm: number;
  heightMm: number;
  scale: number;
  state: PainelState;
  onChange: (s: PainelState) => void;
  label: string;
  isFold?: boolean;
}

function PainelEditor({ id, widthMm, heightMm, scale, state, onChange, label, isFold }: PainelEditorProps) {
  const w = widthMm * scale;
  const h = heightMm * scale;

  function handleImgUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      onChange({ ...state, bgUrl: URL.createObjectURL(f), bgBase64: result.split(",")[1], bgMime: f.type });
    };
    reader.readAsDataURL(f);
  }

  return (
    <div
      style={{ width: w, height: h, minWidth: w }}
      className="relative border-r border-zinc-200 last:border-r-0 flex-shrink-0 overflow-hidden bg-zinc-100"
    >
      {/* Background image */}
      {state.bgUrl ? (
        <img src={state.bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
      ) : (
        <label className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer
          hover:bg-zinc-200/60 transition-colors group">
          <UploadIcon size={16} className="text-zinc-400 group-hover:text-zinc-600" />
          <span className="text-[9px] text-zinc-400 mt-1 group-hover:text-zinc-600">Imagem</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleImgUpload} />
        </label>
      )}

      {/* Panel label overlay at top */}
      <div className="absolute top-1 left-0 right-0 flex justify-center pointer-events-none">
        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded
          ${isFold ? "bg-blue-500/80 text-white" : "bg-zinc-700/70 text-white"}`}>
          {label}
        </span>
      </div>

      {/* Text fields (for non-lombada panels) */}
      {id !== "lombada" && (
        <div className="absolute bottom-2 left-1 right-1 space-y-1">
          {(id === "frente" || id === "contra") && (
            <input
              value={state.titulo}
              onChange={e => onChange({ ...state, titulo: e.target.value })}
              placeholder="Título"
              className="w-full bg-black/50 text-white text-[9px] font-bold placeholder-white/50
                border-0 outline-none px-1 py-0.5 rounded"
            />
          )}
          {id === "frente" && (
            <input
              value={state.autor}
              onChange={e => onChange({ ...state, autor: e.target.value })}
              placeholder="Autor"
              className="w-full bg-black/40 text-white text-[8px] placeholder-white/50
                border-0 outline-none px-1 py-0.5 rounded"
            />
          )}
          {id === "contra" && (
            <input
              value={state.subtitulo}
              onChange={e => onChange({ ...state, subtitulo: e.target.value })}
              placeholder="Sinopse / quarta capa"
              className="w-full bg-black/40 text-white/90 text-[7px] placeholder-white/50
                border-0 outline-none px-1 py-0.5 rounded"
            />
          )}
        </div>
      )}

      {/* Lombada text (rotated) */}
      {id === "lombada" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="transform -rotate-90 whitespace-nowrap">
            <input
              value={state.titulo}
              onChange={e => onChange({ ...state, titulo: e.target.value })}
              placeholder="Título · Autor"
              className="bg-transparent text-white text-[8px] font-bold border-0 outline-none
                text-center placeholder-white/50"
              style={{ width: h - 4 }}
            />
          </div>
        </div>
      )}

      {/* Re-upload overlay when image exists */}
      {state.bgUrl && (
        <label className="absolute top-5 right-1 cursor-pointer">
          <div className="bg-white/80 hover:bg-white rounded px-1 py-0.5 text-[8px] text-zinc-700">
            Trocar
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={handleImgUpload} />
        </label>
      )}
    </div>
  );
}

function ModoManual({
  projectId,
  titulo: tituloInicial,
  autor: autorInicial,
  sinopse,
  formatoInicial,
  onSalvo,
  onVoltar,
}: {
  projectId: string;
  titulo: string;
  autor: string;
  sinopse: string;
  formatoInicial: FormatoId;
  onSalvo: () => void;
  onVoltar: () => void;
}) {
  const formato = formatoInicial; // inherited from page-level selector
  const [paginas, setPaginas] = useState(200);
  const [usarOrelhas, setUsarOrelhas] = useState(false);
  const [exportDpi, setExportDpi] = useState<150 | 300>(300);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fmtInfo = FORMATOS.find(f => f.id === formato)!;
  const lombadaMm = calcLombadaMm(paginas);

  const [paineis, setPaineis] = useState<Record<PainelId, PainelState>>({
    orelha_verso:  { ...emptyPainel() },
    contra:        { ...emptyPainel(), titulo: tituloInicial, subtitulo: sinopse?.slice(0, 200) ?? "" },
    lombada:       { ...emptyPainel(), titulo: `${tituloInicial} · ${autorInicial}` },
    frente:        { ...emptyPainel(), titulo: tituloInicial, autor: autorInicial },
    orelha_frente: { ...emptyPainel() },
  });

  function updatePainel(id: PainelId, s: PainelState) {
    setPaineis(prev => ({ ...prev, [id]: s }));
  }

  // Scale: fit spread in ~700px viewport width
  const sangriaMm = 3;
  const orelhasMm = usarOrelhas ? 80 : 0;
  const spreadWMm = sangriaMm + orelhasMm + fmtInfo.w + lombadaMm + fmtInfo.w + orelhasMm + sangriaMm;
  const spreadHMm = sangriaMm + fmtInfo.h + sangriaMm;
  const VIEWPORT_W = 700;
  const scale = VIEWPORT_W / spreadWMm; // px per mm

  // ── Export canvas to real PNG and upload ─────────────────────────────────
  async function handleExportar() {
    setExporting(true);
    setError(null);
    try {
      const DPI = exportDpi;
      const mm2px = DPI / 25.4;
      const sangriaMm = 3;
      const orelhasMm2 = usarOrelhas ? 80 : 0;
      const totalWMm = sangriaMm + orelhasMm2 + fmtInfo.w + lombadaMm + fmtInfo.w + orelhasMm2 + sangriaMm;
      const totalHMm = sangriaMm + fmtInfo.h + sangriaMm;
      const cW = Math.round(totalWMm * mm2px);
      const cH = Math.round(totalHMm * mm2px);

      const canvas = document.createElement("canvas");
      canvas.width = cW;
      canvas.height = cH;
      const ctx = canvas.getContext("2d")!;

      // White background
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cW, cH);

      // Draw each panel left to right
      let xMm = sangriaMm;
      const panelOrder: { id: PainelId; wMm: number }[] = [
        ...(usarOrelhas ? [{ id: "orelha_verso" as PainelId, wMm: orelhasMm2 }] : []),
        { id: "contra",  wMm: fmtInfo.w },
        { id: "lombada", wMm: lombadaMm },
        { id: "frente",  wMm: fmtInfo.w },
        ...(usarOrelhas ? [{ id: "orelha_frente" as PainelId, wMm: orelhasMm2 }] : []),
      ];

      for (const { id: pid, wMm } of panelOrder) {
        const px = Math.round(xMm * mm2px);
        const py = Math.round(sangriaMm * mm2px);
        const pw = Math.round(wMm * mm2px);
        const ph = Math.round(fmtInfo.h * mm2px);
        const p = paineis[pid];

        if (p.bgUrl) {
          await new Promise<void>(resolve => {
            const img = new window.Image();
            img.onload = () => { ctx.drawImage(img, px, py, pw, ph); resolve(); };
            img.onerror = () => resolve();
            img.src = p.bgUrl!;
          });
        } else {
          ctx.fillStyle = pid === "lombada" ? "#1a1a2e" : "#2d2d4e";
          ctx.fillRect(px, py, pw, ph);
        }

        // Text overlays
        ctx.fillStyle = "#ffffff";
        if (p.titulo) {
          if (pid === "lombada") {
            ctx.save();
            ctx.translate(px + pw / 2, py + ph / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.font = `bold ${Math.round(pw * 0.4)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(p.titulo.slice(0, 40), 0, 0);
            ctx.restore();
          } else {
            ctx.font = `bold ${Math.round(Math.min(pw * 0.06, 18))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(p.titulo.slice(0, 40), px + pw / 2, py + ph - 40);
          }
        }
        if (p.autor && pid === "frente") {
          ctx.font = `${Math.round(Math.min(pw * 0.045, 14))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(p.autor.slice(0, 40), px + pw / 2, py + ph - 20);
        }
        xMm += wMm;
      }

      // Export as PNG
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error("Canvas export failed")), "image/png")
      );
      const reader = new FileReader();
      const b64 = await new Promise<string>((res, rej) => {
        reader.onload = () => res((reader.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(blob);
      });

      const r = await fetch("/api/agentes/upload-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          imagem_base64: b64,
          mime_type: "image/png",
          largura_px: cW,
          altura_px: cH,
          dpi: DPI,
          formato,
          paginas,
          usar_orelhas: usarOrelhas,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao exportar");
      onSalvo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao exportar capa");
    } finally {
      setExporting(false);
    }
  }

  async function handleSalvar() {
    setSaving(true);
    setError(null);
    try {
      const snapshot = Object.fromEntries(
        Object.entries(paineis).map(([k, v]) => [
          k,
          { titulo: v.titulo, autor: v.autor, subtitulo: v.subtitulo, has_image: !!v.bgUrl },
        ])
      );
      await supabase
        .from("projects")
        .update({
          dados_capa: {
            modo: "manual",
            formato,
            paginas,
            usar_orelhas: usarOrelhas,
            paineis: snapshot,
            gerado_em: new Date().toISOString(),
          },
          etapa_atual: "capa",
        })
        .eq("id", projectId);
      onSalvo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // Build ordered panels for display
  const ordenados: { id: PainelId; label: string; wMm: number; isFold?: boolean }[] = [
    ...(usarOrelhas ? [{ id: "orelha_verso" as PainelId, label: "Orelha V", wMm: orelhasMm, isFold: true }] : []),
    { id: "contra",  label: "Verso",   wMm: fmtInfo.w },
    { id: "lombada", label: "Lombada", wMm: lombadaMm },
    { id: "frente",  label: "Frente",  wMm: fmtInfo.w },
    ...(usarOrelhas ? [{ id: "orelha_frente" as PainelId, label: "Orelha F", wMm: orelhasMm, isFold: true }] : []),
  ];

  return (
    <div className="space-y-6">
      <button onClick={onVoltar} className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
        ← Voltar
      </button>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-zinc-100 p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Formato</label>
          <p className="text-sm font-medium text-brand-primary px-3 py-2 border border-zinc-200 rounded-lg bg-zinc-50">
            {fmtInfo?.label} <span className="text-zinc-400 text-xs">(definido na etapa anterior)</span>
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1.5">Páginas</label>
          <input type="number" min={10} max={1500} value={paginas}
            onChange={e => setPaginas(Number(e.target.value))}
            className="w-24 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer pb-0.5">
          <div onClick={() => setUsarOrelhas(!usarOrelhas)}
            className={`w-10 h-5 rounded-full border-2 transition-colors relative
              ${usarOrelhas ? "bg-brand-gold border-brand-gold" : "bg-zinc-200 border-zinc-300"}`}>
            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
              ${usarOrelhas ? "left-5" : "left-0.5"}`} />
          </div>
          <span className="text-xs text-zinc-600">Orelhas (8cm)</span>
        </label>
        <div className="text-xs text-zinc-400">
          Lombada: <strong className="text-zinc-600">{lombadaMm}mm</strong>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-red-400" />
          Sangria (3mm)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-blue-400" />
          Dobra / lombada
        </span>
      </div>

      {/* Canvas */}
      <div className="overflow-x-auto pb-4">
        <div
          style={{ width: spreadWMm * scale, height: spreadHMm * scale }}
          className="relative bg-zinc-300 mx-auto"
        >
          {/* Bleed (sangria) area shown as darker border */}
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, bottom: 0,
              border: `${sangriaMm * scale}px dashed #ef4444`,
              pointerEvents: "none",
              zIndex: 20,
            }}
          />

          {/* Panels */}
          <div className="absolute flex"
            style={{ top: sangriaMm * scale, left: sangriaMm * scale, height: fmtInfo.h * scale }}>
            {ordenados.map(p => (
              <div key={p.id} style={{ position: "relative" }}>
                {/* Fold line on left edge (except first) */}
                {p.isFold && (
                  <div style={{
                    position: "absolute",
                    left: 0, top: 0, bottom: 0,
                    width: 1,
                    borderLeft: "1px dashed #3b82f6",
                    zIndex: 25,
                    pointerEvents: "none",
                  }} />
                )}
                <PainelEditor
                  id={p.id}
                  widthMm={p.wMm}
                  heightMm={fmtInfo.h}
                  scale={scale}
                  state={paineis[p.id]}
                  onChange={s => updatePainel(p.id, s)}
                  label={p.label}
                  isFold={p.isFold}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-zinc-50 rounded-xl p-4 text-xs text-zinc-500">
        <p><strong>Como usar:</strong> Clique em cada painel para adicionar uma imagem de fundo. Edite os textos diretamente no painel. O editor mostra as linhas de sangria (vermelho) e dobras (azul).</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {/* DPI selector */}
      <div className="bg-white rounded-xl border border-zinc-100 p-4">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Resolução de exportação</p>
        <div className="flex gap-3">
          {([150, 300] as const).map(dpi => (
            <button
              key={dpi}
              onClick={() => setExportDpi(dpi)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors
                ${exportDpi === dpi
                  ? "border-brand-gold bg-brand-gold/5 text-brand-primary"
                  : "border-zinc-200 text-zinc-500 hover:border-brand-gold/30"}`}
            >
              {dpi} dpi {dpi === 300 ? "(impressão)" : "(digital)"}
            </button>
          ))}
        </div>
        {exportDpi === 300 && (
          <p className="mt-2 text-xs text-amber-600">
            300 dpi recomendado para impressão. O arquivo será maior e o processo de exportação pode levar alguns segundos a mais.
          </p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleExportar} disabled={exporting || saving}
          className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
            hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
          {exporting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
              Exportando capa…
            </span>
          ) : `Exportar capa (PNG ${exportDpi}dpi) →`}
        </button>
        <button onClick={handleSalvar} disabled={saving || exporting}
          className="px-5 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
            hover:border-zinc-300 transition-colors disabled:opacity-50">
          {saving ? "Salvando…" : "Salvar rascunho"}
        </button>
      </div>
    </div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultadoCard({
  dados,
  onContinuar,
  onRefazer,
}: {
  dados: Record<string, unknown>;
  onContinuar: () => void;
  onRefazer: () => void;
}) {
  const modo = dados.modo as string;
  const url = (dados.url_escolhida ?? dados.url) as string | undefined;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <CheckCircleIcon />
          </div>
          <div>
            <p className="font-medium text-brand-primary text-sm">
              {modo === "upload" ? "Capa enviada com sucesso" :
               modo === "ia" ? "Capa gerada com IA" :
               "Capa criada no editor"}
            </p>
            <p className="text-xs text-zinc-400">
              {dados.gerado_em ? new Date(dados.gerado_em as string).toLocaleString("pt-BR") : ""}
            </p>
          </div>
        </div>

        {url && (
          <div className="flex justify-center mb-4">
            <div className="relative w-40 aspect-[2/3] rounded-xl overflow-hidden border border-zinc-200 shadow-sm">
              <Image src={url} alt="Capa" fill className="object-cover" />
            </div>
          </div>
        )}
        {!url && modo === "manual" && (
          <div className="flex justify-center mb-4">
            <div className="w-40 aspect-[2/3] rounded-xl border border-zinc-200 bg-zinc-50
              flex items-center justify-center text-zinc-400 text-xs">
              Editor manual
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={onRefazer}
          className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
            hover:border-brand-gold/30 transition-colors">
          Refazer capa
        </button>
        <button onClick={onContinuar}
          className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm
            hover:bg-brand-gold/90 transition-colors">
          Aceito — Continuar para Créditos →
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [modo, setModo] = useState<Modo>("escolha");
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState<Record<string, unknown> | null>(null);

  // Project data for AI and editor
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [sinopse, setSinopse] = useState("");
  const [genero, setGenero] = useState("literatura");

  // Single source of truth for book format — selected once here, propagates to Créditos + Diagramação
  const [formatoGlobal, setFormatoGlobal] = useState<FormatoId>("16x23");
  // Real lombada calculated after Diagramação (paginas_reais × 0.07 mm)
  const [lombadaReal, setLombadaReal] = useState<number | null>(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("dados_elementos, dados_capa, dados_miolo, manuscripts:manuscript_id(autor_primeiro_nome, autor_sobrenome)")
        .eq("id", id)
        .single();

      if (data?.dados_elementos) {
        const el = data.dados_elementos as Record<string, unknown>;
        setTitulo((el.titulo_escolhido as string) ?? (el.opcoes_titulo as string[])?.[0] ?? "");
        setSinopse(el.sinopse_curta as string ?? "");
        if (el.genero) setGenero(el.genero as string);
      }

      const ms = data?.manuscripts as { autor_primeiro_nome?: string; autor_sobrenome?: string } | null;
      if (ms) {
        setAutor([ms.autor_primeiro_nome, ms.autor_sobrenome].filter(Boolean).join(" "));
      }

      // Restore saved format (single source of truth)
      const capa = data?.dados_capa as Record<string, unknown> | null;
      if (capa) {
        setDados(capa);
        if (capa.formato) setFormatoGlobal(capa.formato as FormatoId);
      }

      // Load real lombada if diagramação was already done
      const miolo = data?.dados_miolo as { lombada_mm?: number } | null;
      if (miolo?.lombada_mm) setLombadaReal(miolo.lombada_mm);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Persist format change immediately so downstream steps can read it
  async function handleFormatoChange(f: FormatoId) {
    setFormatoGlobal(f);
    await supabase
      .from("projects")
      .update({ dados_capa: { ...(dados ?? {}), formato: f } })
      .eq("id", id);
  }

  useEffect(() => { loadProject(); }, [loadProject]);

  async function handleContinuar() {
    await supabase
      .from("projects")
      .update({ etapa_atual: "creditos" })
      .eq("id", id);
    router.push(`/dashboard/creditos/${id}`);
  }

  async function handleSkip() {
    // Always persist the selected format so Créditos and Diagramação have it
    await supabase
      .from("projects")
      .update({ dados_capa: { modo: "skip", formato: formatoGlobal }, etapa_atual: "creditos" })
      .eq("id", id);
    router.push(`/dashboard/creditos/${id}`);
  }

  function handleSalvoIA(result: CapaGeradaResult, escolhida: string) {
    const saved = { ...result, url_escolhida: escolhida };
    setDados(saved as unknown as Record<string, unknown>);
  }

  function handleSalvoUpload(result: CapaUploadResult) {
    setDados(result as unknown as Record<string, unknown>);
  }

  function handleSalvoManual() {
    loadProject();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <EtapasProgress currentStep={3} projectId={id} />
      <main className="max-w-4xl mx-auto px-4 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Passo 4 — Capa
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">Criação da capa</h1>
          <p className="text-zinc-500 mt-1.5 text-sm">
            Envie uma capa pronta, gere com IA ou crie no editor interativo.
          </p>
        </div>

        {/* Already has result */}
        {dados && modo === "escolha" ? (
          <ResultadoCard
            dados={dados}
            onContinuar={handleContinuar}
            onRefazer={() => { setDados(null); setModo("escolha"); }}
          />
        ) : modo === "escolha" ? (
          <div className="space-y-6">
            {/* Format selector — single source of truth, propagates to Créditos and Diagramação */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                Formato do livro <span className="text-zinc-300 normal-case font-normal">(definido uma vez, usado em todas as etapas)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {FORMATOS.map(f => (
                  <button key={f.id} type="button" onClick={() => handleFormatoChange(f.id)}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all
                      ${formatoGlobal === f.id
                        ? "border-brand-gold bg-brand-gold/5 text-brand-primary"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                    {f.label}
                    <span className="text-xs font-normal text-zinc-400 ml-1.5">{f.sub}</span>
                  </button>
                ))}
              </div>
              {lombadaReal !== null && (
                <p className="text-xs text-emerald-600 mt-2">
                  Lombada calculada após diagramação: <strong>{lombadaReal}mm</strong>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ModoCard
                icon={<UploadIcon />}
                title="Upload de capa pronta"
                desc="Você já tem o arquivo final. Vamos verificar se as dimensões estão corretas para o formato e número de páginas."
                onClick={() => setModo("upload")}
              />
              <ModoCard
                icon={<SparklesIcon />}
                title="Gerar com IA"
                desc="Escolha estilo, cor e referências. A IA cria 4 opções completas — frente, lombada, quarta capa e orelhas."
                onClick={() => setModo("ia")}
              />
              <ModoCard
                icon={<PencilIcon />}
                title="Editor interativo"
                desc="Monte a capa com suas próprias imagens. Painel com guias de sangria e dobras — você tem controle total."
                onClick={() => setModo("manual")}
              />
            </div>

            <div className="text-center">
              <button onClick={handleSkip}
                className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2">
                Pular esta etapa — já tenho a capa fora da plataforma
              </button>
            </div>
          </div>
        ) : modo === "upload" ? (
          <ModoUpload
            projectId={id}
            formatoInicial={formatoGlobal}
            lombadaReal={lombadaReal}
            onSalvo={r => { handleSalvoUpload(r); setModo("escolha"); }}
            onVoltar={() => setModo("escolha")}
          />
        ) : modo === "ia" ? (
          <ModoIA
            projectId={id}
            titulo={titulo}
            autor={autor}
            sinopse={sinopse}
            genero={genero}
            onSalvo={(r, escolhida) => { handleSalvoIA(r, escolhida); setModo("escolha"); }}
            onVoltar={() => setModo("escolha")}
          />
        ) : modo === "manual" ? (
          <ModoManual
            projectId={id}
            titulo={titulo}
            autor={autor}
            sinopse={sinopse}
            formatoInicial={formatoGlobal}
            onSalvo={() => { handleSalvoManual(); setModo("escolha"); }}
            onVoltar={() => setModo("escolha")}
          />
        ) : null}

      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon({ size = 20, className = "text-brand-gold" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-brand-gold">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-brand-gold">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-emerald-600">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

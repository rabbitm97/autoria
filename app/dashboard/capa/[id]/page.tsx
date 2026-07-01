"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { CapaGeradaResult, EstiloCapa } from "@/app/api/agentes/gerar-capa/route";
import type { CapaUploadResult, CapaValidacao } from "@/app/api/agentes/upload-capa/route";
import type { AnaliseTecnica } from "@/lib/capa-analyzer";
import { FORMATOS_LIVRO, type FormatoLivro, getFormatoDef, estimarLombadaCapaMm, LIMITE_DIVERGENCIA_LOMBADA_MM } from "@/lib/formatos";
import { ORELHA_MIN_MM, getOrelhaDefault, getOrelhaMax, clampOrelhaMm, type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";

// ─── Constants ────────────────────────────────────────────────────────────────

type Modo = "escolha" | "upload" | "ia";


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

function calcLombadaMm(paginas: number) {
  return estimarLombadaCapaMm(paginas);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModoCard({
  icon,
  title,
  desc,
  onClick,
  warning,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  warning?: string;
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
        {warning && (
          <p className="text-[11px] text-amber-600 mt-2 leading-relaxed">⚠ {warning}</p>
        )}
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
  estimativaPaginas,
  fonteEstimativa,
  onSalvo,
  onVoltar,
}: {
  projectId: string;
  formatoInicial: FormatoLivro;
  lombadaReal: number | null;
  estimativaPaginas: number | null;
  fonteEstimativa: "miolo_real" | "estimado" | null;
  onSalvo: (result: CapaUploadResult) => void;
  onVoltar: () => void;
}) {
  const formato = formatoInicial;
  const [paginas, setPaginas] = useState(estimativaPaginas ?? 200);

  useEffect(() => {
    if (estimativaPaginas != null) setPaginas(estimativaPaginas);
  }, [estimativaPaginas]);
  const [orelhaMm, setOrelhaMm] = useState(0);
  const [dpi, setDpi] = useState<300 | 150>(300);

  // Clamp orelhaMm to format range whenever format changes
  useEffect(() => {
    setOrelhaMm((prev) => (prev > 0 ? clampOrelhaMm(formato as FormatKey, prev) : 0));
  }, [formato]);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [validacao, setValidacao] = useState<CapaValidacao | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usarOrelhas = orelhaMm > 0;
  const orelhaMaxCm = getOrelhaMax(formato as FormatKey) / 10;
  const orelhaMinCm = ORELHA_MIN_MM / 10;
  const orelhaCm = Math.round(orelhaMm / 10);

  // Use real lombada from diagramação if available, otherwise estimate
  const lombada = lombadaReal ?? calcLombadaMm(paginas);
  const fmtSpecs = getFormatoDef(formato).specs;
  const sangria = fmtSpecs.bleed_mm;
  const orelha = orelhaMm;
  const espWMm = sangria + orelha + fmtSpecs.width_mm + lombada + fmtSpecs.width_mm + orelha + sangria;
  const espHMm = sangria + fmtSpecs.height_mm + sangria;
  const mm2px = dpi / 25.4;
  const espWPx = Math.round(espWMm * mm2px);
  const espHPx = Math.round(espHMm * mm2px);

  // Auto-executa verificação de dimensões sempre que o autor sobe arquivo
  // OU muda páginas/orelhas/DPI. Elimina necessidade do botão "Verificar
  // dimensões" — o resultado aparece imediato.
  useEffect(() => {
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
    setValidacao({
      ok: wOk && hOk,
      largura_esperada_mm: espWMm,
      altura_esperada_mm: espHMm,
      largura_recebida_mm: rW,
      altura_recebida_mm: rH,
      tolerancia_mm: 2,
      detalhes,
    });
  }, [dims, espWMm, espHMm, espWPx, espHPx, mm2px]);

  const [convertingPdf, setConvertingPdf] = useState(false);

  async function handleFileChange(f: File) {
    setValidacao(null);
    setError(null);

    // PDF: renderizar primeira página em canvas 300 DPI e converter para PNG.
    // pdf.js é carregado sob demanda para não pesar o bundle da rota.
    if (f.type === "application/pdf") {
      setConvertingPdf(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        const page = await doc.getPage(1);
        // pdf.js usa 72 dpi como base → escala 300/72 para 300 DPI.
        const viewport = page.getViewport({ scale: 300 / 72 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Não foi possível criar contexto 2D para renderizar o PDF.");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Falha ao converter PDF em imagem.");
        const pngName = f.name.replace(/\.pdf$/i, "") + ".png";
        const pngFile = new File([blob], pngName, { type: "image/png" });
        setFile(pngFile);
        const url = URL.createObjectURL(pngFile);
        setPreview(url);
        setDims({ w: canvas.width, h: canvas.height });
      } catch (e) {
        setError(e instanceof Error ? `Falha ao ler PDF: ${e.message}` : "Falha ao ler PDF.");
      } finally {
        setConvertingPdf(false);
      }
      return;
    }

    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const img = new window.Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }

  async function handleUpload() {
    if (!file || !dims) return;
    setUploading(true);
    setError(null);
    try {
      const presignRes = await fetch("/api/agentes/upload-capa/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, mime_type: file.type }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "Erro ao obter URL de upload");

      const { error: uploadError } = await supabase.storage
        .from("capas")
        .uploadToSignedUrl(presign.storage_path, presign.token, file, { contentType: file.type });
      if (uploadError) throw new Error(`Erro ao enviar imagem: ${uploadError.message}`);

      const r = await fetch("/api/agentes/upload-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          storage_path: presign.storage_path,
          mime_type: file.type,
          largura_px: dims.w,
          altura_px: dims.h,
          dpi,
          paginas,
          orelha_mm: orelhaMm,
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
          <p className="text-sm font-medium text-brand-primary">{getFormatoDef(formato).label} ({getFormatoDef(formato).dimensoes})</p>
          <p className="text-xs text-zinc-400 ml-auto">Alterável na tela anterior</p>
        </div>
        <div className="hidden">
        </div>

        {/* Pages + orelhas + DPI */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1.5">Páginas</label>
            {fonteEstimativa === "miolo_real" && (
              <p className="text-xs text-emerald-700 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                Número real do miolo já diagramado ({paginas} págs., lombada {calcLombadaMm(paginas)}mm).
              </p>
            )}
            {fonteEstimativa === "estimado" && (
              <p className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                Estimativa baseada no manuscrito. Ajustamos automaticamente após a diagramação se a lombada divergir.
              </p>
            )}
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
          <div className="flex flex-col justify-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <div onClick={() => setOrelhaMm(usarOrelhas ? 0 : getOrelhaDefault(formato as FormatKey))}
                className={`w-10 h-5 rounded-full border-2 transition-colors relative
                  ${usarOrelhas ? "bg-brand-gold border-brand-gold" : "bg-zinc-200 border-zinc-300"}`}>
                <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
                  ${usarOrelhas ? "left-5" : "left-0.5"}`} />
              </div>
              <span className="text-xs text-zinc-600">Orelhas</span>
            </label>
            {usarOrelhas && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={orelhaMinCm}
                  max={orelhaMaxCm}
                  step={1}
                  value={orelhaCm}
                  onChange={(e) => {
                    const cm = Number(e.target.value);
                    if (!Number.isFinite(cm)) return;
                    setOrelhaMm(clampOrelhaMm(formato as FormatKey, cm * 10));
                  }}
                  className="w-14 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-brand-gold"
                />
                <span className="text-xs text-zinc-500">cm ({orelhaMinCm}–{orelhaMaxCm})</span>
              </div>
            )}
          </div>
        </div>

        {/* Expected size */}
        <div className="bg-zinc-50 rounded-xl p-4 text-xs text-zinc-600">
          <p className="font-medium mb-1">Dimensões esperadas para sua capa:</p>
          <p>{espWMm}mm × {espHMm}mm ({espWPx}px × {espHPx}px @ {dpi}dpi)</p>
          <p className="text-zinc-400 mt-1">
            = {sangria}mm sangria + {usarOrelhas ? `${orelha}mm orelha + ` : ""}{fmtSpecs.width_mm}mm frente + {lombada}mm lombada{lombadaReal !== null ? " ✓ real" : " (estimativa)"} + {fmtSpecs.width_mm}mm verso{usarOrelhas ? ` + ${orelha}mm orelha` : ""} + {sangria}mm sangria
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
              <button onClick={() => { setFile(null); setPreview(null); setDims(null); setValidacao(null); }}
                className="px-4 py-2 rounded-lg border border-zinc-200 text-zinc-600 text-xs hover:border-zinc-300 transition-colors">
                Remover
              </button>
            </div>

            {validacao && (
              <div className={`rounded-xl p-3 border text-xs ${validacao.ok
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                <p className="font-semibold">
                  {validacao.ok ? "✓ Dimensões dentro da tolerância" : "⚠ Dimensões fora do esperado"}
                </p>
                {!validacao.ok && validacao.detalhes.map((d, i) => (
                  <p key={i} className="mt-0.5">{d}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed
            border-zinc-300 rounded-xl cursor-pointer hover:border-brand-gold/50 hover:bg-zinc-50 transition-colors">
            {convertingPdf ? (
              <>
                <span className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                <p className="text-sm font-medium text-zinc-600 mt-2">Convertendo PDF…</p>
                <p className="text-xs text-zinc-400 mt-1">Renderizando a primeira página</p>
              </>
            ) : (
              <>
                <UploadIcon />
                <p className="text-sm font-medium text-zinc-600 mt-2">Clique para selecionar</p>
                <p className="text-xs text-zinc-400 mt-1">PNG, JPG ou PDF, alta resolução</p>
              </>
            )}
            <input type="file" accept="image/png,image/jpeg,application/pdf" className="hidden"
              disabled={convertingPdf}
              onChange={e => { if (e.target.files?.[0]) void handleFileChange(e.target.files[0]); }} />
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
  formatoInicial,
  titulo,
  autor,
  sinopse,
  genero,
  estimativaPaginas,
  onSalvo,
  onVoltar,
}: {
  projectId: string;
  formatoInicial: FormatoLivro;
  titulo: string;
  autor: string;
  sinopse: string;
  genero: string;
  estimativaPaginas: number | null;
  onSalvo: (result: CapaGeradaResult, escolhida: string) => void;
  onVoltar: () => void;
}) {
  const [paginas, setPaginas] = useState(estimativaPaginas ?? 200);

  useEffect(() => {
    if (estimativaPaginas != null) setPaginas(estimativaPaginas);
  }, [estimativaPaginas]);

  const formato = formatoInicial;
  const [estilo, setEstilo] = useState<EstiloCapa>("minimalista");
  const [cor, setCor] = useState(CORES_PRESET[0].value);
  const [corHex, setCorHex] = useState(CORES_PRESET[0].hex);
  const [orelhaMm, setOrelhaMm] = useState(0);
  useEffect(() => {
    setOrelhaMm((prev) => (prev > 0 ? clampOrelhaMm(formato as FormatKey, prev) : 0));
  }, [formato]);
  const usarOrelhas = orelhaMm > 0;
  const orelhaMaxCm = getOrelhaMax(formato as FormatKey) / 10;
  const orelhaMinCm = ORELHA_MIN_MM / 10;
  const orelhaCm = Math.round(orelhaMm / 10);
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
          estilo,
          cor_predominante: cor,
          orelha_mm: orelhaMm,
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
              <div onClick={() => setOrelhaMm(usarOrelhas ? 0 : getOrelhaDefault(formato as FormatKey))}
                className={`w-10 h-5 rounded-full border-2 transition-colors relative
                  ${usarOrelhas ? "bg-brand-gold border-brand-gold" : "bg-zinc-200 border-zinc-300"}`}>
                <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
                  ${usarOrelhas ? "left-5" : "left-0.5"}`} />
              </div>
              <div>
                <p className="text-sm text-zinc-700 font-medium">Incluir orelhas</p>
                <p className="text-xs text-zinc-400">Dobras laterais — espaço para bio do autor</p>
              </div>
            </label>
            {usarOrelhas && (
              <div className="flex items-center gap-2 pl-13">
                <label className="text-xs text-zinc-500">Largura:</label>
                <input
                  type="number"
                  min={orelhaMinCm}
                  max={orelhaMaxCm}
                  step={1}
                  value={orelhaCm}
                  onChange={(e) => {
                    const cm = Number(e.target.value);
                    if (!Number.isFinite(cm)) return;
                    setOrelhaMm(clampOrelhaMm(formato as FormatKey, cm * 10));
                  }}
                  className="w-16 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-brand-gold"
                />
                <span className="text-xs text-zinc-500">cm ({orelhaMinCm}–{orelhaMaxCm})</span>
              </div>
            )}

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

// ─── Recomendações técnicas (verbal, contextual) ──────────────────────────────

type Recomendacao = {
  nivel: "ok" | "aviso" | "info";
  titulo: string;
  detalhe: string;
};

function buildRecomendacoes(
  analise: AnaliseTecnica | undefined,
): Recomendacao[] {
  if (!analise) return [];
  const recs: Recomendacao[] = [];

  // Colorspace
  if (analise.colorspace === "cmyk") {
    recs.push({
      nivel: "ok",
      titulo: "Cores em CMYK",
      detalhe: "Perfeito para impressão. As cores no papel vão sair exatamente como você vê.",
    });
  } else if (analise.colorspace === "srgb" || analise.colorspace === "rgb16") {
    recs.push({
      nivel: "aviso",
      titulo: "Cores em RGB",
      detalhe: "A capa está em RGB (padrão de tela). Para eBook e Kindle está pronta. Para impressão física, converteremos automaticamente para CMYK — algumas cores muito saturadas podem ficar levemente diferentes no papel.",
    });
  }

  // Sangria
  if (analise.sangria === "presente") {
    recs.push({
      nivel: "ok",
      titulo: "Sangria de 3mm presente",
      detalhe: "As bordas da capa têm a margem de segurança que a gráfica precisa para cortar sem deixar filete branco.",
    });
  } else if (analise.sangria === "ausente" || analise.sangria === "parcial") {
    recs.push({
      nivel: "aviso",
      titulo: analise.sangria === "ausente" ? "Sangria de 3mm ausente" : "Sangria de 3mm parcial",
      detalhe: "Para eBook e Kindle isso não importa. Para impressão física, sem sangria a gráfica pode deixar um filete branco fino na borda ao cortar — recomendamos redimensionar a arte com +3mm em cada lado.",
    });
  }

  // DPI
  if (analise.dpi >= 300) {
    recs.push({
      nivel: "ok",
      titulo: `${analise.dpi} DPI`,
      detalhe: "Resolução alta o suficiente para impressão profissional sem pixelização.",
    });
  } else if (analise.dpi > 0) {
    recs.push({
      nivel: "aviso",
      titulo: `Resolução ${analise.dpi} DPI`,
      detalhe: `Abaixo dos 300 DPI recomendados para impressão. Para eBook e Kindle está ótimo. Para impressão física, elementos finos (texto pequeno, linhas) podem sair levemente serrilhados no papel.`,
    });
  }

  // Marcas de corte
  if (analise.marcas_corte === "detectadas") {
    recs.push({
      nivel: "info",
      titulo: "Marcas de corte detectadas",
      detalhe: "Sua capa tem indicações de onde a gráfica deve cortar. Isso é bom — mostra que ela foi preparada para produção.",
    });
  }

  // Lombada deduzida vs esperada
  if (
    analise.lombada_deduzida_mm != null &&
    analise.lombada_esperada_mm > 0
  ) {
    const diff = analise.lombada_deduzida_mm - analise.lombada_esperada_mm;
    const absDiff = Math.abs(diff);
    if (absDiff <= 1) {
      recs.push({
        nivel: "ok",
        titulo: `Lombada com ${analise.lombada_deduzida_mm}mm`,
        detalhe: `Bate com a espessura estimada pelo miolo (${analise.lombada_esperada_mm}mm).`,
      });
    } else {
      recs.push({
        nivel: "aviso",
        titulo: `Lombada diverge em ${absDiff.toFixed(1)}mm`,
        detalhe: `Sua capa tem lombada de ${analise.lombada_deduzida_mm}mm, mas o miolo indica ${analise.lombada_esperada_mm}mm. Diferenças acima de 1mm fazem o texto da lombada aparecer torto ou na dobra. Se você já sabe a espessura final do livro, revise; senão, gere a capa novamente após confirmar o miolo.`,
      });
    }
  }

  // Orelha deduzida vs esperada
  if (
    analise.orelha_deduzida_mm != null &&
    analise.orelha_esperada_mm != null
  ) {
    if (analise.orelha_deduzida_mm !== analise.orelha_esperada_mm) {
      recs.push({
        nivel: "aviso",
        titulo: analise.orelha_deduzida_mm === 0
          ? "Sem orelhas detectadas"
          : `Orelhas de ${analise.orelha_deduzida_mm}mm detectadas`,
        detalhe: analise.orelha_esperada_mm === 0
          ? `Você não marcou orelhas, mas a imagem parece incluir espaço para orelhas de ${analise.orelha_deduzida_mm}mm. Marque a caixa "Orelhas" acima para bater com a arte enviada.`
          : `Você marcou orelhas de ${analise.orelha_esperada_mm}mm, mas a imagem indica ${analise.orelha_deduzida_mm}mm. Ajuste no campo acima ou reenvie a arte.`,
      });
    }
  }

  return recs;
}

function RecomendacoesTecnicas({
  analise,
}: {
  analise: AnaliseTecnica | undefined;
}) {
  if (!analise) {
    return (
      <div className="mt-4 text-xs text-zinc-500 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-zinc-300 animate-pulse"></span>
        Analisando capa tecnicamente...
      </div>
    );
  }

  const recs = buildRecomendacoes(analise);
  if (recs.length === 0) {
    return (
      <div className="mt-4 text-xs text-zinc-500">
        Análise técnica concluída — nenhum aviso.
      </div>
    );
  }

  const styles = {
    ok:    { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-900", dot: "bg-emerald-500" },
    aviso: { border: "border-amber-200",   bg: "bg-amber-50",   text: "text-amber-900",   dot: "bg-amber-500" },
    info:  { border: "border-blue-200",    bg: "bg-blue-50",    text: "text-blue-900",    dot: "bg-blue-500" },
  } as const;

  return (
    <div className="mt-4 space-y-2">
      <div className="text-xs font-medium text-zinc-700">Análise técnica da capa</div>
      <div className="space-y-2">
        {recs.map((rec, idx) => {
          const s = styles[rec.nivel];
          return (
            <div key={idx} className={`rounded-lg border ${s.border} ${s.bg} p-3`}>
              <div className="flex items-start gap-2">
                <span className={`inline-block h-2 w-2 rounded-full mt-1.5 shrink-0 ${s.dot}`} />
                <div className="flex-1">
                  <p className={`text-xs font-semibold ${s.text}`}>{rec.titulo}</p>
                  <p className={`text-xs mt-0.5 ${s.text} opacity-80 leading-relaxed`}>{rec.detalhe}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!analise.ok_grafica && (
        <p className="text-xs text-zinc-500 pt-1">
          Para eBook e Kindle, a capa já está pronta. Ajustes acima só afetam impressão física.
        </p>
      )}
    </div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function AnaliseBadge({
  label,
  variant,
}: {
  label: string;
  variant: "ok" | "aviso" | "info";
}) {
  const styles = {
    ok:    "bg-emerald-50 text-emerald-800 border-emerald-200",
    aviso: "bg-amber-50 text-amber-800 border-amber-200",
    info:  "bg-blue-50 text-blue-800 border-blue-200",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}

function ResultadoCard({
  dados,
  onContinuar,
  onRefazer,
  onEditarEditor,
}: {
  dados: Record<string, unknown>;
  onContinuar: () => void;
  onRefazer: () => void;
  onEditarEditor?: () => void;
}) {
  const modo = (dados.source === "editor" ? "editor" : dados.modo) as string;
  const url = (dados.imagem_url ?? dados.url_escolhida ?? dados.url) as string | undefined;
  const analise = dados.analise_tecnica as AnaliseTecnica | undefined;

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
               modo === "editor" ? "Capa criada no editor" :
               "Capa registrada"}
            </p>
            <p className="text-xs text-zinc-400">
              {dados.gerado_em ? new Date(dados.gerado_em as string).toLocaleString("pt-BR") : ""}
            </p>
          </div>
        </div>

        {url && (
          <div className="flex justify-center mb-4">
            <div className="relative w-full max-w-xl aspect-[16/5] rounded-xl overflow-hidden border border-zinc-200 shadow-sm bg-zinc-50">
              <Image src={url} alt="Capa" fill className="object-contain" />
            </div>
          </div>
        )}

        <RecomendacoesTecnicas analise={analise} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={onRefazer}
          className="px-6 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
            hover:border-brand-gold/30 transition-colors">
          Refazer capa
        </button>
        {onEditarEditor && (
          <button onClick={onEditarEditor}
            className="px-6 py-3 rounded-xl border border-brand-gold/40 text-brand-primary text-sm
              hover:bg-brand-gold/5 transition-colors">
            Editar no editor
          </button>
        )}
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
  const [formatoGlobal, setFormatoGlobal] = useState<FormatoLivro>("padrao_br");
  // Lombada real: sempre RECALCULADA a partir de paginas_reais usando a
  // fórmula unificada de `estimarLombadaCapaMm`. NÃO confiar em
  // `dados_miolo.lombada_mm` do banco — projetos com miolo gerado antes
  // do 14.G tinham fórmula legada (× 0.078) fossilizada nesse campo.
  const [lombadaReal, setLombadaReal] = useState<number | null>(null);
  // Estimated pages from manuscript (or real pages if miolo already generated)
  const [estimativaPaginas, setEstimativaPaginas] = useState<number | null>(null);
  const [fonteEstimativa, setFonteEstimativa] = useState<"miolo_real" | "estimado" | null>(null);
  // Lombada adjustment
  const [ajusteDisponivel, setAjusteDisponivel] = useState<{ anterior: number; nova: number; diff: number } | null>(null);
  const [ajustando, setAjustando] = useState(false);

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

      const capa = data?.dados_capa as Record<string, unknown> | null;
      if (capa) setDados(capa);

      const fmtRes = await fetch(`/api/projects/${id}/formato`).then(r => r.ok ? r.json() : null);
      if (fmtRes?.formato) setFormatoGlobal(fmtRes.formato as FormatoLivro);

      // Load real lombada if diagramação was already done — recalculada
      // a partir de paginas_reais (nunca lê lombada_mm fossilizada do banco)
      const miolo = data?.dados_miolo as { lombada_mm?: number; paginas_reais?: number } | null;
      if (miolo?.paginas_reais) {
        const lombadaRecalculada = estimarLombadaCapaMm(miolo.paginas_reais);
        setLombadaReal(lombadaRecalculada);
        // Detect divergence with the lombada used when the IA cover was generated
        const capaDados = data?.dados_capa as { lombada_mm?: number; modo?: string } | null;
        if (capaDados?.modo === "ia" && capaDados?.lombada_mm) {
          const diff = Math.abs(capaDados.lombada_mm - lombadaRecalculada);
          setAjusteDisponivel(diff > LIMITE_DIVERGENCIA_LOMBADA_MM ? { anterior: capaDados.lombada_mm, nova: lombadaRecalculada, diff } : null);
        } else {
          setAjusteDisponivel(null);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // Polling de análise técnica. Dispara quando `dados` está populado mas
  // ainda não tem `analise_tecnica` (esperando o fire-and-forget do
  // /analisar terminar). Consulta o banco a cada 3s, para em 60s ou
  // quando popular.
  useEffect(() => {
    if (!dados) return;
    if (dados.modo === "skip") return;
    if (dados.analise_tecnica) return;
    const hasUrl = dados.url || dados.url_escolhida || dados.imagem_url;
    if (!hasUrl) return;

    let cancelled = false;
    let ticks = 0;
    const MAX_TICKS = 20; // 20 × 3s = 60s
    const INTERVAL_MS = 3000;

    const poll = async () => {
      if (cancelled) return;
      ticks++;
      try {
        const { data: proj } = await supabase
          .from("projects")
          .select("dados_capa")
          .eq("id", id)
          .single();
        const capa = proj?.dados_capa as Record<string, unknown> | null;
        if (capa?.analise_tecnica) {
          setDados(capa);
          return;
        }
      } catch (err) {
        console.warn("[capa polling] falha:", err);
      }
      if (ticks < MAX_TICKS && !cancelled) {
        setTimeout(poll, INTERVAL_MS);
      }
    };

    const timer = setTimeout(poll, INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dados, id]);

  useEffect(() => {
    if (!id || !formatoGlobal) return;
    fetch(`/api/projects/${id}/estimativa-paginas?formato=${formatoGlobal}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setEstimativaPaginas(data.paginas_estimadas);
        setFonteEstimativa(data.fonte === "miolo_real" ? "miolo_real" : "estimado");
      })
      .catch(() => { /* fall back to default 200 */ });
  }, [id, formatoGlobal]);

  async function handleContinuar() {
    // Se a análise técnica marcou !ok_grafica, alerta o autor antes de
    // avançar. Os itens listados NÃO bloqueiam publicação em eBook/Kindle,
    // mas afetam impressão física. window.confirm é intencional: dialog
    // custom aqui seria overkill para um gate opcional.
    const analise = dados?.analise_tecnica as AnaliseTecnica | undefined;
    if (analise && !analise.ok_grafica) {
      const problemas: string[] = [];
      if (analise.colorspace !== "cmyk") {
        problemas.push("• Capa em RGB (converteremos para CMYK ao imprimir)");
      }
      if (analise.sangria !== "presente") {
        problemas.push("• Sangria de 3mm ausente ou incompleta");
      }
      if (analise.dpi > 0 && analise.dpi < 300) {
        problemas.push(`• Resolução de ${analise.dpi} DPI (recomendado 300)`);
      }
      if (
        analise.lombada_deduzida_mm != null &&
        analise.lombada_esperada_mm > 0 &&
        Math.abs(analise.lombada_deduzida_mm - analise.lombada_esperada_mm) > 1
      ) {
        const diff = Math.abs(analise.lombada_deduzida_mm - analise.lombada_esperada_mm);
        problemas.push(`• Lombada diverge do estimado em ${diff.toFixed(1)}mm`);
      }
      if (problemas.length > 0) {
        const msg =
          "Sua capa tem divergências que podem afetar a impressão física:\n\n" +
          problemas.join("\n") +
          "\n\nPara eBook e Kindle a capa está pronta. Deseja avançar mesmo assim?";
        if (!window.confirm(msg)) return;
      }
    }

    await supabase
      .from("projects")
      .update({ etapa_atual: "creditos" })
      .eq("id", id);
    router.push(`/dashboard/creditos/${id}`);
  }

  async function handleSkip() {
    await supabase
      .from("projects")
      .update({ dados_capa: { modo: "skip" }, etapa_atual: "creditos" })
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

        {/* Already has result — only show ResultadoCard for upload/IA, not editor (handled in grid) */}
        {dados && modo === "escolha" && dados.source !== "editor" ? (
          <ResultadoCard
            dados={dados}
            onContinuar={handleContinuar}
            onRefazer={async () => {
              // Zera dados_capa no banco antes de limpar estado local. Sem
              // isso, o editor abre "continuando" a capa anterior (background
              // + elements persistidos em editor_data) em vez de em branco.
              try {
                await fetch(`/api/projects/${id}/capa/reset`, { method: "POST" });
              } catch (err) {
                console.error("[capa] falha ao resetar dados_capa (não-fatal):", err);
              }
              setDados(null);
              setModo("escolha");
            }}
            onEditarEditor={() => router.push(`/editor/capa/${id}`)}
          />
        ) : modo === "escolha" ? (
          <div className="space-y-6">
            {/* Format — read-only; defined in Elementos step */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Formato do livro
              </p>
              <p className="text-sm font-medium text-brand-primary">
                {FORMATOS_LIVRO.find(f => f.value === formatoGlobal)?.label ?? "—"}{" "}
                <span className="text-zinc-400 font-normal">
                  {FORMATOS_LIVRO.find(f => f.value === formatoGlobal)?.dimensoes}
                </span>
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Definido em Elementos.{" "}
                {lombadaReal !== null && (
                  <span className="text-emerald-600">Lombada após diagramação: <strong>{lombadaReal}mm</strong></span>
                )}
              </p>
            </div>

            {/* Lombada adjustment banner — shown when miolo is done and spine diverges */}
            {ajusteDisponivel && (
              <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl">
                <h3 className="font-semibold text-amber-900 text-sm mb-1.5">
                  Lombada da capa precisa de ajuste
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed mb-3">
                  O miolo ficou com <strong>{ajusteDisponivel.nova}mm</strong> de lombada, mas sua capa foi gerada
                  com <strong>{ajusteDisponivel.anterior}mm</strong> (diferença de {ajusteDisponivel.diff.toFixed(1)}mm).
                  Ajuste automático regenera só a lombada, sem custo de créditos.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setAjustando(true);
                      try {
                        const res = await fetch("/api/agentes/ajustar-lombada", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ project_id: id }),
                        });
                        if (res.ok) {
                          setAjusteDisponivel(null);
                          await loadProject();
                        }
                      } finally {
                        setAjustando(false);
                      }
                    }}
                    disabled={ajustando}
                    className="px-4 py-2 bg-amber-700 text-white rounded-lg text-xs font-medium hover:bg-amber-800 transition-colors disabled:opacity-50"
                  >
                    {ajustando ? "Ajustando…" : "Ajustar automaticamente"}
                  </button>
                  <button
                    onClick={() => setAjusteDisponivel(null)}
                    className="px-4 py-2 bg-transparent text-amber-800 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            )}

            {(() => {
              const editorConfirmed = dados?.source === "editor" && dados?.confirmed_at;
              const editorThumbnail = editorConfirmed ? (dados?.imagem_url as string | undefined) : null;
              const editorConfirmedAt = editorConfirmed ? (dados?.confirmed_at as string) : null;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ModoCard
                    icon={<UploadIcon />}
                    title="Upload de capa pronta"
                    desc="Você já tem o arquivo final. Vamos verificar se as dimensões estão corretas para o formato e número de páginas."
                    warning={editorConfirmed ? "Substituirá a capa atual feita no editor." : undefined}
                    onClick={() => setModo("upload")}
                  />
                  <ModoCard
                    icon={<SparklesIcon />}
                    title="Gerar com IA"
                    desc="Escolha estilo, cor e referências. A IA cria 4 opções completas — frente, lombada, quarta capa e orelhas."
                    warning={editorConfirmed ? "Substituirá a capa atual feita no editor." : undefined}
                    onClick={() => setModo("ia")}
                  />
                  {editorConfirmed ? (
                    <div className="flex flex-col p-6 bg-white rounded-2xl border border-emerald-200 text-left">
                      {editorThumbnail ? (
                        <div className="mb-3 w-full aspect-[16/5] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                          <img src={editorThumbnail} alt="Capa atual" className="h-full w-full object-contain" />
                        </div>
                      ) : (
                        <div className="mb-3 w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                          <PencilIcon />
                        </div>
                      )}
                      <p className="font-semibold text-brand-primary text-sm">
                        Editor interativo{" "}
                        <span className="text-xs font-normal text-emerald-600">✓ Capa confirmada</span>
                      </p>
                      {editorConfirmedAt && (
                        <p className="text-xs text-zinc-400 mt-1">
                          Confirmada em {new Date(editorConfirmedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}.
                        </p>
                      )}
                      {(() => {
                        const analise = dados?.analise_tecnica as AnaliseTecnica | undefined;
                        if (!analise) {
                          return (
                            <p className="text-[11px] text-zinc-500 mt-2 flex items-center gap-1.5">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse"></span>
                              Analisando tecnicamente...
                            </p>
                          );
                        }
                        return (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <AnaliseBadge
                              label={analise.colorspace === "cmyk" ? "CMYK ✓" : analise.colorspace === "srgb" ? "RGB" : analise.colorspace === "rgb16" ? "RGB 16" : "Cor?"}
                              variant={analise.colorspace === "cmyk" ? "ok" : "aviso"}
                            />
                            <AnaliseBadge
                              label={analise.sangria === "presente" ? "Sangria ✓" : analise.sangria === "ausente" ? "Sem sangria" : analise.sangria === "parcial" ? "Sangria parcial" : "Dimensões?"}
                              variant={analise.sangria === "presente" ? "ok" : "aviso"}
                            />
                            <AnaliseBadge
                              label={`${analise.dpi} DPI`}
                              variant={analise.dpi >= 300 ? "ok" : "aviso"}
                            />
                          </div>
                        );
                      })()}
                      <div className="mt-auto pt-4 flex flex-col gap-2">
                        <Link
                          href={`/editor/capa/${id}`}
                          className="text-xs font-medium text-brand-gold hover:underline"
                        >
                          Continuar editando →
                        </Link>
                        <button
                          onClick={handleContinuar}
                          className="text-xs font-medium text-emerald-600 hover:underline text-left"
                        >
                          Avançar para Créditos →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => router.push(`/editor/capa/${id}`)}
                      className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border border-zinc-200
                        hover:border-brand-gold/60 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-brand-gold/10 flex items-center justify-center
                        group-hover:bg-brand-gold/20 transition-colors">
                        <PencilIcon />
                      </div>
                      <div>
                        <p className="font-semibold text-brand-primary text-sm">Editor interativo</p>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                          Crie sua capa do zero com texto, imagens e elementos da marca em um editor visual fullscreen.
                        </p>
                      </div>
                      <span className="text-xs font-medium text-brand-gold mt-auto">Abrir editor →</span>
                    </button>
                  )}
                </div>
              );
            })()}

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
            estimativaPaginas={estimativaPaginas}
            fonteEstimativa={fonteEstimativa}
            onSalvo={r => { handleSalvoUpload(r); setModo("escolha"); }}
            onVoltar={() => setModo("escolha")}
          />
        ) : modo === "ia" ? (
          <ModoIA
            projectId={id}
            formatoInicial={formatoGlobal}
            titulo={titulo}
            autor={autor}
            sinopse={sinopse}
            genero={genero}
            estimativaPaginas={estimativaPaginas}
            onSalvo={(r, escolhida) => { handleSalvoIA(r, escolhida); setModo("escolha"); }}
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

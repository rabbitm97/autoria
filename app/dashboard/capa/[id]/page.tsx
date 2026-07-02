"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import type { CapaGeradaResult, EstiloCapa } from "@/app/api/agentes/gerar-capa/route";
import type { CapaUploadResult } from "@/app/api/agentes/upload-capa/route";
import type { AnaliseTecnica } from "@/lib/capa-analyzer";
import { FORMATOS_LIVRO, type FormatoLivro, getFormatoDef, estimarLombadaCapaMm, LIMITE_DIVERGENCIA_LOMBADA_MM } from "@/lib/formatos";
import { ORELHA_MIN_MM, getOrelhaDefault, getOrelhaMax, clampOrelhaMm, type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";

// ─── Constants ────────────────────────────────────────────────────────────────

type Modo = "escolha" | "upload" | "ia";

/**
 * Limite de tamanho para upload (arquivo original, antes de qualquer conversão).
 * Rationale: pipeline serverless da Vercel Hobby tem limite de ~4.5MB no body
 * de requests e memória apertada em `sharp`/`pdfjs`. Aceitar arquivos muito
 * grandes trava a conversão de PDF no cliente e o registro no servidor.
 * Autores com arquivos maiores são orientados a comprimir ou a nos contactar.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;


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

/**
 * ModoUpload unificado (14.M.1.2).
 *
 * Card único com duas seções:
 *  1. Informações do formato: formato, orelhas (toggle+input), lombada
 *     calculada, dimensões esperadas.
 *  2. Arquivo: dropzone com upload automático, preview, recomendações
 *     técnicas inline.
 *
 * Sem campo "Páginas" (o valor vem de paginas_reais/estimativa),
 * sem seletor de DPI (sempre 300), sem botão manual de conferência
 * (validação client-side é automática), sem tela ResultadoCard
 * intermediária (o próprio card mostra estado salvo).
 *
 * Upload dispara automaticamente quando arquivo é selecionado. Análise
 * técnica é populada via polling no CapaPage (14.M.1.1).
 */
function ModoUpload({
  projectId,
  formatoInicial,
  lombadaReal,
  estimativaPaginas,
  dadosSalvos,
  pollingTimeout,
  onSalvo,
  onContinuar,
  onRefazer,
  onReanalisar,
  onVoltar,
}: {
  projectId: string;
  formatoInicial: FormatoLivro;
  lombadaReal: number | null;
  estimativaPaginas: number | null;
  fonteEstimativa: "miolo_real" | "estimado" | null;
  dadosSalvos: Record<string, unknown> | null;
  pollingTimeout: boolean;
  onSalvo: (result: CapaUploadResult) => void;
  onContinuar: () => void;
  onRefazer: () => void;
  onReanalisar: () => void;
  onVoltar: () => void;
}) {
  const formato = formatoInicial;

  // Páginas usadas para calcular lombada — nunca editável. Se miolo já
  // gerado, usa paginas_reais (recalculada em lombadaReal via
  // estimarLombadaCapaMm no loadProject do CapaPage — 14.M.1.1). Senão,
  // estimativa a partir de caracteres/cpp do endpoint (14.M.1.2A).
  const paginas = estimativaPaginas ?? 200;

  // Orelhas: única decisão real do autor neste card.
  const [orelhaMm, setOrelhaMm] = useState(0);

  // Clamp orelhaMm ao trocar formato
  useEffect(() => {
    setOrelhaMm((prev) => (prev > 0 ? clampOrelhaMm(formato as FormatKey, prev) : 0));
  }, [formato]);

  // DPI fixo em 300 (assumido). Análise técnica reporta DPI real depois.
  const dpi = 300;

  // Arquivo local
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [convertingPdf, setConvertingPdf] = useState(false);
  // PDF cru quando o autor sobe um PDF — a conversão para PNG é o que
  // vai para o pipeline principal (dims/análise), mas o PDF original é
  // preservado em paralelo no Storage para eventual reimpressão.
  const [pdfOriginal, setPdfOriginal] = useState<File | null>(null);

  // Ref no input de arquivo — permite "Trocar capa" abrir o picker sem
  // desmontar o dropzone (que passaria por onRefazer/reset).
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(!!dadosSalvos && dadosSalvos.modo === "upload");
  const [error, setError] = useState<string | null>(null);

  // Origem do arquivo já persistido (para renderizar recomendações sem
  // avisar sobre DPI quando a origem era PDF).
  const origemArquivoSalva = (dadosSalvos?.origem_arquivo ?? undefined) as
    | "pdf"
    | "png"
    | "jpg"
    | undefined;

  // Se veio com dados salvos (autor recarregou a página com upload já feito),
  // popula preview a partir da URL do banco.
  //
  // Depende explicitamente de `dadosSalvos.gerado_em` (além de dadosSalvos)
  // para garantir que trocar capa (mesma URL, novo timestamp) dispare
  // repopulação do preview. Sem esta dependência, React pode considerar
  // dadosSalvos "igual" via reference equality e não reprocessar.
  const dadosSalvosGeradoEm = dadosSalvos?.gerado_em as string | undefined;

  useEffect(() => {
    if (dadosSalvos && dadosSalvos.modo === "upload") {
      const url = dadosSalvos.url as string | undefined;
      const wPx = dadosSalvos.largura_px as number | undefined;
      const hPx = dadosSalvos.altura_px as number | undefined;
      const orelhaSalva = dadosSalvos.orelha_mm as number | undefined;

      // Signed URLs (do 14.M.1.6) já são únicas por sessão e contém
      // ?token=... — anexar ?v= adicional quebrava a assinatura.
      // Cache busting agora é implícito: cada nova análise gera URL nova.
      if (url) {
        console.info(`[capa upload] repopulando preview com ${url}`);
        setPreview(url);
      }
      if (wPx && hPx) setDims({ w: wPx, h: hPx });
      if (typeof orelhaSalva === "number") setOrelhaMm(orelhaSalva);
      setUploaded(true);
    }
  }, [dadosSalvos, dadosSalvosGeradoEm]);

  const usarOrelhas = orelhaMm > 0;
  const orelhaMaxCm = getOrelhaMax(formato as FormatKey) / 10;
  const orelhaMinCm = ORELHA_MIN_MM / 10;
  const orelhaCm = Math.round(orelhaMm / 10);

  const lombada = lombadaReal ?? calcLombadaMm(paginas);
  const fmtSpecs = getFormatoDef(formato).specs;
  const sangria = fmtSpecs.bleed_mm;
  const orelha = orelhaMm;
  const espWMm = sangria + orelha + fmtSpecs.width_mm + lombada + fmtSpecs.width_mm + orelha + sangria;
  const espHMm = sangria + fmtSpecs.height_mm + sangria;
  const mm2px = dpi / 25.4;
  const espWPx = Math.round(espWMm * mm2px);
  const espHPx = Math.round(espHMm * mm2px);

  // Auto-upload: dispara quando file + dims estão disponíveis e upload
  // ainda não rodou nesta sessão. Sem validação client-side de dimensões
  // aqui — a análise técnica (populada por polling) reporta o mesmo com
  // mais precisão; duplicar apenas confundia o autor.
  const uploadTriggeredRef = useRef(false);
  useEffect(() => {
    if (!file || !dims || uploading || uploaded) return;
    if (uploadTriggeredRef.current) return;
    uploadTriggeredRef.current = true;
    void handleUpload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, dims]);

  async function handleFileChange(f: File) {
    setError(null);
    uploadTriggeredRef.current = false;

    // Limite de tamanho: aplica-se ao arquivo original enviado (antes de
    // qualquer conversão). Autores com arquivos maiores são orientados a
    // comprimir ou contactar o suporte.
    if (f.size > MAX_UPLOAD_BYTES) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      const limitMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
      const isPdfOriginal = f.type === "application/pdf";
      setError(
        `Arquivo com ${mb}MB — acima do limite de ${limitMb}MB. ` +
          (isPdfOriginal
            ? "PDFs muito grandes travam a conversão no navegador. Exporte com resolução menor (150 DPI é suficiente para capa) ou envie a arte em PNG. "
            : "Reduza a resolução ou salve em JPG. ") +
          "Se precisar de ajuda, escreva para oi@autoria.app.",
      );
      return;
    }

    // PDF → PNG (primeira página @ 300 DPI)
    if (f.type === "application/pdf") {
      setPdfOriginal(f);
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
        const viewport = page.getViewport({ scale: 300 / 72 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Não foi possível criar contexto 2D.");
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Falha ao converter PDF em imagem.");
        const pngName = f.name.replace(/\.pdf$/i, "") + ".png";
        const pngFile = new File([blob], pngName, { type: "image/png" });
        setFile(pngFile);
        setPreview(URL.createObjectURL(pngFile));
        setDims({ w: canvas.width, h: canvas.height });
      } catch (e) {
        setError(e instanceof Error ? `Falha ao ler PDF: ${e.message}` : "Falha ao ler PDF.");
        setPdfOriginal(null);
      } finally {
        setConvertingPdf(false);
      }
      return;
    }

    setPdfOriginal(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    const img = new window.Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = URL.createObjectURL(f);
  }

  /**
   * Abre o picker de arquivos sem passar por `onRefazer`. Diferença
   * fundamental: `onRefazer` chama o endpoint de reset e volta ao grid
   * de escolha; `handleTrocarArquivo` só limpa o estado local do card
   * e reabre o input. Assim o autor troca a capa sem perder o modo
   * upload nem contexto de dimensões esperadas.
   */
  function handleTrocarArquivo() {
    setFile(null);
    setPreview(null);
    setDims(null);
    setError(null);
    setPdfOriginal(null);
    setUploaded(false);
    uploadTriggeredRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function handleUpload() {
    if (!file || !dims) return;
    setUploading(true);
    setError(null);
    try {
      // 1. Presign para o PNG principal
      const presignRes = await fetch("/api/agentes/upload-capa/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, mime_type: file.type }),
      });
      if (!presignRes.ok) {
        const j = await presignRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao obter URL de upload.");
      }
      const { token, storage_path } = await presignRes.json();

      // 2. Upload direto para o Storage. Usa a SDK do Supabase — mais
      // confiável que PUT cru contra a signed URL (que pode variar entre
      // versões do supabase-js quanto a headers/token).
      const uploadPng = supabase.storage
        .from("capas")
        .uploadToSignedUrl(storage_path, token, file, { contentType: file.type });

      // 2b. Em paralelo: preserva o PDF original quando aplicável.
      // Usa `fetch` direto ao signed URL (mais simples de debugar que
      // `uploadToSignedUrl`) e registra causa da falha em uma variável
      // separada — enviada ao backend para rastreamento sem bloquear.
      let pdfOriginalPath: string | null = null;
      let pdfOriginalError: string | null = null;
      const uploadPdfOriginal = pdfOriginal
        ? (async () => {
            try {
              const presignPdf = await fetch("/api/agentes/upload-capa/presign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ project_id: projectId, mime_type: "application/pdf" }),
              });
              if (!presignPdf.ok) {
                const errBody = await presignPdf.text().catch(() => "");
                throw new Error(`presign PDF falhou (HTTP ${presignPdf.status}): ${errBody.slice(0, 200)}`);
              }
              const { signed_url: pdfSignedUrl, token: pdfToken, storage_path: pdfPath } = await presignPdf.json();

              // Upload direto via signed URL (fetch nu, não wrapper).
              const putRes = await fetch(pdfSignedUrl, {
                method: "PUT",
                headers: {
                  "Content-Type": "application/pdf",
                  Authorization: `Bearer ${pdfToken}`,
                  "x-upsert": "true",
                },
                body: pdfOriginal,
              });
              if (!putRes.ok) {
                const errBody = await putRes.text().catch(() => "");
                throw new Error(`PUT PDF falhou (HTTP ${putRes.status}): ${errBody.slice(0, 200)}`);
              }
              pdfOriginalPath = pdfPath;
              console.info(`[upload-capa] PDF original preservado em ${pdfPath}`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error("[upload-capa] PDF original preservation FAILED:", msg);
              pdfOriginalError = msg.slice(0, 500);
            }
          })()
        : Promise.resolve();

      const [uploadResult] = await Promise.all([uploadPng, uploadPdfOriginal]);
      if (uploadResult.error) {
        throw new Error(`Falha ao enviar imagem: ${uploadResult.error.message}`);
      }

      // 3. Registra na aplicação
      const origemArquivo: "pdf" | "png" | "jpg" = pdfOriginal
        ? "pdf"
        : file.type.includes("png")
        ? "png"
        : "jpg";
      const filenameOriginal = pdfOriginal?.name ?? file.name;
      const registerRes = await fetch("/api/agentes/upload-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          storage_path,
          mime_type: file.type,
          largura_px: dims.w,
          altura_px: dims.h,
          dpi,
          paginas,
          orelha_mm: orelhaMm,
          origem_arquivo: origemArquivo,
          pdf_original_path: pdfOriginalPath,
          filename_original: filenameOriginal,
          pdf_original_error: pdfOriginalError,
        }),
      });
      if (!registerRes.ok) {
        const j = await registerRes.json().catch(() => ({}));
        throw new Error(j.error ?? "Falha ao registrar capa.");
      }
      const result: CapaUploadResult = await registerRes.json();
      setUploaded(true);
      onSalvo(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no upload.");
      uploadTriggeredRef.current = false; // permite retry
    } finally {
      setUploading(false);
    }
  }

  const analise = dadosSalvos?.analise_tecnica as AnaliseTecnica | undefined;

  const podeContinuar = uploaded && !uploading;

  return (
    <div className="space-y-6">
      <button onClick={onVoltar} className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
        ← Voltar
      </button>

      <div>
        <h2 className="text-lg font-medium text-brand-primary mb-1">Envie sua capa</h2>
        <p className="text-xs text-zinc-500">
          Suba o arquivo panorâmico (frente + lombada + verso), com sangria de 3mm.
        </p>
      </div>

      {/* Card único unificado */}
      <div className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
        {/* ── Seção 1: Informações do formato ────────────────────── */}
        <div className="p-6 space-y-5">
          {/* Formato */}
          <div className="flex items-center gap-3 py-2 px-3 bg-zinc-50 rounded-xl">
            <p className="text-xs text-zinc-500">Formato:</p>
            <p className="text-sm font-medium text-brand-primary">
              {getFormatoDef(formato).label} ({getFormatoDef(formato).dimensoes})
            </p>
            <p className="text-xs text-zinc-400 ml-auto">Alterável em Elementos</p>
          </div>

          {/* Orelhas + lombada */}
          <div className="flex items-start gap-6 flex-wrap">
            {/* Orelhas */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setOrelhaMm(usarOrelhas ? 0 : getOrelhaDefault(formato as FormatKey))}
                  className={`w-10 h-5 rounded-full border-2 transition-colors relative
                    ${usarOrelhas ? "bg-brand-gold border-brand-gold" : "bg-zinc-200 border-zinc-300"}`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all
                      ${usarOrelhas ? "left-5" : "left-0.5"}`}
                  />
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

            {/* Lombada (label puro, sem input) */}
            <div className="text-xs text-zinc-600 pt-1">
              Lombada: <span className="font-medium text-zinc-800">{lombada}mm</span>
            </div>
          </div>

          {/* Dimensões esperadas */}
          <div className="bg-zinc-50 rounded-xl p-4 text-xs text-zinc-600">
            <p className="font-medium mb-1 text-zinc-700">Dimensões esperadas para sua capa:</p>
            <p className="text-zinc-700">
              {espWMm}mm × {espHMm}mm ({espWPx}px × {espHPx}px @ {dpi}dpi)
            </p>
            <p className="text-zinc-400 mt-1">
              = {sangria}mm sangria
              {usarOrelhas && ` + ${orelha}mm orelha`}
              {" "}+ {fmtSpecs.width_mm}mm frente + {lombada}mm lombada + {fmtSpecs.width_mm}mm verso
              {usarOrelhas && ` + ${orelha}mm orelha`}
              {" "}+ {sangria}mm sangria
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-100"></div>

        {/* ── Seção 2: Arquivo da capa ────────────────────────────── */}
        <div className="p-6 space-y-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Arquivo da capa
          </p>

          {/* Input persistente: fica sempre montado para que
              `handleTrocarArquivo` possa abrir o picker programaticamente
              sem passar por remontagens do dropzone. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            className="hidden"
            disabled={convertingPdf}
            onChange={(e) => {
              if (e.target.files?.[0]) void handleFileChange(e.target.files[0]);
            }}
          />

          {preview ? (
            <div className="space-y-3">
              <div className="relative w-full max-h-64 overflow-hidden rounded-xl border border-zinc-200 flex items-center justify-center bg-zinc-50">
                <img
                  src={preview ?? undefined}
                  alt="Preview"
                  className="max-h-64 object-contain"
                  key={preview ?? "empty"}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                {/* Metadata do arquivo: só nome. Dimensões em pixels não
                    ajudam o autor a decidir nada — o que importa é o
                    resultado da análise técnica, que aparece abaixo. */}
                <span className="truncate">
                  {/*
                    Prioridade do nome exibido:
                    1. pdfOriginal.name — quando autor selecionou PDF na sessão
                       (antes ou durante upload). Preserva "capa.pdf" mesmo
                       quando internamente `file` é o PNG convertido.
                    2. dadosSalvos.filename_original — nome persistido após
                       upload concluído. Cobre reload da página e o caso
                       normal pós-upload.
                    3. file.name — arquivo local em memória, casos não-PDF.
                    4. Fallback "capa".
                  */}
                  {pdfOriginal?.name
                    ?? (dadosSalvos?.filename_original as string | undefined)
                    ?? file?.name
                    ?? "capa"}
                </span>
                {uploading && (
                  <span className="flex items-center gap-1.5 text-brand-primary shrink-0">
                    <span className="w-3 h-3 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                    Enviando…
                  </span>
                )}
                {uploaded && !uploading && (
                  <span className="text-emerald-600 flex items-center gap-1 shrink-0">✓ Enviada</span>
                )}
                <button
                  onClick={handleTrocarArquivo}
                  disabled={uploading}
                  className="ml-auto text-zinc-500 hover:text-zinc-700 underline underline-offset-2 disabled:opacity-40 shrink-0"
                >
                  {uploaded ? "Trocar arquivo" : "Remover"}
                </button>
              </div>

              {/* Recomendações técnicas completas (via polling do CapaPage).
                  Sem validação client-side de dimensões: a análise técnica
                  reporta o mesmo (e mais). Duplicar confunde o autor. */}
              {uploaded && !pollingTimeout && (
                <RecomendacoesTecnicas
                  analise={analise}
                  contexto={{
                    paginas,
                    formato,
                    orelhaDeclarada: orelhaMm,
                    lombadaEstimada: lombada,
                    origemArquivo: origemArquivoSalva,
                  }}
                  loading={!analise}
                />
              )}
              {uploaded && pollingTimeout && !analise && (
                <div className="rounded-xl p-4 border border-amber-200 bg-amber-50 text-xs text-amber-800">
                  <p className="font-medium mb-1">Análise demorou mais que o esperado</p>
                  <p className="mb-3">
                    A análise técnica ainda não chegou. Isso pode acontecer se o
                    arquivo é muito grande ou se houve troca de arquivo durante o
                    processamento.
                  </p>
                  <button
                    onClick={onReanalisar}
                    className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-medium transition-colors"
                  >
                    Tentar de novo
                  </button>
                </div>
              )}

              {error && (
                <div className="rounded-xl p-3 border border-red-200 bg-red-50 text-xs text-red-700">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={convertingPdf}
              className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed
              border-zinc-300 rounded-xl cursor-pointer hover:border-brand-gold/50 hover:bg-zinc-50 transition-colors disabled:cursor-wait"
            >
              {convertingPdf ? (
                <>
                  <span className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                  <p className="text-sm font-medium text-zinc-600 mt-2">Carregando…</p>
                </>
              ) : (
                <>
                  <UploadIcon />
                  <p className="text-sm font-medium text-zinc-600 mt-2">Clique para selecionar</p>
                  <p className="text-xs text-zinc-400 mt-1">PNG, JPG ou PDF, até 25MB</p>
                </>
              )}
            </button>
          )}

          {/* Erro fora do preview: aparece também quando o arquivo é
              rejeitado por tamanho antes de virar preview. */}
          {!preview && error && (
            <div className="rounded-xl p-3 border border-red-200 bg-red-50 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Botão Continuar (só aparece após upload concluído) */}
      {podeContinuar && (
        <button
          onClick={onContinuar}
          className="w-full py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm
            hover:bg-brand-gold/90 transition-colors"
        >
          Continuar para Créditos →
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
  origemArquivo?: "pdf" | "png" | "jpg",
): Recomendacao[] {
  if (!analise) return [];
  const recs: Recomendacao[] = [];

  // ──────────────────────────────────────────────────────────────────
  // 1. CONFIGURAÇÃO DA CAPA (dimensões + marcas + sangria unificados)
  //    Sempre primeira linha. Mensagens específicas por configuração.
  // ──────────────────────────────────────────────────────────────────
  const sangriaMm = analise.sangria_detectada_mm ?? 0;
  const areaUtil = analise.area_util_mm;

  if (analise.configuracao === "A") {
    recs.push({
      nivel: "ok",
      titulo: "Capa pronta para gráfica",
      detalhe: `Marcas de corte, sangria de ${sangriaMm}mm e dimensões corretas${
        areaUtil ? ` (${areaUtil.largura}mm × ${areaUtil.altura}mm dentro do corte)` : ""
      }. Formato ideal para impressão profissional.`,
    });
  } else if (analise.configuracao === "B") {
    recs.push({
      nivel: "aviso",
      titulo: "Capa com sangria, sem marcas de corte",
      detalhe: `Sua capa tem sangria de ${sangriaMm}mm mas não tem marcas de corte. Para eBook, Kindle e impressão sob demanda está pronta. Para gráfica offset, ideal ter marcas de corte para orientar o operador — não é bloqueador, mas alguns fluxos exigem.`,
    });
  } else if (analise.configuracao === "C") {
    recs.push({
      nivel: "aviso",
      titulo: "Capa no formato de eBook",
      detalhe: `Sua capa está no formato correto da área útil${
        areaUtil ? ` (${areaUtil.largura}mm × ${areaUtil.altura}mm)` : ""
      }. Para eBook e Kindle está pronta. Para impressão física, falta a sangria de 3mm (evita filete branco na borda) e as marcas de corte (orientam o corte da gráfica).`,
    });
  } else {
    recs.push({
      nivel: "aviso",
      titulo: "Dimensões fora do esperado",
      detalhe: `Sua capa tem ${analise.largura_mm}mm × ${analise.altura_mm}mm, mas não bate com nenhuma configuração esperada para este formato e número de páginas. Verifique se o formato do livro está correto e se a capa é panorâmica (frente + lombada + verso).`,
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 2. Colorspace
  // ──────────────────────────────────────────────────────────────────
  if (analise.colorspace === "cmyk") {
    recs.push({
      nivel: "ok",
      titulo: "Cores em CMYK",
      detalhe: analise.colorspace_source === "pdf"
        ? "Perfeito para impressão profissional. Detectado direto do PDF."
        : "Perfeito para impressão. As cores no papel vão sair como você vê.",
    });
  } else if (analise.colorspace === "srgb" || analise.colorspace === "rgb16") {
    recs.push({
      nivel: "aviso",
      titulo: "Cores em RGB",
      detalhe: "Sua capa está em RGB (padrão de tela). Para eBook, Kindle e impressão sob demanda, está pronta. Para tiragens grandes em gráfica offset, algumas cores muito saturadas podem sair levemente diferentes no papel.",
    });
  } else if (analise.colorspace === "other") {
    recs.push({
      nivel: "aviso",
      titulo: "Espaço de cor não identificado",
      detalhe: "Não conseguimos determinar o espaço de cor do arquivo. Recomendamos exportar como PNG, JPG ou PDF padrão.",
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 3. DPI — pulamos quando o original era PDF
  // ──────────────────────────────────────────────────────────────────
  if (origemArquivo === "pdf") {
    recs.push({
      nivel: "ok",
      titulo: "PDF vetorial",
      detalhe: "O arquivo original é PDF vetorial — o formato ideal para impressão. A qualidade não depende de DPI e será nítida em qualquer tamanho.",
    });
  } else if (analise.dpi >= 300) {
    recs.push({
      nivel: "ok",
      titulo: `${analise.dpi} DPI`,
      detalhe: "Resolução alta o suficiente para impressão profissional sem pixelização.",
    });
  } else if (analise.dpi > 0) {
    recs.push({
      nivel: "aviso",
      titulo: `Resolução ${analise.dpi} DPI`,
      detalhe: "Abaixo dos 300 DPI recomendados para impressão. Para eBook e Kindle está ótimo. Para impressão física, elementos finos (texto pequeno, linhas) podem sair levemente serrilhados.",
    });
  }

  // ──────────────────────────────────────────────────────────────────
  // 4. Lombada deduzida vs esperada
  // ──────────────────────────────────────────────────────────────────
  if (
    analise.lombada_deduzida_mm != null &&
    analise.lombada_esperada_mm > 0
  ) {
    const diff = analise.lombada_deduzida_mm - analise.lombada_esperada_mm;
    const absDiff = Math.abs(diff);
    if (absDiff > 1) {
      recs.push({
        nivel: "aviso",
        titulo: `Lombada diverge em ${absDiff.toFixed(1)}mm`,
        detalhe: `Sua capa tem lombada de ${analise.lombada_deduzida_mm}mm, mas o miolo indica ${analise.lombada_esperada_mm}mm. Diferenças acima de 1mm fazem o texto da lombada aparecer torto ou na dobra.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 5. Orelha deduzida vs esperada
  // ──────────────────────────────────────────────────────────────────
  if (
    analise.orelha_deduzida_mm != null &&
    analise.orelha_esperada_mm != null &&
    analise.orelha_deduzida_mm !== analise.orelha_esperada_mm
  ) {
    recs.push({
      nivel: "aviso",
      titulo: analise.orelha_deduzida_mm === 0
        ? "Sem orelhas detectadas na imagem"
        : `Orelhas de ${analise.orelha_deduzida_mm}mm detectadas`,
      detalhe: analise.orelha_esperada_mm === 0
        ? `Você não marcou orelhas, mas a imagem parece incluir espaço para orelhas de ${analise.orelha_deduzida_mm}mm. Marque a opção "Orelhas" acima para bater com a arte.`
        : `Você marcou orelhas de ${analise.orelha_esperada_mm}mm, mas a imagem indica ${analise.orelha_deduzida_mm}mm. Ajuste no campo acima ou reenvie a arte.`,
    });
  }

  return recs;
}

function RecomendacoesTecnicas({
  analise,
  contexto,
  loading,
}: {
  analise: AnaliseTecnica | undefined;
  contexto?: {
    paginas?: number;
    formato?: FormatoLivro;
    orelhaDeclarada?: number;
    lombadaEstimada?: number;
    /**
     * Tipo do arquivo original enviado pelo autor. Quando "pdf", omitimos
     * a recomendação de DPI (a rasterização em 300 no cliente não reflete
     * a qualidade real do PDF).
     */
    origemArquivo?: "pdf" | "png" | "jpg";
  };
  loading?: boolean;
}) {
  if (loading || !analise) {
    return (
      <div className="mt-4 text-xs text-zinc-500 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-zinc-300 animate-pulse"></span>
        Analisando capa tecnicamente...
      </div>
    );
  }

  const recs = buildRecomendacoes(analise, contexto?.origemArquivo);
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

        <RecomendacoesTecnicas
          analise={analise}
          contexto={{
            origemArquivo: dados.origem_arquivo as "pdf" | "png" | "jpg" | undefined,
          }}
        />
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
  // Polling timeout (14.M.1.7): quando o polling estoura 60s sem análise,
  // mostra CTA de reanalisar em vez de deixar spinner infinito.
  const [pollingTimeout, setPollingTimeout] = useState(false);
  // Nonce incrementado por handleReanalisar para forçar o effect do polling
  // a re-executar mesmo quando `dados` não muda entre tentativas.
  const [reanalisarNonce, setReanalisarNonce] = useState(0);

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
      if (capa) {
        setDados(capa);
        // Se capa foi salva via upload, entrar direto no modo upload — a UI
        // do ModoUpload é responsável por mostrar preview + análise + botão
        // continuar. O grid de escolha (Upload/IA/Editor) só aparece quando
        // ainda não há capa ou quando o autor está pra reiniciar.
        if ((capa as { modo?: string }).modo === "upload") {
          setModo("upload");
        }
      }

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
    if (dados.analise_tecnica) {
      setPollingTimeout(false);
      return;
    }
    const hasUrl = dados.url || dados.url_escolhida || dados.imagem_url;
    if (!hasUrl) return;

    // Novo ciclo de polling: garante que qualquer timeout anterior é limpo
    // antes de reiniciar. Necessário para o botão "Reanalisar" (via
    // reanalisarNonce) desligar o CTA de erro assim que o polling retomar.
    setPollingTimeout(false);

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
          setPollingTimeout(false);
          return;
        }
      } catch (err) {
        console.warn("[capa polling] falha:", err);
      }
      if (ticks < MAX_TICKS && !cancelled) {
        setTimeout(poll, INTERVAL_MS);
      } else if (!cancelled) {
        // Estourou 60s sem análise: sinaliza timeout para a UI mostrar CTA.
        setPollingTimeout(true);
      }
    };

    const timer = setTimeout(poll, INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dados, id, reanalisarNonce]);

  // Handler do CTA "Tentar de novo" quando o polling estourou. Dispara
  // /analisar manualmente e bumpa o nonce para o effect do polling
  // re-executar (dados não muda entre tentativas, então só o nonce
  // dispara o retry).
  async function handleReanalisar() {
    setPollingTimeout(false);
    setReanalisarNonce((n) => n + 1);
    try {
      await fetch(`/api/projects/${id}/capa/analisar`, { method: "POST" });
    } catch (err) {
      console.warn("[capa reanalisar] falhou:", err);
    }
  }

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
    // Não muda modo — permanece em "upload" para que o ModoUpload mostre
    // preview + análise inline. Botão "Continuar" fica dentro do próprio
    // ModoUpload (implementado na Passada 2).
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

        {/* Already has result — só a IA usa ResultadoCard. Upload é
            renderizado pelo próprio ModoUpload (com preview + análise
            inline). Editor confirmado usa card compacto no grid. */}
        {dados && modo === "escolha" && dados.modo === "ia" ? (
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
            dadosSalvos={dados}
            pollingTimeout={pollingTimeout}
            onSalvo={handleSalvoUpload}
            onContinuar={handleContinuar}
            onRefazer={async () => {
              try {
                await fetch(`/api/projects/${id}/capa/reset`, { method: "POST" });
              } catch (err) {
                console.error("[capa] falha ao resetar (não-fatal):", err);
              }
              setDados(null);
              setModo("escolha");
            }}
            onReanalisar={handleReanalisar}
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

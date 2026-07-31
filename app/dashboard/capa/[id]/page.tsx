"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import { supabase } from "@/lib/supabase";
import { avancarEtapa } from "@/lib/supabase-helpers";
import type { CapaGeradaResult, EstiloCapa } from "@/app/api/agentes/gerar-capa/route";
import type { CapaUploadResult } from "@/app/api/agentes/upload-capa/route";
import type { AnaliseTecnica } from "@/lib/capa-analyzer";
import { isEditorCapa, isUploadCapa } from "@/lib/capa-resolver";
import { ColorPickerPopover } from "@/components/color-picker-popover";
import { FORMATOS_LIVRO, type FormatoLivro, getFormatoDef, estimarLombadaCapaMm } from "@/lib/formatos";
import { ORELHA_MIN_MM, getOrelhaDefault, getOrelhaMax, clampOrelhaMm, type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";
import type { PropositoPublicacao, OpcaoCapa, GaleriaCapaItem, DadosVersoIa } from "@/lib/project-data";
import { PLANO_LABEL, planoAtende, type Plano } from "@/lib/planos";
import { TelaConversaoPlano } from "@/components/plano-conversao";

// ─── Constants ────────────────────────────────────────────────────────────────

type Modo = "escolha" | "upload" | "ia";

type AnaliseStatus = "nao_analisada" | "analisando" | "concluida" | "erro";

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

const ATMOSFERAS_LABELS = [
  { id: "melancolica", label: "Melancólica" },
  { id: "vibrante",   label: "Vibrante" },
  { id: "sobria",     label: "Sóbria" },
  { id: "misteriosa", label: "Misteriosa" },
  { id: "acolhedora", label: "Acolhedora" },
  { id: "epica",      label: "Épica" },
  { id: "tensa",      label: "Tensa" },
  { id: "luminosa",   label: "Luminosa" },
] as const;

function calcLombadaMm(paginas: number) {
  return estimarLombadaCapaMm(paginas);
}

// ─── Saldo de imagens (B2-05b) ────────────────────────────────────────────────
// Contrato compartilhado entre ModoIA / PainelVersoIa e as rotas
// /agentes/gerar-capa, /agentes/capa-briefing, /projects/:id/capa/comprar-imagens.

type AlvoImagem = "frente" | "verso" | "unica";

interface SaldoImagensCliente {
  incluso: { frente: number; verso: number };
  restante_frente: number;
  restante_verso: number;
  restante_pool: number;
}

function restanteDoAlvo(saldo: SaldoImagensCliente, alvo: AlvoImagem): number {
  if (alvo === "frente") return saldo.restante_frente;
  if (alvo === "verso") return saldo.restante_verso;
  // Para arte única, contamos o menor lado — é o que limita.
  return Math.min(saldo.restante_frente, saldo.restante_verso);
}

function labelAlvo(alvo: AlvoImagem): string {
  if (alvo === "frente") return "frente";
  if (alvo === "verso") return "verso";
  return "arte única";
}

/**
 * Guia visual do terço direito de uma arte única panorâmica. O terço direito
 * é o que vira a capa frontal no editor — mostrar essa fronteira ajuda o
 * autor a julgar a composição antes de escolher. SÓ preview: nunca é
 * exportado, persistido ou renderizado no editor.
 */
function GuiaFrenteDireita({ compacto = false }: { compacto?: boolean } = {}) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 right-0 w-1/3 border-l-2 border-dashed border-white/80"
      aria-hidden="true"
    >
      {!compacto && (
        <span className="absolute top-1.5 right-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">
          frente
        </span>
      )}
    </div>
  );
}

/**
 * Bloco de compra de pacote de imagens extras (B2-05b). Aparece dentro do
 * fluxo quando o saldo do alvo esgota. Duas opções fixas:
 *  - 1 imagem por 10 créditos
 *  - 4 imagens por 30 créditos
 * Sucesso atualiza o saldo via callback do pai (que refetch dados do projeto).
 */
function ComprarImagensBloco({
  projectId,
  saldoCreditos,
  onComprado,
}: {
  projectId: string;
  saldoCreditos: number | null;
  onComprado: (novoSaldo: SaldoImagensCliente, novosCreditos: number | null) => void;
}) {
  const [comprando, setComprando] = useState<"unitario" | "quadruplo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function comprar(pacote: "unitario" | "quadruplo") {
    setErro(null);
    setComprando(pacote);
    try {
      const r = await fetch(`/api/projects/${projectId}/capa/comprar-imagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pacote }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.error ?? "Falha ao comprar imagens.");
      }
      onComprado(data.saldo as SaldoImagensCliente, data.creditos_saldo ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao comprar imagens.");
    } finally {
      setComprando(null);
    }
  }

  const semCreditosPara = (custo: number) =>
    saldoCreditos !== null && saldoCreditos < custo;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-amber-900">Comprar mais imagens</p>
        <p className="text-xs text-amber-800/80 mt-0.5">
          Você usou todas as imagens inclusas neste projeto. Compre mais para continuar
          {saldoCreditos !== null && (
            <> — saldo atual: <strong>{saldoCreditos} crédito{saldoCreditos !== 1 ? "s" : ""}</strong></>
          )}
          .
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void comprar("unitario")}
          disabled={comprando !== null || semCreditosPara(10)}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs font-medium text-amber-900 hover:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-semibold">+1 imagem</span>
          <span className="text-amber-700/80">10 créditos</span>
          {comprando === "unitario" && <span className="ml-2 text-amber-500">…</span>}
        </button>
        <button
          type="button"
          onClick={() => void comprar("quadruplo")}
          disabled={comprando !== null || semCreditosPara(30)}
          className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-xs font-medium text-amber-900 hover:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="block text-sm font-semibold">+4 imagens</span>
          <span className="text-amber-700/80">30 créditos (25% off)</span>
          {comprando === "quadruplo" && <span className="ml-2 text-amber-500">…</span>}
        </button>
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {saldoCreditos !== null && saldoCreditos < 10 && (
        <p className="text-xs text-amber-800/80">
          Créditos insuficientes.{" "}
          <Link href="/dashboard/creditos" className="underline font-medium">
            Recarregar
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function SaldoBadge({ saldo, alvo }: { saldo: SaldoImagensCliente; alvo: AlvoImagem }) {
  const rest = restanteDoAlvo(saldo, alvo);
  const pool = saldo.restante_pool;
  if (rest <= 0 && pool <= 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 text-[11px] font-medium px-2 py-0.5">
        Sem imagens de {labelAlvo(alvo)} — compre para continuar
      </span>
    );
  }
  const parts: string[] = [];
  if (rest > 0) parts.push(`${rest} de ${labelAlvo(alvo)}`);
  if (pool > 0) parts.push(`${pool} do pacote extra`);
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium px-2 py-0.5">
      Restam {parts.join(" + ")}
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModoCard({
  icon,
  title,
  desc,
  onClick,
  warning,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  warning?: string;
  badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border border-zinc-200
        hover:border-brand-gold/60 hover:shadow-sm transition-all text-left group"
    >
      {badge && (
        <span className="absolute top-3 right-3 bg-brand-gold/15 text-brand-primary text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
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
  analiseStatus,
  analiseErro,
  onSalvo,
  onContinuar,
  onRefazer,
  onAnalisar,
  onVoltar,
}: {
  projectId: string;
  formatoInicial: FormatoLivro;
  lombadaReal: number | null;
  estimativaPaginas: number | null;
  fonteEstimativa: "miolo_real" | "estimado" | null;
  dadosSalvos: Record<string, unknown> | null;
  analiseStatus: AnaliseStatus;
  analiseErro: string | null;
  onSalvo: (result: CapaUploadResult) => void;
  onContinuar: () => void;
  onRefazer: () => void;
  onAnalisar: () => void;
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
        // pdfjs 5.x tornou `canvas` obrigatório no tipo RenderParameters mantendo
        // `canvasContext` opcional. Como no runtime deste projeto convivem duas
        // resoluções de tipo (top-level e nested via react-pdf), passamos AMBAS as
        // propriedades para satisfazer os dois shapes de RenderParameters.
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
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

              {/* Estado 1: upload feito, análise pendente — mostra CTA */}
              {uploaded && analiseStatus === "nao_analisada" && (
                <div className="rounded-xl p-4 border border-brand-gold/40 bg-brand-gold/5">
                  <p className="text-sm font-medium text-zinc-800 mb-1">Análise técnica pendente</p>
                  <p className="text-xs text-zinc-600 mb-3">
                    Antes de continuar, vamos verificar se sua capa está adequada para eBook
                    e impressão. Leva alguns segundos.
                  </p>
                  <button
                    type="button"
                    onClick={onAnalisar}
                    className="px-4 py-2 rounded-lg bg-brand-gold hover:bg-brand-gold-dark text-white font-medium text-sm transition-colors"
                  >
                    Analisar capa
                  </button>
                </div>
              )}

              {/* Estado 2: análise rodando — spinner */}
              {uploaded && analiseStatus === "analisando" && (
                <div className="rounded-xl p-4 border border-zinc-200 bg-zinc-50">
                  <div className="flex items-center gap-3">
                    <span className="w-4 h-4 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
                    <p className="text-sm text-zinc-700">Analisando capa tecnicamente…</p>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2 ml-7">
                    Verificando dimensões, marcas de corte, sangria, colorspace e resolução.
                  </p>
                </div>
              )}

              {/* Estado 3: análise concluída — mostra recomendações */}
              {uploaded && analiseStatus === "concluida" && analise && (
                <RecomendacoesTecnicas
                  analise={analise}
                  loading={false}
                />
              )}

              {/* Estado 4: análise falhou — mostra erro + CTA de retry */}
              {uploaded && analiseStatus === "erro" && (
                <div className="rounded-xl p-4 border border-red-200 bg-red-50">
                  <p className="text-sm font-medium text-red-800 mb-1">Análise falhou</p>
                  <p className="text-xs text-red-700 mb-3">
                    {analiseErro ?? "Erro desconhecido durante a análise."}
                  </p>
                  <button
                    type="button"
                    onClick={onAnalisar}
                    className="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 font-medium text-xs transition-colors"
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

      {/* Botão Continuar — sempre visível após upload, mas desabilitado
          até a análise ficar concluída. Tooltip explica o porquê. */}
      {podeContinuar && (
        <button
          onClick={onContinuar}
          disabled={!uploaded || analiseStatus !== "concluida"}
          className="w-full py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm
            hover:bg-brand-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={
            !uploaded
              ? "Envie sua capa primeiro"
              : analiseStatus === "nao_analisada"
                ? "Clique em Analisar capa antes de continuar"
                : analiseStatus === "analisando"
                  ? "Aguarde a análise terminar"
                  : analiseStatus === "erro"
                    ? "Análise falhou — tente de novo"
                    : undefined
          }
        >
          Continuar para Créditos →
        </button>
      )}
    </div>
  );
}

// ─── IA: grid de escolha persistente (bank-sourced) ───────────────────────────

/**
 * Grid de escolha que renderiza a partir de `dados_capa` (fonte de verdade),
 * não de estado em memória. Sobrevive a F5/Voltar. Reusado em dois pontos:
 * a) quando `url_escolhida` ainda é null (escolha pendente), e b) dentro do
 * `CapaIaStatusCard` quando o autor clica "Ver e usar outras gerações"
 * (re-escolher é grátis).
 */
function IaEscolhaGrid({
  opcoes,
  galeria,
  urlEscolhida,
  onEscolher,
  escolhendo,
  cobertura = "frente_verso",
}: {
  opcoes: OpcaoCapa[];
  galeria: GaleriaCapaItem[];
  urlEscolhida: string | null;
  onEscolher: (url: string, storagePath: string) => Promise<void>;
  escolhendo: string | null;
  /**
   * Cobertura da rodada — arte única mostra landscape com guia do terço
   * direito (a região que vira a capa frontal); frente_verso mostra retrato
   * clássico. Default cobre grids legados sem essa dimensão.
   */
  cobertura?: "frente_verso" | "unica";
}) {
  const opcoesUrls = new Set(opcoes.map((o) => o.url));
  const anteriores = galeria.filter((g) => !opcoesUrls.has(g.url));
  const isUnica = cobertura === "unica";
  const aspectClass = isUnica ? "aspect-[3/2]" : "aspect-[2/3]";
  const fitClass = isUnica ? "object-contain" : "object-cover";
  const bgClass = isUnica ? "bg-zinc-100" : "";
  const opcoesGridCols = isUnica ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-4";
  const anterioresGridCols = isUnica ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-6";
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Escolha uma capa ({opcoes.length} opções desta rodada)
        </p>
        <div className={`grid ${opcoesGridCols} gap-3`}>
          {opcoes.map((op, i) => {
            const isEsc = urlEscolhida === op.url;
            const isLoad = escolhendo === op.url;
            return (
              <button
                key={op.url}
                disabled={escolhendo !== null}
                onClick={() => void onEscolher(op.url, op.storage_path)}
                className={`relative rounded-xl overflow-hidden border-2 transition-all ${aspectClass} ${bgClass}
                  ${isEsc ? "border-brand-gold shadow-md" : "border-zinc-200 hover:border-zinc-300"}
                  ${escolhendo !== null && !isLoad ? "opacity-40" : ""}`}
              >
                <Image src={op.url} alt={`Opção ${i + 1}`} fill className={fitClass} />
                {isUnica && <GuiaFrenteDireita />}
                {isEsc && !isLoad && (
                  <div className="absolute inset-0 bg-brand-gold/10 flex items-center justify-center">
                    <span className="bg-brand-gold text-brand-primary text-xs font-bold px-2 py-1 rounded-full">
                      Selecionada
                    </span>
                  </div>
                )}
                {isLoad && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <span className="w-6 h-6 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {anteriores.length > 0 && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
            Gerações anteriores ({anteriores.length})
          </p>
          <p className="text-xs text-zinc-400 mb-4">Re-escolher uma antiga é grátis.</p>
          <div className={`grid ${anterioresGridCols} gap-2`}>
            {anteriores.map((g, i) => {
              const isEsc = urlEscolhida === g.url;
              const isLoad = escolhendo === g.url;
              // Item legado sem tipo conta como frente — desenha em retrato
              // pra não distorcer artes antigas quando a rodada atual é única.
              const itemUnica = g.tipo === "unica";
              const itemAspect = itemUnica ? "aspect-[3/2]" : "aspect-[2/3]";
              const itemFit = itemUnica ? "object-contain" : "object-cover";
              const itemBg = itemUnica ? "bg-zinc-100" : "";
              return (
                <button
                  key={g.storage_path}
                  disabled={escolhendo !== null}
                  onClick={() => void onEscolher(g.url, g.storage_path)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all ${itemAspect} ${itemBg}
                    ${isEsc ? "border-brand-gold" : "border-zinc-200 hover:border-zinc-300"}
                    ${escolhendo !== null && !isLoad ? "opacity-40" : ""}`}
                >
                  <Image src={g.url} alt={`Anterior ${i + 1}`} fill className={itemFit} />
                  {itemUnica && <GuiaFrenteDireita compacto />}
                  {isLoad && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                      <span className="w-5 h-5 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IA: rascunho do briefing (localStorage) ──────────────────────────────────

// Preserva o briefing enquanto o autor sai/volta da tela de IA sem gerar.
// Servidor NÃO conhece — draft não vai a DB (ephemeral, sem custo de writes).
// Precedência ao montar ModoIA: regerarDe > draft > default.
type BriefingDraft = {
  estilo?: EstiloCapa;
  atmosfera?: string[];
  cor?: string;
  corHex?: string;
  posicaoTitulo?: "topo" | "centro" | "base" | "sem_preferencia";
  descricaoLivre?: string;
  referenciasTexto?: string;
  evitar?: string;
};

function draftKey(projectId: string): string {
  return `autoria:capa-briefing-draft:${projectId}`;
}

function loadDraft(projectId: string): BriefingDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(draftKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return (parsed && typeof parsed === "object") ? (parsed as BriefingDraft) : {};
  } catch {
    return {};
  }
}

// ─── Verso IA — fluxo enxuto (B2-05a Mudança 2) ───────────────────────────────

/**
 * Painel de geração do VERSO. Vive na mesma tela do card unificado (não
 * navega para ModoIA como pré-B2-05a). O briefing herda automaticamente
 * estilo/atmosfera/cor/posição da FRENTE já escolhida — o autor só decide
 * modo (cor sólida / continuação / independente) e ajustes opcionais.
 *
 * Fases:
 *   cards       → 3 botões (cor sólida | continuação | independente)
 *   continuacao → textarea única "ajustes" (curto) + confirmar
 *   independente→ resumo de herança + descrição + evitar + confirmar
 *   confirmando → frase do agente + saldo + gerar
 *   gerando     → spinner
 *   escolha     → imagem grande + miniaturas anteriores + 3 botões (aceitar / outra opção / mudar briefing)
 *
 * Continuação e Independente compartilham o mesmo backend (gerar-capa alvo=verso)
 * — a diferença é o `verso.modo` no briefing e o texto do prompt.
 */
function PainelVersoIa({
  projectId,
  dadosFrente,
  onSalvo,
}: {
  projectId: string;
  dadosFrente: Record<string, unknown>;
  onSalvo: (dadosServidor: Record<string, unknown>) => void;
}) {
  type Fase = "cards" | "continuacao" | "independente" | "confirmando" | "gerando" | "escolha";
  const [fase, setFase] = useState<Fase>("cards");
  const [salvandoCor, setSalvandoCor] = useState(false);
  const [ajustes, setAjustes] = useState("");
  const [descricao, setDescricao] = useState("");
  const [evitar, setEvitar] = useState("");
  const [modoVerso, setModoVerso] = useState<"continuacao" | "independente">("continuacao");
  const [frase, setFrase] = useState("");
  // B2-05b: saldo incremental substitui cobrança por rodada.
  const [saldo, setSaldo] = useState<SaldoImagensCliente | null>(null);
  const [consumoOrigem, setConsumoOrigem] = useState<"incluso" | "pool" | "nenhum" | null>(null);
  const [creditosSaldo, setCreditosSaldo] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ verso: DadosVersoIa } | null>(null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aceitando, setAceitando] = useState(false);
  const [gerandoOutra, setGerandoOutra] = useState(false);

  // Herança da frente (valores fossos — o autor não edita aqui).
  const estilo = (dadosFrente.estilo as EstiloCapa | undefined) ?? "minimalista";
  const atmosfera = Array.isArray(dadosFrente.atmosfera)
    ? (dadosFrente.atmosfera as string[])
    : [];
  const corNome = (dadosFrente.cor_predominante as string | undefined) ?? "";
  // B2-05g: sem default fabricado — herança do result mínimo do fallback
  // (B2-04d) pode gravar hex="". `??` não cobre string vazia; validamos e
  // colapsamos qualquer hex malformado em "" (o schema/prompt já toleram).
  const corHexRaw = (dadosFrente.cor_predominante_hex as string | undefined) ?? "";
  const corHex = /^#[0-9a-fA-F]{6}$/.test(corHexRaw) ? corHexRaw : "";
  const posicaoTitulo = ((): "topo" | "centro" | "base" | "sem_preferencia" => {
    const p = dadosFrente.posicao_titulo;
    return p === "topo" || p === "centro" || p === "base" || p === "sem_preferencia"
      ? p
      : "sem_preferencia";
  })();

  const heredityLine = [
    ESTILOS.find(e => e.id === estilo)?.label ?? estilo,
    atmosfera.length ? atmosfera.map(a => ATMOSFERAS_LABELS.find(x => x.id === a)?.label ?? a).join(" + ") : null,
    corNome || null,
    posicaoTitulo !== "sem_preferencia" ? `título ${posicaoTitulo}` : null,
  ].filter(Boolean).join(" · ");

  async function handleCor(): Promise<void> {
    setSalvandoCor(true);
    setErro(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/capa/verso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "cor" }),
      });
      if (!res.ok) {
        setErro((await res.text().catch(() => "")) || "Falha ao salvar verso em cor sólida.");
        return;
      }
      onSalvo(await res.json());
    } finally {
      setSalvandoCor(false);
    }
  }

  function buildBriefing() {
    const desc = modoVerso === "continuacao" ? ajustes : descricao;
    return {
      estilo,
      atmosfera,
      cor_predominante: { nome: corNome, hex: corHex },
      posicao_titulo: posicaoTitulo,
      descricao_livre: desc || undefined,
      evitar: modoVerso === "independente" ? (evitar || undefined) : undefined,
      verso: { modo: modoVerso, descricao: desc || undefined },
    };
  }

  async function handleConfirmar() {
    setErro(null);
    setFrase("");
    setFase("confirmando");
    try {
      const r = await fetch("/api/agentes/capa-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmar", project_id: projectId, briefing: buildBriefing(), alvo: "verso" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro na confirmação");
      setFrase(data.frase_confirmacao ?? "");
      setSaldo(data.saldo ?? null);
      setConsumoOrigem((data.consumo?.origem as "incluso" | "pool" | "nenhum" | undefined) ?? null);
      setCreditosSaldo(data.creditos_saldo ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro na confirmação. Tente novamente.");
      setFase(modoVerso);
    }
  }

  async function chamarGerar(manterOpcoes: boolean) {
    setErro(null);
    const r = await fetch("/api/agentes/gerar-capa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        alvo: "verso",
        briefing: buildBriefing(),
        manter_opcoes: manterOpcoes,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const sufixo = r.status === 402 ? " Compre imagens extras para continuar." : "";
      throw new Error((data.error ?? "Erro ao gerar") + sufixo);
    }
    return data as { verso: DadosVersoIa; saldo?: SaldoImagensCliente; creditos_saldo?: number | null };
  }

  async function handleGerar() {
    setFase("gerando");
    try {
      const data = await chamarGerar(false);
      setResultado({ verso: data.verso });
      const ultima = data.verso.opcoes[data.verso.opcoes.length - 1]?.url ?? null;
      setEscolhida(ultima);
      if (data.saldo) setSaldo(data.saldo);
      if (data.creditos_saldo !== undefined) setCreditosSaldo(data.creditos_saldo);
      setFase("escolha");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
      setFase("confirmando");
    }
  }

  async function handleGerarOutra() {
    setGerandoOutra(true);
    try {
      const data = await chamarGerar(true);
      setResultado({ verso: data.verso });
      const ultima = data.verso.opcoes[data.verso.opcoes.length - 1]?.url ?? null;
      setEscolhida(ultima);
      if (data.saldo) setSaldo(data.saldo);
      if (data.creditos_saldo !== undefined) setCreditosSaldo(data.creditos_saldo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGerandoOutra(false);
    }
  }

  function handleMudarBriefing() {
    setErro(null);
    setResultado(null);
    setEscolhida(null);
    setFase(modoVerso);
  }

  async function handleAceitar() {
    if (!escolhida) return;
    setAceitando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/capa/escolha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: escolhida, alvo: "verso" }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao salvar escolha");
      onSalvo(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar escolha");
    } finally {
      setAceitando(false);
    }
  }

  function voltarCards() {
    setFase("cards");
    setFrase("");
    setSaldo(null);
    setConsumoOrigem(null);
    setResultado(null);
    setEscolhida(null);
    setErro(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-brand-primary text-sm">Verso da capa</p>
          <p className="text-xs text-zinc-500 mt-1">
            {fase === "cards"
              ? "Escolha como a contracapa (parte de trás) deve ser preenchida."
              : `Herdando da frente: ${heredityLine || "—"}`}
          </p>
        </div>
        {fase !== "cards" && fase !== "gerando" && (
          <button
            onClick={voltarCards}
            className="text-xs text-zinc-400 hover:text-zinc-600 shrink-0"
          >
            ← Voltar
          </button>
        )}
      </div>

      {fase === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={salvandoCor}
            onClick={() => void handleCor()}
            className="flex flex-col items-start gap-2 p-4 rounded-xl border border-zinc-200 hover:border-brand-gold/60 transition-all text-left disabled:opacity-50"
          >
            <span className="text-xl">🎨</span>
            <p className="text-sm font-semibold text-brand-primary">Só cor sólida</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Sem gerar arte. O editor pinta com a cor predominante da frente.
            </p>
            <span className="text-xs font-medium text-emerald-600 mt-auto">
              {salvandoCor ? "Salvando…" : "Grátis — escolher →"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setModoVerso("continuacao"); setFase("continuacao"); }}
            className="flex flex-col items-start gap-2 p-4 rounded-xl border border-zinc-200 hover:border-brand-gold/60 transition-all text-left"
          >
            <span className="text-xl">🖼️</span>
            <p className="text-sm font-semibold text-brand-primary">Continuação da frente</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              A IA usa a arte da frente como referência e cria um verso que combina.
            </p>
            <span className="text-xs font-medium text-brand-gold mt-auto">Usa 1 imagem do seu pacote →</span>
          </button>
          <button
            type="button"
            onClick={() => { setModoVerso("independente"); setFase("independente"); }}
            className="flex flex-col items-start gap-2 p-4 rounded-xl border border-zinc-200 hover:border-brand-gold/60 transition-all text-left"
          >
            <span className="text-xl">✨</span>
            <p className="text-sm font-semibold text-brand-primary">Arte independente</p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Cena própria para o verso, ainda dentro da mesma família visual da frente.
            </p>
            <span className="text-xs font-medium text-brand-gold mt-auto">Usa 1 imagem do seu pacote →</span>
          </button>
        </div>
      )}

      {fase === "continuacao" && (
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Ajustes (opcional)
          </label>
          <textarea
            value={ajustes}
            onChange={(e) => setAjustes(e.target.value)}
            rows={3}
            placeholder="Ex.: menos elementos, área central mais calma para a sinopse, etc."
            className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-gold"
          />
          <button
            onClick={handleConfirmar}
            className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors"
          >
            Gerar verso →
          </button>
        </div>
      )}

      {fase === "independente" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Descrição
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              placeholder="Descreva a cena que quer no verso — usaremos a mesma família visual da frente."
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-brand-gold"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              O que evitar (opcional)
            </label>
            <input
              type="text"
              value={evitar}
              onChange={(e) => setEvitar(e.target.value)}
              placeholder="Ex.: pessoas, fotos, tons frios…"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
            />
          </div>
          <button
            onClick={handleConfirmar}
            disabled={descricao.trim().length === 0}
            className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
          >
            Gerar verso →
          </button>
        </div>
      )}

      {fase === "confirmando" && (
        <div className="space-y-3">
          {frase ? (
            <>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Confirmação</p>
              <p className="text-sm text-zinc-700 leading-relaxed">{frase}</p>
              {saldo && (
                <div className="flex flex-col gap-1">
                  <SaldoBadge saldo={saldo} alvo="verso" />
                  <p className="text-[11px] text-zinc-500">
                    {consumoOrigem === "incluso" && "Esta imagem sai do pacote incluso no seu plano."}
                    {consumoOrigem === "pool" && "Esta imagem sai do pacote extra que você comprou."}
                    {consumoOrigem === "nenhum" && "Saldo esgotado — compre imagens extras abaixo para continuar."}
                  </p>
                </div>
              )}
              {consumoOrigem === "nenhum" && (
                <ComprarImagensBloco
                  projectId={projectId}
                  saldoCreditos={creditosSaldo}
                  onComprado={(novoSaldo, novosCred) => {
                    setSaldo(novoSaldo);
                    setCreditosSaldo(novosCred);
                    // Re-avaliar origem local: se ganhou pool, agora sai de "pool"
                    setConsumoOrigem(novoSaldo.restante_pool > 0 ? "pool" : "nenhum");
                  }}
                />
              )}
              <div className="flex gap-3">
                <button onClick={() => setFase(modoVerso)} className="px-5 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-zinc-300 transition-colors">
                  Ajustar
                </button>
                <button
                  onClick={handleGerar}
                  disabled={consumoOrigem === "nenhum"}
                  className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
                >
                  Gerar verso →
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32">
              <span className="w-5 h-5 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
            </div>
          )}
        </div>
      )}

      {fase === "gerando" && (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <span className="w-6 h-6 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
          <p className="text-sm text-zinc-500">Gerando sua capa… ~15 segundos</p>
        </div>
      )}

      {fase === "escolha" && resultado && (() => {
        const opcoesList = resultado.verso.opcoes;
        const atual = opcoesList[opcoesList.length - 1];
        const anteriores = opcoesList.slice(0, -1);
        const semSaldo = !saldo || (restanteDoAlvo(saldo, "verso") <= 0 && saldo.restante_pool <= 0);
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Sua última geração
              </p>
              {saldo && <SaldoBadge saldo={saldo} alvo="verso" />}
            </div>
            {atual && (
              <div className="relative rounded-xl overflow-hidden border-2 border-brand-gold shadow-sm aspect-[2/3] max-w-sm mx-auto">
                <Image src={atual.url} alt="Opção atual" fill className="object-cover" />
                {gerandoOutra && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <span className="w-6 h-6 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                  </div>
                )}
              </div>
            )}
            {anteriores.length > 0 && (
              <div>
                <p className="text-[11px] text-zinc-400 mb-2">Anteriores desta sequência</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {anteriores.map((op, i) => (
                    <button
                      key={op.url}
                      onClick={() => setEscolhida(op.url)}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[2/3]
                        ${escolhida === op.url ? "border-brand-gold shadow-md" : "border-zinc-200 hover:border-zinc-300"}`}
                    >
                      <Image src={op.url} alt={`Anterior ${i + 1}`} fill className="object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {semSaldo && (
              <ComprarImagensBloco
                projectId={projectId}
                saldoCreditos={creditosSaldo}
                onComprado={(novoSaldo, novosCred) => {
                  setSaldo(novoSaldo);
                  setCreditosSaldo(novosCred);
                }}
              />
            )}
            {erro && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{erro}</div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleMudarBriefing}
                disabled={gerandoOutra || aceitando}
                className="px-4 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-zinc-300 transition-colors disabled:opacity-50"
              >
                Mudar briefing
              </button>
              <button
                onClick={() => void handleGerarOutra()}
                disabled={gerandoOutra || aceitando || semSaldo}
                className="px-4 py-3 rounded-xl border border-brand-gold/40 text-brand-primary text-sm font-medium hover:border-brand-gold transition-colors disabled:opacity-50"
              >
                {gerandoOutra ? "Gerando outra…" : "Gerar outra opção (mesmo estilo)"}
              </button>
              <button
                onClick={handleAceitar}
                disabled={!escolhida || aceitando || gerandoOutra}
                className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm hover:bg-brand-gold/90 transition-colors disabled:opacity-50"
              >
                {aceitando
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                      Salvando…
                    </span>
                  : "É essa que quero →"}
              </button>
            </div>
          </div>
        );
      })()}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{erro}</div>
      )}
    </div>
  );
}

// ─── IA mode ──────────────────────────────────────────────────────────────────

function ModoIA({
  projectId,
  titulo,
  autor,
  genero,
  estimativaPaginas: _estimativaPaginas,
  regerarDe,
  plano,
  proposito,
  coberturaSalva,
  onSalvo,
  onVoltar,
}: {
  projectId: string;
  titulo: string;
  autor: string;
  sinopse: string;
  genero: string;
  estimativaPaginas: number | null;
  regerarDe?: CapaGeradaResult;
  /**
   * Plano do projeto — gate do seletor de cobertura (só Pro tem arte única).
   */
  plano: Plano;
  /**
   * Propósito da publicação — gate do seletor de cobertura (só completa tem
   * verso/lombada impressos; digital é sempre frente).
   */
  proposito: PropositoPublicacao | null;
  /**
   * Cobertura já persistida em `dados_capa.cobertura`. Usada como valor
   * inicial do seletor interno; permite o autor trocar unica↔frente_verso
   * ao regerar sem precisar sair da ModoIA (B2-05a).
   */
  coberturaSalva?: "frente_verso" | "unica";
  onSalvo: (dadosServidor: CapaGeradaResult) => void;
  onVoltar: () => void;
}) {
  // Modal educativo — primeira visita ao modo IA
  const [modalVisto, setModalVisto] = useState(true);
  useEffect(() => {
    setModalVisto(localStorage.getItem("autoria:capa-ia-explicada-v1") === "true");
  }, []);
  function fecharModal() {
    localStorage.setItem("autoria:capa-ia-explicada-v1", "true");
    setModalVisto(true);
  }

  // Máquina de estados: briefing → confirmando → gerando → escolha
  const [fase, setFase] = useState<"briefing" | "confirmando" | "gerando" | "escolha">("briefing");

  // B2-05a Mudança 1: cobertura vive DENTRO do ModoIA. Precede o briefing
  // (é uma decisão sobre o que vai ser gerado). Inicial:
  //   1º regerarDe.cobertura (regeneração respeita a decisão anterior)
  //   2º coberturaSalva do banco (não-regen mas capa já existe)
  //   3º "frente_verso" (default retrocompat)
  // Alvo efetivo = "verso" quando painel externo assim decidiu; senão
  // deriva de cobertura ("unica" gera arte panorâmica; "frente_verso"
  // gera só a frente aqui — o verso é uma etapa separada depois).
  const coberturaInicial: "frente_verso" | "unica" =
    (regerarDe?.cobertura as "frente_verso" | "unica" | undefined) ??
    coberturaSalva ??
    "frente_verso";
  const [cobertura, setCobertura] = useState<"frente_verso" | "unica">(coberturaInicial);
  const podeUnica = plano === "pro" && proposito === "completa";
  const alvoEfetivo: "frente" | "unica" =
    podeUnica && cobertura === "unica" ? "unica" : "frente";

  // Briefing — inicializado de regerarDe quando em modo regeneração
  const presetCorInicial = regerarDe
    ? (CORES_PRESET.find(c => c.value === regerarDe.cor_predominante) ?? null)
    : null;
  const [estilo, setEstilo] = useState<EstiloCapa>(regerarDe?.estilo ?? "minimalista");
  const [atmosfera, setAtmosfera] = useState<string[]>(regerarDe ? [...regerarDe.atmosfera] : []);
  const [cor, setCor] = useState(presetCorInicial?.value ?? (regerarDe?.cor_predominante ?? CORES_PRESET[0].value));
  const [corHex, setCorHex] = useState(presetCorInicial?.hex ?? (regerarDe?.cor_predominante_hex ?? CORES_PRESET[0].hex));
  const [posicaoTitulo, setPosicaoTitulo] = useState<"topo" | "centro" | "base" | "sem_preferencia">(
    regerarDe?.posicao_titulo ?? "topo"
  );
  const [descricaoLivre, setDescricaoLivre] = useState(regerarDe?.descricao_livre ?? "");
  const [referenciasTexto, setReferenciasTexto] = useState(regerarDe?.referencias_texto ?? "");
  const [evitar, setEvitar] = useState(regerarDe?.evitar ?? "");
  const [imgRef, setImgRef] = useState<string | null>(null);
  const [imgRefIntencao, setImgRefIntencao] = useState<"estilo" | "conteudo">("estilo");
  const [isRegen, setIsRegen] = useState(!!regerarDe);
  const [deltaTexto, setDeltaTexto] = useState("");
  // B2-05b: saldo incremental substitui cobrança por rodada.
  const [saldoImagens, setSaldoImagens] = useState<SaldoImagensCliente | null>(null);
  const [consumoOrigem, setConsumoOrigem] = useState<"incluso" | "pool" | "nenhum" | null>(null);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [gerandoOutra, setGerandoOutra] = useState(false);

  // Créditos
  const [saldo, setSaldo] = useState<number | null>(null);
  function refreshSaldo() {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("users").select("creditos").eq("id", user.id).single()
        .then(({ data }) => { if (data) setSaldo((data as { creditos: number }).creditos); });
    });
  }
  useEffect(() => { refreshSaldo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rascunho do briefing — restaura no mount (só quando NÃO é regeneração).
  // Segue o padrão do modalVisto: valor default no useState + correção no
  // useEffect para não quebrar hidratação (localStorage é client-only).
  useEffect(() => {
    if (regerarDe) return;
    const d = loadDraft(projectId);
    if (d.estilo) setEstilo(d.estilo);
    if (Array.isArray(d.atmosfera)) setAtmosfera(d.atmosfera.slice(0, 2));
    if (d.cor) setCor(d.cor);
    if (d.corHex) setCorHex(d.corHex);
    if (d.posicaoTitulo) setPosicaoTitulo(d.posicaoTitulo);
    if (typeof d.descricaoLivre === "string") setDescricaoLivre(d.descricaoLivre);
    if (typeof d.referenciasTexto === "string") setReferenciasTexto(d.referenciasTexto);
    if (typeof d.evitar === "string") setEvitar(d.evitar);
  }, [projectId, regerarDe]);

  // Rascunho do briefing — salva com debounce a cada mudança de campo.
  // Não limpa após gerar (inofensivo; útil se autor voltar para nova rodada).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      const draft: BriefingDraft = {
        estilo, atmosfera, cor, corHex,
        posicaoTitulo, descricaoLivre, referenciasTexto, evitar,
      };
      try {
        window.localStorage.setItem(draftKey(projectId), JSON.stringify(draft));
      } catch { /* quota / privacy mode — ignora */ }
    }, 500);
    return () => window.clearTimeout(t);
  }, [projectId, estilo, atmosfera, cor, corHex, posicaoTitulo, descricaoLivre, referenciasTexto, evitar]);

  // Galeria pré-briefing — pós-reset/troca de modo, se o autor já pagou por
  // gerações antes, storage ainda tem os PNGs. Oferecemos reuso ANTES do
  // briefing para não cobrar de novo. Fetch é best-effort (falha silenciosa).
  const [galeriaPreBrief, setGaleriaPreBrief] = useState<GaleriaCapaItem[]>([]);
  const [carregandoGaleria, setCarregandoGaleria] = useState(false);
  const [escolhendoDaGaleria, setEscolhendoDaGaleria] = useState<string | null>(null);
  useEffect(() => {
    if (regerarDe) return;
    let ativo = true;
    setCarregandoGaleria(true);
    fetch(`/api/projects/${projectId}/capa/galeria`)
      .then(r => (r.ok ? r.json() : { itens: [] }))
      .then((data: { itens?: GaleriaCapaItem[] }) => {
        if (!ativo || !Array.isArray(data.itens)) return;
        // Filtra por alvo (B2-05): pré-brief só mostra gerações compatíveis
        // com o alvo efetivo (após seleção interna de cobertura). Item
        // legado (tipo indefinido) conta como frente.
        const filtradas = data.itens.filter(
          (g) => (g.tipo ?? "frente") === alvoEfetivo,
        );
        setGaleriaPreBrief(filtradas);
      })
      .catch(() => { /* best-effort */ })
      .finally(() => { if (ativo) setCarregandoGaleria(false); });
    return () => { ativo = false; };
  }, [projectId, regerarDe, alvoEfetivo]);

  async function handleUsarDaGaleria(item: GaleriaCapaItem) {
    setEscolhendoDaGaleria(item.storage_path);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/capa/escolha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: item.url, storage_path: item.storage_path, alvo: alvoEfetivo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao usar geração anterior");
      onSalvo(data as CapaGeradaResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao usar geração anterior");
    } finally {
      setEscolhendoDaGaleria(null);
    }
  }

  // Confirmação
  const [frase, setFrase] = useState("");

  // Resultado / escolha — pre-populado quando regerarDe fornecido
  const [resultado, setResultado] = useState<CapaGeradaResult | null>(regerarDe ?? null);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aceitando, setAceitando] = useState(false);

  function buildBriefing() {
    return {
      estilo,
      atmosfera,
      cor_predominante: { nome: cor, hex: corHex },
      posicao_titulo: posicaoTitulo,
      descricao_livre: descricaoLivre || undefined,
      referencias_texto: referenciasTexto || undefined,
      evitar: evitar || undefined,
    };
  }

  function toggleAtmosfera(a: string) {
    setAtmosfera(prev => {
      if (prev.includes(a)) return prev.filter(x => x !== a);
      if (prev.length >= 2) return prev;
      return [...prev, a];
    });
  }

  function handleRefImg(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => setImgRef(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function handleSugerirConceito() {
    setSugerindo(true);
    try {
      const r = await fetch("/api/agentes/capa-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "sugerir_conceito", project_id: projectId }),
      });
      const data = await r.json();
      if (r.ok && data.conceito) setDescricaoLivre(data.conceito);
    } catch {
      // best-effort — falha silenciosa
    } finally {
      setSugerindo(false);
    }
  }

  async function handleConfirmar() {
    if (atmosfera.length === 0) {
      setErroForm("Escolha pelo menos 1 atmosfera antes de continuar.");
      return;
    }
    setErroForm(null);
    setFrase("");
    setFase("confirmando");
    try {
      const r = await fetch("/api/agentes/capa-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "confirmar", project_id: projectId, briefing: buildBriefing(), alvo: alvoEfetivo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro na confirmação");
      setFrase(data.frase_confirmacao);
      setSaldoImagens(data.saldo ?? null);
      setConsumoOrigem((data.consumo?.origem as "incluso" | "pool" | "nenhum" | undefined) ?? null);
      if (data.creditos_saldo !== undefined && data.creditos_saldo !== null) setSaldo(data.creditos_saldo);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : "Erro na confirmação. Tente novamente.");
      setFase("briefing");
    }
  }

  async function chamarGerarModo(manterOpcoes: boolean) {
    const descFinal = isRegen && deltaTexto.trim()
      ? `${descricaoLivre}\n\nAJUSTE PEDIDO: ${deltaTexto.trim()}`
      : descricaoLivre;
    const r = await fetch("/api/agentes/gerar-capa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        alvo: alvoEfetivo,
        briefing: { ...buildBriefing(), descricao_livre: descFinal || undefined },
        imagemRef: imgRef ?? undefined,
        imagemRefIntencao: imgRef ? imgRefIntencao : undefined,
        manter_opcoes: manterOpcoes,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const sufixo = r.status === 402 ? " Compre imagens extras para continuar." : "";
      throw new Error((data.error ?? "Erro ao gerar") + sufixo);
    }
    return data as CapaGeradaResult & {
      saldo?: SaldoImagensCliente;
      creditos_saldo?: number | null;
    };
  }

  async function handleGerar() {
    setFase("gerando");
    setError(null);
    try {
      const data = await chamarGerarModo(false);
      setResultado(data);
      const ultima = data.opcoes[data.opcoes.length - 1]?.url ?? null;
      setEscolhida(ultima);
      if (data.saldo) setSaldoImagens(data.saldo);
      if (data.creditos_saldo !== undefined && data.creditos_saldo !== null) setSaldo(data.creditos_saldo);
      setFase("escolha");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
      setFase(resultado ? "escolha" : "briefing");
    }
  }

  async function handleGerarOutra() {
    setGerandoOutra(true);
    setError(null);
    try {
      const data = await chamarGerarModo(true);
      setResultado(data);
      const ultima = data.opcoes[data.opcoes.length - 1]?.url ?? null;
      setEscolhida(ultima);
      if (data.saldo) setSaldoImagens(data.saldo);
      if (data.creditos_saldo !== undefined && data.creditos_saldo !== null) setSaldo(data.creditos_saldo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setGerandoOutra(false);
    }
  }

  function handleMudarBriefing() {
    if (resultado) {
      setEstilo(resultado.estilo);
      setAtmosfera([...resultado.atmosfera]);
      const presetCor = CORES_PRESET.find(c => c.value === resultado.cor_predominante);
      if (presetCor) { setCor(presetCor.value); setCorHex(presetCor.hex); }
      else { setCor(resultado.cor_predominante); setCorHex(resultado.cor_predominante_hex); }
      setPosicaoTitulo(resultado.posicao_titulo);
      setDescricaoLivre(resultado.descricao_livre ?? "");
      setReferenciasTexto(resultado.referencias_texto ?? "");
      setEvitar(resultado.evitar ?? "");
    }
    setIsRegen(true);
    setDeltaTexto("");
    setFase("briefing");
  }

  async function handleAceitar() {
    if (!escolhida || !resultado) return;
    setAceitando(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/capa/escolha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: escolhida, alvo: alvoEfetivo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Erro ao salvar escolha");
      onSalvo(data as CapaGeradaResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar escolha");
    } finally {
      setAceitando(false);
    }
  }

  // Suppress unused-var warnings for props used only in context (titulo, autor, genero)
  void titulo; void autor; void genero;

  return (
    <div className="space-y-6">
      {/* Modal educativo — primeira visita */}
      {!modalVisto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold text-brand-primary">Como funciona a capa com IA</h2>
            <ol className="space-y-2 text-sm text-zinc-600">
              <li><span className="font-medium">1.</span> Você descreve estilo, atmosfera e cor</li>
              <li><span className="font-medium">2.</span> Geramos a arte da sua capa — você pode pedir novas opções ou ajustar a descrição, imagem a imagem, dentro do pacote do seu plano</li>
              <li><span className="font-medium">3.</span> Você escolhe e personaliza no editor com títulos e textos</li>
            </ol>
            <p className="text-xs text-zinc-500 bg-zinc-50 rounded-xl p-3">
              As imagens são geradas <strong>SEM texto</strong>: título, nome e demais textos são
              adicionados por você no editor — isso garante tipografia perfeita.
            </p>
            <p className="text-xs text-amber-600">
              Se esgotar o pacote, você pode comprar mais imagens com créditos.
            </p>
            <button onClick={fecharModal}
              className="w-full py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                hover:bg-brand-primary/90 transition-colors">
              Entendi, começar →
            </button>
          </div>
        </div>
      )}

      <button onClick={onVoltar} className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
        ← Voltar
      </button>

      {/* ── GALERIA PRÉ-BRIEFING (pós-reset/troca de modo) ─────────────────── */}
      {/* Só aparece em briefing "fresco" (sem regeneração) — se o autor já pagou
          por gerações antes e resetou/trocou de modo, o storage guardou os PNGs.
          Reusar uma delas é grátis; o servidor reconstrói `dados_capa` no
          fallback do endpoint de escolha (B2-04d Mudança 3). */}
      {fase === "briefing" && !regerarDe && galeriaPreBrief.length > 0 && (
        <div className="bg-brand-gold/5 rounded-2xl border border-brand-gold/30 p-6 space-y-3">
          <div>
            <p className="font-medium text-brand-primary text-sm">
              Você já tem {galeriaPreBrief.length} capa{galeriaPreBrief.length !== 1 ? "s" : ""} geradas antes
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Reusar uma delas é grátis. Se preferir opções novas, siga com o briefing abaixo.
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {galeriaPreBrief.map((g, i) => {
              const isLoad = escolhendoDaGaleria === g.storage_path;
              return (
                <button key={g.storage_path}
                  disabled={escolhendoDaGaleria !== null}
                  onClick={() => void handleUsarDaGaleria(g)}
                  className={`relative rounded-lg overflow-hidden border-2 border-zinc-200 hover:border-brand-gold transition-all aspect-[2/3]
                    ${escolhendoDaGaleria !== null && !isLoad ? "opacity-40" : ""}`}>
                  <Image src={g.url} alt={`Anterior ${i + 1}`} fill className="object-cover" />
                  {isLoad && (
                    <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                      <span className="w-5 h-5 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </div>
      )}

      {/* Indicador leve enquanto galeria carrega — evita "flash" caso haja itens */}
      {fase === "briefing" && !regerarDe && carregandoGaleria && galeriaPreBrief.length === 0 && (
        <p className="text-[11px] text-zinc-400">Verificando gerações anteriores…</p>
      )}

      {/* ── BRIEFING ────────────────────────────────────────────────────────── */}
      {fase === "briefing" && (
        <>
          <p className="text-xs text-zinc-400 flex items-center gap-1.5">
            <span>·</span> Usando o que sabemos do seu livro: título, gênero e sinopse
          </p>

          {/* Cobertura (Pro + completa) — primeira decisão do briefing.
              Vive DENTRO da ModoIA (B2-05a) para permitir troca em
              regeneração e não perder o alvo no meio do fluxo. */}
          {podeUnica && (
            <div className="bg-white rounded-2xl border border-zinc-100 p-6">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                Cobertura da arte gerada
              </p>
              <p className="text-[11px] text-zinc-400 mb-3">
                Escolha antes de gerar. Depois, o autor personaliza no editor.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <RadioBtn
                  checked={cobertura === "frente_verso"}
                  onChange={() => setCobertura("frente_verso")}
                  label="Frente e verso (duas artes)"
                  sub="Uma arte de cada vez; frente e verso têm pacotes separados."
                />
                <RadioBtn
                  checked={cobertura === "unica"}
                  onChange={() => setCobertura("unica")}
                  label="Arte única panorâmica"
                  sub="Cada imagem única consome 1 do pacote de frente e 1 do de verso."
                />
              </div>
            </div>
          )}

          {/* Estilo — TODO B2-06: default por família editorial + thumbnails */}
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

          {/* Atmosfera */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">
              Atmosfera <span className="normal-case font-normal text-zinc-300">(1 ou 2)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {ATMOSFERAS_LABELS.map(a => {
                const sel = atmosfera.includes(a.id);
                const bloq = !sel && atmosfera.length >= 2;
                return (
                  <button key={a.id} type="button"
                    onClick={() => { if (!bloq) toggleAtmosfera(a.id); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                      ${sel ? "border-brand-gold bg-brand-gold/10 text-brand-primary" :
                        bloq ? "border-zinc-100 text-zinc-300 cursor-not-allowed" :
                        "border-zinc-200 text-zinc-600 hover:border-zinc-300"}`}>
                    {a.label}
                  </button>
                );
              })}
            </div>
            {atmosfera.length >= 2 && (
              <p className="text-[11px] text-zinc-400 mt-2">Máximo 2 atmosferas.</p>
            )}
          </div>

          {/* Cor predominante */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Cor predominante</p>
            <p className="text-[11px] text-zinc-400 mb-3">
              Esta cor também será a base da lombada e do verso no editor.
            </p>
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
              {/* Swatch "Personalizar" — mesmo picker do editor (paletas +
                  hex + conta-gotas). schema aceita qualquer hex; nome fica
                  marcado como "personalizada" para o prompt saber que não é
                  preset. `allowRemove={false}` porque cor sempre existe no
                  briefing IA. */}
              <ColorPickerPopover
                variant="swatch"
                selected={cor === "personalizada"}
                value={cor === "personalizada" ? corHex : null}
                allowRemove={false}
                onChange={(hex) => {
                  if (!hex) return;
                  setCor("personalizada");
                  setCorHex(hex);
                }}
              />
            </div>
          </div>

          {/* Posição do título */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Posição do título</p>
            <p className="text-[11px] text-zinc-400 mb-3">
              A arte deixa essa área mais limpa para o título que você colocará no editor.
            </p>
            <div className="flex gap-2">
              {(["topo", "centro", "base", "sem_preferencia"] as const).map(p => (
                <button key={p} type="button" onClick={() => setPosicaoTitulo(p)}
                  className={`flex-1 py-2 px-1 rounded-lg border text-xs font-medium transition-all
                    ${posicaoTitulo === p
                      ? "border-brand-gold bg-brand-gold/5 text-brand-primary"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
                  {p === "topo" ? "Topo" : p === "centro" ? "Centro" : p === "base" ? "Base" : "Sem pref."}
                </button>
              ))}
            </div>
          </div>

          {/* Descrição livre + sugerir conceito */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Descrição (opcional)</p>
              <button type="button" onClick={handleSugerirConceito} disabled={sugerindo}
                className="flex items-center gap-1 text-xs text-brand-primary hover:text-brand-primary/80 font-medium disabled:opacity-50">
                {sugerindo
                  ? <><span className="w-3 h-3 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" /> Sugerindo…</>
                  : "✦ Sugerir conceito"}
              </button>
            </div>
            <textarea
              value={descricaoLivre}
              onChange={e => setDescricaoLivre(e.target.value)}
              rows={4}
              placeholder="Descreva cena, objetos, atmosfera. Ex.: 'uma estrada vazia ao amanhecer, névoa, tom melancólico'. Não peça textos — você os adiciona no editor."
              className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm resize-none
                focus:outline-none focus:border-brand-gold"
            />
          </div>

          {/* Referências */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Referências (opcional)</p>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                Capas que considera referência
              </label>
              <input
                type="text"
                value={referenciasTexto}
                onChange={e => setReferenciasTexto(e.target.value)}
                placeholder="Ex.: Atomic Habits, The Lean Startup…"
                className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm
                  focus:outline-none focus:border-brand-gold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                Imagem de referência
              </label>
              {imgRef ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <img src={imgRef} alt="ref" className="w-16 h-16 object-cover rounded-lg border border-zinc-200" />
                    <button onClick={() => setImgRef(null)} className="text-xs text-red-500 hover:text-red-700">
                      Remover
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {(["estilo", "conteudo"] as const).map(i => (
                      <button key={i} type="button" onClick={() => setImgRefIntencao(i)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                          ${imgRefIntencao === i
                            ? "border-brand-gold bg-brand-gold/5 text-brand-primary"
                            : "border-zinc-200 text-zinc-500 hover:border-zinc-300"}`}>
                        {i === "estilo" ? "Usar como guia de estilo" : "Quero esta imagem na capa"}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed
                  border-zinc-300 cursor-pointer hover:border-brand-gold/50 text-xs text-zinc-500 w-fit">
                  <UploadIcon size={14} />
                  Selecionar imagem
                  <input type="file" accept="image/*" className="hidden" onChange={handleRefImg} />
                </label>
              )}
            </div>
          </div>

          {/* Evitar */}
          <div className="bg-white rounded-2xl border border-zinc-100 p-6">
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              O que evitar (opcional)
            </label>
            <input
              type="text"
              value={evitar}
              onChange={e => setEvitar(e.target.value)}
              placeholder="Ex.: pessoas, fotos, tons frios…"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm
                focus:outline-none focus:border-brand-gold"
            />
          </div>

          <p className="text-xs text-zinc-400 text-center">
            Orelhas, lombada e verso você configura no editor.
          </p>

          {/* Campo de delta para regeneração */}
          {isRegen && (
            <div className="bg-white rounded-2xl border border-zinc-100 p-6">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                O que mudar em relação às opções anteriores?
              </label>
              <textarea
                value={deltaTexto}
                onChange={e => setDeltaTexto(e.target.value)}
                rows={3}
                placeholder="Ex.: cores mais vibrantes, menos elementos, adicionar névoa…"
                className="w-full border border-zinc-200 rounded-xl px-3 py-2.5 text-sm resize-none
                  focus:outline-none focus:border-brand-gold"
              />
            </div>
          )}

          {erroForm && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{erroForm}</div>
          )}

          <div className="space-y-2">
            {saldo !== null && (
              <p className="text-xs text-zinc-400 text-center">
                Você tem {saldo} crédito{saldo !== 1 ? "s" : ""}
              </p>
            )}
            <button
              onClick={handleConfirmar}
              disabled={atmosfera.length === 0}
              className="w-full py-4 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
              Gerar capa com IA →
            </button>
          </div>
        </>
      )}

      {/* ── CONFIRMANDO ─────────────────────────────────────────────────────── */}
      {fase === "confirmando" && (
        <div className="space-y-4">
          {frase ? (
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Confirmação</p>
              <p className="text-sm text-zinc-700 leading-relaxed">{frase}</p>
              {saldoImagens && (
                <div className="flex flex-col gap-1">
                  <SaldoBadge saldo={saldoImagens} alvo={alvoEfetivo} />
                  <p className="text-[11px] text-zinc-500">
                    {consumoOrigem === "incluso" && (alvoEfetivo === "unica"
                      ? "Esta imagem única consome 1 do incluso de frente e 1 do incluso de verso."
                      : "Esta imagem sai do pacote incluso no seu plano.")}
                    {consumoOrigem === "pool" && "Esta imagem sai do pacote extra que você comprou."}
                    {consumoOrigem === "nenhum" && "Saldo esgotado — compre imagens extras abaixo para continuar."}
                  </p>
                </div>
              )}
              {consumoOrigem === "nenhum" && (
                <ComprarImagensBloco
                  projectId={projectId}
                  saldoCreditos={saldo}
                  onComprado={(novoSaldo, novosCred) => {
                    setSaldoImagens(novoSaldo);
                    if (novosCred !== null) setSaldo(novosCred);
                    setConsumoOrigem(novoSaldo.restante_pool > 0 ? "pool" : "nenhum");
                  }}
                />
              )}
              <div className="flex gap-3">
                <button onClick={() => setFase("briefing")}
                  className="px-5 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
                    hover:border-zinc-300 transition-colors">
                  Ajustar
                </button>
                <button onClick={handleGerar}
                  disabled={consumoOrigem === "nenhum"}
                  className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                    hover:bg-brand-primary/90 transition-colors disabled:opacity-50">
                  Gerar capa →
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex items-center
              justify-center h-32">
              <span className="w-5 h-5 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* ── GERANDO ─────────────────────────────────────────────────────────── */}
      {fase === "gerando" && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col items-center
          justify-center h-40 gap-3">
          <span className="w-6 h-6 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
          <p className="text-sm text-zinc-500">Gerando sua capa… ~15 segundos</p>
        </div>
      )}

      {/* ── ESCOLHA ─────────────────────────────────────────────────────────── */}
      {fase === "escolha" && resultado && (() => {
        const opcoesList = resultado.opcoes;
        const atual = opcoesList[opcoesList.length - 1];
        const anteriores = opcoesList.slice(0, -1);
        const semSaldo = !saldoImagens || (
          restanteDoAlvo(saldoImagens, alvoEfetivo) <= 0 && saldoImagens.restante_pool <= 0
        );
        // Arte única mostra em landscape; frente em retrato.
        const aspectClass = alvoEfetivo === "unica" ? "aspect-[3/2]" : "aspect-[2/3]";
        return (
          <>
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Sua última geração
                </p>
                {saldoImagens && <SaldoBadge saldo={saldoImagens} alvo={alvoEfetivo} />}
              </div>
              {atual && (
                <div className={`relative rounded-xl overflow-hidden border-2 border-brand-gold shadow-sm mx-auto ${aspectClass} ${alvoEfetivo === "unica" ? "w-full max-w-2xl bg-zinc-100" : "max-w-sm"}`}>
                  <Image
                    src={atual.url}
                    alt="Capa atual"
                    fill
                    className={alvoEfetivo === "unica" ? "object-contain" : "object-cover"}
                  />
                  {alvoEfetivo === "unica" && <GuiaFrenteDireita />}
                  {gerandoOutra && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <span className="w-6 h-6 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                    </div>
                  )}
                </div>
              )}
              {anteriores.length > 0 && (
                <div>
                  <p className="text-[11px] text-zinc-400 mb-2">Anteriores desta sequência</p>
                  <div className={`grid gap-2 ${alvoEfetivo === "unica" ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-4 sm:grid-cols-6"}`}>
                    {anteriores.map((op, i) => (
                      <button
                        key={op.url}
                        onClick={() => setEscolhida(op.url)}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all ${aspectClass}
                          ${alvoEfetivo === "unica" ? "bg-zinc-100" : ""}
                          ${escolhida === op.url ? "border-brand-gold shadow-md" : "border-zinc-200 hover:border-zinc-300"}`}
                      >
                        <Image
                          src={op.url}
                          alt={`Anterior ${i + 1}`}
                          fill
                          className={alvoEfetivo === "unica" ? "object-contain" : "object-cover"}
                        />
                        {alvoEfetivo === "unica" && <GuiaFrenteDireita compacto />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {semSaldo && (
              <ComprarImagensBloco
                projectId={projectId}
                saldoCreditos={saldo}
                onComprado={(novoSaldo, novosCred) => {
                  setSaldoImagens(novoSaldo);
                  if (novosCred !== null) setSaldo(novosCred);
                }}
              />
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={handleMudarBriefing}
                disabled={gerandoOutra || aceitando}
                className="px-4 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm
                  hover:border-zinc-300 transition-colors disabled:opacity-50">
                Mudar briefing
              </button>
              <button onClick={() => void handleGerarOutra()}
                disabled={gerandoOutra || aceitando || semSaldo}
                className="px-4 py-3 rounded-xl border border-brand-gold/40 text-brand-primary text-sm font-medium
                  hover:border-brand-gold transition-colors disabled:opacity-50">
                {gerandoOutra ? "Gerando outra…" : "Gerar outra opção (mesmo estilo)"}
              </button>
              <button
                onClick={handleAceitar}
                disabled={!escolhida || aceitando || gerandoOutra}
                className="flex-1 py-3 rounded-xl bg-brand-gold text-brand-primary font-medium text-sm
                  hover:bg-brand-gold/90 transition-colors disabled:opacity-50">
                {aceitando ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
                    Salvando…
                  </span>
                ) : "É essa que quero →"}
              </button>
            </div>
          </>
        );
      })()}
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

  // ──────────────────────────────────────────────────────────────────
  // 1. CONFIGURAÇÃO DA CAPA (dimensões + marcas + sangria unificados)
  //    Sempre primeira linha. Mensagens específicas por configuração.
  // ──────────────────────────────────────────────────────────────────
  const sangriaMm = analise.sangria_detectada_mm ?? 0;
  const areaUtil = analise.area_util_mm;

  if (analise.configuracao === "A") {
    recs.push({
      nivel: "info",
      titulo: "Arquivo em formato correto",
      detalhe: `Marcas de corte, sangria de ${sangriaMm}mm e dimensões corretas${
        areaUtil ? ` (${areaUtil.largura}mm × ${areaUtil.altura}mm dentro do corte)` : ""
      }. O verdict "Pronta para gráfica" só aparece quando lombada e orelhas também conferem com o miolo.`,
    });
  } else if (analise.configuracao === "B") {
    recs.push({
      nivel: "info",
      titulo: "Capa com sangria, sem marcas de corte",
      detalhe: `Sua capa tem sangria de ${sangriaMm}mm mas não tem marcas de corte. Para eBook, Kindle e impressão sob demanda está pronta. Para gráfica offset, ideal ter marcas de corte para orientar o operador — não é bloqueador, mas alguns fluxos exigem.`,
    });
  } else if (analise.configuracao === "C") {
    recs.push({
      nivel: "info",
      titulo: "Capa no formato de eBook",
      detalhe: `Sua capa está no formato correto da área útil${
        areaUtil ? ` (${areaUtil.largura}mm × ${areaUtil.altura}mm)` : ""
      }. Para eBook e Kindle está pronta. Para impressão física é necessário enviar a capa completa (frente, lombada, verso e orelhas se houver), com sangria de 3mm (evita filete branco na borda) e marcas de corte (orientam o corte da gráfica).`,
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
      nivel: "info",
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
  // 3. DPI — avalia sempre, independente da extensão original
  //    (PDFs podem conter raster embutido; a análise no PNG rasterizado
  //    reflete o DPI real que a gráfica vai receber)
  // ──────────────────────────────────────────────────────────────────
  if (analise.dpi >= 300) {
    recs.push({
      nivel: "info",
      titulo: `${analise.dpi} DPI`,
      detalhe: "Resolução alta o suficiente para impressão profissional sem pixelização.",
    });
  } else if (analise.dpi > 0) {
    recs.push({
      nivel: "aviso",
      titulo: `Resolução ${analise.dpi} DPI`,
      detalhe: "Abaixo dos 300 DPI recomendados para impressão profissional. Para eBook e POD digital funciona; para tiragens grandes em offset, elementos finos podem sair serrilhados.",
    });
  }
  // DPI = 0 significa que não foi possível medir (comum em PDFs
  // puramente vetoriais). Nesse caso não adicionamos rec — a ausência
  // de aviso já comunica "sem problema detectado".

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

  // ──────────────────────────────────────────────────────────────────
  // 6. Verdict agregado "Pronta para gráfica" (verde)
  //
  // Único rec verde da tela. Aparece só quando TUDO conflui:
  //  - Configuração A (marcas + sangria + dimensões batendo)
  //  - Lombada deduzida da capa bate com a lombada esperada do miolo
  //    (dentro da tolerância de 1mm)
  //  - Orelha deduzida bate com a orelha esperada
  //
  // Se qualquer aviso amarelo estiver presente acima, este verdict
  // não aparece — eliminando a contradição de dizer "pronta" com
  // divergência ativa.
  // ──────────────────────────────────────────────────────────────────
  const isConfigA = analise.configuracao === "A";
  const lombadaBate =
    analise.lombada_deduzida_mm == null ||
    analise.lombada_esperada_mm === 0 ||
    Math.abs(analise.lombada_deduzida_mm - analise.lombada_esperada_mm) <= 1;
  const orelhaBate =
    analise.orelha_deduzida_mm == null ||
    analise.orelha_esperada_mm == null ||
    analise.orelha_deduzida_mm === analise.orelha_esperada_mm;

  if (isConfigA && lombadaBate && orelhaBate) {
    recs.push({
      nivel: "ok",
      titulo: "Pronta para gráfica",
      detalhe: "Formato, lombada e dimensões conferem com o miolo. Arquivo pronto para impressão profissional.",
    });
  }

  return recs;
}

function RecomendacoesTecnicas({
  analise,
  loading,
}: {
  analise: AnaliseTecnica | undefined;
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
    // `info`: neutro / cinza. Comunica "está pronto pro seu contexto, atenção
    // para outros contextos" — distinto do `aviso` (amarelo, desvio real que
    // exige ação) e do `ok` (verde, ideal para qualquer contexto).
    info:  { border: "border-zinc-200",    bg: "bg-zinc-50",    text: "text-zinc-800",    dot: "bg-zinc-500" },
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
    </div>
  );
}

// ─── CapaExistenteCard ───────────────────────────────────────────────────────
// Cartão único que representa "capa existente" em dois estados:
//   - Confirmada (isEditorCapa(dados) === true): PNG exportado do editor,
//     `imagem_url` + `confirmed_at` presentes. Autor pode avançar pra Créditos.
//   - Em edição (dados.modo === "ia" com url_escolhida sem confirm): a arte
//     da IA está escolhida mas ainda não virou capa final — só o editor
//     confirmando gera o PNG canônico. "Avançar" fica escondido.
//
// Substitui o antigo CapaIaStatusCard + o slot de capa confirmada dentro do
// grid de 3 modos (evita duas UIs para o mesmo conceito de "já tem capa").

function CapaExistenteCard({
  dados,
  editorConfirmed,
  proposito,
  formato,
  onContinuarEditor,
  onAvancarCreditos,
  onVerOutrasGeracoes,
  onGerarNovasOpcoes,
  onTrocarModo,
  onEscolherTrilha,
}: {
  dados: Record<string, unknown>;
  editorConfirmed: boolean;
  proposito: PropositoPublicacao | null;
  formato: FormatoLivro;
  onContinuarEditor: () => void;
  onAvancarCreditos: () => void;
  onVerOutrasGeracoes: () => void;
  onGerarNovasOpcoes: () => void;
  onTrocarModo: () => void;
  onEscolherTrilha: (p: PropositoPublicacao) => Promise<void>;
}) {
  const thumbUrl = editorConfirmed
    ? (dados.imagem_url as string | undefined)
    : (dados.url_escolhida as string | undefined);
  const confirmedAt = editorConfirmed ? (dados.confirmed_at as string | undefined) : undefined;
  // Só mostra "Ver e usar outras gerações" quando de fato existem gerações
  // (opcoes ou galeria de IA). Se o autor confirmou um editor sem passar por
  // IA (start-from-blank), esse CTA é irrelevante.
  const temGeracoesIa =
    (Array.isArray(dados.opcoes) && (dados.opcoes as unknown[]).length > 0) ||
    (Array.isArray(dados.galeria) && (dados.galeria as unknown[]).length > 0);
  // Análise técnica: SÓ faz sentido para origem upload (autor trouxe arquivo
  // pronto — pode ter cor/sangria/DPI errados). Editor + IA passam pelo
  // pipeline interno; badge de "Analisando..." fica órfão nesse caminho.
  const mostrarAnalise = isUploadCapa(dados);

  const [escolhendoTrilha, setEscolhendoTrilha] = useState(false);
  const [salvandoTrilha, setSalvandoTrilha] = useState(false);

  async function handleAbrirEditor() {
    if (proposito !== null) { onContinuarEditor(); return; }
    setEscolhendoTrilha(true);
  }

  async function handleEscolher(p: PropositoPublicacao) {
    setSalvandoTrilha(true);
    await onEscolherTrilha(p);
    setSalvandoTrilha(false);
    onContinuarEditor();
  }

  if (escolhendoTrilha) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-heading text-xl text-brand-primary">Qual é a sua trilha de publicação?</p>
            <p className="text-sm text-zinc-500 mt-1">Esta escolha orienta quais arquivos são gerados para você.</p>
          </div>
          <button onClick={() => setEscolhendoTrilha(false)} className="text-xs text-zinc-400 hover:text-zinc-600 underline shrink-0 mt-1">
            Cancelar
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([
            { id: "digital" as const, label: "Publicação digital", sub: "EPUB para Amazon, Apple, Kobo, Google Play" },
            { id: "completa" as const, label: "Publicação completa", sub: "Digital + PDF com sangria e marcas de corte para gráfica" },
          ]).map(t => (
            <button key={t.id} onClick={() => handleEscolher(t.id)}
              disabled={salvandoTrilha}
              className="flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border border-zinc-200
                hover:border-brand-gold/60 hover:shadow-sm transition-all text-left disabled:opacity-50">
              <div>
                <p className="font-semibold text-brand-primary text-sm">{t.label}</p>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Proporção da miniatura pelo formato (frente pura = width/height). Confirmada
  // pode ser panorâmica ou frente-only — usa `object-contain` pra não cortar.
  const fmtSpecs = getFormatoDef(formato).specs;
  const aspectFrente = fmtSpecs.width_mm / fmtSpecs.height_mm;
  const thumbHeightPx = 180;
  const thumbWidthPx = Math.round(thumbHeightPx * aspectFrente);

  const statusLabel = editorConfirmed ? "Capa confirmada" : "Falta confirmar no editor";
  const statusDetail = editorConfirmed && confirmedAt
    ? `Confirmada em ${new Date(confirmedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
    : "Arte selecionada. Abra no editor para finalizar e virar capa final.";

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-zinc-100 p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Miniatura à esquerda — proporção do formato */}
          {thumbUrl ? (
            <div
              className="relative shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 shadow-sm"
              style={{
                width: editorConfirmed ? "auto" : thumbWidthPx,
                height: thumbHeightPx,
                maxWidth: editorConfirmed ? 320 : thumbWidthPx,
              }}
            >
              {editorConfirmed ? (
                // Confirmada pode ser panorâmica — contain para não cortar.
                <img src={thumbUrl} alt="Capa" className="h-full w-auto object-contain" />
              ) : (
                <Image src={thumbUrl} alt="Capa" fill className="object-cover" sizes="180px" />
              )}
            </div>
          ) : (
            <div
              className="shrink-0 rounded-lg border border-dashed border-zinc-200 bg-zinc-50"
              style={{ width: thumbWidthPx, height: thumbHeightPx }}
            />
          )}

          {/* Info + CTAs à direita */}
          <div className="flex flex-1 flex-col gap-4 min-w-0">
            <div className="flex items-start gap-2">
              {editorConfirmed
                ? <span className="mt-0.5 shrink-0 text-emerald-600"><CheckCircleIcon /></span>
                : <span className="mt-0.5 shrink-0 text-amber-500"><PencilIcon /></span>}
              <div className="min-w-0">
                <p className="font-medium text-brand-primary text-sm">{statusLabel}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{statusDetail}</p>
              </div>
            </div>

            {mostrarAnalise && (() => {
              const analise = dados.analise_tecnica as AnaliseTecnica | undefined;
              if (!analise) {
                return (
                  <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse"></span>
                    Analisando tecnicamente...
                  </p>
                );
              }
              return (
                <div className="flex flex-wrap gap-1.5">
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

            {/* CTAs primários — dourado é o CTA principal. Sem verde. */}
            <div className="flex flex-wrap gap-3 mt-auto pt-2">
              {editorConfirmed ? (
                <>
                  <button onClick={onAvancarCreditos}
                    className="px-5 py-2.5 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                      hover:bg-brand-primary/90 transition-colors">
                    Avançar para Créditos →
                  </button>
                  <button onClick={handleAbrirEditor}
                    className="px-5 py-2.5 rounded-xl border border-zinc-200 text-brand-primary font-medium text-sm
                      hover:border-brand-gold/60 transition-colors">
                    Continuar editando
                  </button>
                </>
              ) : (
                <button onClick={handleAbrirEditor}
                  className="px-5 py-2.5 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm
                    hover:bg-brand-primary/90 transition-colors">
                  Abrir no editor →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ações terciárias — links discretos em linha */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm text-zinc-500">
        {temGeracoesIa && (
          <>
            <button onClick={onVerOutrasGeracoes} className="hover:text-zinc-700 hover:underline underline-offset-2">
              Ver e usar outras gerações
            </button>
            <span className="text-zinc-300">·</span>
          </>
        )}
        <button onClick={onGerarNovasOpcoes} className="hover:text-zinc-700 hover:underline underline-offset-2">
          Gerar novas opções
        </button>
        <span className="text-zinc-300">·</span>
        <button onClick={onTrocarModo} className="hover:text-zinc-700 hover:underline underline-offset-2">
          Trocar por upload ou editor em branco
        </button>
      </div>
    </div>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-emerald-600">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

// ─── Result card (badges) ─────────────────────────────────────────────────────

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
  // null = ainda carregando; false = NULL no banco (não definido);
  // true = persistido em projects.formato. NUNCA renderizar métodos ou
  // formulários dependentes de formato antes de `true`.
  const [formatoDefinido, setFormatoDefinido] = useState<boolean | null>(null);
  // Lombada real: sempre RECALCULADA a partir de paginas_reais usando a
  // fórmula unificada de `estimarLombadaCapaMm`. NÃO confiar em
  // `dados_miolo.lombada_mm` do banco — projetos com miolo gerado antes
  // do 14.G tinham fórmula legada (× 0.078) fossilizada nesse campo.
  const [lombadaReal, setLombadaReal] = useState<number | null>(null);
  // Estimated pages from manuscript (or real pages if miolo already generated)
  const [estimativaPaginas, setEstimativaPaginas] = useState<number | null>(null);
  const [fonteEstimativa, setFonteEstimativa] = useState<"miolo_real" | "estimado" | null>(null);
  // Status da análise técnica na sessão atual. Só existe em memória —
  // dados_capa.analise_tecnica no banco é a fonte da verdade persistida.
  // Estados:
  //   - "nao_analisada": upload feito mas botão ainda não clicado
  //   - "analisando": chamada em andamento (spinner)
  //   - "concluida": análise disponível, botão "Continuar" liberado
  //   - "erro": chamada falhou, mostra CTA "Tentar de novo"
  const [analiseStatus, setAnaliseStatus] = useState<AnaliseStatus>("nao_analisada");
  const [analiseErro, setAnaliseErro] = useState<string | null>(null);
  // Trilha de publicação — antecipada aqui para pré-selecionar Créditos.
  // null = indefinida (mostra tela de escolha). Valores legados
  // "pessoal"/"livrarias" são normalizados na leitura; qualquer valor ≠
  // "digital"/"completa" é tratado como indefinido.
  const [proposito, setProposito] = useState<PropositoPublicacao | null>(null);
  // UI-only: true enquanto o autor está no fluxo de troca de trilha (sem anular
  // o proposito local, que reflete o banco). Reseta quando confirma ou cancela.
  const [trocandoTrilha, setTrocandoTrilha] = useState(false);
  // CapaGeradaResult a pré-carregar quando abre ModoIA em modo regeneração
  // a partir do CapaIaStatusCard.
  const [modoIaRegerarDe, setModoIaRegerarDe] = useState<CapaGeradaResult | null>(null);
  // Plano do projeto — usado para gate do card "Gerar com IA" (D2-05).
  // Default freemium = fail-closed: em caso de projeto sem coluna preenchida
  // ou falha de leitura, tratamos como freemium e mostramos o paywall.
  const [plano, setPlano] = useState<Plano>("freemium");
  // UI-only: true quando freemium clicou em "Gerar com IA" e vê o paywall
  // no lugar do grid de modos. Reseta ao voltar.
  const [mostrandoConversaoIa, setMostrandoConversaoIa] = useState(false);


  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("projects")
        .select("dados_elementos, dados_capa, dados_creditos, dados_miolo, plano, manuscripts:manuscript_id(titulo, autor_primeiro_nome, autor_sobrenome)")
        .eq("id", id)
        .single();

      // Plano — determina o gate do card "Gerar com IA" (D2-05).
      const planoRaw = (data as { plano?: unknown } | null)?.plano;
      setPlano(
        planoRaw === "pro" || planoRaw === "essencial" || planoRaw === "freemium"
          ? planoRaw
          : "freemium",
      );

      if (data?.dados_elementos) {
        const el = data.dados_elementos as Record<string, unknown>;
        setSinopse(el.sinopse_curta as string ?? "");
        if (el.genero) setGenero(el.genero as string);
      }

      const ms = data?.manuscripts as { titulo?: string; autor_primeiro_nome?: string; autor_sobrenome?: string } | null;
      if (ms) {
        setTitulo(ms.titulo ?? "");
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

      // Extrair proposito de dados_creditos. Normaliza legados "pessoal"/
      // "livrarias" tal como o dashboard de Créditos faz (restoreConfig).
      const dc = data?.dados_creditos as { config?: { proposito?: string } } | null;
      const propRaw = dc?.config?.proposito;
      const propNorm: PropositoPublicacao | null =
        propRaw === "completa" || propRaw === "livrarias" ? "completa"
        : propRaw === "digital" || propRaw === "pessoal" ? "digital"
        : null;
      setProposito(propNorm);

      const fmtRes = await fetch(`/api/projects/${id}/formato`).then(r => r.ok ? r.json() : null);
      if (fmtRes?.formato) {
        setFormatoGlobal(fmtRes.formato as FormatoLivro);
        setFormatoDefinido(true);
      } else {
        setFormatoDefinido(false);
      }

      // Load real lombada if diagramação was already done — recalculada
      // a partir de paginas_reais (nunca lê lombada_mm fossilizada do banco)
      const miolo = data?.dados_miolo as { lombada_mm?: number; paginas_reais?: number } | null;
      if (miolo?.paginas_reais) {
        const lombadaRecalculada = estimarLombadaCapaMm(miolo.paginas_reais);
        setLombadaReal(lombadaRecalculada);
      }

      // ── Auto-reanálise quando análise técnica está desatualizada ─────
      // Cenário: autor sobe capa → análise roda com paginas_reais X →
      // autor rediagrama → paginas_reais vira Y → autor volta para essa
      // tela. A análise persistida ainda reflete o X — precisa disparar
      // nova análise para atualizar `lombada_esperada_mm` e a UI ficar
      // coerente com o miolo atual.
      //
      // Guarda: só dispara quando (a) já existe análise técnica salva
      // e (b) o miolo tem paginas_reais definido e (c) o valor esperado
      // salvo diverge do valor esperado atual. Fire-and-forget para não
      // bloquear a renderização inicial da UI (mostra dados antigos, e
      // troca silenciosamente quando a reanálise termina).
      const capaCarregada = data?.dados_capa as {
        modo?: string;
        analise_tecnica?: { lombada_esperada_mm?: number };
      } | null;
      // Auto-reanálise só faz sentido para upload: capa IA não tem dimensões
      // de arquivo para validar sangria/lombada/DPI.
      const analiseSalva = capaCarregada?.modo === "upload" ? capaCarregada?.analise_tecnica : null;
      if (analiseSalva && miolo?.paginas_reais) {
        const lombadaEsperadaAtual = estimarLombadaCapaMm(miolo.paginas_reais);
        const lombadaEsperadaSalva = analiseSalva.lombada_esperada_mm ?? 0;
        const stale = Math.abs(lombadaEsperadaAtual - lombadaEsperadaSalva) > 0.05;
        if (stale) {
          console.log(
            "[capa/loadProject] análise técnica desatualizada — disparando reanálise silenciosa",
            { lombadaEsperadaSalva, lombadaEsperadaAtual },
          );
          setAnaliseStatus("analisando");
          void fetch(`/api/projects/${id}/capa/analisar`, { method: "POST" })
            .then(async (res) => {
              if (!res.ok) {
                console.error("[capa/loadProject] reanálise falhou:", res.status);
                setAnaliseStatus("concluida"); // volta ao estado anterior
                return;
              }
              const { data: refreshed } = await supabase
                .from("projects")
                .select("dados_capa")
                .eq("id", id)
                .single();
              if (refreshed?.dados_capa) {
                setDados(refreshed.dados_capa as Record<string, unknown>);
              }
              setAnaliseStatus("concluida");
            })
            .catch((err) => {
              console.error("[capa/loadProject] reanálise falhou:", err);
              setAnaliseStatus("concluida");
            });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // Ao carregar dados salvos (reload da página, navegação de volta),
  // sincronizar analiseStatus com o que existe no banco. Análise só se
  // aplica a capas de upload — IA não tem dimensões de arquivo.
  useEffect(() => {
    if (!dados || dados.modo !== "upload") return;
    if (dados.analise_tecnica) {
      setAnaliseStatus("concluida");
      setAnaliseErro(null);
    } else {
      setAnaliseStatus("nao_analisada");
    }
  }, [dados]);

  // Handler do CTA "Analisar capa". Chama /analisar síncrono, re-fetcha
  // dados_capa para renderizar as recomendações e libera o Continuar.
  async function handleAnalisarCapa() {
    setAnaliseStatus("analisando");
    setAnaliseErro(null);
    try {
      const res = await fetch(`/api/projects/${id}/capa/analisar`, {
        method: "POST",
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} — ${errBody.slice(0, 200)}`);
      }
      const body = await res.json();
      if (!body?.ok || !body?.analise) {
        throw new Error("Endpoint retornou resposta sem análise");
      }

      // Re-fetch dados_capa completo para renderizar. O endpoint /analisar
      // já persistiu a análise via PATCH — aqui só recarregamos o state.
      const { data: refreshed } = await supabase
        .from("projects")
        .select("dados_capa")
        .eq("id", id)
        .single();

      if (refreshed?.dados_capa) {
        setDados(refreshed.dados_capa as Record<string, unknown>);
      }
      setAnaliseStatus("concluida");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[capa analisar] falhou:", msg);
      setAnaliseErro(msg);
      setAnaliseStatus("erro");
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
    // avançar. Os itens listados NÃO bloqueiam publicação em eBook/Kindle
    // e POD digital, mas afetam impressão offset (tiragens grandes).
    // window.confirm é intencional: dialog custom aqui seria overkill
    // para um gate opcional.
    //
    // RGB não é problema no fluxo padrão (POD aceita nativamente), então
    // não entra na lista de "problemas". Conversão CMYK só ocorre em
    // offset e é comunicada no fluxo específico.
    const analise = dados?.analise_tecnica as AnaliseTecnica | undefined;
    if (analise && !analise.ok_grafica) {
      const problemas: string[] = [];
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

    const { ok } = await avancarEtapa(supabase, id, null, "creditos", "dashboard-capa");
    if (!ok) {
      alert("Não foi possível avançar a etapa. Tente novamente.");
      return;
    }
    router.push(`/dashboard/creditos/${id}`);
  }

  async function handleSkip() {
    const { error: skipErr } = await supabase
      .from("projects")
      .update({ dados_capa: { modo: "skip" } })
      .eq("id", id);
    if (skipErr) {
      alert("Não foi possível pular a capa. Tente novamente.");
      return;
    }
    await avancarEtapa(supabase, id, null, "creditos", "dashboard-capa");
    router.push(`/dashboard/creditos/${id}`);
  }

  function handleSalvoIA(dadosServidor: CapaGeradaResult) {
    setDados(dadosServidor as unknown as Record<string, unknown>);
  }

  function handleSalvoUpload(result: CapaUploadResult) {
    // Reset explícito da análise ao trocar capa. O backend já zera
    // analise_tecnica no dados_capa (o payload do upload-capa não inclui
    // esse campo), então o banco fica limpo. O state local também precisa
    // resetar para o botão "Analisar capa" reaparecer imediatamente.
    setDados(result as unknown as Record<string, unknown>);
    setAnaliseStatus("nao_analisada");
    setAnaliseErro(null);
    // Não muda modo — permanece em "upload" para que o ModoUpload mostre
    // preview + análise inline. Botão "Continuar" fica dentro do próprio
    // ModoUpload (implementado na Passada 2).
  }

  async function handleEscolherTrilha(p: PropositoPublicacao): Promise<void> {
    const res = await fetch(`/api/projects/${id}/proposito`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposito: p }),
    });
    if (res.ok) {
      setProposito(p);
      setTrocandoTrilha(false);
    }
  }

  // Chamado pelo IaEscolhaGrid — clique numa opção dispara o endpoint de
  // escolha (grátis; regenerar é pago). Servidor devolve o dados_capa
  // atualizado (com url_escolhida preenchida) — sincroniza o state local.
  const [escolhendoUrl, setEscolhendoUrl] = useState<string | null>(null);
  async function handleEscolherOpcao(url: string, storagePath: string): Promise<void> {
    setEscolhendoUrl(url);
    try {
      const res = await fetch(`/api/projects/${id}/capa/escolha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, storage_path: storagePath }),
      });
      if (!res.ok) {
        console.error("[capa/escolha] falhou:", await res.text().catch(() => ""));
        return;
      }
      const dadosNovos = await res.json();
      setDados(dadosNovos);
      setMostrandoGridPersistente(false);
    } finally {
      setEscolhendoUrl(null);
    }
  }
  // Quando o autor está no CapaExistenteCard e clica "Ver e usar outras
  // gerações", entra neste modo — reusa IaEscolhaGrid com a escolhida
  // destacada. Cancelar volta ao status card sem custo.
  const [mostrandoGridPersistente, setMostrandoGridPersistente] = useState(false);

  // Toggle para o link "Trocar por upload ou editor em branco" do
  // CapaExistenteCard. Quando true, esconde o card unificado e mostra o
  // grid dos 3 modos (Upload / IA / Editor em branco) — clicar num modo
  // diferente dispara resetIfDifferentMode e limpa o rascunho atual.
  const [trocandoModo, setTrocandoModo] = useState(false);

  // Zera dados_capa quando o autor está trocando de modo. Garante que
  // "sempre a última escolha vale" — sem estados híbridos entre
  // Upload / IA / Editor.
  //
  // Nota: não é chamado no botão "Editar no editor" do ResultadoCard
  // (esse botão é caminho intencional de IA → Editor, mantendo a IA
  // como background). Só é chamado nos cliques dos 3 cards da tela de
  // ESCOLHA, quando o autor está trocando de modo.
  async function resetIfDifferentMode(
    intendedMode: "upload" | "ia" | "editor",
  ): Promise<void> {
    if (!dados) return;
    const currentMode =
      dados.source === "editor"
        ? "editor"
        : dados.modo === "upload"
          ? "upload"
          : dados.modo === "ia"
            ? "ia"
            : null;
    if (!currentMode || currentMode === intendedMode) return;
    try {
      await fetch(`/api/projects/${id}/capa/reset`, { method: "POST" });
      setDados(null);
    } catch (err) {
      console.error("[capa] falha ao resetar dados_capa (não-fatal):", err);
    }
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

        {/* Precedência de render em `modo === "escolha"`:
            1. IaEscolhaGrid — mostra a grade de opções IA quando:
               (a) IA sem escolha ainda (primeira vez); ou
               (b) o autor clicou "Ver e usar outras gerações" no
                   CapaExistenteCard (mostrandoGridPersistente=true), tanto
                   em estado confirmado quanto em edição.
            2. CapaExistenteCard — card único unificado ("capa existente"):
               dois estados internos via `isEditorCapa(dados)` — confirmada
               (source==='editor') ou em edição (IA com url_escolhida sem
               confirm). Escondido quando o autor clicou "Trocar modo" ou
               está vendo a grade persistente.
            3. 3-card grid (Upload / IA / Editor em branco) — fallback e
               também para quando `trocandoModo` está ligado. */}
        {dados && modo === "escolha" && (
          (dados.modo === "ia" && !isEditorCapa(dados) && !dados.url_escolhida) ||
          mostrandoGridPersistente
        ) ? (
          <div className="space-y-6">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className="font-heading text-xl text-brand-primary">
                  {dados.url_escolhida ? "Trocar a capa escolhida" : "Escolha uma das capas geradas"}
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {dados.url_escolhida
                    ? "Re-escolher é grátis. Regenerar novas opções custa créditos."
                    : "Clicar seleciona e salva imediatamente. Você pode trocar depois."}
                </p>
              </div>
              {mostrandoGridPersistente && (
                <button
                  onClick={() => setMostrandoGridPersistente(false)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 underline shrink-0 ml-4"
                >
                  Cancelar
                </button>
              )}
            </div>
            <IaEscolhaGrid
              opcoes={Array.isArray(dados.opcoes) ? (dados.opcoes as OpcaoCapa[]) : []}
              galeria={Array.isArray(dados.galeria) ? (dados.galeria as GaleriaCapaItem[]) : []}
              urlEscolhida={typeof dados.url_escolhida === "string" ? (dados.url_escolhida as string) : null}
              onEscolher={handleEscolherOpcao}
              escolhendo={escolhendoUrl}
              cobertura={dados.cobertura === "unica" ? "unica" : "frente_verso"}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => {
                  setModoIaRegerarDe(dados as unknown as CapaGeradaResult);
                  setMostrandoGridPersistente(false);
                  setModo("ia");
                }}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-sm hover:border-amber-300 transition-colors"
              >
                Gerar novas opções
              </button>
              {typeof dados.url_escolhida === "string" && (
                <button
                  onClick={() => router.push(`/editor/capa/${id}`)}
                  className="flex-1 py-3 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors"
                >
                  Abrir no editor →
                </button>
              )}
            </div>
          </div>
        ) : dados && modo === "escolha" && !trocandoModo && (
          isEditorCapa(dados) ||
          (dados.modo === "ia" && typeof dados.url_escolhida === "string" && dados.url_escolhida.length > 0)
        ) ? (
          <div className="space-y-4">
            <CapaExistenteCard
              dados={dados}
              editorConfirmed={isEditorCapa(dados)}
              proposito={proposito}
              formato={formatoGlobal}
              onContinuarEditor={() => router.push(`/editor/capa/${id}`)}
              onAvancarCreditos={handleContinuar}
              onVerOutrasGeracoes={() => setMostrandoGridPersistente(true)}
              onGerarNovasOpcoes={() => {
                setModoIaRegerarDe(dados as unknown as CapaGeradaResult);
                setModo("ia");
              }}
              onTrocarModo={() => setTrocandoModo(true)}
              onEscolherTrilha={handleEscolherTrilha}
            />
            {/* B2-05a: painel de verso enxuto — herda estilo/cor/atmosfera
                 da frente automaticamente. Só faz sentido quando:
                 • capa é de IA (upload/editor já trazem verso próprio)
                 • cobertura é frente_verso (unica cobre tudo com uma arte)
                 • Pro + trilha completa (verso impresso só existe nesse caso)
                 • autor ainda não decidiu verso (nem cor, nem arte escolhida) */}
            {(() => {
              const cobertura = (dados.cobertura as string | undefined) ?? "frente_verso";
              const verso = dados.verso as DadosVersoIa | null | undefined;
              const versoDecidido =
                !!verso &&
                (verso.modo === "cor" || (typeof verso.url_escolhida === "string" && verso.url_escolhida.length > 0));
              const mostrarPainelVerso =
                dados.modo === "ia" &&
                cobertura === "frente_verso" &&
                plano === "pro" &&
                proposito === "completa" &&
                !versoDecidido;
              if (!mostrarPainelVerso) return null;
              return (
                <PainelVersoIa
                  projectId={id}
                  dadosFrente={dados}
                  onSalvo={(novo) => setDados(novo)}
                />
              );
            })()}
          </div>
        ) : modo === "escolha" ? (
          <div className="space-y-6">
            {/* Linha discreta de trilha — aparece quando já definida */}
            {proposito !== null && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span>Trilha: <strong className="text-brand-primary">
                  {proposito === "digital" ? "Publicação digital" : "Publicação completa (digital + impressa)"}
                </strong></span>
                <span>·</span>
                <button onClick={() => setTrocandoTrilha(true)} className="underline hover:text-zinc-700">
                  Trocar
                </button>
              </div>
            )}
            {/* Format — read-only; defined in Elementos step */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-5">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">
                Formato do livro
              </p>
              {formatoDefinido === true ? (
                <>
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
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-amber-700">
                    Formato ainda não definido
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Escolha o formato na etapa{" "}
                    <Link href={`/dashboard/elementos/${id}`} className="underline text-brand-primary">
                      Elementos
                    </Link>{" "}
                    antes de criar a capa.
                  </p>
                </>
              )}
            </div>

            {formatoDefinido === true && (() => {
              const capaSalva = dados?.modo === "upload" || (dados?.source === "editor" && Boolean(dados?.confirmed_at));
              if ((proposito === null && !capaSalva) || trocandoTrilha) {
                const trilhas = [
                  { id: "digital" as const, emoji: "📱", label: "Publicação digital", sub: "Ebook (e-pub/PDF). Capa frente apenas, sem lombada impressa." },
                  { id: "completa" as const, emoji: "📚", label: "Publicação completa", sub: "Digital + impressa. Capa panorâmica (frente + lombada + verso) e opção de orelhas." },
                ];
                return (
                  <div className="space-y-4">
                    <div className="flex items-baseline justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-brand-primary mb-1">
                          {trocandoTrilha ? "Trocar trilha de publicação" : "Como você quer publicar?"}
                        </h2>
                        <p className="text-xs text-zinc-500">
                          {trocandoTrilha ? "Selecione a nova trilha. Você pode mudar de ideia a qualquer momento." : "Escolha a trilha antes de criar a capa. Você pode trocar depois."}
                        </p>
                      </div>
                      {trocandoTrilha && (
                        <button onClick={() => setTrocandoTrilha(false)} className="text-xs text-zinc-400 hover:text-zinc-600 underline shrink-0 ml-4">
                          Cancelar
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {trilhas.map(t => {
                        const isAtual = trocandoTrilha && proposito === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => void handleEscolherTrilha(t.id)}
                            className={`flex flex-col items-start gap-3 p-6 bg-white rounded-2xl border transition-all text-left group
                              ${isAtual
                                ? "border-brand-gold ring-2 ring-brand-gold/30 shadow-sm"
                                : "border-zinc-200 hover:border-brand-gold/60 hover:shadow-sm"}`}
                          >
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors
                              ${isAtual ? "bg-brand-gold/20" : "bg-brand-gold/10 group-hover:bg-brand-gold/20"}`}>
                              <span className="text-2xl">{t.emoji}</span>
                            </div>
                            <div>
                              <p className="font-semibold text-brand-primary text-sm">
                                {t.label}{isAtual && <span className="ml-2 text-xs font-normal text-brand-gold">atual</span>}
                              </p>
                              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t.sub}</p>
                            </div>
                            <span className="text-xs font-medium text-brand-gold mt-auto">
                              {isAtual ? "Manter esta trilha →" : "Selecionar →"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              // D2-05: freemium clicou em "Gerar com IA" — trocar o grid pela
              // tela de conversão de plano (mesmo padrão da Prova). Upload e
              // Editor seguem livres para freemium.
              if (mostrandoConversaoIa) {
                return (
                  <div className="space-y-4">
                    <button
                      onClick={() => setMostrandoConversaoIa(false)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                    >
                      ← Voltar
                    </button>
                    <TelaConversaoPlano />
                  </div>
                );
              }
              // hasCurrentCapa = true quando existe qualquer capa salva
              // no banco (upload, IA ou editor). Usado para exibir aviso
              // "Substituirá a capa atual" nos cards que representam um
              // modo diferente do atual. Quando o autor está aqui via
              // `trocandoModo`, o CapaExistenteCard já não está sendo
              // mostrado — mas a capa ainda existe no banco e será
              // substituída se ele escolher outro modo.
              const hasCurrentCapa =
                (dados?.source === "editor" && Boolean(dados?.confirmed_at)) ||
                dados?.modo === "upload" ||
                dados?.modo === "ia";
              // Gate do IA — freemium vê o paywall antes do briefing (D2-05).
              // Upload e Editor não são gated: continuam livres.
              const iaGated = !planoAtende(plano, "essencial");
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ModoCard
                    icon={<UploadIcon />}
                    title="Upload de capa pronta"
                    desc="Você já tem o arquivo final. Vamos verificar se as dimensões estão corretas para o formato e número de páginas."
                    warning={hasCurrentCapa ? "Substituirá a capa atual." : undefined}
                    onClick={async () => {
                      await resetIfDifferentMode("upload");
                      setModo("upload");
                    }}
                  />
                  <ModoCard
                    icon={<SparklesIcon />}
                    title="Gerar com IA"
                    desc="Descreva o que imagina e a IA cria a arte da capa. Você itera imagem a imagem até ficar do seu jeito — os textos você adiciona no editor."
                    warning={!iaGated && hasCurrentCapa ? "Substituirá a capa atual." : undefined}
                    badge={iaGated ? `${PLANO_LABEL.essencial} e ${PLANO_LABEL.pro}` : undefined}
                    onClick={async () => {
                      if (iaGated) {
                        setMostrandoConversaoIa(true);
                        return;
                      }
                      await resetIfDifferentMode("ia");
                      // Verso vive fora da ModoIA (PainelVersoIa); a
                      // decisão unica↔frente_verso vive DENTRO da ModoIA
                      // via seletor de cobertura (B2-05a).
                      setModo("ia");
                    }}
                  />
                  {/* Sempre "editor em branco". O estado confirmado é
                      mostrado pelo CapaExistenteCard no nível da página —
                      chegamos aqui apenas quando `trocandoModo` está ligado
                      ou não existe capa; em ambos os casos, o slot #3
                      representa "começar um editor limpo". */}
                  <button
                    onClick={async () => {
                      await resetIfDifferentMode("editor");
                      router.push(`/editor/capa/${id}`);
                    }}
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
                      {hasCurrentCapa && (
                        <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                          Substituirá a capa atual.
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-medium text-brand-gold mt-auto">Abrir editor →</span>
                  </button>
                </div>
              );
            })()}

            {formatoDefinido === true && (
              <div className="text-center">
                <button onClick={handleSkip}
                  className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2">
                  Pular esta etapa — já tenho a capa fora da plataforma
                </button>
              </div>
            )}
          </div>
        ) : modo === "upload" ? (
          <ModoUpload
            projectId={id}
            formatoInicial={formatoGlobal}
            lombadaReal={lombadaReal}
            estimativaPaginas={estimativaPaginas}
            fonteEstimativa={fonteEstimativa}
            dadosSalvos={dados}
            analiseStatus={analiseStatus}
            analiseErro={analiseErro}
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
            onAnalisar={handleAnalisarCapa}
            onVoltar={() => setModo("escolha")}
          />
        ) : modo === "ia" ? (
          <ModoIA
            projectId={id}
            titulo={titulo}
            autor={autor}
            sinopse={sinopse}
            genero={genero}
            estimativaPaginas={estimativaPaginas}
            regerarDe={modoIaRegerarDe ?? undefined}
            plano={plano}
            proposito={proposito}
            coberturaSalva={
              (dados?.cobertura === "unica" || dados?.cobertura === "frente_verso")
                ? (dados.cobertura as "unica" | "frente_verso")
                : undefined
            }
            onSalvo={(dadosServidor) => {
              handleSalvoIA(dadosServidor);
              setModoIaRegerarDe(null);
              // ModoIA só gera frente/unica (verso vive no PainelVersoIa).
              // Quando trilha definida, abre editor direto para o autor
              // finalizar textos; sem trilha, volta ao card unificado.
              if (proposito !== null) {
                router.push(`/editor/capa/${id}`);
              }
              setModo("escolha");
            }}
            onVoltar={() => {
              setModo("escolha");
              setModoIaRegerarDe(null);
            }}
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


"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { FORMATOS_LIVRO, type FormatoLivro } from "@/lib/formatos";
import type { VerificacaoResultado, MarcasVisuaisHint } from "@/lib/verificacao-miolo";

// Import dinâmico: motor (pdf-lib) e detecção visual (pdfjs) só carregam no
// clique do usuário, mantendo o bundle inicial da rota mínimo. Espelha o
// gatilho do livro-pronto: detecção visual roda em paralelo e o hint é
// aguardado só na hora do POST verify.
async function loadMotor() {
  return await import("@/lib/verificacao-miolo");
}
async function loadDeteccaoVisual() {
  return await import("@/lib/miolo-marcas-cliente");
}

const MAX_BYTES = 100 * 1024 * 1024;

const DETECCAO_LABEL: Record<string, string> = {
  pdf_boxes: "Boxes declarados no PDF",
  visual: "Marcas de corte detectadas visualmente",
  none: "Dimensão total compatível",
};

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function validatePdf(file: File): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const mimeOk = file.type === "application/pdf";
  const extOk = ext === ".pdf";
  if (!mimeOk && !extOk) return "Formato inválido. Envie um arquivo .pdf";
  if (file.size > MAX_BYTES) return "Arquivo muito grande. Máximo: 100 MB";
  return null;
}

type Estado = "idle" | "lendo" | "detectando" | "concluido";

export default function VerificadorPdfTool() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [formato, setFormato] = useState<FormatoLivro>("padrao_br");
  const [estado, setEstado] = useState<Estado>("idle");
  const [resultado, setResultado] = useState<VerificacaoResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const runVerify = useCallback(async (f: File, fmt: FormatoLivro) => {
    setErro(null);
    setResultado(null);
    setEstado("lendo");
    try {
      const buffer = await f.arrayBuffer();
      const [{ verificarMioloBuffer }, { detectarMarcasMioloCliente }] = await Promise.all([
        loadMotor(),
        loadDeteccaoVisual(),
      ]);

      setEstado("detectando");
      // Detecção visual em paralelo — o motor decide se usa o hint (só quando
      // o PDF não declara boxes semânticos).
      let hint: MarcasVisuaisHint | null = null;
      try {
        hint = await detectarMarcasMioloCliente(f);
      } catch {
        hint = null;
      }

      const res = await verificarMioloBuffer({
        buffer,
        formato: fmt,
        paginas_declaradas: 0,
        marcas_visuais: hint,
      });
      setResultado(res);
      setEstado("concluido");
    } catch (e) {
      console.error("[verificador-pdf]", e);
      setErro(e instanceof Error ? e.message : "Falha ao ler o PDF.");
      setEstado("idle");
    }
  }, []);

  function pickFile(f: File) {
    const err = validatePdf(f);
    if (err) {
      setErro(err);
      return;
    }
    setErro(null);
    setFile(f);
    void runVerify(f, formato);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
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

  function onFormatoChange(novo: FormatoLivro) {
    setFormato(novo);
    if (file) void runVerify(file, novo);
  }

  const disabled = estado === "lendo" || estado === "detectando";

  return (
    <div>
      <main className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-6">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Ferramenta
          </p>
          <h1 className="font-heading text-3xl text-brand-primary mb-2">
            Verificador de PDF para impressão
          </h1>
          <p className="text-zinc-500 text-sm">
            Confira formato, sangria, marcas de corte e páginas do miolo antes de enviar pra gráfica.
          </p>
        </div>

        {/* Selo de privacidade — o diferencial */}
        <div className="mb-6 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-start gap-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <p className="text-sm text-emerald-800 leading-relaxed">
            <strong>Seu arquivo é analisado aqui no seu navegador</strong> — não sobe pra nenhum servidor da Autoria.
          </p>
        </div>

        {/* Config + dropzone */}
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
          <div className="mb-5">
            <label className="block text-xs text-zinc-400 uppercase tracking-wide font-medium mb-1.5">
              Formato do livro
            </label>
            <select
              value={formato}
              onChange={(e) => onFormatoChange(e.target.value as FormatoLivro)}
              disabled={disabled}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:opacity-60"
            >
              {FORMATOS_LIVRO.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label} ({f.descricao_curta})
                </option>
              ))}
            </select>
          </div>

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-brand-gold bg-brand-gold/5"
                : "border-zinc-200 hover:border-brand-gold/50 hover:bg-zinc-50"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={onInputChange}
              className="hidden"
            />
            {file ? (
              <>
                <p className="text-sm font-medium text-brand-primary">{file.name}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatBytes(file.size)} — clique ou arraste outro pra trocar
                </p>
              </>
            ) : (
              <>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <polyline points="9 15 12 12 15 15"/>
                </svg>
                <p className="text-sm font-medium text-zinc-600">
                  Arraste o PDF do miolo ou clique pra escolher
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Arquivos grandes podem levar alguns segundos.
                </p>
              </>
            )}
          </div>

          {erro && (
            <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {erro}
            </div>
          )}
        </div>

        {/* Loading */}
        {(estado === "lendo" || estado === "detectando") && (
          <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6 text-center">
            <div className="inline-flex items-center gap-3 text-sm text-zinc-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="animate-spin">
                <circle cx="12" cy="12" r="9" stroke="#e4e4e7" strokeWidth="3"/>
                <path d="M21 12a9 9 0 0 0-9-9" stroke="#c9a84c" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              {estado === "lendo" ? "Lendo o PDF…" : "Procurando marcas de corte…"}
            </div>
          </div>
        )}

        {/* Resultado */}
        {resultado && <ResultadoView resultado={resultado} onReverificar={(f) => onFormatoChange(f)} />}

        {/* CTA pós-verificação */}
        {resultado && (
          <div className="mt-6 rounded-2xl bg-brand-primary text-white px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="font-heading text-lg">Publique este livro grátis na Autoria</p>
              <p className="text-sm text-white/70">A verificação já fica feita — é só continuar de onde parou.</p>
            </div>
            <Link
              href="/cadastro?next=%2Fdashboard%2Flivro-pronto"
              className="shrink-0 bg-brand-gold text-brand-primary text-sm font-bold px-5 py-3 rounded-xl hover:bg-brand-gold-light active:scale-95 transition-all tracking-wide text-center"
            >
              Criar conta grátis
            </Link>
          </div>
        )}

        {/* Info block */}
        <div className="mt-6 bg-brand-primary/5 rounded-xl border border-brand-primary/10 px-5 py-4">
          <p className="text-sm text-zinc-600 leading-relaxed">
            <strong className="text-brand-primary">O que checamos:</strong> o <strong>TrimBox</strong> (área
            de corte final) contra o formato escolhido, se há <strong>sangria</strong> (BleedBox &gt; TrimBox)
            e se as <strong>marcas de corte</strong> foram desenhadas no PDF — declaradas por boxes semânticos
            ou detectadas visualmente nos cantos. Também contamos as páginas reais e estimamos a lombada.
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── Cards de resultado ──────────────────────────────────────────────────────

function ResultadoView({
  resultado,
  onReverificar,
}: {
  resultado: VerificacaoResultado;
  onReverificar: (f: FormatoLivro) => void;
}) {
  if (resultado.ok) return <CardOk resultado={resultado} />;
  if (resultado.motivo === "pdf_ilegivel") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-heading text-lg text-red-900 mb-2">PDF ilegível</h2>
        <ul className="text-sm text-red-800 space-y-1">
          {resultado.divergencias.map((d, i) => (<li key={i}>• {d}</li>))}
        </ul>
      </div>
    );
  }
  // dimensao_divergente
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="font-heading text-lg text-amber-900 mb-3">Não bate com o formato escolhido</h2>
      <ul className="text-sm text-amber-800 space-y-1.5 mb-4">
        {resultado.divergencias.map((d, i) => (<li key={i}>• {d}</li>))}
      </ul>
      {resultado.formato_provavel && (
        <button
          onClick={() => onReverificar(resultado.formato_provavel as FormatoLivro)}
          className="inline-flex items-center gap-2 bg-amber-900 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-amber-950 transition-colors"
        >
          Verificar como {labelFormato(resultado.formato_provavel)}
        </button>
      )}
      {(resultado.largura_mm !== undefined || resultado.paginas_reais !== undefined) && (
        <div className="mt-4 pt-4 border-t border-amber-200 grid grid-cols-2 gap-3 text-xs text-amber-900">
          {resultado.largura_mm !== undefined && resultado.altura_mm !== undefined && (
            <div>
              <div className="uppercase tracking-wide opacity-70">Medida detectada</div>
              <div className="font-mono">{resultado.largura_mm}×{resultado.altura_mm} mm</div>
            </div>
          )}
          {resultado.paginas_reais !== undefined && (
            <div>
              <div className="uppercase tracking-wide opacity-70">Páginas</div>
              <div className="font-mono">{resultado.paginas_reais}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardOk({ resultado }: { resultado: Extract<VerificacaoResultado, { ok: true }> }) {
  const {
    largura_mm,
    altura_mm,
    paginas_reais,
    sangria_detectada,
    sangria_mm,
    marcas_detectadas,
    deteccao_fonte,
    lombada_mm,
    avisos,
  } = resultado;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h2 className="font-heading text-lg text-emerald-900">PDF pronto pra gráfica</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Área de corte" value={`${largura_mm}×${altura_mm} mm`} />
        <Stat label="Páginas" value={String(paginas_reais)} />
        <Stat label="Lombada estimada" value={`${lombada_mm.toFixed(1)} mm`} />
        <Stat
          label="Sangria"
          value={sangria_detectada ? (sangria_mm ? `${sangria_mm} mm` : "sim") : "não detectada"}
          tone={sangria_detectada ? "ok" : "warn"}
        />
        <Stat
          label="Marcas de corte"
          value={marcas_detectadas ? "sim" : "não detectadas"}
          tone={marcas_detectadas ? "ok" : "warn"}
        />
        <Stat label="Fonte" value={DETECCAO_LABEL[deteccao_fonte] ?? deteccao_fonte} />
      </div>

      {avisos.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <ul className="text-xs text-amber-800 space-y-1">
            {avisos.map((a, i) => (<li key={i}>• {a}</li>))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "ok" }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "warn" ? "bg-white border-amber-200" : "bg-white border-emerald-100"}`}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-400 font-medium">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 ${tone === "warn" ? "text-amber-700" : "text-emerald-900"}`}>
        {value}
      </div>
    </div>
  );
}

function labelFormato(f: FormatoLivro): string {
  return FORMATOS_LIVRO.find((x) => x.value === f)?.label ?? f;
}

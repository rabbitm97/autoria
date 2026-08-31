"use client";

import { useRef, useState } from "react";
import { DeclaracaoTitularidade } from "@/components/declaracao-titularidade";
import { validateFile } from "@/lib/upload-manuscrito-cliente";
import type { ModoDiagnostico } from "@/lib/diagnostico-avulso";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";

// ─── Types ────────────────────────────────────────────────────────────────────

type Etapa = "upload" | "aceite" | "processando" | "concluido" | "erro";

interface Progresso { atual: number; total: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_TENTATIVAS = 30;

// ─── Component ────────────────────────────────────────────────────────────────

export function WizardDiagnostico({ modo }: { modo: ModoDiagnostico }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [texto, setTexto] = useState("");
  const [parseando, setParseando] = useState(false);
  const [aceita, setAceita] = useState(false);
  const [aberta, setAberta] = useState(false);
  const [progresso, setProgresso] = useState<Progresso>({ atual: 0, total: 0 });
  const [etapaMsg, setEtapaMsg] = useState("");
  const [jobId, setJobId] = useState("");
  const [erro, setErro] = useState("");
  const [entregavel, setEntregavel] = useState<{ job_id: string; nome: string } | null>(null);

  const custo = modo === "expresso"
    ? CUSTOS_CREDITOS.diagnostico_expresso
    : CUSTOS_CREDITOS.diagnostico_completo;

  // ── File handling ──────────────────────────────────────────────────────────

  async function processarArquivo(file: File) {
    const err = validateFile(file);
    if (err) { setErro(err); return; }

    setErro("");
    setNomeArquivo(file.name);
    setParseando(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/ferramentas/parse-file", { method: "POST", body: form });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Falha ao ler o arquivo.");
      if (!j.texto || j.texto.trim().length < 50) {
        throw new Error("Arquivo muito curto ou sem texto reconhecível.");
      }
      setTexto(j.texto);
      setEtapa("aceite");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setNomeArquivo("");
    } finally {
      setParseando(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processarArquivo(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processarArquivo(file);
  }

  // ── Rodar ─────────────────────────────────────────────────────────────────

  async function rodar() {
    if (!aceita || !texto) return;
    setEtapa("processando");
    setEtapaMsg("Criando job…");
    setErro("");

    try {
      // 1. Criar job + sombra project (créditos debitados aqui)
      const jobRes = await fetch("/api/ferramentas/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ferramenta_id: `diagnostico-${modo}`,
          titulo: nomeArquivo.replace(/\.[^.]+$/, ""),
        }),
      });
      const jobData = await jobRes.json().catch(() => ({}));
      if (!jobRes.ok) throw new Error(jobData.error ?? "Falha ao criar job.");
      const { job_id, project_id } = jobData as { job_id: string; project_id: string };
      setJobId(job_id);

      // 2. Registrar aceite legal (best-effort — aceite da UI já foi feito)
      fetch("/api/legal/aceite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "declaracao-titularidade",
          contexto: "upload",
          projectId: project_id,
        }),
      }).catch(() => {/* best-effort */});

      // 3. Polling diagnóstico
      setEtapaMsg("Analisando manuscrito…");
      let tentativas = 0;
      let textoBody: string | undefined = texto;

      while (tentativas < MAX_TENTATIVAS) {
        tentativas++;
        const diagRes = await fetch("/api/agentes/diagnostico", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id,
            job_id,
            modo,
            ...(textoBody !== undefined ? { texto: textoBody } : {}),
          }),
        });
        textoBody = undefined; // texto apenas na primeira chamada

        const diagData = await diagRes.json().catch(() => ({}));

        if (!diagRes.ok) {
          throw new Error(diagData.error ?? `Erro ${diagRes.status} no diagnóstico.`);
        }

        if (diagData.progresso) {
          setProgresso(diagData.progresso as Progresso);
        }

        if (diagData.status === "concluido") break;
        if (diagData.status === "erro") throw new Error(diagData.erro ?? "Diagnóstico falhou.");
        // status "processando_capitulos" | "consolidando" → continua
      }

      if (tentativas >= MAX_TENTATIVAS) {
        throw new Error("Tempo limite excedido. O diagnóstico ainda está em andamento — recarregue a página para tentar novamente.");
      }

      // 4. Gerar PDF no cofre
      setEtapaMsg("Gerando relatório PDF…");
      const concRes = await fetch("/api/ferramentas/diagnostico-avulso/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id }),
      });
      const concData = await concRes.json().catch(() => ({}));
      if (!concRes.ok) throw new Error(concData.error ?? "Falha ao gerar PDF.");

      const nome = `Diagnóstico ${modo === "expresso" ? "Expresso" : "Completo"} — ${nomeArquivo.replace(/\.[^.]+$/, "")}.pdf`;
      setEntregavel({ job_id, nome });
      setEtapa("concluido");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setEtapa("erro");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (etapa === "upload") {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <h1 className="font-heading text-3xl text-brand-primary mb-1">
          Diagnóstico {modo === "expresso" ? "Expresso" : "Completo"}
        </h1>
        <p className="text-zinc-500 text-sm mb-8">
          {modo === "expresso"
            ? `Análise editorial rápida de uma amostra do manuscrito. Custa ${custo} créditos.`
            : `Diagnóstico editorial completo, capítulo a capítulo. Custa ${custo} créditos.`}
        </p>

        {erro && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {erro}
          </div>
        )}

        <div
          className="border-2 border-dashed border-zinc-200 rounded-2xl p-10 text-center cursor-pointer hover:border-brand-gold/50 hover:bg-brand-gold/5 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {parseando ? (
            <p className="text-zinc-400 text-sm">Lendo arquivo…</p>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-brand-primary/5 flex items-center justify-center mx-auto mb-4">
                <UploadIcon />
              </div>
              <p className="text-sm text-zinc-600 font-medium mb-1">
                Arraste o arquivo ou clique para escolher
              </p>
              <p className="text-xs text-zinc-400">DOCX, PDF ou TXT · máximo 50 MB</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf,.txt"
          className="hidden"
          onChange={onFileChange}
        />
      </div>
    );
  }

  if (etapa === "aceite") {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <button
          onClick={() => { setEtapa("upload"); setAceita(false); setAberta(false); }}
          className="text-xs text-zinc-400 hover:text-zinc-600 mb-6 flex items-center gap-1"
        >
          ← Trocar arquivo
        </button>

        <div className="mb-6 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-400 uppercase tracking-wide font-semibold mb-0.5">Arquivo selecionado</p>
          <p className="text-sm font-medium text-brand-primary">{nomeArquivo}</p>
        </div>

        <DeclaracaoTitularidade
          aceita={aceita}
          aberta={aberta}
          onAceita={setAceita}
          onToggle={() => setAberta(!aberta)}
        />

        <div className="mt-6">
          <p className="text-xs text-zinc-400 mb-4">
            Custo: <strong className="text-brand-primary">{custo} créditos</strong>
            {" "}debitados ao clicar em "Rodar".
          </p>
          <button
            disabled={!aceita}
            onClick={rodar}
            className="w-full rounded-xl bg-brand-primary text-white font-semibold py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-primary/90 transition-colors"
          >
            Rodar diagnóstico →
          </button>
        </div>
      </div>
    );
  }

  if (etapa === "processando") {
    const pct = progresso.total > 0
      ? Math.round((progresso.atual / progresso.total) * 100)
      : null;

    return (
      <div className="max-w-lg mx-auto py-12 px-4 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-brand-gold border-t-transparent animate-spin mx-auto mb-6" />
        <p className="font-heading text-xl text-brand-primary mb-2">{etapaMsg}</p>
        {pct !== null && (
          <>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden mb-2 mx-auto max-w-xs">
              <div
                className="h-full bg-brand-gold rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-zinc-400">
              {progresso.atual} / {progresso.total} fragmentos
            </p>
          </>
        )}
        <p className="text-xs text-zinc-400 mt-6">Não feche esta aba.</p>
      </div>
    );
  }

  if (etapa === "concluido" && entregavel) {
    return (
      <div className="max-w-lg mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon />
          </div>
          <h1 className="font-heading text-2xl text-brand-primary mb-1">Diagnóstico pronto!</h1>
          <p className="text-zinc-500 text-sm">Disponível por 90 dias na sua conta.</p>
        </div>

        <a
          href={`/api/ferramentas/jobs/${entregavel.job_id}/download?i=0`}
          className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-white px-4 py-3 hover:border-brand-gold hover:text-brand-primary transition-colors"
        >
          <span className="text-sm font-medium text-zinc-700 truncate">{entregavel.nome}</span>
          <span className="shrink-0 text-brand-gold text-sm font-semibold">Baixar PDF</span>
        </a>

        <p className="mt-6 text-center">
          <a href="/dashboard/ferramentas" className="text-xs text-zinc-400 hover:text-brand-primary">
            ← Voltar às ferramentas
          </a>
        </p>
      </div>
    );
  }

  // Erro
  return (
    <div className="max-w-lg mx-auto py-12 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
        <XCircleIcon />
      </div>
      <h1 className="font-heading text-xl text-brand-primary mb-2">Algo deu errado</h1>
      <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">{erro}</p>
      <button
        onClick={() => { setEtapa("upload"); setErro(""); setNomeArquivo(""); setTexto(""); setAceita(false); setAberta(false); }}
        className="rounded-xl border border-zinc-200 px-6 py-2.5 text-sm font-medium text-zinc-700 hover:border-brand-gold hover:text-brand-primary transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="15" y1="9" x2="9" y2="15"/>
      <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  );
}

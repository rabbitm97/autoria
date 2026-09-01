"use client";

// components/ferramentas/wizard-diagramacao.tsx
//
// Wizard das ferramentas Diagramação avulsa (FERR-3.3b). Um único wizard
// serve os dois modos: digital (100c) e completa (150c). Fluxo:
//
//   0 início → 1 manuscrito → 2 rodando (upload/parse) → 3 formato
//   → 4 bridge créditos → 5 bridge miolo → 6 gerar PDF → 7 pronto
//
// O autor SAI DO WIZARD duas vezes: para /dashboard/creditos/[id]?avulso=
// e para /dashboard/miolo/[id]?avulso=. Volta em ambos os casos via
// /dashboard/ferramentas/diagramacao?job=<jobId>. Nessa volta, o wizard
// consulta GET /api/ferramentas/jobs/[id] e reidrata o passo a partir de
// sombra.{formato,tem_creditos,tem_miolo}.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import { modoDiagramacao } from "@/lib/ferramenta-jobs";
import type { FormatoLivro } from "@/lib/formatos";
import { EscolhaFormato } from "@/components/escolha-formato";
import {
  TelaInicio,
  TelaManuscrito,
  TelaRodando,
  TelaPronto,
  useSaldo,
  type DadosManuscrito,
} from "./wizard-shell";

// ─── Config ───────────────────────────────────────────────────────────────────

type Modo = "digital" | "completa";
type Passo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const HEADINGS: Record<Modo, string> = {
  digital: "Diagramação digital",
  completa: "Diagramação completa",
};

const FERRAMENTA_ID: Record<Modo, string> = {
  digital: "diagramacao-digital",
  completa: "diagramacao-completa",
};

const CUSTO: Record<Modo, number> = {
  digital: CUSTOS_CREDITOS.diagramacao_digital,
  completa: CUSTOS_CREDITOS.diagramacao_completa,
};

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  totalEntregaveis: number;
}

interface Props {
  modoInicial: Modo;
  jobIdInicial: string | null;
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function WizardDiagramacao({ modoInicial, jobIdInicial }: Props) {
  const router = useRouter();

  const [modo, setModo] = useState<Modo>(modoInicial);
  const custo = CUSTO[modo];
  const heading = HEADINGS[modo];
  const saldo = useSaldo();

  const [passo, setPasso] = useState<Passo>(jobIdInicial ? 2 : 0);
  const [dados, setDados] = useState<DadosManuscrito>({
    titulo: "",
    autor: "",
    file: null,
    declaracaoAceita: false,
  });

  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [formatoSalvo, setFormatoSalvo] = useState<FormatoLivro | null>(null);

  // Rodando (passo 2 e 6)
  const [statusTexto, setStatusTexto] = useState(jobIdInicial ? "Retomando…" : "");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // Pronto (passo 7)
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);

  // Retomada por ?job= — roda uma única vez no mount.
  const retomouRef = useRef(false);
  useEffect(() => {
    if (!jobIdInicial || retomouRef.current) return;
    retomouRef.current = true;
    void reidratarDeJob(jobIdInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reidratarDeJob(id: string) {
    setErro(null);
    try {
      const res = await fetch(`/api/ferramentas/jobs/${id}`);
      if (!res.ok) throw new Error("Não conseguimos retomar este trabalho.");
      const data = (await res.json()) as {
        job: {
          id: string;
          ferramenta_id: string;
          estado: string;
          projeto_sombra_id: string | null;
          entregaveis: unknown[];
          expira_em: string | null;
        };
        sombra: { formato: string | null; tem_creditos: boolean; tem_miolo: boolean } | null;
      };

      const modoJob = modoDiagramacao(data.job.ferramenta_id);
      if (!modoJob) throw new Error("Este job não é de diagramação.");
      if (modoJob !== modo) setModo(modoJob);

      setJobId(data.job.id);
      setProjectId(data.job.projeto_sombra_id);

      if (data.job.estado === "concluido") {
        setResultado({
          jobId: data.job.id,
          expiraEm: data.job.expira_em,
          totalEntregaveis: Array.isArray(data.job.entregaveis) ? data.job.entregaveis.length : 1,
        });
        setPasso(7);
        return;
      }

      const s = data.sombra;
      if (s?.formato) setFormatoSalvo(s.formato as FormatoLivro);

      if (s?.tem_miolo) setPasso(6);
      else if (s?.tem_creditos) setPasso(5);
      else if (s?.formato) setPasso(4);
      else setPasso(3);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao retomar.");
      setPasso(2); // fica na tela de rodando com botão de voltar
    }
  }

  // ── Passo 1 → 2 → 3: cria sombra e vai para escolha do formato ─────────────
  async function iniciarSombra() {
    if (!dados.file || !dados.titulo.trim() || !dados.declaracaoAceita) return;
    setPasso(2);
    setErro(null);
    setProgresso(0);

    try {
      const sombra = await criarSombraEJob({
        file: dados.file,
        titulo: dados.titulo,
        autor: dados.autor,
        ferramentaId: FERRAMENTA_ID[modo],
        onStatus: (t, p) => {
          setStatusTexto(t);
          setProgresso(p);
        },
      });
      setProjectId(sombra.projectId);
      setJobId(sombra.jobId);
      router.replace(`/dashboard/ferramentas/diagramacao?modo=${modo}&job=${sombra.jobId}`);
      setPasso(3);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao iniciar.");
    }
  }

  // ── Passo 6: gerar PDFs + concluir ─────────────────────────────────────────
  async function gerarPdfsEConcluir() {
    if (!projectId || !jobId) return;
    setPasso(2);
    setErro(null);
    setStatusTexto("Gerando PDF digital…");
    setProgresso(15);

    try {
      const digRes = await fetch("/api/agentes/gerar-pdf-digital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, job_id: jobId }),
      });
      if (digRes.status === 402) {
        const d = (await digRes.json()) as { error?: string };
        throw new Error(d.error ?? "Créditos insuficientes.");
      }
      if (!digRes.ok) {
        const d = (await digRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao gerar o PDF digital.");
      }

      if (modo === "completa") {
        setStatusTexto("Gerando PDF de impressão…");
        setProgresso(55);
        const grafRes = await fetch("/api/agentes/gerar-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, job_id: jobId }),
        });
        if (!grafRes.ok) {
          const d = (await grafRes.json()) as { error?: string };
          throw new Error(d.error ?? "Falha ao gerar o PDF de impressão.");
        }
      }

      setStatusTexto("Salvando e liberando download…");
      setProgresso(85);
      const concluirRes = await fetch("/api/ferramentas/diagramacao-avulsa/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!concluirRes.ok) {
        const d = (await concluirRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao concluir.");
      }
      const concluirData = (await concluirRes.json()) as {
        expira_em?: string | null;
        entregaveis?: unknown[];
      };

      setProgresso(100);
      setResultado({
        jobId,
        expiraEm: concluirData.expira_em ?? null,
        totalEntregaveis: Array.isArray(concluirData.entregaveis) ? concluirData.entregaveis.length : (modo === "completa" ? 2 : 1),
      });
      setPasso(7);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (passo === 0) {
    return (
      <TelaInicio
        titulo={heading}
        custo={custo}
        saldo={saldo}
        onIniciar={() => setPasso(1)}
      />
    );
  }

  if (passo === 1) {
    return (
      <TelaManuscrito
        tituloHeading={heading}
        ctaLabel="Continuar"
        dados={dados}
        onDados={(patch) => setDados((d) => ({ ...d, ...patch }))}
        onSubmit={iniciarSombra}
      />
    );
  }

  if (passo === 2) {
    return (
      <TelaRodando
        tituloHeading={heading}
        statusTexto={statusTexto}
        progresso={progresso}
        erro={erro}
        onRetry={
          projectId && jobId
            ? () => {
                setErro(null);
                void gerarPdfsEConcluir();
              }
            : undefined
        }
        onVoltar={projectId ? undefined : () => setPasso(1)}
      />
    );
  }

  if (passo === 3) {
    if (!projectId) return null;
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="font-heading text-3xl text-brand-primary mb-2">{heading}</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Escolha o formato do seu livro. Ele define a mancha de texto do miolo.
        </p>
        <EscolhaFormato
          projectId={projectId}
          initialFormato={formatoSalvo}
          locked={false}
          onSaved={(f) => setFormatoSalvo(f)}
        />
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setPasso(4)}
            disabled={!formatoSalvo}
            className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
          >
            Continuar para ficha de créditos
          </button>
        </div>
      </div>
    );
  }

  if (passo === 4) {
    if (!projectId || !jobId) return null;
    return (
      <BridgeEtapa
        heading={heading}
        titulo="Ficha e página de créditos"
        descricao="Vamos preencher a ficha de créditos do seu livro na esteira. Ao terminar, você volta para cá."
        ctaLabel="Ir para ficha de créditos"
        onGo={() => router.push(`/dashboard/creditos/${projectId}?avulso=${jobId}`)}
      />
    );
  }

  if (passo === 5) {
    if (!projectId || !jobId) return null;
    return (
      <BridgeEtapa
        heading={heading}
        titulo="Diagramação do miolo"
        descricao="Vamos diagramar o miolo do seu livro. Ao terminar, você volta para cá para gerar o PDF final."
        ctaLabel="Ir para diagramação"
        onGo={() => router.push(`/dashboard/miolo/${projectId}?avulso=${jobId}`)}
      />
    );
  }

  if (passo === 6) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="font-heading text-3xl text-brand-primary mb-2">{heading}</h1>
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 mb-6 space-y-3">
          <p className="text-sm text-zinc-700">
            Tudo pronto para gerar seu {modo === "completa" ? "PDF digital + PDF de impressão" : "PDF digital"}.
          </p>
          <p className="text-xs text-zinc-400">
            Ao clicar, cobramos <span className="font-semibold text-brand-primary">{custo} créditos</span>. Depois o download fica disponível por 90 dias.
          </p>
        </div>
        {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}
        <button
          type="button"
          onClick={gerarPdfsEConcluir}
          className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
        >
          Gerar PDF — {custo} créditos
        </button>
      </div>
    );
  }

  // passo === 7
  const r = resultado!;
  return (
    <TelaPronto
      tituloEntregavel={modo === "completa" ? "Seus PDFs estão prontos" : "Seu PDF está pronto"}
      jobId={r.jobId}
      ctaDownload="Baixar PDF digital"
      expiraEm={r.expiraEm}
    >
      {r.totalEntregaveis > 1 && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 mb-8">
          <p className="text-xs font-semibold text-brand-primary uppercase tracking-wide mb-3">
            PDF de impressão (com sangria e marcas de corte)
          </p>
          <a
            href={`/api/ferramentas/jobs/${r.jobId}/download?i=1`}
            download
            className="block w-full text-center rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
          >
            Baixar PDF de impressão
          </a>
        </div>
      )}
    </TelaPronto>
  );
}

// ─── Bridges (passos 4 e 5) ──────────────────────────────────────────────────

function BridgeEtapa({
  heading,
  titulo,
  descricao,
  ctaLabel,
  onGo,
}: {
  heading: string;
  titulo: string;
  descricao: string;
  ctaLabel: string;
  onGo: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-heading text-3xl text-brand-primary mb-2">{heading}</h1>
      <div className="rounded-2xl border border-zinc-100 bg-white p-6 mb-6 space-y-3">
        <p className="text-sm font-semibold text-brand-primary">{titulo}</p>
        <p className="text-sm text-zinc-500">{descricao}</p>
      </div>
      <button
        type="button"
        onClick={onGo}
        className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
      >
        {ctaLabel}
      </button>
    </div>
  );
}

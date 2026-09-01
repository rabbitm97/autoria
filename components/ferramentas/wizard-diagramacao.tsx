"use client";

// components/ferramentas/wizard-diagramacao.tsx
//
// Wizard das ferramentas Diagramação avulsa (FERR-3.3b + layout FERR-3.3c).
// Um único wizard serve os dois modos: digital (100c) e completa (150c).
// Fluxo (passos exibidos no stepper — 7 etapas):
//
//   0 Início → 1 Manuscrito → 2 Formato → 3 Créditos → 4 Diagramar → 5 PDF → 6 Pronto
//
// Estado interno usa 8 valores (0..7) porque o "rodando" (upload/parse e
// geração final) é um estado transitório que renderiza sobre o mesmo card
// do passo em curso (2 quando é upload; 5 quando é PDF).
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
  ConteudoInicio,
  ConteudoManuscrito,
  ConteudoRodando,
  CtaInicio,
  CtaPrimario,
  TelaPronto,
  WizardLayout,
  manuscritoPronto,
  useSaldo,
  type DadosManuscrito,
  type EntregavelPronto,
} from "./wizard-shell";

// ─── Config ───────────────────────────────────────────────────────────────────

type Modo = "digital" | "completa";
// Passo interno (rodando reaproveita o cartão do estado corrente).
type Passo = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Passos exibidos no stepper — 7 etapas.
const PASSOS = ["Início", "Manuscrito", "Formato", "Créditos", "Diagramar", "PDF", "Pronto"];

const FERRAMENTA_LABEL: Record<Modo, string> = {
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

// Mapeia passo interno → índice no stepper.
function passoDoStepper(passo: Passo, rodandoTipo: "upload" | "gerar" | null): number {
  if (rodandoTipo === "upload") return 1; // parse ainda é parte de "Manuscrito"
  if (rodandoTipo === "gerar") return 5; // geração é parte de "PDF"
  switch (passo) {
    case 0:
      return 0;
    case 1:
      return 1;
    case 2:
      return 1; // "rodando" upload — fica em Manuscrito
    case 3:
      return 2; // Formato
    case 4:
      return 3; // Créditos
    case 5:
      return 4; // Diagramar
    case 6:
      return 5; // PDF (revisar & gerar)
    case 7:
      return 6; // Pronto
  }
}

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  entregaveis: EntregavelPronto[];
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
  const ferramenta = FERRAMENTA_LABEL[modo];
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

  // Rodando: qual passo o overlay está representando ("upload" no 2, "gerar" no 6).
  const [rodandoTipo, setRodandoTipo] = useState<"upload" | "gerar" | null>(
    jobIdInicial ? "upload" : null,
  );
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
          entregaveis: EntregavelPronto[];
          expira_em: string | null;
        };
        sombra: { formato: string | null; tem_creditos: boolean; tem_miolo: boolean } | null;
      };

      const modoJob = modoDiagramacao(data.job.ferramenta_id);
      if (!modoJob) throw new Error("Este job não é de diagramação.");
      if (modoJob !== modo) setModo(modoJob);

      setJobId(data.job.id);
      setProjectId(data.job.projeto_sombra_id);
      setRodandoTipo(null);

      if (data.job.estado === "concluido") {
        setResultado({
          jobId: data.job.id,
          expiraEm: data.job.expira_em,
          entregaveis: Array.isArray(data.job.entregaveis) ? data.job.entregaveis : [],
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
      setPasso(2);
      setRodandoTipo("upload");
    }
  }

  // ── Passo 1 → sombra → 3 (Formato) ─────────────────────────────────────────
  async function iniciarSombra() {
    if (!manuscritoPronto(dados)) return;
    setPasso(2);
    setRodandoTipo("upload");
    setErro(null);
    setProgresso(0);

    try {
      const sombra = await criarSombraEJob({
        file: dados.file!,
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
      setRodandoTipo(null);
      setPasso(3);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao iniciar.");
    }
  }

  // ── Passo 6: gerar PDFs + concluir ─────────────────────────────────────────
  async function gerarPdfsEConcluir() {
    if (!projectId || !jobId) return;
    setRodandoTipo("gerar");
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
        entregaveis?: EntregavelPronto[];
      };

      setProgresso(100);
      setResultado({
        jobId,
        expiraEm: concluirData.expira_em ?? null,
        entregaveis: Array.isArray(concluirData.entregaveis) ? concluirData.entregaveis : [],
      });
      setRodandoTipo(null);
      setPasso(7);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const stepperIdx = passoDoStepper(passo, rodandoTipo);

  // ── Passo 0: Início ─────────────────────────────────────────────────────────
  if (passo === 0) {
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={0}
        titulo="Como funciona"
        descricao={
          modo === "completa"
            ? "Envie seu manuscrito, escolha o formato e receba o miolo diagramado em PDF digital e em PDF de impressão, com sangria e marcas de corte."
            : "Envie seu manuscrito, escolha o formato e receba o miolo do seu livro diagramado em PDF."
        }
        rodape={{ primario: <CtaInicio custo={custo} saldo={saldo} onIniciar={() => setPasso(1)} /> }}
      >
        <ConteudoInicio custo={custo} saldo={saldo} />
      </WizardLayout>
    );
  }

  // ── Passo 1: Manuscrito ─────────────────────────────────────────────────────
  if (passo === 1) {
    const pronto = manuscritoPronto(dados);
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={1}
        titulo="Seu manuscrito"
        rodape={{
          primario: (
            <CtaPrimario disabled={!pronto} onClick={iniciarSombra}>
              Continuar
            </CtaPrimario>
          ),
        }}
      >
        <ConteudoManuscrito dados={dados} onDados={(patch) => setDados((d) => ({ ...d, ...patch }))} />
      </WizardLayout>
    );
  }

  // ── Passo 2: Rodando (upload/parse) ────────────────────────────────────────
  if (passo === 2) {
    const podeRetry = !!(projectId && jobId && erro);
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={stepperIdx}
        titulo={erro ? "Não conseguimos preparar o manuscrito" : "Preparando manuscrito…"}
        rodape={{
          primario: podeRetry ? (
            <CtaPrimario
              onClick={() => {
                setErro(null);
                void reidratarDeJob(jobId!);
              }}
            >
              Tentar novamente
            </CtaPrimario>
          ) : !projectId && erro ? (
            <CtaPrimario onClick={() => setPasso(1)}>Voltar ao manuscrito</CtaPrimario>
          ) : undefined,
        }}
      >
        <ConteudoRodando statusTexto={statusTexto} progresso={progresso} erro={erro} />
      </WizardLayout>
    );
  }

  // ── Passo 3: Formato ───────────────────────────────────────────────────────
  if (passo === 3) {
    if (!projectId) return null;
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={2}
        titulo="Formato do livro"
        descricao="Ele define a mancha de texto do miolo."
        rodape={{
          primario: (
            <CtaPrimario disabled={!formatoSalvo} onClick={() => setPasso(4)}>
              Avançar →
            </CtaPrimario>
          ),
        }}
      >
        <EscolhaFormato
          projectId={projectId}
          initialFormato={formatoSalvo}
          locked={false}
          onSaved={(f) => setFormatoSalvo(f)}
        />
      </WizardLayout>
    );
  }

  // ── Passo 4: Bridge Créditos ───────────────────────────────────────────────
  if (passo === 4) {
    if (!projectId || !jobId) return null;
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={3}
        titulo="Ficha e página de créditos"
        descricao="Vamos preencher a ficha de créditos do seu livro. Ao terminar, você volta para cá."
        rodape={{
          primario: (
            <CtaPrimario onClick={() => router.push(`/dashboard/creditos/${projectId}?avulso=${jobId}`)}>
              Ir para ficha de créditos →
            </CtaPrimario>
          ),
        }}
      >
        <p className="text-sm text-zinc-600">
          Você preenche o essencial (título, autor, editora, ISBN…) numa única tela e a gente
          monta a página. Quando terminar, o wizard retoma exatamente daqui.
        </p>
      </WizardLayout>
    );
  }

  // ── Passo 5: Bridge Miolo ──────────────────────────────────────────────────
  if (passo === 5) {
    if (!projectId || !jobId) return null;
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={4}
        titulo="Diagramação do miolo"
        descricao="Escolha fonte, corpo e sumário. Você pode refazer quantas vezes quiser — refazer é gratuito."
        rodape={{
          primario: (
            <CtaPrimario onClick={() => router.push(`/dashboard/miolo/${projectId}?avulso=${jobId}`)}>
              Ir para diagramação →
            </CtaPrimario>
          ),
        }}
      >
        <p className="text-sm text-zinc-600">
          Ao concluir, você volta para cá para gerar o PDF final.
        </p>
      </WizardLayout>
    );
  }

  // ── Passo 6: Revisar e gerar (também usado quando rodandoTipo="gerar") ────
  if (passo === 6) {
    const rodando = rodandoTipo === "gerar";
    const podeRetry = !!(projectId && jobId && erro);
    if (rodando || erro) {
      return (
        <WizardLayout
          ferramenta={ferramenta}
          passos={PASSOS}
          passoAtual={5}
          titulo={erro ? "Geração interrompida" : "Gerando…"}
          rodape={{
            primario: podeRetry ? (
              <CtaPrimario
                onClick={() => {
                  setErro(null);
                  void gerarPdfsEConcluir();
                }}
              >
                Tentar novamente
              </CtaPrimario>
            ) : undefined,
          }}
        >
          <ConteudoRodando statusTexto={statusTexto} progresso={progresso} erro={erro} />
        </WizardLayout>
      );
    }
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS}
        passoAtual={5}
        titulo="Gerar PDF"
        descricao={
          modo === "completa"
            ? "Vamos gerar o PDF digital e o PDF de impressão."
            : "Vamos gerar o PDF digital do seu livro."
        }
        rodape={{
          primario: (
            <CtaPrimario onClick={gerarPdfsEConcluir}>
              Gerar PDF — {custo} créditos
            </CtaPrimario>
          ),
        }}
      >
        <p className="text-sm text-zinc-700">
          Ao clicar, cobramos <span className="font-semibold text-brand-primary">{custo} créditos</span>.
          Depois o download fica disponível por 90 dias.
        </p>
      </WizardLayout>
    );
  }

  // ── Passo 7: Pronto ────────────────────────────────────────────────────────
  const r = resultado!;
  return (
    <TelaPronto
      ferramenta={ferramenta}
      passos={PASSOS}
      entregaveis={r.entregaveis}
      jobId={r.jobId}
      expiraEm={r.expiraEm}
    />
  );
}

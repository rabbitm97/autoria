"use client";

import { useState } from "react";
import { ACAO_DIAGNOSTICO, FERRAMENTA_ID_DIAGNOSTICO } from "@/lib/diagnostico-avulso";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import type { DiagnosticoResult } from "@/lib/project-data";
import { ResultadoDiagnostico } from "@/components/diagnostico/resultado-diagnostico";
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

const FERRAMENTA_LABEL = "Diagnóstico editorial";
const PASSOS = ["Início", "Manuscrito", "Análise", "Pronto"];

type Passo = 0 | 1 | 2 | 3;

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  entregaveis: EntregavelPronto[];
  resultado: DiagnosticoResult | null;
}

export function WizardDiagnostico() {
  const custo = CUSTOS_CREDITOS[ACAO_DIAGNOSTICO];
  const ferramentaId = FERRAMENTA_ID_DIAGNOSTICO;
  const saldo = useSaldo();

  const [passo, setPasso] = useState<Passo>(0);
  const [dados, setDados] = useState<DadosManuscrito>({
    titulo: "",
    autor: "",
    file: null,
    declaracaoAceita: false,
  });
  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);
  const [projectIdAtivo, setProjectIdAtivo] = useState<string | null>(null);
  const [jobIdAtivo, setJobIdAtivo] = useState<string | null>(null);

  async function pollarEConcluir(projectIdAtual: string, jobIdAtual: string) {
    setStatusTexto("Processando capítulos…");
    let concluido = false;
    let tentativas = 0;
    let errosSeguidos = 0;

    while (!concluido && tentativas < 200) {
      await new Promise((r) => setTimeout(r, 3000));
      tentativas++;

      const pollRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectIdAtual }),
      });

      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json()) as {
        status?: string;
        progresso?: { atual: number; total: number };
        erro?: string;
      };

      if (pollData.progresso) {
        const { atual, total } = pollData.progresso;
        if (total > 0) setProgresso(40 + Math.round((atual / total) * 45));
      }

      if (pollData.status === "concluido") {
        concluido = true;
      } else if (pollData.status === "erro") {
        errosSeguidos++;
        if (errosSeguidos >= 3) throw new Error(pollData.erro ?? "Erro no diagnóstico.");
        setStatusTexto("Retomando análise…");
      } else {
        errosSeguidos = 0;
        setStatusTexto(
          pollData.status === "consolidando" ? "Consolidando análise…" : "Processando capítulos…",
        );
      }
    }

    if (!concluido) {
      throw new Error(
        "A análise está demorando mais que o normal. Clique em Tentar novamente para continuar de onde parou.",
      );
    }

    setStatusTexto("Gerando relatório PDF…");
    setProgresso(90);
    const concluirRes = await fetch("/api/ferramentas/diagnostico-avulso/concluir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobIdAtual }),
    });
    if (!concluirRes.ok) {
      const d = (await concluirRes.json()) as { error?: string };
      throw new Error(d.error ?? "Falha ao gerar o relatório.");
    }
    const concluirData = (await concluirRes.json()) as {
      expira_em?: string | null;
      resultado?: DiagnosticoResult | null;
    };

    const jobRes = await fetch(`/api/ferramentas/jobs/${jobIdAtual}`);
    const jobData = (await jobRes.json()) as {
      job: { entregaveis?: EntregavelPronto[] };
    };

    setProgresso(100);
    setResultado({
      jobId: jobIdAtual,
      expiraEm: concluirData.expira_em ?? null,
      entregaveis: jobData.job.entregaveis ?? [],
      resultado: concluirData.resultado ?? null,
    });
    setPasso(3);
  }

  async function rodar() {
    if (!manuscritoPronto(dados)) return;
    setPasso(2);
    setErro(null);
    setProgresso(0);

    try {
      const sombra = await criarSombraEJob({
        file: dados.file!,
        titulo: dados.titulo,
        autor: dados.autor,
        ferramentaId,
        onStatus: (texto, prog) => {
          setStatusTexto(texto);
          setProgresso(prog);
        },
      });

      setProjectIdAtivo(sombra.projectId);
      setJobIdAtivo(sombra.jobId);

      setStatusTexto("Analisando manuscrito…");
      setProgresso(40);
      const diagRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: sombra.texto, project_id: sombra.projectId, job_id: sombra.jobId }),
      });
      if (diagRes.status === 402) {
        const d = (await diagRes.json()) as { error?: string };
        throw new Error(d.error ?? "Créditos insuficientes.");
      }
      if (!diagRes.ok) throw new Error("Falha ao iniciar diagnóstico.");

      await pollarEConcluir(sombra.projectId, sombra.jobId);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setStatusTexto("");
    }
  }

  if (passo === 0) {
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={0}
        titulo="Como funciona"
        descricao="Analisamos o manuscrito capítulo a capítulo e devolvemos um relatório em PDF."
        rodape={{ primario: <CtaInicio custo={custo} saldo={saldo} onIniciar={() => setPasso(1)} /> }}
      >
        <ConteudoInicio custo={custo} saldo={saldo} />
      </WizardLayout>
    );
  }

  if (passo === 1) {
    const pronto = manuscritoPronto(dados);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={1}
        titulo="Seu manuscrito"
        rodape={{
          primario: (
            <CtaPrimario disabled={!pronto} onClick={rodar}>
              Rodar diagnóstico — {custo} créditos
            </CtaPrimario>
          ),
        }}
      >
        <ConteudoManuscrito dados={dados} onDados={(patch) => setDados((d) => ({ ...d, ...patch }))} />
      </WizardLayout>
    );
  }

  if (passo === 2) {
    const podeRetry = !!(projectIdAtivo && jobIdAtivo && erro);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={2}
        titulo={erro ? "Análise interrompida" : "Analisando…"}
        rodape={{
          primario: podeRetry ? (
            <CtaPrimario
              onClick={() => {
                setErro(null);
                pollarEConcluir(projectIdAtivo!, jobIdAtivo!).catch((e) =>
                  setErro(e instanceof Error ? e.message : "Erro inesperado."),
                );
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

  const r = resultado!;
  return (
    <TelaPronto
      ferramenta={FERRAMENTA_LABEL}
      passos={PASSOS}
      entregaveis={r.entregaveis}
      jobId={r.jobId}
      expiraEm={r.expiraEm}
    >
      {r.resultado && (
        <ResultadoDiagnostico manuscritoNome={dados.titulo || "Manuscrito"} diagnostico={r.resultado} />
      )}
    </TelaPronto>
  );
}

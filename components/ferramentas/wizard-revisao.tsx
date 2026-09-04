"use client";

// components/ferramentas/wizard-revisao.tsx
//
// Wizard da REVISÃO COMPLETA — avulsa (FERR-3.5f). Fluxo enxuto:
// revisar → aceitar sugestões → gerar arquivos. Capítulos ficam
// invisíveis pro autor: o concluir/route.ts auto-aprova sobre o
// texto_revisado antes de chamar gerar-docx.
//
// Passos: 0 Início · 1 Manuscrito · 2 Revisão (débito 150 + push pro fluxo)
// · 3 Sugestões (destino de reidratação quando revisao_estado="concluida")
// · 4 Pronto (card "Gerar arquivos" → concluir → TelaPronto).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
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

const FERRAMENTA_LABEL = "Revisão completa";
const FERRAMENTA_ID = "revisao";
const CUSTO = CUSTOS_CREDITOS.revisao_completa;
const PASSOS = ["Início","Manuscrito","Revisão","Sugestões","Pronto"];

type Passo = 0 | 1 | 2 | 3 | 4;

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  entregaveis: EntregavelPronto[];
}

interface JobEmAndamento {
  id: string;
  titulo: string;
  criadoEm: string;
}

interface Props {
  jobIdInicial: string | null;
}

export function WizardRevisao({ jobIdInicial }: Props) {
  const router = useRouter();
  const saldo = useSaldo();

  const [passo, setPasso] = useState<Passo>(0);
  const [retomando, setRetomando] = useState<boolean>(!!jobIdInicial);
  const [dados, setDados] = useState<DadosManuscrito>({
    titulo: "",
    autor: "",
    file: null,
    declaracaoAceita: false,
  });

  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(jobIdInicial);

  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  const retryRef = useRef<null | (() => Promise<void>)>(null);

  // ── Retomada por ?job= ──────────────────────────────────────────────────
  const retomouRef = useRef(false);
  useEffect(() => {
    if (!jobIdInicial || retomouRef.current) return;
    retomouRef.current = true;
    void reidratar(jobIdInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retomada automática pra jobs abandonados ────────────────────────────
  const [ofertaRetomada, setOfertaRetomada] = useState<JobEmAndamento | null>(null);
  const [ofertaDescartada, setOfertaDescartada] = useState(false);
  useEffect(() => {
    if (jobIdInicial || ofertaDescartada) return;
    let cancelado = false;
    (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao?.session?.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("ferramenta_jobs")
        .select("id, entrada, criado_em, estado")
        .eq("user_id", uid)
        .eq("ferramenta_id", FERRAMENTA_ID)
        .not("estado", "in", '("cancelado","expirado","falhou","concluido")')
        .order("criado_em", { ascending: false })
        .limit(1);
      if (cancelado || !data || data.length === 0) return;
      const row = data[0] as { id: string; entrada: { titulo?: string } | null; criado_em: string };
      setOfertaRetomada({
        id: row.id,
        titulo: row.entrada?.titulo?.trim() || "Sem título",
        criadoEm: row.criado_em,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [jobIdInicial, ofertaDescartada]);

  async function reidratar(id: string) {
    setErro(null);
    try {
      const res = await fetch(`/api/ferramentas/jobs/${id}`);
      if (!res.ok) throw new Error("Não conseguimos retomar este trabalho.");
      const data = (await res.json()) as {
        job: {
          id: string;
          estado: string;
          projeto_sombra_id: string | null;
          entrada: Record<string, unknown>;
          entregaveis: EntregavelPronto[];
          expira_em: string | null;
        };
        sombra:
          | {
              revisao_estado: null | "processing" | "concluida" | "finalizada";
            }
          | null;
      };

      setJobId(data.job.id);
      setProjectId(data.job.projeto_sombra_id);

      const e = data.job.entrada ?? {};
      setDados((d) => ({
        ...d,
        titulo: typeof e.titulo === "string" ? e.titulo : d.titulo,
        autor: typeof e.autor === "string" ? e.autor : d.autor,
      }));

      if (data.job.estado === "concluido") {
        setResultado({
          jobId: data.job.id,
          expiraEm: data.job.expira_em,
          entregaveis: Array.isArray(data.job.entregaveis) ? data.job.entregaveis : [],
        });
        setPasso(4);
        setRetomando(false);
        return;
      }

      const r = data.sombra?.revisao_estado ?? null;

      if (r === "processing") {
        // Batch rodando — a tela do fluxo mostra o progresso ao vivo.
        // Não desliga retomando: a navegação vai unmountar o wizard.
        router.push(`/dashboard/revisao/${data.job.projeto_sombra_id}?avulso=${data.job.id}`);
        return;
      }
      if (r === "finalizada") {
        // Sugestões já aceitas — pronto pra gerar arquivos.
        setPasso(4);
      } else if (r === "concluida") {
        setPasso(3);
      } else {
        setPasso(2);
      }
      setRetomando(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao retomar.");
      setPasso(1);
      setRetomando(false);
    }
  }

  // ── Passo 1 → sombra + parse → 2 ────────────────────────────────────────
  async function iniciarSombra() {
    if (!manuscritoPronto(dados)) return;
    retryRef.current = null;
    setErro(null);
    setProcessando("Preparando…");
    setStatusTexto("Preparando…");
    setProgresso(0);
    try {
      const sombra = await criarSombraEJob({
        file: dados.file,
        titulo: dados.titulo,
        autor: dados.autor,
        ferramentaId: FERRAMENTA_ID,
        entradaExtra: { usar_revisao: true },
        onStatus: (t, p) => {
          setStatusTexto(t);
          setProcessando(t);
          setProgresso(p);
        },
      });
      setProjectId(sombra.projectId);
      setJobId(sombra.jobId);
      window.history.replaceState(null, "", `/dashboard/ferramentas/revisao?job=${sombra.jobId}`);
      setProcessando(null);
      setPasso(2);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao iniciar.");
      setProcessando(null);
      setPasso(1);
    }
  }

  // ── Passo 2 → tela do fluxo: dispara batch (débito no motor) ────────────
  async function dispararRevisao() {
    if (!projectId || !jobId) return;
    retryRef.current = dispararRevisao;
    setErro(null);
    setProcessando("Enviando para análise…");
    setStatusTexto("Enviando para análise…");
    setProgresso(30);
    try {
      const resR = await fetch("/api/agentes/revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, job_id: jobId }),
      });

      if (resR.status === 402) {
        const d = (await resR.json().catch(() => ({}))) as { error?: string };
        setProcessando(null);
        setPasso(2);
        setErro(
          d.error ??
            `Créditos insuficientes${saldo !== null ? ` (você tem ${saldo}, precisa de ${CUSTO})` : ""}.`,
        );
        return;
      }
      if (!resR.ok) {
        const d = (await resR.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Falha ao iniciar revisão.");
      }

      // 2xx do motor: batch aceito. A tela do fluxo cuida do resto.
      router.push(`/dashboard/revisao/${projectId}?avulso=${jobId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  // ── Passo 4 → gerar arquivos ────────────────────────────────────────────
  async function gerarArquivos() {
    if (!jobId) return;
    retryRef.current = gerarArquivos;
    setErro(null);
    setProcessando("Gerando arquivos…");
    setStatusTexto("Gerando arquivos…");
    setProgresso(30);
    try {
      const res = await fetch("/api/ferramentas/revisao-avulsa/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Falha ao gerar arquivos.");
      }
      const data = (await res.json()) as {
        expira_em?: string | null;
        entregaveis?: EntregavelPronto[];
      };
      setProgresso(100);
      setResultado({
        jobId,
        expiraEm: data.expira_em ?? null,
        entregaveis: Array.isArray(data.entregaveis) ? data.entregaveis : [],
      });
      setProcessando(null);
      setPasso(4);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar arquivos.");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (processando !== null) {
    const podeRetry = !!(erro && retryRef.current);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={passo}
        titulo={erro ? "Não conseguimos concluir" : processando}
        rodape={{
          primario: podeRetry ? (
            <CtaPrimario
              onClick={() => {
                setErro(null);
                void retryRef.current!();
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

  if (retomando) {
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={-1}
        titulo="Retomando seu trabalho…"
        descricao="Estamos abrindo o job onde você parou."
      >
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span
            aria-hidden
            className="h-4 w-4 rounded-full border-2 border-zinc-200 border-t-brand-gold animate-spin"
          />
          Carregando…
        </div>
      </WizardLayout>
    );
  }

  if (passo === 0) {
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={0}
        titulo="Como funciona"
        descricao="Envie seu manuscrito, deixe a IA revisar, aceite as sugestões e receba um DOCX revisado + relatório em PDF."
        rodape={{ primario: <CtaInicio custo={CUSTO} saldo={saldo} onIniciar={() => setPasso(1)} /> }}
      >
        {ofertaRetomada && (
          <div className="mb-4 rounded-xl border border-brand-gold/40 bg-brand-gold/5 p-4">
            <p className="text-sm text-brand-primary">
              Você tem uma revisão em andamento:{" "}
              <span className="font-semibold">{ofertaRetomada.titulo}</span>, iniciada em{" "}
              {new Date(ofertaRetomada.criadoEm).toLocaleDateString("pt-BR")}.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const id = ofertaRetomada.id;
                  setOfertaRetomada(null);
                  setRetomando(true);
                  retomouRef.current = true;
                  window.history.replaceState(null, "", `/dashboard/ferramentas/revisao?job=${id}`);
                  void reidratar(id);
                }}
                className="rounded-lg bg-brand-primary px-4 py-2 text-xs font-semibold text-brand-gold hover:bg-brand-primary/90"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={() => {
                  setOfertaDescartada(true);
                  setOfertaRetomada(null);
                }}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-500 hover:border-zinc-300"
              >
                Começar outra
              </button>
            </div>
          </div>
        )}
        <ConteudoInicio custo={CUSTO} saldo={saldo} />
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

  if (passo === 2) {
    const saldoInsuf = saldo !== null && saldo < CUSTO;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={2}
        titulo="Revisar o livro"
        descricao="A IA vai varrer o texto capítulo por capítulo — ortografia, gramática, coesão, consistência e ritmo."
        rodape={{
          primario: (
            <CtaPrimario disabled={saldoInsuf} onClick={dispararRevisao}>
              {saldoInsuf ? "Créditos insuficientes" : "Revisar meu livro — 150 créditos"}
            </CtaPrimario>
          ),
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-700">
            Sua revisão roda em segundo plano e você aprova cada sugestão antes de aplicar.
          </p>
          <ul className="text-sm text-zinc-700 space-y-1">
            <li>
              <span className="text-zinc-400">Livro:</span> {dados.titulo || "—"}
            </li>
            <li>
              <span className="text-zinc-400">Custo:</span> 150 créditos, debitados agora
            </li>
          </ul>
          {saldo !== null && (
            <p className="text-xs text-zinc-400">
              Seu saldo atual: <span className="font-semibold">{saldo} créditos</span>
            </p>
          )}
          {erro && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {erro}
            </div>
          )}
        </div>
      </WizardLayout>
    );
  }

  if (passo === 3) {
    if (!projectId || !jobId) return null;
    const href = `/dashboard/revisao/${projectId}?avulso=${jobId}`;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={3}
        titulo="Revisão pronta"
        descricao="Suas sugestões estão prontas. Aceite ou rejeite cada alteração e depois gere os arquivos."
        rodape={{
          primario: (
            <CtaPrimario onClick={() => router.push(href)}>Ver sugestões →</CtaPrimario>
          ),
        }}
      >
        <div className="space-y-3">
          <ul className="text-sm text-zinc-700 space-y-1">
            <li>
              <span className="text-zinc-400">Livro:</span> {dados.titulo || "—"}
            </li>
            <li>
              <span className="text-zinc-400">Depois disso:</span> gerar DOCX revisado + relatório em PDF
            </li>
          </ul>
        </div>
      </WizardLayout>
    );
  }

  // Passo 4: dois estados — se resultado carregado → TelaPronto; senão,
  // card "Gerar arquivos" com CTA.
  if (resultado) {
    return (
      <TelaPronto
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        entregaveis={resultado.entregaveis}
        jobId={resultado.jobId}
        expiraEm={resultado.expiraEm}
      />
    );
  }
  return (
    <WizardLayout
      ferramenta={FERRAMENTA_LABEL}
      passos={PASSOS}
      passoAtual={4}
      titulo="Gerar arquivos da revisão"
      descricao="Sugestões aplicadas. Gere o DOCX revisado e o relatório de alterações."
      rodape={{
        primario: <CtaPrimario onClick={gerarArquivos}>Gerar arquivos</CtaPrimario>,
      }}
    >
      <div className="space-y-3">
        <ul className="text-sm text-zinc-700 space-y-1">
          <li>
            <span className="text-zinc-400">Livro:</span> {dados.titulo || "—"}
          </li>
          <li>
            <span className="text-zinc-400">Você receberá:</span> DOCX revisado + relatório em PDF
          </li>
        </ul>
      </div>
    </WizardLayout>
  );
}

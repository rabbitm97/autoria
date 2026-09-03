"use client";

// components/ferramentas/wizard-revisao.tsx
//
// Wizard da REVISÃO COMPLETA — avulsa (FERR-3.5b). Fluxo:
//   0 Início → 1 Manuscrito → 2 Capítulos → 3 Revisar (débito 150 + batch)
//   → 4 Sugestões (handoff pra /dashboard/revisao/[sombra]?avulso=[job])
//   → 5 Arquivos (gera DOCX + relatório de alterações) → 6 Pronto.
//
// Retomada por ?job=: consulta GET /api/ferramentas/jobs/[id] e reidrata
// pelo `sombra.revisao_estado` (`null` → tem_capitulos ? 3 : 2 ·
// `processing` → 4 · `concluida` → 5 · `finalizada` → 6 quando ainda não
// concluído, `concluido` job → 6 direto).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import type { CandidatoCapitulo } from "@/lib/chapter-detection";
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
  fieldClass,
  labelClass,
  type DadosManuscrito,
  type EntregavelPronto,
} from "./wizard-shell";

const FERRAMENTA_LABEL = "Revisão completa";
const FERRAMENTA_ID = "revisao";
const CUSTO = CUSTOS_CREDITOS.revisao_completa;
const PASSOS = ["Início", "Manuscrito", "Capítulos", "Revisar", "Sugestões", "Arquivos", "Pronto"];

type Passo = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface CapAprovado {
  titulo: string;
  pos: number;
}

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
  const [capitulos, setCapitulos] = useState<CapAprovado[]>([]);
  const [carregandoCapitulos, setCarregandoCapitulos] = useState(false);

  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);
  const retryRef = useRef<null | (() => Promise<void>)>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
              tem_capitulos: boolean;
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
        setPasso(6);
        return;
      }

      const s = data.sombra;
      const r = s?.revisao_estado ?? null;
      if (r === "finalizada") setPasso(5);
      else if (r === "concluida") setPasso(5);
      else if (r === "processing") {
        setPasso(4);
        // Retoma polling do batch em segundo plano
        void iniciarPolling();
      } else if (s?.tem_capitulos) setPasso(3);
      else setPasso(2);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao retomar.");
      setPasso(1);
    } finally {
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

  // ── Passo 2: propor + aprovar capítulos ─────────────────────────────────
  async function proporCapitulosDoSombra() {
    if (!projectId) return;
    setCarregandoCapitulos(true);
    setErro(null);
    try {
      const res = await fetch("/api/agentes/miolo/propor-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = (await res.json()) as { candidatos?: CandidatoCapitulo[]; error?: string };
      if (!res.ok) {
        setErro(data.error ?? "Erro ao detectar capítulos.");
        return;
      }
      const sugeridos = (data.candidatos ?? []).filter((c) => c.sugerido);
      if (sugeridos.length === 0) {
        // Sem candidatos: aprovar 1 "livro inteiro" para permitir o fluxo
        setCapitulos([{ titulo: dados.titulo || "Livro", pos: 0 }]);
      } else {
        setCapitulos(sugeridos.map((c) => ({ titulo: c.titulo, pos: c.pos })));
      }
    } catch {
      setErro("Erro de rede ao detectar capítulos.");
    } finally {
      setCarregandoCapitulos(false);
    }
  }

  useEffect(() => {
    if (passo === 2 && projectId && capitulos.length === 0 && !carregandoCapitulos && !erro) {
      void proporCapitulosDoSombra();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo, projectId]);

  async function aprovarCapitulos() {
    if (!projectId || capitulos.length === 0) return;
    retryRef.current = aprovarCapitulos;
    setErro(null);
    setProcessando("Salvando capítulos…");
    setStatusTexto("Salvando capítulos…");
    setProgresso(50);
    try {
      const res = await fetch("/api/agentes/miolo/aprovar-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, capitulos_aprovados: capitulos }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao aprovar capítulos.");
      }
      setProcessando(null);
      setPasso(3);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao aprovar.");
    }
  }

  // ── Passo 3 → dispara batch e polling ───────────────────────────────────
  async function iniciarPolling() {
    if (!projectId) return;
    stopPolling();

    async function poll() {
      try {
        const res = await fetch(`/api/agentes/revisao?project_id=${projectId}`);
        if (!res.ok) {
          pollingRef.current = setTimeout(poll, 10_000);
          return;
        }
        const data = (await res.json()) as {
          status: string;
          done?: number;
          total?: number;
          iniciado_em?: string;
        };
        if (data.status === "done") {
          setPasso(4);
          return;
        }
        if (data.status === "processing") {
          const total = Math.max(1, data.total ?? 1);
          const done = data.done ?? 0;
          setProgresso(Math.round((done / total) * 100));
          setStatusTexto(`Analisando… ${done}/${total} trechos`);
          const elapsed = data.iniciado_em
            ? (Date.now() - new Date(data.iniciado_em).getTime()) / 1000
            : 0;
          const interval = elapsed < 30 ? 3_000 : elapsed < 120 ? 6_000 : 10_000;
          pollingRef.current = setTimeout(poll, interval);
        } else {
          setErro("Estado inesperado da revisão. Tente novamente.");
        }
      } catch {
        pollingRef.current = setTimeout(poll, 10_000);
      }
    }
    void poll();
  }

  function stopPolling() {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }

  useEffect(() => () => stopPolling(), []);

  async function dispararRevisao() {
    if (!projectId || !jobId) return;
    retryRef.current = dispararRevisao;
    setErro(null);
    setProcessando("Enviando para análise…");
    setStatusTexto("Enviando para análise…");
    setProgresso(5);
    try {
      const res = await fetch("/api/agentes/revisao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, job_id: jobId }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao iniciar revisão.");
      }
      const data = (await res.json()) as { status: string; total_chunks?: number };
      setProcessando(null);
      if (data.status === "done" || data.status === "skipped") {
        setPasso(4);
      } else {
        setPasso(4);
        void iniciarPolling();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao iniciar.");
    }
  }

  // ── Passo 5 → gerar arquivos ────────────────────────────────────────────
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
        const d = (await res.json()) as { error?: string };
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
      setPasso(6);
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
        descricao="Envie seu manuscrito, aprove os capítulos, deixe a IA revisar e receba um DOCX com as alterações aceitas e um relatório de tudo o que foi sugerido."
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
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={2}
        titulo="Capítulos do livro"
        descricao="Detectamos os capítulos automaticamente. Ajuste os títulos se quiser antes de continuar."
        rodape={{
          primario: (
            <CtaPrimario disabled={capitulos.length === 0} onClick={aprovarCapitulos}>
              Aprovar capítulos →
            </CtaPrimario>
          ),
        }}
      >
        {carregandoCapitulos ? (
          <div className="flex items-center gap-3 text-sm text-zinc-500">
            <span
              aria-hidden
              className="h-4 w-4 rounded-full border-2 border-zinc-200 border-t-brand-gold animate-spin"
            />
            Detectando capítulos…
          </div>
        ) : erro ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {erro}
            <button
              type="button"
              onClick={() => {
                setErro(null);
                void proporCapitulosDoSombra();
              }}
              className="mt-2 block text-xs underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              {capitulos.length} capítulo{capitulos.length === 1 ? "" : "s"} detectado
              {capitulos.length === 1 ? "" : "s"}.
            </p>
            <ol className="space-y-2">
              {capitulos.map((c, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-6 text-right">{i + 1}.</span>
                  <input
                    className={fieldClass}
                    value={c.titulo}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCapitulos((cs) => cs.map((x, j) => (j === i ? { ...x, titulo: v } : x)));
                    }}
                  />
                </li>
              ))}
            </ol>
          </div>
        )}
      </WizardLayout>
    );
  }

  if (passo === 3) {
    const saldoInsuf = saldo !== null && saldo < CUSTO;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={3}
        titulo="Revisar o livro"
        descricao="A IA vai analisar capítulo por capítulo: ortografia, gramática, coesão, consistência e ritmo. Você decide o que aceitar."
        rodape={{
          primario: (
            <CtaPrimario disabled={saldoInsuf} onClick={dispararRevisao}>
              {saldoInsuf ? "Créditos insuficientes" : `Revisar por ${CUSTO} créditos`}
            </CtaPrimario>
          ),
        }}
      >
        <div className="space-y-3">
          <ul className="text-sm text-zinc-700 space-y-1">
            <li>
              <span className="text-zinc-400">Título:</span> {dados.titulo || "—"}
            </li>
            <li>
              <span className="text-zinc-400">Capítulos:</span> {capitulos.length || "—"}
            </li>
            <li>
              <span className="text-zinc-400">Custo:</span> {CUSTO} créditos, debitados agora
            </li>
          </ul>
          {saldo !== null && (
            <p className="text-xs text-zinc-400">
              Seu saldo atual: <span className="font-semibold">{saldo} créditos</span>
            </p>
          )}
        </div>
      </WizardLayout>
    );
  }

  if (passo === 4) {
    if (!projectId || !jobId) return null;
    const href = `/dashboard/revisao/${projectId}?avulso=${jobId}`;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={4}
        titulo={statusTexto || "Revisão em andamento"}
        descricao="Você pode acompanhar o progresso na tela de sugestões. Assim que estiver pronta, revise as alterações e volte aqui para gerar os arquivos."
        rodape={{
          primario: (
            <CtaPrimario onClick={() => router.push(href)}>
              Abrir tela de sugestões →
            </CtaPrimario>
          ),
        }}
      >
        <div className="space-y-4">
          {progresso > 0 && (
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-zinc-600">{statusTexto || "Analisando…"}</span>
                <span className="text-sm text-zinc-400">{progresso}%</span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-gold transition-all duration-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Você pode fechar esta aba: o trabalho continua no servidor. Volte pelo painel
            de ferramentas em <Link href="/dashboard/ferramentas" className="underline">Continuar</Link>.
          </p>
        </div>
      </WizardLayout>
    );
  }

  if (passo === 5) {
    if (!projectId || !jobId) return null;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={5}
        titulo="Gerar arquivos da revisão"
        descricao="Vamos montar o DOCX revisado (com suas alterações aceitas) e o relatório em PDF de todas as sugestões."
        rodape={{
          primario: (
            <CtaPrimario onClick={gerarArquivos}>Gerar arquivos</CtaPrimario>
          ),
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
          <Link
            href={`/dashboard/revisao/${projectId}?avulso=${jobId}`}
            className="text-xs text-zinc-500 underline underline-offset-4 hover:text-brand-primary"
          >
            Voltar para revisar sugestões
          </Link>
        </div>
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
    />
  );
}

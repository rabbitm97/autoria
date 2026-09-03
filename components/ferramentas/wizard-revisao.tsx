"use client";

// components/ferramentas/wizard-revisao.tsx
//
// Wizard da REVISÃO COMPLETA — avulsa (FERR-3.5d). Sem tela própria de
// carregamento: assim que o motor aceita o batch (POST 2xx), o wizard
// empurra o autor pra /dashboard/revisao/[sombra]?avulso=[job], que é
// quem renderiza o progresso e depois a lista de sugestões.
//
// Fluxo: 0 Início → 1 Manuscrito → 2 Capítulos (débito 150 + POST motor)
// → router.push pra tela do fluxo. Reidratação com revisao_estado
// "processing" cai lá também. Passo 4 (Sugestões) e 5 (Pronto) só como
// destino de reidratação por ?job=/painel quando o batch já encerrou.
//
// O rótulo "Revisão" segue no stepper (posição 3), mas sem tela dedicada
// aqui — a tela do fluxo faz o passo inteiro.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import type { CandidatoCapitulo } from "@/lib/chapter-detection";
import { AprovacaoCapitulos } from "@/components/aprovacao-capitulos";
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
const PASSOS = ["Início", "Manuscrito", "Capítulos", "Revisão", "Sugestões", "Pronto"];

type Passo = 0 | 1 | 2 | 3 | 4 | 5;
type RevisaoEstado = null | "processing" | "concluida" | "finalizada";

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
  const [candidatos, setCandidatos] = useState<CandidatoCapitulo[]>([]);
  const [carregandoCapitulos, setCarregandoCapitulos] = useState(false);
  const [revisaoEstado, setRevisaoEstado] = useState<RevisaoEstado>(null);

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
              tem_capitulos: boolean;
              revisao_estado: RevisaoEstado;
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
        setPasso(5);
        return;
      }

      const r = data.sombra?.revisao_estado ?? null;
      setRevisaoEstado(r);
      if (r === "processing") {
        // Batch rodando — a tela do fluxo é quem mostra o progresso ao
        // vivo. Não desliga retomando: a navegação vai unmountar o wizard.
        router.push(`/dashboard/revisao/${data.job.projeto_sombra_id}?avulso=${data.job.id}`);
        return;
      }
      if (r === "finalizada" || r === "concluida") {
        // Card de "voltar depois" — sem auto-push. O autor entrou pelo
        // painel/URL e espera um destino estável, não outra navegação.
        setPasso(4);
      } else {
        // Sem revisão ainda — volta para o passo de capítulos. Se já havia
        // capítulos aprovados, o autor só reconfirma (o aprovar-capitulos
        // aceita reaprovação idempotente).
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

  // ── Passo 2: propor capítulos (auto-load) ───────────────────────────────
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
      setCandidatos(data.candidatos ?? []);
    } catch {
      setErro("Erro de rede ao detectar capítulos.");
    } finally {
      setCarregandoCapitulos(false);
    }
  }

  useEffect(() => {
    if (passo === 2 && projectId && candidatos.length === 0 && !carregandoCapitulos && !erro) {
      void proporCapitulosDoSombra();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo, projectId]);

  // ── Passo 2 → tela do fluxo: aprovar + disparar batch (débito no motor) ─
  // A partir do 2xx do motor, o batch está em curso; navegamos pra tela
  // do fluxo, que renderiza o progresso e depois a lista de sugestões.
  async function aprovarCapitulosEIr(capitulosAprovados: { titulo: string; pos: number }[]) {
    if (!projectId || !jobId) return;
    retryRef.current = () => aprovarCapitulosEIr(capitulosAprovados);
    setErro(null);
    setProcessando("Salvando capítulos…");
    setStatusTexto("Salvando capítulos…");
    setProgresso(15);
    try {
      const resA = await fetch("/api/agentes/miolo/aprovar-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, capitulos_aprovados: capitulosAprovados }),
      });
      if (!resA.ok) {
        const d = (await resA.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Falha ao aprovar capítulos.");
      }

      setProcessando("Enviando para análise…");
      setStatusTexto("Enviando para análise…");
      setProgresso(30);
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

  // ── Passo 4 (reidratação) → gerar arquivos ──────────────────────────────
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
      setPasso(5);
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
    // AprovacaoCapitulos traz seus próprios botões (Voltar / Confirmar);
    // por isso o rodapé do layout fica sem CTA primário — o CTA vive dentro
    // do próprio componente. Padrão herdado do wizard-epub.
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={2}
        titulo="Capítulos detectados"
        descricao="Marque quais viram capítulos na revisão. Ajuste os títulos se quiser."
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
                if (candidatos.length === 0) void proporCapitulosDoSombra();
              }}
              className="mt-2 block text-xs underline"
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 rounded-xl border border-brand-gold/30 bg-brand-gold/5 p-3">
              <p className="text-sm text-brand-primary">
                Ao confirmar, a revisão começa — 150 créditos.
                {saldo !== null && (
                  <span className="text-brand-primary/70"> Seu saldo: {saldo}.</span>
                )}
              </p>
            </div>
            <AprovacaoCapitulos
              candidatos={candidatos}
              onConfirmar={aprovarCapitulosEIr}
              onVoltar={() => setPasso(1)}
              loading={false}
              acaoLabel="continuar"
            />
          </>
        )}
      </WizardLayout>
    );
  }

  // passo === 3 (rótulo "Revisão") não tem tela própria — o carregamento
  // mora em /dashboard/revisao. Fluxo normal navega pra lá antes de cair
  // aqui; caso caia, o passo 4 assume via fallback abaixo.

  if (passo === 4) {
    if (!projectId || !jobId) return null;
    const finalizada = revisaoEstado === "finalizada";
    const href = `/dashboard/revisao/${projectId}?avulso=${jobId}`;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={4}
        titulo={finalizada ? "Sugestões revisadas" : "Revisão pronta"}
        descricao={
          finalizada
            ? "Você já revisou as sugestões. Gere agora o DOCX revisado e o relatório em PDF."
            : "Suas sugestões estão prontas. Aceite ou rejeite cada alteração e volte aqui para gerar os arquivos."
        }
        rodape={{
          primario: finalizada ? (
            <CtaPrimario onClick={gerarArquivos}>Gerar arquivos</CtaPrimario>
          ) : (
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
              <span className="text-zinc-400">Você receberá:</span> DOCX revisado + relatório em PDF
            </li>
          </ul>
          {finalizada && (
            <Link
              href={href}
              className="text-xs text-zinc-500 underline underline-offset-4 hover:text-brand-primary"
            >
              Voltar para revisar sugestões
            </Link>
          )}
        </div>
      </WizardLayout>
    );
  }

  if (!resultado) return null;
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

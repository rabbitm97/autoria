"use client";

// components/ferramentas/wizard-capa.tsx
//
// Wizard da CAPA COM IA — avulsa (FERR-3.4b). Fluxo:
//   0 Início → 1 Dados do livro → 2 Formato → 3 Capa (handoff) → 4 Gerar
//   → 5 Pronto
//
// A capa em si é gerada dentro de /dashboard/capa/{sombra}?avulso={job}
// (herdada da esteira; ver FERR-3.4a). Aqui só recolhemos os dados,
// escolhemos o formato, mandamos o autor para o editor e, na volta,
// disparamos preparar-capa-grafica + capa-avulsa/concluir.
//
// Retomada por ?job=: consulta GET /api/ferramentas/jobs/[id] e reidrata
// pelo estado do sombra (formato, tem_capa_confirmada). Se estado já for
// "concluido" com sombra ainda vivo, cai no passo 3 (autor pode reeditar
// e re-concluir sem custo). Sem sombra, mostra a tela pronta.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import { estimarLombadaCapaMm, type FormatoLivro } from "@/lib/formatos";
import { GENRES } from "@/lib/generos";
import { EscolhaFormato } from "@/components/escolha-formato";
import {
  ConteudoInicio,
  ConteudoRodando,
  CtaInicio,
  CtaPrimario,
  TelaPronto,
  WizardLayout,
  fieldClass,
  labelClass,
  useSaldo,
  type EntregavelPronto,
} from "./wizard-shell";

const FERRAMENTA_LABEL = "Capa com IA";
const FERRAMENTA_ID = "capa-ia";
// Stepper: 6 etapas visíveis (0..5). A geração/preparação intermediária
// vira um overlay sobre o passo atual (state `processando`), sem mudar
// o stepper — evita o flicker antigo em que o stepper acendia o passo
// 5 e voltava.
const PASSOS = ["Início", "Dados do livro", "Formato", "Capa", "Gerar", "Pronto"];

const PRECO_COPY =
  `${CUSTOS_CREDITOS.capa_avulsa} créditos, debitados na primeira geração. Inclui 4 gerações da arte da frente; extras: ${CUSTOS_CREDITOS.capa_avulsa_imagem} créditos cada · 4 por ${CUSTOS_CREDITOS.capa_avulsa_pacote}.`;

const GENEROS_TOPO = Object.keys(GENRES);

// 0..5 correspondem aos passos do stepper. Geração intermediária vive
// no state `processando` (overlay), sem alterar o `passo`.
type Passo = 0 | 1 | 2 | 3 | 4 | 5;

interface DadosLivro {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  sinopse: string;
  paginas: number;
  file: File | null;
}

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  entregaveis: EntregavelPronto[];
}

interface Props {
  jobIdInicial: string | null;
}

export function WizardCapa({ jobIdInicial }: Props) {
  const router = useRouter();
  const saldo = useSaldo();

  // Passo inicial sempre 0. A tela de retomada é um overlay separado — evita
  // o flicker antigo (montar passo 6 → router.replace → remontar).
  const [passo, setPasso] = useState<Passo>(0);
  const [retomando, setRetomando] = useState<boolean>(!!jobIdInicial);
  const [dados, setDados] = useState<DadosLivro>({
    titulo: "",
    subtitulo: "",
    autor: "",
    genero: "",
    sinopse: "",
    paginas: 200,
    file: null,
  });

  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(jobIdInicial);
  const [formatoSalvo, setFormatoSalvo] = useState<FormatoLivro | null>(null);
  const [temCapaConfirmada, setTemCapaConfirmada] = useState(false);

  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);
  // FERR-3.4d: overlay de "processando" que sobrepõe o passo atual sem
  // avançar o stepper. `null` = não processando. `string` = texto exibido.
  const [processando, setProcessando] = useState<string | null>(null);
  // Retry do overlay reexecuta a operação que falhou (não hardcodar
  // gerarArquivos). `null` = sem retry seguro (ex.: falha antes de existir
  // job no `iniciarSombraEPreparar` cai no formulário do passo 1).
  const retryRef = useRef<null | (() => Promise<void>)>(null);

  const retomouRef = useRef(false);
  useEffect(() => {
    if (!jobIdInicial || retomouRef.current) return;
    retomouRef.current = true;
    void reidratar(jobIdInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          | { formato: string | null; tem_capa_confirmada: boolean }
          | null;
      };

      setJobId(data.job.id);
      setProjectId(data.job.projeto_sombra_id);

      // Pré-preenche o form pela `entrada` do job — usado quando o autor
      // volta ao passo 1 pelo link "Alterar dados".
      const e = data.job.entrada ?? {};
      setDados((d) => ({
        ...d,
        titulo: typeof e.titulo === "string" ? e.titulo : d.titulo,
        subtitulo: typeof e.subtitulo === "string" ? e.subtitulo : d.subtitulo,
        autor: typeof e.autor === "string" ? e.autor : d.autor,
        genero: typeof e.genero === "string" ? e.genero : d.genero,
        sinopse: typeof e.sinopse === "string" ? e.sinopse : d.sinopse,
        paginas: typeof e.paginas === "number" ? e.paginas : d.paginas,
      }));

      const s = data.sombra;
      if (s?.formato) setFormatoSalvo(s.formato as FormatoLivro);
      setTemCapaConfirmada(!!s?.tem_capa_confirmada);

      if (data.job.estado === "concluido") {
        if (data.job.projeto_sombra_id) {
          // Reconclusão: sombra vive, autor pode reeditar a capa.
          setPasso(3);
        } else {
          setResultado({
            jobId: data.job.id,
            expiraEm: data.job.expira_em,
            entregaveis: Array.isArray(data.job.entregaveis) ? data.job.entregaveis : [],
          });
          setPasso(5);
        }
        return;
      }

      // Job ativo: reidrata pelo estado do sombra.
      if (s?.tem_capa_confirmada) setPasso(3);
      else if (s?.formato) setPasso(3);
      else setPasso(2);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao retomar.");
      setPasso(1);
    } finally {
      setRetomando(false);
    }
  }

  // ── passo 1 → sombra + preparar → 2 ──────────────────────────────────────
  async function iniciarSombraEPreparar() {
    if (!dadosProntos(dados)) return;
    // Sem job ainda: retry não é seguro (criaria um segundo sombra) — no
    // erro, caímos de volta ao formulário do passo 1 com o erro inline.
    retryRef.current = null;
    setErro(null);
    setProcessando("Preparando…");
    setStatusTexto("Preparando…");
    setProgresso(10);
    try {
      const sombra = await criarSombraEJob({
        file: dados.file,
        titulo: dados.titulo,
        autor: dados.autor,
        ferramentaId: FERRAMENTA_ID,
        entradaExtra: {
          subtitulo: dados.subtitulo,
          genero: dados.genero,
          sinopse: dados.sinopse,
          paginas: dados.paginas,
        },
        onStatus: (t, p) => {
          setStatusTexto(t);
          setProcessando(t);
          setProgresso(p);
        },
      });
      setProjectId(sombra.projectId);
      setJobId(sombra.jobId);

      setStatusTexto("Salvando dados do livro…");
      setProcessando("Salvando dados do livro…");
      setProgresso(60);
      const prepRes = await fetch("/api/ferramentas/capa-avulsa/preparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: sombra.jobId,
          titulo: dados.titulo,
          subtitulo: dados.subtitulo || undefined,
          autor: dados.autor || undefined,
          genero: dados.genero,
          sinopse: dados.sinopse,
          paginas: dados.paginas,
        }),
      });
      if (!prepRes.ok) {
        const d = (await prepRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao salvar os dados do livro.");
      }

      // history.replaceState em vez de router.replace: atualiza a URL sem
      // remontar o wizard (evita flicker).
      window.history.replaceState(null, "", `/dashboard/ferramentas/capa?job=${sombra.jobId}`);
      setProcessando(null);
      setPasso(2);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao iniciar.");
      // Sem retry seguro: volta ao formulário do passo 1 — o erro fica
      // no state e o autor edita/reenvia via botão Continuar.
      setProcessando(null);
      setPasso(1);
    }
  }

  // "Alterar dados" — re-submit chama preparar para reescrever a entrada
  // e o manuscript/sinopse do sombra sem criar um novo job.
  async function reenviarDadosPreparar() {
    if (!jobId || !dadosProntos(dados)) return;
    retryRef.current = reenviarDadosPreparar;
    setErro(null);
    setProcessando("Atualizando dados do livro…");
    setStatusTexto("Atualizando dados do livro…");
    setProgresso(50);
    try {
      const prepRes = await fetch("/api/ferramentas/capa-avulsa/preparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          titulo: dados.titulo,
          subtitulo: dados.subtitulo || undefined,
          autor: dados.autor || undefined,
          genero: dados.genero,
          sinopse: dados.sinopse,
          paginas: dados.paginas,
        }),
      });
      if (!prepRes.ok) {
        const d = (await prepRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao atualizar dados.");
      }
      setProcessando(null);
      setPasso(4);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao atualizar.");
    }
  }

  // ── passo 4 → gerar arquivos ────────────────────────────────────────────
  async function gerarArquivos() {
    if (!projectId || !jobId) return;
    retryRef.current = gerarArquivos;
    setErro(null);
    setProcessando("Preparando PDF gráfico…");
    setStatusTexto("Preparando PDF gráfico…");
    setProgresso(20);
    try {
      const prepRes = await fetch("/api/agentes/prova/preparar-capa-grafica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!prepRes.ok) {
        const d = (await prepRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao preparar o PDF gráfico.");
      }

      setStatusTexto("Salvando e liberando downloads…");
      setProcessando("Salvando e liberando downloads…");
      setProgresso(70);
      const conclRes = await fetch("/api/ferramentas/capa-avulsa/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!conclRes.ok) {
        const d = (await conclRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao concluir.");
      }
      const conclData = (await conclRes.json()) as {
        expira_em?: string | null;
        entregaveis?: EntregavelPronto[];
      };

      setProgresso(100);
      setResultado({
        jobId,
        expiraEm: conclData.expira_em ?? null,
        entregaveis: Array.isArray(conclData.entregaveis) ? conclData.entregaveis : [],
      });
      setProcessando(null);
      setPasso(5);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // FERR-3.4d: overlay unificado de processamento. Renderiza no MESMO
  // passo atual (não avança nem retrocede o stepper) — evita flicker
  // do antigo estado transitório `passo=6` que remontava a árvore.
  // `processando` só é limpo no sucesso; no erro o overlay permanece
  // com o botão "Tentar novamente" (mesmo padrão do antigo passo=6).
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
    // Overlay de retomada — stepper visível mas sem nenhum passo destacado
    // (passoAtual=-1 zera done/active). Substitui o antigo passo=6 inicial
    // que remontava o wizard após a reidratação.
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
        descricao="Informe os dados do livro, gere a capa com a nossa IA, ajuste no editor e receba a frente em alta resolução e o PDF de capa para a gráfica."
        rodape={{
          primario: <CtaInicio custo={0} saldo={saldo} onIniciar={() => setPasso(1)} />,
        }}
      >
        <ConteudoInicio custo={0} saldo={saldo} precoCopy={PRECO_COPY} />
      </WizardLayout>
    );
  }

  if (passo === 1) {
    const pronto = dadosProntos(dados);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={1}
        titulo="Dados do livro"
        descricao="O essencial que aparece na capa e a sinopse que orienta a IA."
        rodape={{
          primario: (
            <CtaPrimario
              disabled={!pronto}
              onClick={jobId ? reenviarDadosPreparar : iniciarSombraEPreparar}
            >
              Continuar
            </CtaPrimario>
          ),
        }}
      >
        <FormDadosLivro
          dados={dados}
          onDados={(patch) => setDados((d) => ({ ...d, ...patch }))}
        />
      </WizardLayout>
    );
  }

  if (passo === 2) {
    if (!projectId) return null;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={2}
        titulo="Formato do livro"
        descricao="Ele define o tamanho da capa e a proporção da arte gerada."
        rodape={{
          primario: (
            <CtaPrimario disabled={!formatoSalvo} onClick={() => setPasso(3)}>
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

  if (passo === 3) {
    if (!projectId || !jobId) return null;
    const href = `/dashboard/capa/${projectId}?avulso=${jobId}`;
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={3}
        titulo={temCapaConfirmada ? "Capa confirmada" : "Criar a capa"}
        descricao={
          temCapaConfirmada
            ? "Você pode reeditar a capa até 90 dias após a geração — sem novo custo."
            : "Escreva um briefing ou peça um automático, escolha entre as opções e ajuste no editor."
        }
        rodape={{
          primario: temCapaConfirmada ? (
            <CtaPrimario onClick={() => setPasso(4)}>Continuar →</CtaPrimario>
          ) : (
            <CtaPrimario onClick={() => router.push(href)}>Criar a capa →</CtaPrimario>
          ),
        }}
      >
        {temCapaConfirmada ? (
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              ✓ Capa confirmada
            </span>
            <p className="text-sm text-zinc-700">
              Sua capa está pronta. Se quiser trocar de arte ou ajustar
              textos, volte ao editor.
            </p>
            <button
              type="button"
              onClick={() => router.push(href)}
              className="text-sm text-brand-primary underline underline-offset-4"
            >
              Editar capa
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-600">
            Vamos abrir o editor de capa. Ao confirmar a arte, você volta
            aqui para gerar os arquivos finais.
          </p>
        )}
      </WizardLayout>
    );
  }

  if (passo === 4) {
    if (!projectId || !jobId) return null;
    const lombadaEstMm = estimarLombadaCapaMm(dados.paginas);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={4}
        titulo="Gerar arquivos da capa"
        descricao="Vamos montar a frente em alta resolução e o PDF de capa para a gráfica."
        rodape={{
          primario: (
            <CtaPrimario onClick={gerarArquivos}>Gerar arquivos da capa</CtaPrimario>
          ),
        }}
      >
        <div className="space-y-4">
          <ul className="text-sm text-zinc-700 space-y-1">
            <li>
              <span className="text-zinc-400">Título:</span> {dados.titulo || "—"}
            </li>
            <li>
              <span className="text-zinc-400">Formato:</span> {formatoSalvo ?? "—"}
            </li>
            <li>
              <span className="text-zinc-400">Páginas:</span> {dados.paginas}
              {" · lombada estimada "}
              {lombadaEstMm.toFixed(1)} mm
            </li>
          </ul>
          <button
            type="button"
            onClick={() => setPasso(1)}
            className="text-xs text-zinc-500 underline underline-offset-4 hover:text-brand-primary"
          >
            Alterar dados
          </button>
        </div>
      </WizardLayout>
    );
  }

  const r = resultado!;
  const expiraFmt = r.expiraEm
    ? new Date(r.expiraEm).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;
  return (
    <TelaPronto
      ferramenta={FERRAMENTA_LABEL}
      passos={PASSOS}
      entregaveis={r.entregaveis}
      jobId={r.jobId}
      expiraEm={r.expiraEm}
    >
      <p className="text-xs text-zinc-500">
        Sua capa continua editável até{" "}
        {expiraFmt ?? "a expiração do job"} — abra pelo painel em Editar capa.
        Reconfirmar substitui os arquivos, sem novo custo.
      </p>
    </TelaPronto>
  );
}

// ─── Form ───────────────────────────────────────────────────────────────────

function dadosProntos(d: DadosLivro): boolean {
  return !!(
    d.titulo.trim() &&
    d.genero.trim() &&
    d.sinopse.trim().length >= 20 &&
    d.paginas >= 24 &&
    d.paginas <= 1200
  );
}

function FormDadosLivro({
  dados,
  onDados,
}: {
  dados: DadosLivro;
  onDados: (patch: Partial<DadosLivro>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sinopseCount = dados.sinopse.length;
  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Título *</label>
        <input
          className={fieldClass}
          placeholder="O título do seu livro"
          value={dados.titulo}
          onChange={(e) => onDados({ titulo: e.target.value })}
          maxLength={200}
        />
      </div>

      <div>
        <label className={labelClass}>Subtítulo</label>
        <input
          className={fieldClass}
          placeholder="Opcional"
          value={dados.subtitulo}
          onChange={(e) => onDados({ subtitulo: e.target.value })}
          maxLength={200}
        />
      </div>

      <div>
        <label className={labelClass}>Autor</label>
        <input
          className={fieldClass}
          placeholder="Nome do autor"
          value={dados.autor}
          onChange={(e) => onDados({ autor: e.target.value })}
          maxLength={200}
        />
      </div>

      <div>
        <label className={labelClass}>Gênero *</label>
        <select
          className={fieldClass}
          value={dados.genero}
          onChange={(e) => onDados({ genero: e.target.value })}
        >
          <option value="">Selecione o gênero</option>
          {GENEROS_TOPO.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Sinopse *</label>
        <textarea
          className={fieldClass}
          placeholder="Do que trata seu livro? Mínimo de 20 caracteres, máximo 1200."
          value={dados.sinopse}
          onChange={(e) => onDados({ sinopse: e.target.value })}
          rows={5}
          maxLength={1200}
        />
        <p className="mt-1 text-[11px] text-zinc-400 text-right">
          {sinopseCount}/1200
        </p>
      </div>

      <div>
        <label className={labelClass}>Páginas *</label>
        <input
          type="number"
          className={fieldClass}
          min={24}
          max={1200}
          value={dados.paginas}
          onChange={(e) => {
            const n = Number(e.target.value);
            onDados({ paginas: Number.isFinite(n) ? Math.round(n) : 0 });
          }}
        />
        <p className="mt-1 text-[11px] text-zinc-500">
          Define a largura da lombada — confirme com sua gráfica se já tiver
          o miolo fechado.
        </p>
      </div>

      <div>
        <label className={labelClass}>Manuscrito</label>
        <div
          onClick={() => inputRef.current?.click()}
          className="relative border-2 border-dashed border-zinc-200 rounded-xl p-4 text-center cursor-pointer hover:border-brand-gold/50 transition-colors"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".docx,.pdf,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onDados({ file: f });
            }}
          />
          {dados.file ? (
            <div className="space-y-1">
              <p className="text-sm text-brand-primary font-medium">
                {dados.file.name}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDados({ file: null });
                }}
                className="text-xs text-zinc-400 underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Opcional: envie o manuscrito para a IA sugerir o briefing da
              capa.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

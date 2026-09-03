// lib/ferramenta-jobs.ts
//
// Ciclo de vida do job de ferramenta avulsa (ESTRUTURA-v2 §2.2-2.3).
// ESCRITA EXCLUSIVA em ferramenta_jobs passa por aqui (service_role) —
// nunca UPDATE cego em rota (verdade #20). Relógio único: expira_em =
// debitado_em + RETENCAO_DIAS (martelada 31/ago — tudo que foi pago fica
// disponível 90 dias; job sem débito é rascunho e não expira por aqui).

import type { SupabaseClient } from "@supabase/supabase-js";
import { apagarProjetoComoAdmin } from "./apagar-projeto";
import { estornarCreditos, type AcaoCredito } from "./creditos";

export const RETENCAO_DIAS = 90;
export const RASCUNHO_DIAS = 14; // job sem débito: limpo em silêncio (martelada 6.4)
export const AVISO_DIAS = 7;     // e-mail antes de expirar (decisão 6.5)
export const BUCKET_FERRAMENTAS = "ferramentas";
export const PREVIA_PAGINAS = 20; // prévia gratuita da diagramação avulsa (decisão 01/set)

/** Ferramentas que têm wizard e podem criar jobs por POST /ferramentas/jobs.
 *  Barra ids fantasmas/legados (residual de auditoria FERR-3.1). */
export const FERRAMENTAS_COM_WIZARD = ["diagnostico", "epub", "diagramacao-digital", "diagramacao-completa", "capa-ia", "revisao"] as const;

/** Retomada da experiência quando o autor volta ao painel enquanto o job
 *  ainda não concluiu (aguardando_autor / processando). Cada ferramenta
 *  aponta pro seu ponto de reidratação — genérico o suficiente pra tolerar
 *  wizard próprio (capa-ia → /dashboard/ferramentas/capa?job=) ou tela do
 *  fluxo real reaproveitada em modo avulso (revisao → /dashboard/revisao/
 *  <sombra>?avulso=). Retorna null se faltar peça obrigatória (ex.:
 *  ferramenta que só reidrata com sombra e o job não tem). */
export const FERRAMENTAS_RETOMAVEIS: Record<
  string,
  {
    buildUrl: (job: { id: string; projeto_sombra_id: string | null }) => string | null;
    /** Label do badge quando a ferramenta está em `processando`. Default
     *  (vindo do painel) é "Em processamento" — override quando cabe uma
     *  palavra mais fiel ao trabalho ("Em revisão" p/ revisao). */
    badgeProcessando?: string;
  }
> = {
  "capa-ia": {
    buildUrl: (job) => `/dashboard/ferramentas/capa?job=${job.id}`,
  },
  "revisao": {
    buildUrl: (job) =>
      job.projeto_sombra_id
        ? `/dashboard/revisao/${job.projeto_sombra_id}?avulso=${job.id}`
        : null,
    badgeProcessando: "Em revisão",
  },
};

export type EstadoJob =
  | "iniciado" | "aguardando_autor" | "processando"
  | "concluido" | "falhou" | "expirado" | "cancelado";

export interface EntregavelJob {
  tipo: "pdf_digital" | "pdf_grafico" | "epub" | "docx" | "jpg_ebook" | "pdf_capa" | "relatorio_pdf";
  storage_path: string;
  bytes: number;
  nome_exibicao: string;
}

export interface FerramentaJob {
  id: string;
  user_id: string;
  ferramenta_id: string;
  estado: EstadoJob;
  projeto_sombra_id: string | null;
  entrada: Record<string, unknown>;
  custo_creditos: number;
  debitado_em: string | null;
  estornado_em: string | null;
  entregaveis: EntregavelJob[];
  criado_em: string;
  atualizado_em: string;
  concluido_em: string | null;
  expira_em: string | null;
  aviso_expiracao_em: string | null;
}

function agora(): string {
  return new Date().toISOString();
}

export async function criarJob(
  admin: SupabaseClient,
  userId: string,
  ferramentaId: string,
  entrada: Record<string, unknown>,
): Promise<FerramentaJob | null> {
  const { data, error } = await admin
    .from("ferramenta_jobs")
    .insert({ user_id: userId, ferramenta_id: ferramentaId, entrada })
    .select("*")
    .single();
  if (error) {
    console.error("[ferramenta-jobs] criarJob falhou:", error.message);
    return null;
  }
  return data as FerramentaJob;
}

/** Transição de estado + campos. Sempre carimba atualizado_em. */
export async function atualizarJob(
  admin: SupabaseClient,
  jobId: string,
  patch: Partial<
    Pick<FerramentaJob,
      "estado" | "projeto_sombra_id" | "entrada" | "custo_creditos" |
      "debitado_em" | "estornado_em" | "entregaveis" | "concluido_em" | "expira_em" |
      "aviso_expiracao_em">
  >,
): Promise<boolean> {
  const { error } = await admin
    .from("ferramenta_jobs")
    .update({ ...patch, atualizado_em: agora() })
    .eq("id", jobId);
  if (error) {
    console.error("[ferramenta-jobs] atualizarJob falhou:", error.message);
    return false;
  }
  return true;
}

/** Registra o débito no job: liga o relógio único de 90 dias. `estado`
 *  default é `processando` (débito dispara motor). Ferramentas em que o
 *  débito NÃO dispara trabalho autônomo (capa avulsa: autor pilota gerações
 *  e o editor) passam `aguardando_autor` — FERR-3.4f. */
export async function registrarDebitoJob(
  admin: SupabaseClient,
  jobId: string,
  custo: number,
  estado: EstadoJob = "processando",
): Promise<boolean> {
  const debitadoEm = new Date();
  const expiraEm = new Date(debitadoEm.getTime() + RETENCAO_DIAS * 86_400_000);
  return atualizarJob(admin, jobId, {
    custo_creditos: custo,
    debitado_em: debitadoEm.toISOString(),
    expira_em: expiraEm.toISOString(),
    estado,
  });
}

/** Conclui: entregáveis já copiados pro cofre pela rota. Apaga o sombra
 *  por default. Passe `apagarSombra: false` quando o vínculo com o sombra
 *  precisa sobreviver para edição posterior (FERR-3.4b: capa avulsa
 *  reabre no editor até expirar); a expiração normal apaga o sombra. */
export async function concluirJob(
  admin: SupabaseClient,
  job: Pick<FerramentaJob, "id" | "user_id" | "projeto_sombra_id">,
  entregaveis: EntregavelJob[],
  opts?: { apagarSombra?: boolean },
): Promise<boolean> {
  const apagarSombra = opts?.apagarSombra ?? true;
  const ok = await atualizarJob(admin, job.id, {
    estado: "concluido",
    entregaveis,
    concluido_em: agora(),
    ...(apagarSombra ? { projeto_sombra_id: null } : {}),
  });
  if (ok && apagarSombra && job.projeto_sombra_id) {
    await apagarProjetoComoAdmin(admin, job.user_id, job.projeto_sombra_id);
  }
  return ok;
}

/** Falha total: estorna (se houve débito), marca e apaga o sombra. */
export async function falharJob(
  admin: SupabaseClient,
  job: Pick<FerramentaJob, "id" | "user_id" | "projeto_sombra_id" | "debitado_em">,
  acao: AcaoCredito | null,
): Promise<void> {
  if (job.debitado_em && acao) {
    const estorno = await estornarCreditos(admin, job.user_id, acao, null);
    await atualizarJob(admin, job.id, {
      estado: "falhou",
      estornado_em: estorno.ok ? agora() : null,
    });
  } else {
    await atualizarJob(admin, job.id, { estado: "falhou" });
  }
  if (job.projeto_sombra_id) {
    await apagarProjetoComoAdmin(admin, job.user_id, job.projeto_sombra_id);
  }
}

/** Expira um job pago: remove os arquivos do cofre e zera entregáveis.
 *  Sem estorno (relógio único de 90 dias — martelada 31/ago; o aviso de
 *  7 dias é a proteção). Apaga o sombra se ainda existir (job pago que
 *  nunca concluiu). */
export async function expirarJob(
  admin: SupabaseClient,
  job: Pick<FerramentaJob, "id" | "user_id" | "projeto_sombra_id" | "entregaveis">,
): Promise<void> {
  const paths = (job.entregaveis ?? []).map((e) => e.storage_path).filter(Boolean);
  if (paths.length > 0) {
    const { error } = await admin.storage.from(BUCKET_FERRAMENTAS).remove(paths);
    if (error) console.warn("[ferramenta-jobs] expirar: remove falhou:", error.message);
  }
  await atualizarJob(admin, job.id, { estado: "expirado", entregaveis: [] });
  if (job.projeto_sombra_id) {
    await apagarProjetoComoAdmin(admin, job.user_id, job.projeto_sombra_id);
  }
}

/** Cancela rascunho (sem débito) parado há RASCUNHO_DIAS: apaga o sombra
 *  e marca cancelado. Silencioso — nada foi pago, nada é comunicado. */
export async function cancelarRascunho(
  admin: SupabaseClient,
  job: Pick<FerramentaJob, "id" | "user_id" | "projeto_sombra_id">,
): Promise<void> {
  await atualizarJob(admin, job.id, { estado: "cancelado" });
  if (job.projeto_sombra_id) {
    await apagarProjetoComoAdmin(admin, job.user_id, job.projeto_sombra_id);
  }
}

/** Modo da diagramação a partir do id da ferramenta (fonte única). */
export function modoDiagramacao(ferramentaId: string): "digital" | "completa" | null {
  if (ferramentaId === "diagramacao-digital") return "digital";
  if (ferramentaId === "diagramacao-completa") return "completa";
  return null;
}

/** Job ATIVO vinculado a um sombra (rotas do motor que só recebem project_id). */
export async function jobDoSombra(
  admin: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<Pick<FerramentaJob, "id" | "user_id" | "ferramenta_id" | "estado" | "entrada" | "debitado_em" | "custo_creditos"> | null> {
  const { data } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, estado, entrada, debitado_em, custo_creditos")
    .eq("projeto_sombra_id", projectId)
    .eq("user_id", userId)
    .not("estado", "in", '("cancelado","expirado","falhou")')
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    (data as Pick<FerramentaJob, "id" | "user_id" | "ferramenta_id" | "estado" | "entrada" | "debitado_em" | "custo_creditos"> | null) ??
    null
  );
}

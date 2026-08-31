import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { planoAtende, type Plano } from "./planos";

export { CUSTOS_CREDITOS, type AcaoCredito } from "./creditos-custos";
import { CUSTOS_CREDITOS, type AcaoCredito } from "./creditos-custos";

/** Saldo inicial por usuário. Documentacional — o valor operante é o
 *  DEFAULT 0 da coluna users.creditos (migration 20260810000000).
 *  Bônus de boas-vindas futuro entra via ledger (FASE 5.B). */
export const SALDO_INICIAL_USUARIO = 0;

// ─── Leitura de saldo ─────────────────────────────────────────────────────────
// Client do USUÁRIO (RLS: SELECT own via "users: leitura própria").

export async function getSaldoCreditos(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("users")
    .select("creditos")
    .eq("id", userId)
    .single();
  if (error || data == null) {
    console.error("[creditos] getSaldoCreditos falhou:", error?.message);
    return null;
  }
  return (data as { creditos: number }).creditos;
}

// ─── Escrita (débito/estorno) ─────────────────────────────────────────────────
// SEMPRE via admin client (service_role) — passa o trigger
// enforce_users_protected_cols por desenho, igual ao webhook do D.3.
// Padrão leitura-para-merge COM check condicional (verdade 23): o UPDATE
// só aplica se o saldo não mudou entre leitura e escrita; corrida
// concorrente → 1 retry → falha explícita. Todo débito/estorno é logado
// em usage_logs (best-effort, nunca falha a operação principal).

interface ResultadoCredito {
  ok: boolean;
  saldo: number | null;
  erro?: "saldo_insuficiente" | "conflito" | "leitura_falhou" | "update_falhou";
}

async function logCreditosBestEffort(
  admin: SupabaseClient,
  userId: string,
  projectId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await admin.from("usage_logs").insert({
      agent_name: "creditos",
      user_id: userId,
      project_id: projectId,
      metadata,
    });
    if (error) console.error("[creditos] log usage_logs falhou:", error.message);
  } catch (err) {
    console.error("[creditos] log usage_logs exception:", err);
  }
}

async function aplicarDelta(
  admin: SupabaseClient,
  userId: string,
  delta: number,
  exigirSaldo: boolean,
): Promise<ResultadoCredito> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { data: row, error: readErr } = await admin
      .from("users")
      .select("creditos")
      .eq("id", userId)
      .single();
    if (readErr || row == null) {
      console.error("[creditos] leitura de saldo falhou:", readErr?.message);
      return { ok: false, saldo: null, erro: "leitura_falhou" };
    }
    const saldoAtual = (row as { creditos: number }).creditos;
    const saldoNovo = saldoAtual + delta;
    if (exigirSaldo && saldoNovo < 0) {
      return { ok: false, saldo: saldoAtual, erro: "saldo_insuficiente" };
    }
    const { data: updated, error: updErr } = await admin
      .from("users")
      .update({ creditos: Math.max(0, saldoNovo) })
      .eq("id", userId)
      .eq("creditos", saldoAtual) // check condicional — verdade 23
      .select("creditos");
    if (updErr) {
      console.error("[creditos] update de saldo falhou:", updErr.message);
      return { ok: false, saldo: saldoAtual, erro: "update_falhou" };
    }
    if (updated && updated.length > 0) {
      return { ok: true, saldo: (updated[0] as { creditos: number }).creditos };
    }
    // 0 linhas: saldo mudou entre leitura e escrita — retry uma vez.
  }
  return { ok: false, saldo: null, erro: "conflito" };
}

/** Debita o custo da ação. Falha explícita em saldo insuficiente —
 *  a rota chamadora decide o HTTP (402). */
export async function debitarCreditos(
  admin: SupabaseClient,
  userId: string,
  acao: AcaoCredito,
  projectId: string | null = null,
): Promise<ResultadoCredito> {
  const valor = CUSTOS_CREDITOS[acao];
  const r = await aplicarDelta(admin, userId, -valor, true);
  await logCreditosBestEffort(admin, userId, projectId, {
    tipo: "debito",
    acao,
    valor,
    ok: r.ok,
    erro: r.erro ?? null,
    saldo_resultante: r.saldo,
  });
  return r;
}

/** Estorna o custo da ação (falha total de geração paga). Best-effort:
 *  nunca lançar — a rota já está em fluxo de erro. */
export async function estornarCreditos(
  admin: SupabaseClient,
  userId: string,
  acao: AcaoCredito,
  projectId: string | null = null,
): Promise<ResultadoCredito> {
  const valor = CUSTOS_CREDITOS[acao];
  const r = await aplicarDelta(admin, userId, valor, false);
  if (!r.ok) {
    console.error(
      `[creditos] ESTORNO FALHOU user=${userId} acao=${acao} valor=${valor} erro=${r.erro} — regularizar via Studio`,
    );
  }
  await logCreditosBestEffort(admin, userId, projectId, {
    tipo: "estorno",
    acao,
    valor,
    ok: r.ok,
    erro: r.erro ?? null,
    saldo_resultante: r.saldo,
  });
  return r;
}

// ─── Gate único de acesso (FERR-3.0a) ────────────────────────────────────────
// Plano atende → liberado sem débito. Projeto de ferramenta (sombra) →
// paga por ação com crédito (decisão 6.1: crédito NÃO destrava ação em
// projeto de esteira — lá o caminho é comprar o plano). Débito no
// "Rodar", estorno em falha total é responsabilidade da rota (padrão
// estornarCreditos). Limite diário por usage_logs deve ser PULADO pela
// rota quando a ação foi paga (mesmo espírito de plano/cortesia da
// PRE-POST-1).

export interface AutorizacaoAcao {
  liberado: boolean;
  pagoComCreditos: boolean;
  resposta: NextResponse | null; // 402 pronto quando !liberado
}

export async function autorizarAcao(
  admin: SupabaseClient,
  project: { id: string; plano?: unknown; origem?: unknown },
  userId: string,
  opts: { minimoPlano: Plano; acao: AcaoCredito },
): Promise<AutorizacaoAcao> {
  if (planoAtende(project.plano, opts.minimoPlano)) {
    return { liberado: true, pagoComCreditos: false, resposta: null };
  }
  if (project.origem === "ferramenta") {
    const debito = await debitarCreditos(admin, userId, opts.acao, project.id);
    if (debito.ok) {
      return { liberado: true, pagoComCreditos: true, resposta: null };
    }
    const custo = CUSTOS_CREDITOS[opts.acao];
    return {
      liberado: false,
      pagoComCreditos: false,
      resposta: NextResponse.json(
        debito.erro === "saldo_insuficiente"
          ? {
              error: `Créditos insuficientes. Esta ação custa ${custo} créditos.`,
              creditos_saldo: debito.saldo,
            }
          : { error: "Falha ao debitar créditos. Tente novamente." },
        { status: debito.erro === "saldo_insuficiente" ? 402 : 500 },
      ),
    };
  }
  return {
    liberado: false,
    pagoComCreditos: false,
    resposta: NextResponse.json(
      { error: "Recurso disponível a partir de outro plano.", plano_necessario: opts.minimoPlano },
      { status: 402 },
    ),
  };
}

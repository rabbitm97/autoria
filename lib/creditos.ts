import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Fonte única de custos ────────────────────────────────────────────────────
// Nada de valor literal em rota (mesma filosofia de lib/planos.ts).
// Novas ações consumidoras de crédito entram AQUI.

export const CUSTOS_CREDITOS = {
  imagem_capa_extra: 10,
  pacote_imagens_capa: 30,
} as const;

export type AcaoCredito = keyof typeof CUSTOS_CREDITOS;

/** Saldo inicial por usuário. Documentacional — o valor operante é o
 *  DEFAULT da coluna users.creditos (migration 20260723000000). Saldo
 *  diferenciado por plano é escopo do D.4. */
export const SALDO_INICIAL_USUARIO = 100;

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

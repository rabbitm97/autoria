import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ORDEM_ETAPAS } from "@/lib/etapas";
import { planoAtende, PLANO_LABEL, type Plano } from "@/lib/planos";

// Se o tsc reclamar de generics ao passar clients do @supabase/ssr,
// trocar o tipo do parâmetro por: SupabaseClient<any, "public", any>

export interface DbWriteResult {
  ok: boolean;
  error: { message: string; code?: string } | null;
}

/**
 * UPDATE em `projects` com check de erro OBRIGATÓRIO (Bloco C.2, item #1).
 * Nunca escreva `etapa_atual` por aqui — use avancarEtapa().
 * `userId` null = client admin/service-role (sem filtro de user_id).
 */
export async function updateProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string | null,
  payload: Record<string, unknown>,
  contexto: string
): Promise<DbWriteResult> {
  let q = supabase.from("projects").update(payload).eq("id", projectId);
  if (userId) q = q.eq("user_id", userId);
  const { error } = await q;
  if (error) {
    console.error(`[${contexto}] Falha no UPDATE de projects:`, error.message, error.code ?? "");
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, error: null };
}

/**
 * Avanço forward-only de etapa_atual (Bloco C.2, item #4).
 * Atômico: o `.in()` garante que só escreve se a etapa atual for ANTERIOR à
 * nova na ORDEM_ETAPAS. Regressões viram no-op silencioso (0 rows), sem erro.
 * Regressão intencional (ex.: capa/reset) NÃO usa este helper — escreve direto.
 */
export async function avancarEtapa(
  supabase: SupabaseClient,
  projectId: string,
  userId: string | null,
  novaEtapa: string,
  contexto: string
): Promise<DbWriteResult> {
  const idx = (ORDEM_ETAPAS as readonly string[]).indexOf(novaEtapa);
  if (idx < 0) {
    console.error(`[${contexto}] avancarEtapa: etapa desconhecida "${novaEtapa}"`);
    return { ok: false, error: { message: `Etapa desconhecida: ${novaEtapa}` } };
  }
  const anteriores = (ORDEM_ETAPAS as readonly string[]).slice(0, idx);
  let q = supabase
    .from("projects")
    .update({ etapa_atual: novaEtapa })
    .eq("id", projectId)
    .in("etapa_atual", anteriores);
  if (userId) q = q.eq("user_id", userId);
  const { error } = await q;
  if (error) {
    console.error(`[${contexto}] Falha ao avançar etapa para "${novaEtapa}":`, error.message);
    return { ok: false, error: { message: error.message, code: error.code } };
  }
  return { ok: true, error: null };
}

/**
 * Gate de plano (Bloco D.2). Uso: após o SELECT de ownership que já traz
 * `plano`, chamar `negarPorPlano(project.plano, "essencial", "revisao")` e,
 * se retornar Response, devolvê-la. Nunca comparar strings de plano na rota.
 */
export function negarPorPlano(
  planoAtual: unknown,
  minimo: Plano,
  contexto: string
): NextResponse | null {
  if (planoAtende(planoAtual, minimo)) return null;
  console.info(`[${contexto}] gate de plano: atual=${String(planoAtual)} minimo=${minimo}`);
  return NextResponse.json(
    {
      error: `Este recurso faz parte do plano ${PLANO_LABEL[minimo]}. Faça o upgrade da obra para continuar.`,
      plano_necessario: minimo,
    },
    { status: 402 }
  );
}

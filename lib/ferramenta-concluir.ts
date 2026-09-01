// lib/ferramenta-concluir.ts
//
// Núcleo server compartilhado pelas rotas /api/ferramentas/*/concluir.
// Extraído para eliminar a duplicação entre diagnostico e epub (FERR-3.2).
// Escrita em ferramenta_jobs continua saindo por lib/ferramenta-jobs.ts.

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_FERRAMENTAS, type FerramentaJob } from "./ferramenta-jobs";

export type JobCarregado = Pick<
  FerramentaJob,
  "id" | "user_id" | "ferramenta_id" | "estado" | "projeto_sombra_id" | "debitado_em" | "entregaveis" | "expira_em"
>;

export type CarregarJobResult =
  | { ok: true; job: JobCarregado }
  | { ok: false; response: NextResponse };

/** Carrega o job pelo id, valida que pertence ao usuário. 404 se não. */
export async function carregarJobDoUsuario(
  admin: SupabaseClient,
  userId: string,
  jobId: string,
): Promise<CarregarJobResult> {
  const { data } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, estado, projeto_sombra_id, debitado_em, entregaveis, expira_em")
    .eq("id", jobId)
    .maybeSingle();
  const job = data as JobCarregado | null;
  if (!job || job.user_id !== userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Job não encontrado." }, { status: 404 }),
    };
  }
  return { ok: true, job };
}

/** Copia um arquivo de um bucket qualquer para o cofre de ferramentas.
 *  Retorna o storage_path e bytes gravados. Usa service_role no admin. */
export async function copiarParaCofre(
  admin: SupabaseClient,
  opts: {
    userId: string;
    jobId: string;
    srcBucket: string;
    srcPath: string;
    destFilename: string;
    contentType: string;
  },
): Promise<{ storage_path: string; bytes: number } | { error: string }> {
  const { data: blob, error: dlErr } = await admin.storage
    .from(opts.srcBucket)
    .download(opts.srcPath);
  if (dlErr || !blob) {
    return { error: `download falhou: ${dlErr?.message ?? "blob vazio"}` };
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  const storagePath = `${opts.userId}/${opts.jobId}/${opts.destFilename}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET_FERRAMENTAS)
    .upload(storagePath, buffer, { contentType: opts.contentType, upsert: true });
  if (upErr) return { error: `upload falhou: ${upErr.message}` };
  return { storage_path: storagePath, bytes: buffer.byteLength };
}

/** Lê `expira_em` (definido em registrarDebitoJob). Retorna null se não. */
export async function lerExpiraEm(
  admin: SupabaseClient,
  jobId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("ferramenta_jobs")
    .select("expira_em")
    .eq("id", jobId)
    .maybeSingle();
  return (data as { expira_em?: string | null } | null)?.expira_em ?? null;
}

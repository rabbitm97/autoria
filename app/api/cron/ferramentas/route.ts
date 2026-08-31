export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import {
  AVISO_DIAS, RASCUNHO_DIAS, cancelarRascunho, expirarJob, atualizarJob,
  type FerramentaJob,
} from "@/lib/ferramenta-jobs";

// ─── GET /api/cron/ferramentas ───────────────────────────────────────────────
// Diário (vercel.json). Protegido por CRON_SECRET (header Authorization
// que a Vercel injeta). Quatro varreduras, todas best-effort e
// idempotentes:
//   1. jobs pagos com expira_em vencido → expira (cofre limpo, sem estorno)
//   2. rascunhos (sem débito) parados há RASCUNHO_DIAS → cancela em silêncio
//   3. aviso de AVISO_DIAS: concluído, expira em ≤7d, aviso nunca enviado
//   4. (implícita nas anteriores) sombras órfãs desses jobs apagadas

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const agora = new Date();
  const resumo = { expirados: 0, rascunhos_cancelados: 0, avisos_enviados: 0, erros: 0 };

  // 1. Expirar vencidos (qualquer estado pago não-terminal ou concluído)
  const { data: vencidos } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, projeto_sombra_id, entregaveis")
    .lt("expira_em", agora.toISOString())
    .in("estado", ["concluido", "processando", "aguardando_autor"])
    .limit(200);
  for (const job of (vencidos ?? []) as FerramentaJob[]) {
    try { await expirarJob(admin, job); resumo.expirados++; }
    catch (e) { console.error("[cron/ferramentas] expirar falhou:", e); resumo.erros++; }
  }

  // 2. Rascunhos parados (nunca debitados)
  const limiteRascunho = new Date(agora.getTime() - RASCUNHO_DIAS * 86_400_000);
  const { data: rascunhos } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, projeto_sombra_id")
    .is("debitado_em", null)
    .in("estado", ["iniciado", "aguardando_autor"])
    .lt("atualizado_em", limiteRascunho.toISOString())
    .limit(200);
  for (const job of (rascunhos ?? []) as FerramentaJob[]) {
    try { await cancelarRascunho(admin, job); resumo.rascunhos_cancelados++; }
    catch (e) { console.error("[cron/ferramentas] rascunho falhou:", e); resumo.erros++; }
  }

  // 3. Aviso de 7 dias (idempotente via aviso_expiracao_em)
  const janelaFim = new Date(agora.getTime() + AVISO_DIAS * 86_400_000);
  const { data: avisar } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, entregaveis, expira_em")
    .eq("estado", "concluido")
    .is("aviso_expiracao_em", null)
    .gt("expira_em", agora.toISOString())
    .lte("expira_em", janelaFim.toISOString())
    .limit(200);
  for (const job of (avisar ?? []) as FerramentaJob[]) {
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(job.user_id);
      const email = authUser?.user?.email;
      if (!email) continue;
      const dataLimite = new Date(job.expira_em!).toLocaleDateString("pt-BR");
      const arquivos = (job.entregaveis ?? [])
        .map((e) => `- ${e.nome_exibicao}`)
        .join("\n");
      const r = await sendEmail({
        to: email,
        subject: "Seus arquivos na Autoria expiram em 7 dias",
        text:
          `Olá!\n\nOs arquivos abaixo, gerados pelas ferramentas da Autoria, ` +
          `ficam disponíveis para download até ${dataLimite}:\n\n${arquivos}\n\n` +
          `Depois dessa data eles são removidos definitivamente. ` +
          `Para baixar, acesse seu painel: https://useautoria.com/dashboard\n\n` +
          `— Autoria`,
      });
      if (r.ok) {
        await atualizarJob(admin, job.id, { aviso_expiracao_em: new Date().toISOString() });
        resumo.avisos_enviados++;
      }
    } catch (e) {
      console.error("[cron/ferramentas] aviso falhou:", e);
      resumo.erros++;
    }
  }

  console.log("[cron/ferramentas]", JSON.stringify(resumo));
  return NextResponse.json({ ok: true, ...resumo });
}

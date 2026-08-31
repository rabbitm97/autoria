// POST /api/ferramentas/jobs
// Cria um job de ferramenta avulsa: sombra project + débito + job record.
// Retorna { job_id, project_id } para o wizard usar nas chamadas seguintes.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { debitarCreditos, estornarCreditos } from "@/lib/creditos";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarJob, registrarDebitoJob, atualizarJob } from "@/lib/ferramenta-jobs";
import { apagarProjetoComoAdmin } from "@/lib/apagar-projeto";
import { ferramentaParaModo, ACAO_POR_MODO } from "@/lib/diagnostico-avulso";

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    ({ user: { id: userId } } = await requireAuth());
  } catch (e) {
    return e as Response;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: { ferramenta_id: string; titulo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { ferramenta_id, titulo } = body;
  if (!ferramenta_id || typeof ferramenta_id !== "string") {
    return NextResponse.json({ error: "Campo 'ferramenta_id' obrigatório." }, { status: 400 });
  }

  const modo = ferramentaParaModo(ferramenta_id);
  if (!modo) {
    return NextResponse.json(
      { error: `ferramenta_id inválido. Suportados: diagnostico-expresso, diagnostico-completo.` },
      { status: 400 },
    );
  }

  const acao = ACAO_POR_MODO[modo];
  const custo = CUSTOS_CREDITOS[acao];
  const tituloSombra = (titulo && titulo.trim()) || "Manuscrito avulso";

  // 1. Criar sombra project (admin — RLS bloqueia insert de service_role só
  //    se tiver política restritiva; aqui usamos admin explicitamente).
  const { data: sombra, error: sombraErr } = await admin
    .from("projects")
    .insert({ user_id: userId, titulo: tituloSombra, plano: "freemium", origem: "ferramenta" })
    .select("id")
    .single();

  if (sombraErr || !sombra) {
    console.error("[ferramentas/jobs] criar sombra falhou:", sombraErr?.message);
    return NextResponse.json({ error: "Falha ao criar projeto interno." }, { status: 500 });
  }

  const projectId = (sombra as { id: string }).id;

  // 2. Debitar créditos ANTES de criar o job (gate econômico).
  const debito = await debitarCreditos(admin, userId, acao, projectId);
  if (!debito.ok) {
    await apagarProjetoComoAdmin(admin, userId, projectId);
    if (debito.erro === "saldo_insuficiente") {
      return NextResponse.json(
        {
          error: `Créditos insuficientes. Esta ferramenta custa ${custo} créditos.`,
          creditos_saldo: debito.saldo,
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: "Falha ao debitar créditos." }, { status: 500 });
  }

  // 3. Criar job record.
  const job = await criarJob(admin, userId, ferramenta_id, {
    titulo: tituloSombra,
    modo,
  });
  if (!job) {
    // Debito já feito — estornar.
    await estornarCreditos(admin, userId, acao, projectId);
    await apagarProjetoComoAdmin(admin, userId, projectId);
    return NextResponse.json({ error: "Falha ao criar job." }, { status: 500 });
  }

  // 4. Atualizar job: vincular sombra project + registrar débito (liga o relógio).
  await atualizarJob(admin, job.id, { projeto_sombra_id: projectId });
  await registrarDebitoJob(admin, job.id, custo);

  return NextResponse.json({ job_id: job.id, project_id: projectId });
}

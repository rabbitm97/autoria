export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { criarJob, atualizarJob } from "@/lib/ferramenta-jobs";

const bodySchema = z.object({
  ferramenta_id: z.string().min(1),
  projeto_sombra_id: z.string().uuid(),
  entrada: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  let user: { id: string };
  try {
    ({ user } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parâmetros inválidos.", detail: parsed.error.flatten() }, { status: 400 });
  }

  const { ferramenta_id, projeto_sombra_id, entrada } = parsed.data;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verificar que o projeto sombra pertence ao usuário e tem origem='ferramenta'
  const { data: sombra, error: sombraErr } = await admin
    .from("projects")
    .select("id, user_id, origem")
    .eq("id", projeto_sombra_id)
    .maybeSingle();

  if (sombraErr || !sombra) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const s = sombra as { id: string; user_id: string; origem?: string | null };
  if (s.user_id !== user.id) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (s.origem !== "ferramenta") {
    return NextResponse.json({ error: "Projeto não é um projeto de ferramenta." }, { status: 400 });
  }

  const job = await criarJob(admin, user.id, ferramenta_id, entrada);
  if (!job) {
    return NextResponse.json({ error: "Falha ao criar job." }, { status: 500 });
  }

  const ok = await atualizarJob(admin, job.id, { projeto_sombra_id });
  if (!ok) {
    return NextResponse.json({ error: "Falha ao vincular sombra ao job." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, job_id: job.id });
}

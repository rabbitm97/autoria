export const maxDuration = 10;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { saldoImagensCapa, getSaldoCreditos } from "@/lib/capa-briefing";

// GET /api/projects/[id]/capa/saldo (B2-05i M5a) — resumo leve do saldo de
// imagens de capa IA + créditos do usuário, para o cliente montar rótulos
// de consumo ANTES de qualquer chamada de briefing/geração. Sem side-effects.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const dev = isDev();

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: SupabaseClient<any>;
  if (dev) {
    userId = "dev-user";
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, user_id, plano")
    .eq("id", projectId)
    .single();
  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const saldoImagens = await saldoImagensCapa(
    admin,
    projectId,
    (project as { plano?: unknown }).plano,
  );
  const creditosSaldo = dev ? null : await getSaldoCreditos(supabase, userId);

  return NextResponse.json({
    saldo: {
      incluso: saldoImagens.incluso,
      restante_frente: saldoImagens.restanteFrente,
      restante_verso: saldoImagens.restanteVerso,
      restante_pool: saldoImagens.restantePool,
    },
    disponivel: {
      frente: saldoImagens.disponivel("frente"),
      verso: saldoImagens.disponivel("verso"),
      unica: saldoImagens.disponivel("unica"),
    },
    origem_proximo: {
      frente: saldoImagens.origemProximoConsumo("frente"),
      verso: saldoImagens.origemProximoConsumo("verso"),
      unica: saldoImagens.origemProximoConsumo("unica"),
    },
    creditos_saldo: creditosSaldo,
  });
}

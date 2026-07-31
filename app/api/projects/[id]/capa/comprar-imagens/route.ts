export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { debitarCreditos, getSaldoCreditos, CUSTOS_CREDITOS } from "@/lib/creditos";
import { saldoImagensCapa } from "@/lib/capa-briefing";

// ─── POST /api/projects/[id]/capa/comprar-imagens ────────────────────────────
// Compra pool de imagens de capa IA (B2-05b). Débito de créditos → pool
// gravado em usage_logs como agent_name="creditos", metadata.tipo=
// "compra_imagens", metadata.imagens=N. saldoImagensCapa (regra canônica
// 05k) lê o pool somando essa métrica menos rodadas com origem="pool".

const bodySchema = z.object({
  pacote: z.enum(["unitario", "quadruplo"]),
});

export async function POST(
  req: NextRequest,
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido. Esperado { pacote: 'unitario' | 'quadruplo' }." },
      { status: 400 },
    );
  }
  const { pacote } = parsed.data;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Ownership + plano para incluso.
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

  const acao = pacote === "unitario" ? "imagem_capa_extra" : "pacote_imagens_capa";
  const imagens = pacote === "unitario" ? 1 : 4;
  const custo = CUSTOS_CREDITOS[acao];

  // Dev não debita — apenas registra o pool para bater com a UI local.
  if (!dev) {
    const debito = await debitarCreditos(admin, userId, acao, projectId);
    if (!debito.ok) {
      if (debito.erro === "saldo_insuficiente") {
        return NextResponse.json(
          {
            error: `Créditos insuficientes. Este pacote custa ${custo} créditos.`,
            creditos_saldo: debito.saldo,
          },
          { status: 402 },
        );
      }
      return NextResponse.json(
        { error: "Falha ao debitar créditos. Tente novamente." },
        { status: 500 },
      );
    }
  }

  // Log de pool. `ok: true` é o que saldoImagensCapa filtra para somar.
  try {
    const { error } = await admin.from("usage_logs").insert({
      agent_name: "creditos",
      user_id: userId,
      project_id: projectId,
      metadata: {
        tipo: "compra_imagens",
        pacote,
        imagens,
        custo,
        ok: true,
      },
    });
    if (error) {
      console.error("[comprar-imagens] log usage_logs falhou:", error.message);
      // Não desfaz o débito: o crédito foi retirado e o autor tem que ver o
      // pool. Mais seguro logar do que travar — pool sem log é o único
      // caminho para 402 injusto no próximo /gerar-capa.
    }
  } catch (err) {
    console.error("[comprar-imagens] log usage_logs exception:", err);
  }

  const saldoImagens = await saldoImagensCapa(
    admin,
    projectId,
    (project as { plano?: unknown }).plano,
  );
  const creditosSaldo = dev ? null : await getSaldoCreditos(supabase, userId);

  return NextResponse.json({
    ok: true,
    pacote,
    imagens,
    saldo: {
      incluso: saldoImagens.incluso,
      restante_frente: saldoImagens.restanteFrente,
      restante_verso: saldoImagens.restanteVerso,
      restante_pool: saldoImagens.restantePool,
    },
    creditos_saldo: creditosSaldo,
  });
}

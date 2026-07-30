export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import {
  briefingCapaSchema,
  carregarContexto,
  sugerirConceitoCapa,
  processarBriefingCapa,
  cobrancaCapa,
} from "@/lib/capa-briefing";
import { getSaldoCreditos } from "@/lib/creditos";

const alvoSchema = z.enum(["frente", "verso", "unica"]).default("frente");

const bodySchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("sugerir_conceito"), project_id: z.string().min(1) }),
  z.object({
    acao: z.literal("confirmar"),
    project_id: z.string().min(1),
    briefing: briefingCapaSchema,
    alvo: alvoSchema,
  }),
]);

export async function POST(req: NextRequest) {
  try {
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

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido.", detalhes: parsed.error.issues },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const ctx = await carregarContexto(supabase, body.project_id, userId, dev);
    if (ctx.erro) return ctx.erro;
    const contexto = ctx.contexto;

    if (body.acao === "sugerir_conceito") {
      try {
        const conceito = await sugerirConceitoCapa({ contexto, projectId: body.project_id, userId });
        return NextResponse.json({ conceito });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Erro interno." },
          { status: 502 },
        );
      }
    }

    try {
      // Modo "cor" no verso não passa pela IA — o editor pinta a região.
      // A rota até pode ser chamada com esse briefing, mas devolvemos
      // resposta trivial (sem prompt) para o cliente não gastar rodada.
      if (body.alvo === "verso" && body.briefing.verso?.modo === "cor") {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        const saldo = dev ? null : await getSaldoCreditos(supabase, userId);
        const { gratis, custo } = await cobrancaCapa(admin, body.project_id, "verso");
        return NextResponse.json({
          prompt_imagem: "",
          frase_confirmacao:
            "O verso será preenchido apenas com a cor predominante da capa — nada será gerado por IA.",
          negative_hints: [],
          modo_cor: true,
          cobranca: { gratis, custo, saldo },
        });
      }

      const result = await processarBriefingCapa({
        contexto,
        briefing: body.briefing,
        alvo: body.alvo,
        projectId: body.project_id,
        userId,
      });
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { gratis, custo } = await cobrancaCapa(admin, body.project_id, body.alvo);
      const saldo = dev ? null : await getSaldoCreditos(supabase, userId);
      return NextResponse.json({
        ...result,
        cobranca: { gratis, custo, saldo },
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erro interno." },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[capa-briefing] erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

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
} from "@/lib/capa-briefing";

const bodySchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("sugerir_conceito"), project_id: z.string().min(1) }),
  z.object({
    acao: z.literal("confirmar"),
    project_id: z.string().min(1),
    briefing: briefingCapaSchema,
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
      const result = await processarBriefingCapa({
        contexto,
        briefing: body.briefing,
        alvo: "frente",
        projectId: body.project_id,
        userId,
      });
      return NextResponse.json(result);
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

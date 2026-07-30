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
  saldoImagensCapa,
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
        return NextResponse.json({
          prompt_imagem: "",
          frase_confirmacao:
            "O verso será preenchido apenas com a cor predominante da capa — nada será gerado por IA.",
          negative_hints: [],
          modo_cor: true,
        });
      }

      // B2-05a Mudança 4: verso precisa herdar a frente. Carregamos o
      // prompt/estilo da frente escolhida e passamos ao agente. Sem
      // frente escolhida ainda, 409 — o cliente deve escolher a frente
      // primeiro antes de briefar o verso.
      let frente: { prompt_usado: string; estilo: string; frase?: string } | undefined;
      if (body.alvo === "verso") {
        const { data: proj, error: projErr } = await supabase
          .from("projects")
          .select("dados_capa")
          .eq("id", body.project_id)
          .single();
        if (projErr) {
          return NextResponse.json(
            { error: "Projeto não encontrado." },
            { status: 404 },
          );
        }
        const dc = (proj?.dados_capa ?? null) as Record<string, unknown> | null;
        const promptUsado = typeof dc?.prompt_usado === "string" ? dc.prompt_usado : "";
        const estiloFrente = typeof dc?.estilo === "string" ? dc.estilo : "";
        const urlEscolhida = typeof dc?.url_escolhida === "string" ? dc.url_escolhida : "";
        if (!promptUsado || !urlEscolhida) {
          return NextResponse.json(
            { error: "Escolha a arte da capa (frente) antes de briefar o verso." },
            { status: 409 },
          );
        }
        frente = {
          prompt_usado: promptUsado,
          estilo: estiloFrente,
          frase: typeof dc?.frase_confirmacao === "string" ? dc.frase_confirmacao : undefined,
        };
      }

      const result = await processarBriefingCapa({
        contexto,
        briefing: body.briefing,
        alvo: body.alvo,
        projectId: body.project_id,
        userId,
        frente,
      });
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      // Snapshot de saldo pós-confirmação: o cliente mostra "1 imagem
      // será consumida do incluso/pool" antes de disparar /gerar-capa.
      const { data: proj } = await admin
        .from("projects")
        .select("plano")
        .eq("id", body.project_id)
        .single();
      const saldoImagens = await saldoImagensCapa(admin, body.project_id, (proj as { plano?: unknown } | null)?.plano);
      const saldoUsuario = dev ? null : await getSaldoCreditos(supabase, userId);
      const origem = saldoImagens.origemProximoConsumo(body.alvo);
      return NextResponse.json({
        ...result,
        consumo: {
          alvo: body.alvo,
          imagens: 1,
          origem,
        },
        saldo: {
          incluso: saldoImagens.incluso,
          restante_frente: saldoImagens.restanteFrente,
          restante_verso: saldoImagens.restanteVerso,
          restante_pool: saldoImagens.restantePool,
        },
        compra_necessaria: origem === "nenhum",
        creditos_saldo: saldoUsuario,
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

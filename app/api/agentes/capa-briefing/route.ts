export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { negarPorPlano } from "@/lib/supabase-helpers";
import { anthropic, traceClaudeCall, isDev, isMock } from "@/lib/anthropic";
import { getAgentPrompt } from "@/lib/agent-prompts";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const AGENT_NAME = "capa-briefing";

// Duplicado de gerar-capa/route.ts (ESTILO_DESC) de propósito: B2-01 não
// toca aquela rota. Consolidação em lib/ é tarefa do B2-02.
const ESTILO_DESC: Record<string, string> = {
  minimalista:   "minimalist editorial design, clean lines, flat colors, lots of white space",
  cartoon:       "cartoon illustration style, bold outlines, vibrant flat colors, playful feel",
  aquarela:      "watercolor painting style, soft washes, organic edges, painterly texture",
  fotorrealista: "photorealistic digital art, cinematic lighting, high detail, professional photography feel",
  abstrato:      "abstract art, geometric shapes, overlapping forms, expressive color fields",
  vintage:       "vintage retro illustration, aged textures, muted palette, period-appropriate typography feel",
  geometrico:    "geometric design, bold shapes, strong contrast, modern graphic style",
};

const ATMOSFERAS = [
  "melancolica", "vibrante", "sobria", "misteriosa",
  "acolhedora", "epica", "tensa", "luminosa",
] as const;

// ─── Schemas de entrada ───────────────────────────────────────────────────────

const briefingSchema = z.object({
  estilo: z.enum([
    "minimalista", "cartoon", "aquarela", "fotorrealista",
    "abstrato", "vintage", "geometrico",
  ]),
  atmosfera: z.array(z.enum(ATMOSFERAS)).min(1).max(2),
  cor_predominante: z.object({
    nome: z.string().max(40),
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  posicao_titulo: z.enum(["topo", "centro", "base", "sem_preferencia"]),
  descricao_livre: z.string().max(2000).optional().default(""),
  referencias_texto: z.string().max(1000).optional().default(""),
  evitar: z.string().max(500).optional().default(""),
  verso: z
    .object({
      modo: z.enum(["continuacao", "independente"]),
      descricao: z.string().max(2000).optional().default(""),
    })
    .optional(),
});

const bodySchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("sugerir_conceito"), project_id: z.string().min(1) }),
  z.object({
    acao: z.literal("confirmar"),
    project_id: z.string().min(1),
    briefing: briefingSchema,
  }),
]);

// ─── System prompt (fallback — override vivo em agent_prompts) ───────────────

const FALLBACK_PROMPT = `Você é o diretor de arte da Autoria, plataforma
brasileira de autopublicação. Sua função é transformar o briefing de um
autor em instruções precisas para um modelo de geração de imagens criar a
capa do livro dele.

REGRAS INEGOCIÁVEIS do prompt de imagem (sempre em inglês):
- A imagem NUNCA contém texto: inclua sempre "absolutely no text, no
  letters, no words, no typography, no numbers".
- Sempre inclua "full bleed composition, no borders or frames" e
  "professional publishing industry quality, high contrast, suitable for
  CMYK print".
- NUNCA mencione aspect ratio, resolução ou dimensões no texto do prompt
  (são configurados por parâmetro fora do prompt).
- Respeite a área de respiro: se o autor indicou posição do título,
  descreva composição com essa região visualmente calma (ex.: "upper third
  kept visually calm and uncluttered, minimal detail in that area, to
  receive the title later").
- Incorpore o que o autor pediu para evitar como instruções negativas
  claras no próprio prompt.
- Se o briefing do verso tiver modo "continuacao", o prompt deve pedir
  "seamless continuation of the provided front cover artwork onto the back
  cover of the same book, matching palette, lighting and style".

FERRAMENTAS: responda SEMPRE e SOMENTE chamando a ferramenta indicada.
- Para "sugerir_conceito": proponha um conceito visual de capa em 2-3
  frases, em português, concreto (cena, objetos, atmosfera, luz), fiel ao
  gênero e à sinopse, sem clichês vazios e sem pedir textos na imagem.
- Para "confirmar": produza (1) prompt_imagem em inglês seguindo as regras
  acima, denso e específico; (2) frase_confirmacao em português, 1 frase
  natural resumindo ao autor o que será gerado (estilo, atmosfera, cor,
  cena principal, área livre do título quando houver); (3) negative_hints,
  lista curta em inglês do que evitar (inclui os pedidos do autor).`;

// ─── Tools (tool_use forçado) ────────────────────────────────────────────────

const TOOL_CONCEITO = {
  name: "entregar_conceito",
  description: "Entrega o conceito visual sugerido para a capa.",
  input_schema: {
    type: "object" as const,
    properties: { conceito: { type: "string" as const } },
    required: ["conceito"],
  },
};

const TOOL_BRIEFING = {
  name: "entregar_briefing_processado",
  description: "Entrega o prompt de imagem e a frase de confirmação.",
  input_schema: {
    type: "object" as const,
    properties: {
      prompt_imagem: { type: "string" as const },
      frase_confirmacao: { type: "string" as const },
      negative_hints: {
        type: "array" as const,
        items: { type: "string" as const },
      },
    },
    required: ["prompt_imagem", "frase_confirmacao", "negative_hints"],
  },
};

// ─── Contexto do livro (server-side, nunca do front) ─────────────────────────

interface ContextoLivro {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  sinopse: string;
  temas: string;
}

async function carregarContexto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  projectId: string,
  userId: string,
  dev: boolean,
): Promise<{ contexto: ContextoLivro; erro?: never } | { contexto?: never; erro: NextResponse }> {
  const { data: project, error } = await supabase
    .from("projects")
    .select(
      "id, user_id, plano, dados_elementos, manuscripts(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, genero_principal)",
    )
    .eq("id", projectId)
    .single();

  if (error || !project) {
    return { erro: NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 }) };
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return { erro: NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 }) };
  }

  const gate = negarPorPlano((project as { plano?: unknown }).plano, "essencial", AGENT_NAME);
  if (gate) return { erro: gate };

  const ms = (project as Record<string, unknown>).manuscripts as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;
  const de = (project as Record<string, unknown>).dados_elementos as {
    sinopse_curta?: string;
    sinopse_longa?: string;
    palavras_chave?: string[];
  } | null;

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  return {
    contexto: {
      titulo: str(ms?.titulo),
      subtitulo: str(ms?.subtitulo),
      autor: [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" "),
      genero: str(ms?.genero_principal),
      sinopse: (str(de?.sinopse_longa) || str(de?.sinopse_curta)).slice(0, 1200),
      temas: JSON.stringify(de?.palavras_chave ?? []).slice(0, 400),
    },
  };
}

// ─── POST /api/agentes/capa-briefing ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const dev = isDev();

    let userId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let supabase: SupabaseClient<any>;
    if (dev) {
      // Admin client bypasses RLS — necessário para curl sem cookie de sessão.
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

    if (isMock()) {
      return NextResponse.json(
        body.acao === "sugerir_conceito"
          ? { conceito: "[MOCK] Uma estrada vazia ao amanhecer, névoa baixa, tom melancólico e luz dourada." }
          : {
              prompt_imagem: "[MOCK] minimalist editorial design, empty road at dawn, absolutely no text, no letters, no words, no typography, no numbers, full bleed composition, no borders or frames, professional publishing industry quality",
              frase_confirmacao: "[MOCK] Vamos gerar: capa minimalista, tons terrosos, estrada ao amanhecer, topo livre para o título.",
              negative_hints: ["no text", "no people"],
            },
      );
    }

    const systemPrompt = await getAgentPrompt(AGENT_NAME, FALLBACK_PROMPT);

    const contextoTxt = [
      contexto.titulo && `Título: ${contexto.titulo}`,
      contexto.subtitulo && `Subtítulo: ${contexto.subtitulo}`,
      contexto.autor && `Autor: ${contexto.autor}`,
      contexto.genero && `Gênero: ${contexto.genero}`,
      contexto.sinopse && `Sinopse: ${contexto.sinopse}`,
      contexto.temas && contexto.temas !== "[]" && `Palavras-chave: ${contexto.temas}`,
    ]
      .filter(Boolean)
      .join("\n");

    let userMsg: string;
    let tool: typeof TOOL_CONCEITO | typeof TOOL_BRIEFING;

    if (body.acao === "sugerir_conceito") {
      tool = TOOL_CONCEITO;
      userMsg = `Ação: sugerir_conceito\n\nCONTEXTO DO LIVRO:\n${contextoTxt}`;
    } else {
      tool = TOOL_BRIEFING;
      const b = body.briefing;
      const alvo = b.verso ? `VERSO (modo: ${b.verso.modo})` : "FRENTE";
      userMsg = [
        `Ação: confirmar — gerar prompt para a ${alvo} da capa.`,
        "",
        "CONTEXTO DO LIVRO:",
        contextoTxt,
        "",
        "BRIEFING DO AUTOR:",
        `Estilo: ${b.estilo} (${ESTILO_DESC[b.estilo]})`,
        `Atmosfera: ${b.atmosfera.join(", ")}`,
        `Cor predominante: ${b.cor_predominante.nome} (${b.cor_predominante.hex})`,
        `Posição do título: ${b.posicao_titulo}`,
        b.descricao_livre && `Descrição do autor: ${b.descricao_livre}`,
        b.referencias_texto && `Capas de referência citadas: ${b.referencias_texto}`,
        b.evitar && `Evitar: ${b.evitar}`,
        b.verso?.descricao && `Descrição do verso: ${b.verso.descricao}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    const message = await traceClaudeCall({
      agentName: AGENT_NAME,
      projectId: body.project_id,
      userId,
      model: MODEL_HAIKU,
      input: { acao: body.acao },
      fn: () =>
        anthropic.messages.create({
          model: MODEL_HAIKU,
          max_tokens: 1500,
          system: systemPrompt,
          tools: [tool],
          tool_choice: { type: "tool", name: tool.name },
          messages: [{ role: "user", content: userMsg }],
        }),
    });

    const toolBlock = message.content.find((c) => c.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      console.error(`[${AGENT_NAME}] resposta sem tool_use`, message.stop_reason);
      return NextResponse.json(
        { error: "A IA não retornou no formato esperado. Tente novamente." },
        { status: 502 },
      );
    }

    const input = toolBlock.input as Record<string, unknown>;

    if (body.acao === "sugerir_conceito") {
      const conceito = typeof input.conceito === "string" ? input.conceito.trim() : "";
      if (!conceito) {
        return NextResponse.json({ error: "Conceito vazio. Tente novamente." }, { status: 502 });
      }
      return NextResponse.json({ conceito });
    }

    const promptImagem = typeof input.prompt_imagem === "string" ? input.prompt_imagem.trim() : "";
    const frase = typeof input.frase_confirmacao === "string" ? input.frase_confirmacao.trim() : "";
    const hints = Array.isArray(input.negative_hints)
      ? input.negative_hints.filter((h): h is string => typeof h === "string").slice(0, 12)
      : [];

    if (!promptImagem || !frase) {
      return NextResponse.json(
        { error: "Resposta incompleta da IA. Tente novamente." },
        { status: 502 },
      );
    }

    // Cinto e suspensório: a regra inegociável entra mesmo se a IA esquecer.
    const promptFinal = /no text/i.test(promptImagem)
      ? promptImagem
      : `${promptImagem} Absolutely no text, no letters, no words, no typography.`;

    return NextResponse.json({
      prompt_imagem: promptFinal,
      frase_confirmacao: frase,
      negative_hints: hints,
    });
  } catch (err) {
    console.error("[capa-briefing] erro inesperado:", err);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

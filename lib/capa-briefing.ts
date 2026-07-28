import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { negarPorPlano } from "@/lib/supabase-helpers";
import { anthropic, traceClaudeCall, isMock } from "@/lib/anthropic";
import { getAgentPrompt } from "@/lib/agent-prompts";

export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const AGENT_NAME = "capa-briefing";

// Guardrails técnicos INEGOCIÁVEIS, anexados por código a TODO prompt de
// imagem — nunca dependem de o agente lembrar (azeite-01, 24/jul).
// B2-05: SUFIXO_POR_ALVO.verso receberá frase diferente (verso contínuo).
const SUFIXO_POR_ALVO: Record<"frente" | "verso", string> = {
  frente: "Single front cover artwork only, portrait composition.",
  verso:  "Single front cover artwork only, portrait composition.",
};
const SUFIXO_TECNICO_IMAGEM = (alvo: "frente" | "verso") =>
  " Flat two-dimensional digital artwork only, filling the entire canvas" +
  " edge-to-edge. This is the artwork itself, NOT a photograph of a" +
  " printed object: no mockup, no paper, no folds, no creases, no drop" +
  " shadow, no white border, no frame, no margins, no background surface." +
  ` ${SUFIXO_POR_ALVO[alvo]}` +
  " Absolutely no text, no letters, no words, no typography, no numbers.";

export const ESTILO_DESC: Record<string, string> = {
  minimalista:   "minimalist editorial design, clean lines, flat colors, lots of white space",
  cartoon:       "cartoon illustration style, bold outlines, vibrant flat colors, playful feel",
  aquarela:      "watercolor painting style, soft washes, organic edges, painterly texture",
  fotorrealista: "photorealistic digital art, cinematic lighting, high detail, professional photography feel",
  abstrato:      "abstract art, geometric shapes, overlapping forms, expressive color fields",
  vintage:       "vintage retro illustration, aged textures, muted palette, period-appropriate typography feel",
  geometrico:    "geometric design, bold shapes, strong contrast, modern graphic style",
};

export const ATMOSFERAS = [
  "melancolica", "vibrante", "sobria", "misteriosa",
  "acolhedora", "epica", "tensa", "luminosa",
] as const;

export const briefingCapaSchema = z.object({
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

export type BriefingCapa = z.infer<typeof briefingCapaSchema>;

export const FALLBACK_PROMPT = `Você é o diretor de arte da Autoria, plataforma
brasileira de autopublicação. Sua função é transformar o briefing de um
autor em instruções precisas para um modelo de geração de imagens criar
a arte que será usada como fundo da capa do livro dele.

REGRAS INEGOCIÁVEIS do prompt de imagem (sempre em inglês):
- A imagem NUNCA contém texto: inclua sempre "absolutely no text, no
  letters, no words, no typography, no numbers".
- Sempre inclua "full bleed composition, no borders or frames" e
  "striking, gallery-quality digital artwork", "rich, deep, saturated
  color palette", "dramatic lighting and strong tonal contrast".
- NUNCA mencione aspect ratio, resolução ou dimensões no texto do prompt
  (são configurados por parâmetro fora do prompt).
- Descreva uma imagem memorável e emocionalmente evocativa, não uma cena
  literal — interprete o conceito com ambição de direção de arte.
- Prefira composição com UM elemento visual dominante e hierarquia clara
  (foco, não simetria decorativa); assimetria é bem-vinda.
- A cor predominante do autor deve aparecer rica e profunda, nunca
  desbotada ou acinzentada; use a luz para criar drama dentro dessa paleta.
- Área de respiro do título = região visualmente calma, mas NUNCA um bloco
  vazio ou faixa chapada; mantenha textura/gradiente sutil que pertença à
  arte. Se o autor indicou posição do título, descreva a composição com
  essa região calma (ex.: "upper third kept visually calm but with subtle
  gradient texture, to receive the title later").
- Quando a posição do título for CENTRO: posicione o elemento dominante
  DESLOCADO do centro (terço inferior ou superior) e componha a faixa
  central como região de menor detalhe e contraste — tonalmente contínua
  com a arte, NUNCA um vazio; a imagem deve parecer completa mesmo sem o
  título.
- Adapte a densidade do conceito ao estilo: para MINIMALISTA, reduza a UM
  único elemento essencial com amplo espaço negativo e nenhuma iconografia
  acessória; para abstrato, fotorrealista e demais estilos, a densidade
  pode ser maior, mantendo sempre um elemento dominante.
- Incorpore o que o autor pediu para evitar como instruções negativas
  claras no próprio prompt.
- Se o briefing do verso tiver modo "continuacao", o prompt deve pedir
  "seamless continuation of the provided front cover artwork onto the back
  cover of the same book, matching palette, lighting and style".
- Nunca descreva a capa como objeto físico, impresso, fotografado, em
  mockup ou apresentação — o prompt descreve somente a arte em si.

FERRAMENTAS: responda SEMPRE e SOMENTE chamando a ferramenta indicada.
- Para "sugerir_conceito": proponha um conceito visual de capa em 2-3
  frases, em português, concreto (cena, objetos, atmosfera, luz), fiel ao
  gênero e à sinopse, sem clichês vazios e sem pedir textos na imagem.
- Para "confirmar": produza (1) prompt_imagem em inglês descrevendo the
  flat artwork that will be used as the front cover background of a book,
  seguindo as regras acima, denso e específico; (2) frase_confirmacao em
  português, 1 frase natural resumindo ao autor o que será gerado (estilo,
  atmosfera, cor, cena principal, área livre do título quando houver);
  (3) negative_hints, lista curta em inglês do que evitar (inclui os
  pedidos do autor).`;

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

export interface ContextoLivro {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  sinopse: string;
  temas: string;
}

export async function carregarContexto(
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

function buildContextoTxt(contexto: ContextoLivro): string {
  return [
    contexto.titulo && `Título: ${contexto.titulo}`,
    contexto.subtitulo && `Subtítulo: ${contexto.subtitulo}`,
    contexto.autor && `Autor: ${contexto.autor}`,
    contexto.genero && `Gênero: ${contexto.genero}`,
    contexto.sinopse && `Sinopse: ${contexto.sinopse}`,
    contexto.temas && contexto.temas !== "[]" && `Palavras-chave: ${contexto.temas}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function sugerirConceitoCapa(args: {
  contexto: ContextoLivro;
  projectId: string;
  userId: string;
}): Promise<string> {
  if (isMock()) {
    return "[MOCK] Uma estrada vazia ao amanhecer, névoa baixa, tom melancólico e luz dourada.";
  }

  const systemPrompt = await getAgentPrompt(AGENT_NAME, FALLBACK_PROMPT);
  const userMsg = `Ação: sugerir_conceito\n\nCONTEXTO DO LIVRO:\n${buildContextoTxt(args.contexto)}`;

  const message = await traceClaudeCall({
    agentName: AGENT_NAME,
    projectId: args.projectId,
    userId: args.userId,
    model: MODEL_HAIKU,
    input: { acao: "sugerir_conceito" },
    fn: () =>
      anthropic.messages.create({
        model: MODEL_HAIKU,
        max_tokens: 1500,
        system: systemPrompt,
        tools: [TOOL_CONCEITO],
        tool_choice: { type: "tool", name: TOOL_CONCEITO.name },
        messages: [{ role: "user", content: userMsg }],
      }),
  });

  const toolBlock = message.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("A IA não retornou no formato esperado. Tente novamente.");
  }

  const input = toolBlock.input as Record<string, unknown>;
  const conceito = typeof input.conceito === "string" ? input.conceito.trim() : "";
  if (!conceito) throw new Error("Conceito vazio. Tente novamente.");
  return conceito;
}

export async function processarBriefingCapa(args: {
  contexto: ContextoLivro;
  briefing: BriefingCapa;
  alvo: "frente" | "verso";
  projectId: string;
  userId: string;
}): Promise<{ prompt_imagem: string; frase_confirmacao: string; negative_hints: string[] }> {
  if (isMock()) {
    return {
      prompt_imagem:
        "[MOCK] minimalist editorial design, empty road at dawn, absolutely no text, no letters, no words, no typography, no numbers, full bleed composition, no borders or frames, professional publishing industry quality",
      frase_confirmacao:
        "[MOCK] Vamos gerar: capa minimalista, tons terrosos, estrada ao amanhecer, topo livre para o título.",
      negative_hints: ["no text", "no people"],
    };
  }

  const systemPrompt = await getAgentPrompt(AGENT_NAME, FALLBACK_PROMPT);
  const b = args.briefing;
  const alvoLabel = args.alvo === "verso" && b.verso
    ? `VERSO (modo: ${b.verso.modo})`
    : "FRENTE";

  const userMsg = [
    `Ação: confirmar — gerar prompt para a ${alvoLabel} da capa.`,
    "",
    "CONTEXTO DO LIVRO:",
    buildContextoTxt(args.contexto),
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

  const message = await traceClaudeCall({
    agentName: AGENT_NAME,
    projectId: args.projectId,
    userId: args.userId,
    model: MODEL_HAIKU,
    input: { acao: "confirmar", alvo: args.alvo },
    fn: () =>
      anthropic.messages.create({
        model: MODEL_HAIKU,
        max_tokens: 1500,
        system: systemPrompt,
        tools: [TOOL_BRIEFING],
        tool_choice: { type: "tool", name: TOOL_BRIEFING.name },
        messages: [{ role: "user", content: userMsg }],
      }),
  });

  const toolBlock = message.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("A IA não retornou no formato esperado. Tente novamente.");
  }

  const input = toolBlock.input as Record<string, unknown>;
  const promptImagem = typeof input.prompt_imagem === "string" ? input.prompt_imagem.trim() : "";
  const frase = typeof input.frase_confirmacao === "string" ? input.frase_confirmacao.trim() : "";
  const hints = Array.isArray(input.negative_hints)
    ? input.negative_hints.filter((h): h is string => typeof h === "string").slice(0, 12)
    : [];

  if (!promptImagem || !frase) {
    throw new Error("Resposta incompleta da IA. Tente novamente.");
  }

  const promptFinal = `${promptImagem}${SUFIXO_TECNICO_IMAGEM(args.alvo)}`;
  return { prompt_imagem: promptFinal, frase_confirmacao: frase, negative_hints: hints };
}

/** True se o projeto já teve alguma rodada de geração IA de frente
 *  bem-sucedida. Marcador vive em usage_logs — sobrevive a capa/reset
 *  (anti-vazamento, B2-04a). */
export async function jaGerouCapaIa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  projectId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("usage_logs")
    .select("id")
    .eq("agent_name", "gerar-capa")
    .eq("project_id", projectId)
    .limit(1);
  if (error) {
    console.error("[capa-briefing] jaGerouCapaIa falhou:", error.message);
    return true; // fail-closed: na dúvida, cobra — nunca vaza de graça
  }
  return (data?.length ?? 0) > 0;
}

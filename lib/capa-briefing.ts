import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { negarPorPlano } from "@/lib/supabase-helpers";
import { anthropic, traceClaudeCall, isMock } from "@/lib/anthropic";
import { getAgentPrompt } from "@/lib/agent-prompts";
import { getSaldoCreditos } from "@/lib/creditos";
import { SALDO_IMAGENS_CAPA, type Plano, isPlano } from "@/lib/planos";

export const MODEL_HAIKU = "claude-haiku-4-5-20251001";
export const AGENT_NAME = "capa-briefing";

/**
 * Alvo da geração da capa.
 *  - "frente": arte da capa frontal (retrato) — modo padrão, único suporte
 *              pré-B2-05.
 *  - "verso":  arte da contracapa (retrato). Sempre acompanha uma frente já
 *              escolhida — o autor decide continuação/independente.
 *  - "unica":  UMA arte panorâmica landscape que cobre verso+lombada+frente.
 *              O terço direito vira a frente no editor.
 */
export type AlvoCapa = "frente" | "verso" | "unica";

// Guardrails técnicos INEGOCIÁVEIS, anexados por código a TODO prompt de
// imagem — nunca dependem de o agente lembrar (azeite-01, 24/jul).
//
// B2-05k M4 (anti-spine v3): para arte única, REMOVEMOS toda menção às peças
// da capa (spine/fold/back cover/front cover). Hipótese: nomear a peça no
// prompt sugere ao modelo desenhá-la; proibir depois de citar cria conflito.
// Descrevemos apenas geometria e composição — nenhuma peça de livro é
// nomeada. O terço direito é referido como "right third", não "front cover".
const POSICAO_EM_INGLES: Record<"topo" | "centro" | "base" | "sem_preferencia", string> = {
  topo: "top",
  centro: "center",
  base: "bottom",
  sem_preferencia: "",
};
// B2-05m (azeite v4): respiro dito como SUBSTANTIVO ("área calma") virou
// faixa horizontal chapada em 3/3 gerações pós-05k. Reescrito como
// QUALIDADE local da composição ("fewer elements, softer contrast,
// achieved by the composition itself") + proibição explícita de faixas
// em qualquer eixo. Padrão: instrução espacial como substantivo induz o
// modelo a desenhar o substantivo; dita como qualidade da composição
// induz o comportamento.
function sufixoUnica(posicao: "topo" | "centro" | "base" | "sem_preferencia"): string {
  const zona = POSICAO_EM_INGLES[posicao];
  const clausulaZona = zona
    ? ` Inside the right third, let the ${zona} region be NATURALLY quieter — simply fewer elements and softer contrast THERE, achieved by the composition itself. This is a local quality of the artwork, NOT a shape: never a strip, panel, box, overlay, gradient bar or tonal block, and never extending beyond the right third.`
    : "";
  return (
    "One single wide continuous artwork in landscape orientation, filling" +
    " the entire canvas edge-to-edge. The dominant subject lives INSIDE the" +
    " right third, facing or moving toward the left." + clausulaZona +
    " The left two thirds are the same continuous scene extending outward," +
    " painted with the same treatment. The entire canvas is ONE uniform," +
    " continuous painting with a single consistent treatment throughout." +
    " No horizontal or vertical bands, strips or panels of any kind," +
    " anywhere; no seam, no glow line, no fold, no lighting or texture" +
    " change across the width or the height. Flat two-dimensional artwork" +
    " only: no mockup, no paper, no shadow, no border, no text."
  );
}
const SUFIXO_POR_ALVO = (
  alvo: AlvoCapa,
  posicao: "topo" | "centro" | "base" | "sem_preferencia",
): string => {
  if (alvo === "frente") return "Single artwork only, portrait composition.";
  if (alvo === "verso") return "Single artwork only, portrait composition, meant to pair with the front artwork of the same book.";
  return sufixoUnica(posicao);
};
const SUFIXO_TECNICO_IMAGEM = (
  alvo: AlvoCapa,
  posicao: "topo" | "centro" | "base" | "sem_preferencia",
) =>
  " Flat two-dimensional digital artwork only, filling the entire canvas" +
  " edge-to-edge. This is the artwork itself, NOT a photograph of a" +
  " printed object: no mockup, no paper, no folds, no creases, no drop" +
  " shadow, no white border, no frame, no margins, no background surface." +
  ` ${SUFIXO_POR_ALVO(alvo, posicao)}` +
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
  // min(1) é regra da UI do briefing (validação client); o schema aceita
  // vazio porque briefings HERDADOS (verso a partir de result mínimo do
  // fallback da galeria, B2-04d) podem não ter atmosfera. (B2-05f)
  atmosfera: z.array(z.enum(ATMOSFERAS)).max(2),
  cor_predominante: z.object({
    nome: z.string().max(40),
    // Herança de results mínimos pode vir vazia (B2-05g, mesmo princípio
    // do 05f/atmosfera): aceita "" e a linha de cor é omitida do prompt.
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal("")),
  }),
  posicao_titulo: z.enum(["topo", "centro", "base", "sem_preferencia"]),
  descricao_livre: z.string().max(2000).optional().default(""),
  referencias_texto: z.string().max(1000).optional().default(""),
  evitar: z.string().max(500).optional().default(""),
  verso: z
    .object({
      // "cor": não gera imagem — o editor apenas preenche com a cor
      // predominante da frente. Mesmo assim vem no briefing para
      // registrar a escolha do autor e habilitar mudança futura.
      modo: z.enum(["cor", "continuacao", "independente"]),
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
  "seamless continuation of the provided front artwork into the paired
  back artwork of the same book, matching palette, lighting and style".
- Se o alvo for VERSO com modo "cor", NÃO gere prompt de imagem: esse
  modo não usa IA — o editor apenas preenche a região com a cor
  predominante da frente. Você não é chamado nesse caso.
- Se o alvo for ARTE ÚNICA (B2-05m, azeite v4): o prompt descreve UMA
  única obra landscape (proporção larga) contínua, edge-to-edge, como um
  quadro panorâmico. NUNCA nomeie as peças da capa — proibido usar
  "spine", "lombada", "fold", "dobra", "back cover", "front cover",
  "capa", "verso" ou "frente" como partes da composição no texto do
  prompt. Descreva apenas GEOMETRIA e COMPOSIÇÃO: o sujeito/elemento
  dominante DEVE viver DENTRO do terço direito da tela, orientado ou se
  movendo em direção à esquerda (para dentro da composição). Os dois
  terços à esquerda são a MESMA cena contínua se estendendo para fora,
  com o MESMO tratamento — nunca uma continuação "mais quieta" ou
  "diferente". A tela inteira é UMA pintura uniforme e contínua com um
  único tratamento consistente do início ao fim.
  RESPIRO (dentro do terço direito, quando houver posição de título): a
  região correspondente (topo/centro/base) deve ser NATURALMENTE mais
  quieta — simplesmente menos elementos e contraste mais suave ALI,
  alcançado pela própria composição. Isso é uma QUALIDADE local da arte,
  NÃO uma forma: nunca uma faixa, painel, caixa, overlay, barra de
  gradiente ou bloco tonal, e nunca se estendendo além do terço direito.
  ANTI-FAIXA (obrigatório na ARTE ÚNICA): proíba explicitamente qualquer
  faixa horizontal ou vertical, painel, tira, costura, dobra, veio de
  luz ou mudança de iluminação/textura em QUALQUER eixo e em QUALQUER
  lugar da tela — a arte é UM campo pictórico único e ininterrupto.
  NUNCA descreva composição centralizada nem sujeito no lado esquerdo,
  nunca descreva três cenas distintas.
- Nunca descreva a capa como objeto físico, impresso, fotografado, em
  mockup ou apresentação — o prompt descreve somente a arte em si.

REGRAS DE PRECEDÊNCIA (INEGOCIÁVEIS):
- Os campos estruturados do briefing (Estilo, Atmosfera, Cor predominante,
  Posição do título) têm PRECEDÊNCIA ABSOLUTA sobre a Descrição do autor.
  Se o autor descrever cor/estilo/atmosfera/posição na descrição livre e
  isso conflitar com os campos estruturados, os CAMPOS vencem. A descrição
  do autor serve apenas para enriquecer cena/assunto/objetos/atmosfera
  narrativa — nunca para sobrescrever escolhas técnicas.

FERRAMENTAS: responda SEMPRE e SOMENTE chamando a ferramenta indicada.
- Para "sugerir_conceito": proponha um conceito visual de capa em 2-3
  frases, em português, concreto e fiel ao gênero e à sinopse, sem clichês
  vazios. O conceito descreve APENAS: assunto/cena, objetos, composição do
  assunto, atmosfera emocional e qualidade de luz. É PROIBIDO mencionar:
  cores ou paleta; posição do título, área de respiro ou espaço para
  texto; estilo de arte (minimalista/aquarela/etc.); qualquer instrução
  técnica de composição ou dimensão. Essas escolhas pertencem aos campos
  estruturados do briefing e são aplicadas depois.
- Para "confirmar": produza (1) prompt_imagem em inglês descrevendo a
  arte plana que servirá de fundo para a capa do livro, seguindo as
  regras acima, denso e específico; (2) frase_confirmacao em
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
  alvo: AlvoCapa;
  projectId: string;
  userId: string;
  /**
   * Arte da frente já gerada. Passado apenas quando `alvo === "verso"` —
   * o verso pertence à MESMA capa, então o agente precisa enxergar o
   * prompt da frente para produzir um resultado coerente (mesma técnica,
   * paleta, tratamento). O modo do verso (continuacao × independente)
   * decide o tom da instrução extra no userMsg.
   */
  frente?: { prompt_usado: string; estilo: string; frase?: string };
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
  const alvoLabel =
    args.alvo === "unica"
      ? "ARTE ÚNICA (landscape panorâmico contínuo — NÃO nomear peças de capa)"
      : args.alvo === "verso" && b.verso
        ? `VERSO (modo: ${b.verso.modo})`
        : "FRENTE";

  // Herança da frente para o verso (B2-05a Mudança 3): o verso pertence
  // à MESMA capa; o agente precisa enxergar o prompt já usado para não
  // produzir uma cena estranha à família visual.
  // B2-05h: herança textual é BEST-EFFORT. Frente vinda do fallback da
  // galeria (04d) grava prompt_usado="" — nesse caso as instruções por
  // modo apontam para a IMAGEM de referência (continuação) ou herdam
  // apenas do próprio briefing (independente). Sem cabeçalho órfão: o
  // bloco só entra quando há prompt real.
  const versoMode = args.alvo === "verso" ? b.verso?.modo : null;
  const heredityBlock: string[] =
    args.alvo === "verso" && args.frente && args.frente.prompt_usado
      ? [
          "",
          "ARTE DA FRENTE (já gerada — o verso pertence à MESMA capa):",
          `Prompt usado na frente: ${args.frente.prompt_usado}`,
        ]
      : [];
  const temPromptFrente = Boolean(args.frente?.prompt_usado);
  // B2-05j M3a: continuação = mesma família visual, NUNCA cópia/espelho/
  // repetição do assunto principal da frente. O verso é o ENTORNO da mesma
  // cena, com densidade menor e área calma para a sinopse. Texto verbatim.
  const versoInstruction: string | null =
    args.alvo === "verso"
      ? versoMode === "continuacao"
        ? "O verso é a CONTINUAÇÃO da arte da frente para a página ESQUERDA de um livro aberto: mesmo mundo, mesma técnica, mesma paleta e luz — mas NUNCA uma cópia, espelho ou repetição do assunto principal da frente. O verso mostra o ENTORNO ou a extensão da mesma cena (o que está ao redor, atrás ou antes do momento da frente), com densidade menor e uma área ampla e calma para o texto da sinopse. PROIBIDO repetir o elemento dominante da frente."
        : versoMode === "independente"
          ? temPromptFrente
            ? "O prompt do verso deve pertencer à MESMA FAMÍLIA VISUAL do prompt da frente acima (mesma técnica, paleta e tratamento), com a cena própria descrita pelo autor."
            : "O prompt do verso deve pertencer à MESMA FAMÍLIA VISUAL da frente (mesma técnica, paleta e tratamento — herdados do estilo e da imagem de referência quando presente), com a cena própria descrita pelo autor."
          : null
      : null;

  const userMsg = [
    `Ação: confirmar — gerar prompt para a ${alvoLabel} da capa.`,
    "",
    "CONTEXTO DO LIVRO:",
    buildContextoTxt(args.contexto),
    "",
    "BRIEFING DO AUTOR:",
    `Estilo: ${b.estilo} (${ESTILO_DESC[b.estilo]})`,
    b.atmosfera.length > 0 && `Atmosfera: ${b.atmosfera.join(", ")}`,
    // Herança de results mínimos pode não ter cor (B2-05g); no verso por
    // continuação a paleta já vem da FRENTE como referência visual.
    (b.cor_predominante.nome || b.cor_predominante.hex) &&
      `Cor predominante: ${
        b.cor_predominante.nome && b.cor_predominante.hex
          ? `${b.cor_predominante.nome} (${b.cor_predominante.hex})`
          : b.cor_predominante.nome || b.cor_predominante.hex
      }`,
    `Posição do título: ${b.posicao_titulo}`,
    b.descricao_livre &&
      `Descrição do autor (usar apenas cena/assunto/atmosfera; os campos acima prevalecem): ${b.descricao_livre}`,
    b.referencias_texto && `Capas de referência citadas: ${b.referencias_texto}`,
    b.evitar && `Evitar: ${b.evitar}`,
    b.verso?.descricao && `Descrição do verso: ${b.verso.descricao}`,
    ...heredityBlock,
    versoInstruction && "",
    versoInstruction,
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

  const promptFinal = `${promptImagem}${SUFIXO_TECNICO_IMAGEM(args.alvo, b.posicao_titulo)}`;
  return { prompt_imagem: promptFinal, frase_confirmacao: frase, negative_hints: hints };
}

/**
 * Saldo de imagens de capa IA por projeto (B2-05b, regra canônica B2-05k).
 *
 * REGRA CANÔNICA DO CONSUMO (substitui a fórmula de excedente do 05b):
 * - Cada geração bem-sucedida consome de UMA origem decidida ANTES de gerar
 *   e gravada na rodada como `metadata.origem_consumo`: "incluso" | "pool".
 * - INCLUSO: frente/verso consomem 1 da própria partição; ÚNICA exige as DUAS
 *   partições com sobra e consome 1 de CADA (2 no total — é a capa inteira).
 * - POOL (comprado): TODA geração consome exatamente 1 — frente, verso OU
 *   ÚNICA (decisão de negócio: custo real é 1 imagem = 10 créditos). Única
 *   que não cabe integralmente no incluso vai INTEIRA para o pool (1), sem
 *   tocar nas partições.
 * - CONTAGEM DO POOL: `pool = imagens_compradas − rodadas com origem="pool"`.
 *   Nada de fórmula derivada por partição — a origem gravada é a verdade.
 *
 * Ledger: usage_logs — nada de tabela nova.
 *  - consumo: agent_name="gerar-capa", metadata.alvo, metadata.origem_consumo,
 *             metadata.opcoes_geradas
 *  - pool:    agent_name="creditos",   metadata.tipo="compra_imagens",
 *             metadata.imagens (quantidade adicionada ao pool)
 * Retrocompat: rodadas sem `origem_consumo` = "incluso" (todas as anteriores
 *   ao 05k eram inclusas — o pool era derivado pela fórmula agora extinta).
 * Retrocompat: logs pré-B2-05 (sem metadata.alvo) contam como "frente".
 * Fail-closed: qualquer erro de leitura → tratamos como esgotado.
 */
export interface SaldoImagensCapa {
  incluso: { frente: number; verso: number };
  consumido: { frente: number; verso: number; unica: number };
  poolComprado: number;
  poolConsumido: number;
  restanteFrente: number;
  restanteVerso: number;
  restantePool: number;
  disponivel(alvo: AlvoCapa): boolean;
  origemProximoConsumo(alvo: AlvoCapa): "incluso" | "pool" | "nenhum";
}

interface UsageLogRow {
  agent_name: string;
  metadata: Record<string, unknown> | null;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export async function saldoImagensCapa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  projectId: string,
  plano: unknown,
): Promise<SaldoImagensCapa> {
  const planoNorm: Plano = isPlano(plano) ? plano : "freemium";
  const incluso = SALDO_IMAGENS_CAPA[planoNorm];

  // Consumo INCLUSO por partição (regra canônica 05k): frente/verso incluso
  // debitam a própria partição; unica incluso debita 1 de CADA. Rodadas com
  // origem="pool" NÃO tocam nas partições, vão inteiras para o poolConsumido.
  const inclusoConsumido = { frente: 0, verso: 0 };
  // Consumo por alvo (para telemetria/depuração — inclui pool e incluso).
  const consumido = { frente: 0, verso: 0, unica: 0 };
  let poolComprado = 0;
  let poolConsumido = 0;
  let failClosed = false;

  const { data, error } = await admin
    .from("usage_logs")
    .select("agent_name, metadata")
    .eq("project_id", projectId)
    .in("agent_name", ["gerar-capa", "creditos"]);

  if (error) {
    console.error("[capa-briefing] saldoImagensCapa leitura falhou:", error.message);
    failClosed = true;
  } else {
    for (const row of (data ?? []) as UsageLogRow[]) {
      const meta = row.metadata ?? {};
      if (row.agent_name === "gerar-capa") {
        const alvoRaw = typeof meta.alvo === "string" ? meta.alvo : "frente";
        const opcoes = num(meta.opcoes_geradas, 0);
        if (opcoes <= 0) continue;
        // Retrocompat: rodadas pré-05k sem `origem_consumo` = "incluso".
        // Pré-05k não havia rodada pool — o pool era derivado por fórmula
        // (agora extinta), então tudo era incluso na prática.
        const origem: "incluso" | "pool" =
          meta.origem_consumo === "pool" ? "pool" : "incluso";

        if (alvoRaw === "verso") consumido.verso += opcoes;
        else if (alvoRaw === "unica") consumido.unica += opcoes;
        else consumido.frente += opcoes;

        if (origem === "pool") {
          // Cada rodada pool consome exatamente 1 (frente, verso OU única).
          poolConsumido += opcoes;
        } else {
          // Incluso: única debita ambas as partições; frente/verso a própria.
          if (alvoRaw === "unica") {
            inclusoConsumido.frente += opcoes;
            inclusoConsumido.verso += opcoes;
          } else if (alvoRaw === "verso") {
            inclusoConsumido.verso += opcoes;
          } else {
            inclusoConsumido.frente += opcoes;
          }
        }
      } else if (row.agent_name === "creditos") {
        if (meta.tipo === "compra_imagens" && meta.ok === true) {
          poolComprado += num(meta.imagens, 0);
        }
      }
    }
  }

  const restanteFrente = failClosed ? 0 : Math.max(0, incluso.frente - inclusoConsumido.frente);
  const restanteVerso = failClosed ? 0 : Math.max(0, incluso.verso - inclusoConsumido.verso);
  const restantePool = failClosed ? 0 : Math.max(0, poolComprado - poolConsumido);

  function origemProximoConsumo(alvo: AlvoCapa): "incluso" | "pool" | "nenhum" {
    if (failClosed) return "nenhum";
    if (alvo === "frente") {
      if (restanteFrente > 0) return "incluso";
      if (restantePool > 0) return "pool";
      return "nenhum";
    }
    if (alvo === "verso") {
      if (restanteVerso > 0) return "incluso";
      if (restantePool > 0) return "pool";
      return "nenhum";
    }
    // Única: exige AMBAS as partições com sobra para "incluso"; senão pool
    // (1 crédito de imagem cobre a única inteira). Sem pool → nenhum.
    if (restanteFrente > 0 && restanteVerso > 0) return "incluso";
    if (restantePool > 0) return "pool";
    return "nenhum";
  }

  function disponivel(alvo: AlvoCapa): boolean {
    return origemProximoConsumo(alvo) !== "nenhum";
  }

  return {
    incluso,
    consumido,
    poolComprado,
    poolConsumido,
    restanteFrente,
    restanteVerso,
    restantePool,
    disponivel,
    origemProximoConsumo,
  };
}

// Reexport para as rotas que precisam do saldo na resposta.
export { getSaldoCreditos };

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText, traceClaudeCall } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";
import {
  FORMATOS_LIVRO,
  estimarLombadaMm,
  type FormatoLivro,
} from "@/lib/formatos";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FormatoSugerido {
  formato: FormatoLivro | null;        // null quando livre (poesia/teatro)
  label: string;                        // ex: "Padrão editorial · 16×23 cm" ou "ABNT (A4)"
  paginas_estimadas: number;
  lombada_mm: number;
  motivo: string;
  aviso?: string;
  cascata: Array<{
    formato: FormatoLivro;
    paginas: number;
    lombada_mm: number;
  }>;
}

export interface CanaisRecomendados {
  ebook: {
    recomendado: boolean;
    plataformas: string[];
    descricao: string;
  };
  fisico: {
    recomendado: boolean;
    descricao: string;
  };
  audiolivro: {
    recomendado: boolean;
    duracao_estimada_horas: number;
    descricao: string;
  };
}

export interface FaixaPrecoDetalhada {
  ebook: string;
  fisico: string;
  audiolivro: string;
}

export interface DiagnosticoResult {
  // Estrutura
  genero_provavel: string;
  confianca_genero: number;        // 0–100 %
  num_capitulos: number;
  num_palavras: number;
  paginas_estimadas: number;       // ~250 palavras/página

  // Análise editorial
  complexidade: "simples" | "médio" | "complexo";
  complexidade_flesch: number;     // índice Flesch adaptado ao PT 0–100
  tom_narrativo: string;           // ex: "Épico e melancólico"
  pontos_fortes: string[];         // exatamente 3 itens
  pontos_melhorar: string[];       // exatamente 3 itens

  // Mercado
  mercado_alvo: string;
  tamanho_mercado: "nicho" | "adequado" | "amplo";
  potencial_comercial: "baixo" | "médio" | "alto";
  faixa_preco_sugerida: string;   // ex: "R$29,90 – R$39,90"
  comparaveis_mercado: string[];  // 2–3 títulos/autores comparáveis

  // ─── Novos campos calculados em Node ────────────────────────────────────
  formato_sugerido: FormatoSugerido;
  tempo_leitura_horas: number;

  // ─── Novos campos gerados pela IA ───────────────────────────────────────
  canais_recomendados: CanaisRecomendados;
  faixa_preco_detalhada: FaixaPrecoDetalhada;

  // Próximos passos
  proximos_passos: string[];      // 3–5 ações editoriais prioritárias
}

// ─── Cálculo de formato sugerido ─────────────────────────────────────────────
// Cascata: 16×23 → 14×21 → 11×18, mínimo 192 pg, teto 400 pg em padrao_br.
// ABNT → A4 fixo (NBR 14724). Infantil → padrao_br + aviso. Poesia/teatro → sem sugestão.
// Caracteres COM espaços, fonte 11pt fixa.

const MIN_PAGINAS = 192;
const MAX_PAGINAS_PADRAO_BR = 400;
const WPM_LEITURA = 200;
const WPM_NARRACAO = 150;

function detectarCategoriaEspecial(generoLower: string): "abnt" | "infantil" | "poesia_teatro" | null {
  if (generoLower.includes("abnt") || generoLower.includes("acadêm") || generoLower.includes("dissert") || generoLower.includes("tese") || generoLower.includes("tcc")) {
    return "abnt";
  }
  if (generoLower.includes("infantil")) {
    return "infantil";
  }
  if (generoLower.includes("poesia") || generoLower.includes("poético") || generoLower.includes("teatro") || generoLower.includes("dramaturg") || generoLower.includes("peça")) {
    return "poesia_teatro";
  }
  return null;
}

function calcularSugestaoFormato(numPalavras: number, generoLower: string): FormatoSugerido {
  const categoria = detectarCategoriaEspecial(generoLower);

  // Cascata padrão para uso interno e exibição
  const formatosCascata: FormatoLivro[] = ["padrao_br", "compacto", "bolso"];
  const cascataDetalhada = formatosCascata.map(fmt => {
    const def = FORMATOS_LIVRO.find(f => f.value === fmt)!;
    const paginas = Math.max(1, Math.round(numPalavras / def.specs.wpp));
    return {
      formato: fmt,
      paginas,
      lombada_mm: estimarLombadaMm(paginas),
    };
  });

  if (categoria === "abnt") {
    const a4 = FORMATOS_LIVRO.find(f => f.value === "a4")!;
    const paginas = Math.max(1, Math.round(numPalavras / a4.specs.wpp));
    return {
      formato: "a4",
      label: "ABNT · A4 (21×29,7 cm)",
      paginas_estimadas: paginas,
      lombada_mm: estimarLombadaMm(paginas),
      motivo: "Trabalhos acadêmicos seguem a NBR 14724, que exige formato A4 com Times 12pt e margens 3-2-3-2 cm.",
      cascata: cascataDetalhada,
    };
  }

  if (categoria === "poesia_teatro") {
    return {
      formato: null,
      label: "Formato livre",
      paginas_estimadas: 0,
      lombada_mm: 0,
      motivo: "Poesia e teatro pedem decisões editoriais específicas (coluna estreita, preservação de estrofes, didascálias) que dependem do projeto gráfico. Escolha o formato manualmente na etapa de Elementos Editoriais.",
      aviso: "Sugestão automática não se aplica",
      cascata: cascataDetalhada,
    };
  }

  // Caso geral — cascata
  const padraoBr = cascataDetalhada[0];
  const compacto = cascataDetalhada[1];
  const bolso = cascataDetalhada[2];

  let escolhido = padraoBr;
  let aviso: string | undefined;

  if (padraoBr.paginas >= MIN_PAGINAS && padraoBr.paginas <= MAX_PAGINAS_PADRAO_BR) {
    escolhido = padraoBr;
  } else if (padraoBr.paginas > MAX_PAGINAS_PADRAO_BR) {
    escolhido = padraoBr;
    aviso = "Livro extenso (>400 páginas). Considere dividir em volumes ou aceitar uma lombada mais robusta.";
  } else if (compacto.paginas >= MIN_PAGINAS) {
    escolhido = compacto;
  } else if (bolso.paginas >= MIN_PAGINAS) {
    escolhido = bolso;
  } else {
    escolhido = bolso;
    aviso = "Livro curto. A lombada ficará fina (abaixo de 1 cm). Adequado para poesia ou ficção breve.";
  }

  const def = FORMATOS_LIVRO.find(f => f.value === escolhido.formato)!;

  if (categoria === "infantil") {
    aviso = "Considera apenas o texto. Ilustrações alteram significativamente a contagem de páginas.";
  }

  return {
    formato: escolhido.formato,
    label: `${def.label} · ${def.dimensoes}`,
    paginas_estimadas: escolhido.paginas,
    lombada_mm: escolhido.lombada_mm,
    motivo: `Seu manuscrito tem ${numPalavras.toLocaleString("pt-BR")} palavras, o que resulta em aproximadamente ${escolhido.paginas} páginas no formato ${def.dimensoes}.`,
    aviso,
    cascata: cascataDetalhada,
  };
}

function calcularTempoLeitura(numPalavras: number): number {
  const horas = numPalavras / (WPM_LEITURA * 60);
  return Math.round(horas * 2) / 2;
}

function calcularDuracaoAudio(numPalavras: number): number {
  const horas = numPalavras / (WPM_NARRACAO * 60);
  return Math.round(horas * 2) / 2;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const FALLBACK_PROMPT = `\
Você é um editor literário brasileiro sênior e analista de mercado editorial com 20 anos de experiência. \
Já avaliou mais de 5.000 manuscritos de todos os gêneros. Conhece profundamente o mercado leitor brasileiro, \
as convenções editoriais, os catálogos das principais editoras nacionais, as tendências de autopublicação \
e os dados de vendas das principais plataformas (Amazon KDP BR, Kobo, Apple Books, Google Play, Wattpad).

CONTEXTO DO MERCADO EDITORIAL BRASILEIRO (2024):
- Mercado total: R$6,6 bilhões com crescimento de +32,6% no segmento digital
- Gêneros mais vendidos (autopublicação BR): Romance (43%), Fantasia/FC (18%), Autoajuda (15%), \
  Suspense/Thriller (9%), Outros (15%)
- Faixa de preço eBook na Amazon BR: R$9,90–R$19,90 (massa popular), R$24,90–R$49,90 (nicho premium)
- Faixa de preço livro físico POD: R$29,90–R$59,90 (até 300 páginas), R$49,90–R$89,90 (300+ páginas)
- Plataformas leitores BR: Amazon Kindle, Skoob, Wattpad BR, TikTok literário (#BookTok BR)
- Autores de referência: Colleen Hoover (tradução fenômeno), Thalita Rebouças, Raphael Montes, \
  Santiago Nazarian, Lúcio Cardoso, Luiz Ruffato, Adriana Lins

ÍNDICE FLESCH ADAPTADO AO PORTUGUÊS:
- 75–100: Muito fácil — público infantil/teen, autoajuda popular
- 60–74: Fácil — romance de massa, suspense comercial, não-ficção popular
- 45–59: Médio — literatura adulta, ficção literária acessível
- 30–44: Difícil — ensaios, ficção literária densa, narrativas experimentais
- 0–29: Muito difícil — acadêmico, erudito

TAMANHO MÉDIO DE MANUSCRITOS POR GÊNERO:
- Romance massa/comercial: 80.000–100.000 palavras
- Romance literário: 70.000–90.000 palavras
- Fantasia/FC adulto: 90.000–120.000 palavras
- Novela: 20.000–50.000 palavras
- Autoajuda: 40.000–70.000 palavras
- Biografia/Memórias: 60.000–80.000 palavras

Sua tarefa é analisar o manuscrito fornecido e retornar EXCLUSIVAMENTE um objeto JSON válido. \
Não inclua markdown, explicações, comentários ou qualquer texto fora do JSON.

SCHEMA OBRIGATÓRIO:
{
  "genero_provavel": "gênero literário principal em PT-BR (ex: Romance Contemporâneo, Fantasia Épica, Autoajuda, Suspense Psicológico)",
  "confianca_genero": <inteiro 0–100 — % de certeza sobre o gênero identificado>,
  "num_capitulos": <inteiro — estimativa baseada na estrutura e extensão do texto>,
  "num_palavras": <inteiro — contagem das palavras fornecidas>,
  "paginas_estimadas": <inteiro — num_palavras ÷ 250 arredondado>,
  "complexidade": "simples" | "médio" | "complexo",
  "complexidade_flesch": <inteiro 0–100 — estimativa do índice Flesch adaptado ao PT>,
  "tom_narrativo": "descrição curta do tom/voz em 4–8 palavras (ex: Épico e melancólico, Leve e irônico)",
  "pontos_fortes": [
    "ponto forte 1 — específico, cite elemento concreto do texto",
    "ponto forte 2",
    "ponto forte 3"
  ],
  "pontos_melhorar": [
    "sugestão 1 — acionável e construtiva",
    "sugestão 2",
    "sugestão 3"
  ],
  "mercado_alvo": "parágrafo descrevendo o leitor-alvo brasileiro: faixa etária, perfil sociocultural, plataformas de consumo, hábitos de leitura",
  "tamanho_mercado": "nicho" | "adequado" | "amplo",
  "potencial_comercial": "baixo" | "médio" | "alto",
  "faixa_preco_sugerida": "faixa de preço recomendada considerando gênero e extensão (ex: R$29,90 – R$39,90)",
  "faixa_preco_detalhada": {
    "ebook": "faixa específica para eBook (geralmente 30-50% do físico, ex: R$14,90 – R$19,90)",
    "fisico": "faixa para livro físico via POD (ex: R$34,90 – R$49,90 para até 300 páginas)",
    "audiolivro": "faixa para audiolivro (geralmente próximo do eBook + premium pela narração, ex: R$24,90 – R$34,90)"
  },
  "canais_recomendados": {
    "ebook": {
      "recomendado": true,
      "plataformas": ["Amazon Kindle", "Apple Books", "Kobo", "Google Play Books"],
      "descricao": "1-2 frases sobre por que eBook funciona para este livro"
    },
    "fisico": {
      "recomendado": true | false,
      "descricao": "1-2 frases sobre adequação do POD físico para este livro"
    },
    "audiolivro": {
      "recomendado": true | false,
      "duracao_estimada_horas": 0,
      "descricao": "1-2 frases sobre adequação para audiolivro (gêneros como autoajuda, biografia, ficção contemporânea funcionam bem; livros muito técnicos ou ilustrados, não)"
    }
  },
  "comparaveis_mercado": [
    "Autor/Título comparável 1 — 1 frase explicando a semelhança",
    "Autor/Título comparável 2"
  ],
  "proximos_passos": [
    "ação editorial prioritária 1 — específica e acionável",
    "ação 2",
    "ação 3"
  ]
}

DIRETRIZES:
- Seja específico: cite elementos concretos do texto analisado, não generalizações.
- Use linguagem profissional mas acessível, em português brasileiro.
- pontos_fortes e pontos_melhorar devem ter exatamente 3 itens cada.
- comparaveis_mercado deve ter 2–3 itens, preferencialmente autores/obras conhecidos no BR.
- proximos_passos deve ter 3–5 itens ordenados por prioridade.
- Se o trecho for curto demais para análise precisa, indique confianca_genero baixa (≤50) e ajuste os outros campos.
- tamanho_mercado: "nicho" (público restrito/especializado), "adequado" (mercado médio com apelo claro), "amplo" (apelo de massa).`;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { texto: string; project_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { texto, project_id } = body;

  if (!texto || typeof texto !== "string" || texto.trim().length < 50) {
    return NextResponse.json(
      { error: "Campo 'texto' obrigatório (mínimo 50 caracteres)." },
      { status: 400 }
    );
  }
  if (!project_id || typeof project_id !== "string") {
    return NextResponse.json(
      { error: "Campo 'project_id' obrigatório." },
      { status: 400 }
    );
  }

  // Verify project ownership
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // Real word count + truncate to ~50k chars for cost control
  const numPalavras = texto.trim().split(/\s+/).filter(Boolean).length;
  const textoCortado =
    texto.length > 20_000
      ? texto.slice(0, 20_000) + "\n\n[...trecho truncado para análise]"
      : texto;

  const isMock = process.env.MOCK_AI === 'true';
  let diagnostico: DiagnosticoResult;

  if (isMock) {
    const generoLowerMock = "romance contemporâneo";
    const formatoMock = calcularSugestaoFormato(numPalavras, generoLowerMock);
    diagnostico = {
      genero_provavel: 'Romance Contemporâneo (MOCK)',
      confianca_genero: 85,
      num_capitulos: 12,
      num_palavras: numPalavras,
      paginas_estimadas: formatoMock.paginas_estimadas,
      complexidade: 'médio',
      complexidade_flesch: 62,
      tom_narrativo: 'Leve e envolvente (mock)',
      pontos_fortes: ['Narrativa fluida', 'Diálogos naturais', 'Personagens cativantes'],
      pontos_melhorar: ['Desenvolver conflito central', 'Aprofundar subtramas', 'Revisar ritmo final'],
      mercado_alvo: 'Leitores adultos brasileiros, 25-45 anos (resultado simulado)',
      tamanho_mercado: 'adequado',
      potencial_comercial: 'médio',
      faixa_preco_sugerida: 'R$29,90 – R$39,90',
      comparaveis_mercado: ['Thalita Rebouças — estilo acessível', 'Colleen Hoover — apelo emocional'],
      proximos_passos: ['Revisão editorial completa', 'Definir elementos editoriais', 'Criar capa profissional'],
      formato_sugerido: formatoMock,
      tempo_leitura_horas: calcularTempoLeitura(numPalavras),
      canais_recomendados: {
        ebook: { recomendado: true, plataformas: ["Amazon Kindle", "Apple Books", "Kobo"], descricao: "Romance contemporâneo funciona muito bem em eBook — leitura sequencial, alto engajamento mobile." },
        fisico: { recomendado: true, descricao: "Boa adequação para POD físico, especialmente como presente." },
        audiolivro: { recomendado: true, duracao_estimada_horas: calcularDuracaoAudio(numPalavras), descricao: "Narração natural funciona bem para romance — emoções dialogadas se destacam em áudio." },
      },
      faixa_preco_detalhada: {
        ebook: "R$14,90 – R$19,90",
        fisico: "R$34,90 – R$44,90",
        audiolivro: "R$24,90 – R$34,90",
      },
    };
  } else
  try {
    const SYSTEM_PROMPT = await getAgentPrompt("diagnostico", FALLBACK_PROMPT);
    const message = await traceClaudeCall({
      agentName: "diagnostico",
      projectId: project_id,
      userId: user.id,
      model: "claude-haiku-4-5-20251001",
      input: {
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Analise o seguinte manuscrito e retorne apenas o JSON:\n\n${textoCortado}` }],
      },
      fn: () => anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analise o seguinte manuscrito e retorne apenas o JSON:\n\n${textoCortado}`,
          },
        ],
      }),
    });

    diagnostico = parseLLMJson<DiagnosticoResult>(extractText(message.content));

    // Override com contagem real e cálculos determinísticos do backend
    diagnostico.num_palavras = numPalavras;

    const generoLower = (diagnostico.genero_provavel ?? "").toLowerCase();
    diagnostico.formato_sugerido = calcularSugestaoFormato(numPalavras, generoLower);
    diagnostico.paginas_estimadas = diagnostico.formato_sugerido.paginas_estimadas || Math.round(numPalavras / 250);
    diagnostico.tempo_leitura_horas = calcularTempoLeitura(numPalavras);

    // Sobrescreve duracao do audio com valor calculado
    if (diagnostico.canais_recomendados?.audiolivro) {
      diagnostico.canais_recomendados.audiolivro.duracao_estimada_horas = calcularDuracaoAudio(numPalavras);
    }

    const requiredFields: (keyof DiagnosticoResult)[] = [
      "genero_provavel", "confianca_genero", "num_capitulos", "num_palavras",
      "paginas_estimadas", "complexidade", "complexidade_flesch", "tom_narrativo",
      "pontos_fortes", "pontos_melhorar", "mercado_alvo", "tamanho_mercado",
      "potencial_comercial", "faixa_preco_sugerida", "comparaveis_mercado", "proximos_passos",
      // novos campos
      "faixa_preco_detalhada", "canais_recomendados",
    ];
    for (const campo of requiredFields) {
      if (diagnostico[campo] === undefined) {
        throw new Error(`Campo ausente na resposta da IA: ${campo}`);
      }
    }
  } catch (e: unknown) {
    console.error("[diagnostico] Erro Claude:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Erro ao processar diagnóstico: ${msg}` },
      { status: 502 }
    );
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ diagnostico, etapa_atual: "diagnostico" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[diagnostico] Erro ao salvar:", updateErr);
    return NextResponse.json(
      { error: "Diagnóstico gerado, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, diagnostico });
}

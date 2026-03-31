import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosticoFerramenta {
  genero_provavel: string;
  num_palavras: number;
  num_capitulos: number;
  complexidade: "simples" | "médio" | "complexo";
  mercado_alvo: string;
  pontos_fortes: string[];
  pontos_melhorar: string[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um editor literário brasileiro sênior com 20 anos de experiência.
Analise o trecho de manuscrito e retorne EXCLUSIVAMENTE um objeto JSON válido.

Schema:
{
  "genero_provavel": "gênero literário principal em português",
  "num_palavras": <contagem real das palavras>,
  "num_capitulos": <estimativa de capítulos>,
  "complexidade": "simples" | "médio" | "complexo",
  "mercado_alvo": "perfil do leitor-alvo brasileiro (faixa etária, plataformas etc.)",
  "pontos_fortes": ["ponto 1", "ponto 2", "ponto 3"],
  "pontos_melhorar": ["sugestão 1", "sugestão 2", "sugestão 3"]
}

Regras: exatamente 3 pontos_fortes e 3 pontos_melhorar. Português brasileiro. Sem markdown fora do JSON.`;

// ─── Dev mock ─────────────────────────────────────────────────────────────────

const MOCK: DiagnosticoFerramenta = {
  genero_provavel: "Romance contemporâneo",
  num_palavras: 847,
  num_capitulos: 12,
  complexidade: "médio",
  mercado_alvo: "Leitores de 25–40 anos, urbanos, que consomem ficção nacional na Amazon e Wattpad",
  pontos_fortes: [
    "Linguagem fluida e acessível ao leitor brasileiro",
    "Diálogos naturais que revelam personalidade dos personagens",
    "Ambientação urbana bem construída",
  ],
  pontos_melhorar: [
    "Desenvolver mais a motivação do protagonista no início",
    "Reduzir repetições de palavras como 'então' e 'que'",
    "Adicionar elementos sensoriais para maior imersão",
  ],
};

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 1200));
    return NextResponse.json(MOCK);
  }

  let body: { texto: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { texto } = body;
  if (!texto?.trim()) {
    return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });
  }

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Manuscrito:\n\n${texto.slice(0, 10000)}` }],
    });

    const result = parseLLMJson<DiagnosticoFerramenta>(extractText(msg.content));
    return NextResponse.json(result);
  } catch (e) {
    console.error("[ferramenta/diagnostico] Erro Claude:", e);
    return NextResponse.json(
      { error: "Erro ao processar o diagnóstico com IA. Tente novamente." },
      { status: 502 }
    );
  }
}

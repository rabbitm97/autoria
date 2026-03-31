import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SugestaoRevisor {
  id: string;
  tipo: "gramatica" | "ortografia" | "estilo" | "coesao" | "clareza";
  trecho_original: string;
  sugestao: string;
  explicacao: string;
}

// ─── Claude ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `\
Você é um revisor literário brasileiro especializado.
Revise o trecho e retorne EXCLUSIVAMENTE um array JSON de sugestões.

Schema de cada item:
{
  "id": "r001",
  "tipo": "gramatica" | "ortografia" | "estilo" | "coesao" | "clareza",
  "trecho_original": "<trecho exato do texto, máx 150 chars>",
  "sugestao": "<trecho corrigido>",
  "explicacao": "<explicação didática em 1-2 frases>"
}

Retorne entre 5 e 20 sugestões. Preserve a voz do autor. Sem markdown fora do JSON.`;

// ─── Dev mock ─────────────────────────────────────────────────────────────────

const MOCK: SugestaoRevisor[] = [
  { id: "r001", tipo: "ortografia",  trecho_original: "então ele disse que ia embora",  sugestao: "então ele disse que iria embora",       explicacao: "O futuro do pretérito 'iria' é mais adequado em narrativa formal." },
  { id: "r002", tipo: "estilo",      trecho_original: "muito muito cansado",              sugestao: "exausto",                               explicacao: "Evite duplicação de advérbios de intensidade; use um único adjetivo forte." },
  { id: "r003", tipo: "coesao",      trecho_original: "E depois. E então saíram.",        sugestao: "Então saíram juntos.",                  explicacao: "Frases iniciadas com conjunção aditiva consecutiva fragmentam o ritmo." },
  { id: "r004", tipo: "gramatica",   trecho_original: "ela veio junto comigo",            sugestao: "ela veio comigo",                       explicacao: "'Junto comigo' é redundante; 'comigo' já indica companhia." },
  { id: "r005", tipo: "clareza",     trecho_original: "o fato de que ele não foi",        sugestao: "o fato de ele não ter ido",             explicacao: "A construção 'o fato de que' é mais elegante sem a conjunção 'que'." },
  { id: "r006", tipo: "estilo",      trecho_original: "disse ele",                        sugestao: "ele murmurou",                         explicacao: "Variar os verbos de elocução cria ritmo e nuance na narrativa." },
];

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    await new Promise((r) => setTimeout(r, 1500));
    return NextResponse.json(MOCK);
  }

  let body: { texto: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body inválido" }, { status: 400 }); }

  const { texto } = body;
  if (!texto?.trim()) return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Texto para revisão:\n\n${texto.slice(0, 8000)}` }],
  });

  const raw = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  const json = raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
  return NextResponse.json(JSON.parse(json));
}

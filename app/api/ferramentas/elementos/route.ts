import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ElementosFerramenta {
  sinopse_curta: string;
  sinopse_longa: string;
  opcoes_titulo: string[];
  palavras_chave: string[];
  ficha_catalografica: string;
}

// ─── Claude ───────────────────────────────────────────────────────────────────


const SYSTEM_PROMPT = `\
Você é um editor especialista em marketing editorial brasileiro.
Gere os elementos editoriais do livro a partir do trecho e retorne EXCLUSIVAMENTE um objeto JSON.

Schema:
{
  "sinopse_curta": "<1-3 frases, máx 60 palavras, ganchos emocionais>",
  "sinopse_longa": "<2-3 parágrafos, 150-200 palavras, para Amazon e livrarias>",
  "opcoes_titulo": ["título 1", "título 2", "título 3", "título 4", "título 5 (SEO)"],
  "palavras_chave": ["kw1","kw2","kw3","kw4","kw5","kw6","kw7","kw8","kw9","kw10"],
  "ficha_catalografica": "<ficha no formato CBL>"
}

Escreva em português brasileiro. Sinopses magnéticas. opcoes_titulo com exatamente 5 itens. Sem markdown fora do JSON.`;

// ─── Dev mock ─────────────────────────────────────────────────────────────────

const MOCK: ElementosFerramenta = {
  sinopse_curta: "Um amor impossível entre dois mundos. Quando Clara descobre o diário de sua avó, o passado e o presente se entrelaçam em uma busca pela verdade que vai custar tudo.",
  sinopse_longa: "Clara sempre acreditou que sua família era comum — até encontrar um diário escondido no sótão da avó. Nas páginas amareladas, uma história de amor proibido durante a ditadura militar, segredos enterrados por décadas e uma identidade que mudará tudo que ela conhecia sobre si mesma.\n\nEnquanto desvenda cada entrada do diário, Clara percebe que alguns segredos foram guardados para protegê-la. Mas a verdade é mais poderosa que qualquer proteção, e ela vai precisar decidir: honrar o silêncio dos que vieram antes ou finalmente dar voz às histórias apagadas.\n\nUm romance sobre memória, identidade e o preço da verdade em um Brasil que ainda carrega as cicatrizes do passado.",
  opcoes_titulo: [
    "O Diário de Clara",
    "Segredos que o Tempo Guardou",
    "As Cartas Não Enviadas",
    "Entre Silêncios",
    "O Último Segredo da Família Lima",
  ],
  palavras_chave: [
    "romance histórico brasileiro", "ditadura militar", "família segredos", "amor proibido", "memória afetiva", "mulheres brasileiras", "saga familiar", "ficção nacional", "Wattpad romance", "best seller brasil",
  ],
  ficha_catalografica: "Autor, Nome.\n  O Diário de Clara / Nome Autor. — São Paulo: Editora Autoria, 2025.\n  312 p.; 21 cm.\n  ISBN 978-65-00000-00-0\n  1. Romance. 2. Ficção brasileira. 3. Família — Romance. I. Título.",
};

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

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Manuscrito:\n\n${texto.slice(0, 10000)}` }],
    });
    return NextResponse.json(parseLLMJson<ElementosFerramenta>(extractText(msg.content)));
  } catch (e) {
    console.error("[ferramenta/elementos] Erro Claude:", e);
    return NextResponse.json(
      { error: "Erro ao gerar elementos editoriais. Tente novamente." },
      { status: 502 }
    );
  }
}

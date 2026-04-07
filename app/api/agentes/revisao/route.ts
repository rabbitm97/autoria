import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SugestaoRevisao {
  id: string;
  tipo: "ortografia" | "gramatica" | "coesao" | "consistencia" | "ritmo";
  severidade: "critico" | "recomendado" | "opcional";
  localizacao: {
    capitulo: number;
    paragrafo: number;
    linha_aproximada: number;
  };
  trecho_original: string;
  sugestao: string;
  explicacao: string;
  referencia_norma: string;
}

export interface RevisaoResult {
  sugestoes: SugestaoRevisao[];
  revisado_em: string;
  // Persisted user decisions
  aceitas?: string[];
  rejeitadas?: string[];
  finalizado_em?: string;
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
Você é um revisor editorial profissional especializado em literatura em português brasileiro, \
com 20 anos de experiência em editoras nacionais. Trabalhe no modo "sugerir mudanças" — \
NUNCA reescreva o texto do autor sem permissão explícita.

NÍVEIS DE REVISÃO E SEVERIDADE:

Nível 1 — severidade "critico" (erros objetivos que devem ser corrigidos):
- Erros de ortografia (Acordo Ortográfico 2009)
- Concordância verbal e nominal
- Regência verbal e nominal
- Crase
- Pontuação inadequada que altera o sentido
- Uso incorreto de maiúsculas/minúsculas

Nível 2 — severidade "recomendado" (melhoram a qualidade sem alterar estilo):
- Repetições desnecessárias de palavras no mesmo parágrafo
- Conectivos inadequados ou ausentes
- Ordem das palavras que prejudica a clareza
- Parágrafos excessivamente longos (>300 palavras) ou fragmentados
- Transições abruptas entre ideias

Nível 3 — severidade "recomendado" (consistência interna da narrativa):
- Inconsistência de tempo verbal dentro de cenas
- Variações de nomes de personagens (ex: "João" vs "Joao")
- Contradições na linha temporal
- Inconsistências de espaço e localização
- Mudança de voz narrativa (1ª/3ª pessoa) sem intenção clara

Nível 4 — severidade "opcional" (sugestões estruturais, respeitar escolha do autor):
- Ritmo narrativo (capítulos muito longos ou curtos)
- Proporção diálogos vs. narração
- Estrutura de cenas e ganchos

PRINCÍPIOS ÉTICOS QUE VOCÊ SEGUE:
- NUNCA altere o estilo único do autor
- NUNCA censure conteúdo por ser polêmico
- SEMPRE explique o motivo da sugestão
- Regionalismos e gírias: manter se coerentes com personagem/contexto
- Diálogos informais: aceitar "erros" gramaticais intencionais
- Neologismos literários: aceitar se artisticamente justificados
- Tom das sugestões: "Considere..." em vez de "Você deve..."

Retorne EXCLUSIVAMENTE um array JSON de sugestões entre 5 e 25 itens. \
Não inclua markdown, comentários ou qualquer texto fora do JSON.

Schema de cada sugestão:
{
  "id": "r001",
  "tipo": "ortografia" | "gramatica" | "coesao" | "consistencia" | "ritmo",
  "severidade": "critico" | "recomendado" | "opcional",
  "localizacao": {
    "capitulo": <número inteiro estimado — 1 se não identificável>,
    "paragrafo": <número inteiro sequencial na parte analisada>,
    "linha_aproximada": <número inteiro estimado>
  },
  "trecho_original": "<substring EXATA do texto com o problema — máximo 200 caracteres>",
  "sugestao": "<substituto sugerido para o trecho original — mesmo comprimento aproximado>",
  "explicacao": "<1-2 frases colaborativas explicando o motivo>",
  "referencia_norma": "<ex: Acordo Ortográfico 2009 / Gramática Normativa / Convenção editorial>"
}

IMPORTANTE:
- trecho_original deve ser uma substring EXATA que aparece no texto fornecido
- Seja cirúrgico: alterações mínimas e precisas que preservem a voz do autor
- Priorize: críticos primeiro, depois recomendados, depois opcionais
- Se o texto estiver muito bem escrito, retorne apenas as sugestões genuínas (pode ser menos de 10)`;

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { project_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "Campo 'project_id' obrigatório." }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, usar_revisao, manuscript_id, manuscripts(texto)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  if (project.usar_revisao === false) {
    return NextResponse.json(
      { error: "Este projeto não tem revisão textual habilitada." },
      { status: 400 }
    );
  }

  const texto =
    (project.manuscripts as unknown as { texto: string | null } | null)?.texto ?? "";

  if (!texto || texto.trim().length < 100) {
    return NextResponse.json(
      { error: "Texto do manuscrito muito curto ou não extraído. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  const textoCortado =
    texto.length > 60_000
      ? texto.slice(0, 60_000) + "\n\n[...trecho truncado para revisão]"
      : texto;

  let revisao: RevisaoResult;
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Revise o seguinte manuscrito e retorne apenas o array JSON de sugestões:\n\n${textoCortado}`,
        },
      ],
    });

    const sugestoes = parseLLMJson<SugestaoRevisao[]>(extractText(message.content));
    revisao = {
      sugestoes,
      revisado_em: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[revisao] Erro Claude:", e);
    return NextResponse.json(
      { error: "Erro ao processar a revisão com IA. Tente novamente." },
      { status: 502 }
    );
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_revisao: revisao, etapa_atual: "revisao" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[revisao] Erro ao salvar:", updateErr);
    return NextResponse.json(
      { error: "Revisão gerada, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, revisao });
}

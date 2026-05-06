export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, extractText, traceClaudeCall } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  project_id: string | null;
  pergunta: string;
  resposta_ia: string | null;
  resolvido: boolean;
  criado_em: string;
}

// ─── Knowledge base ───────────────────────────────────────────────────────────

const FALLBACK_KNOWLEDGE_BASE = `
Você é o assistente de suporte N1 da Autoria — plataforma de publicação de livros com IA.
Responda em português, de forma clara, direta e amigável. Máximo de 3 parágrafos.
Se não souber a resposta com certeza, oriente o autor a entrar em contato pelo e-mail oi@autoria.app.
Se a pergunta foge do escopo da Autoria, responda educadamente: "Essa pergunta foge do escopo do nosso suporte. Posso ajudar com algo sobre seu projeto na plataforma?" e ofereça caminho alternativo.

## O que é a Autoria?
Plataforma SaaS que transforma manuscritos em livros publicados usando IA. O fluxo é:
Upload do manuscrito → Diagnóstico → Revisão → Elementos editoriais → Capa → Diagramação (PDF + EPUB) → QA → Publicação.

## Formatos aceitos para upload
.docx (Word), .pdf e .txt. Tamanho máximo: 50MB.

## Quanto tempo leva cada etapa?
- Upload e parse: até 30 segundos
- Diagnóstico (IA): 15–30 segundos
- Revisão (IA): 30–60 segundos dependendo do tamanho
- Geração de capa: 20–40 segundos por opção
- Geração de PDF: 10–20 segundos
- Geração de EPUB: 5–10 segundos
- Audiolivro por capítulo (ElevenLabs): 10–30 segundos

## Planos disponíveis
- Essencial (R$197): revisão com IA + 3 sinopses + ficha catalográfica + capa por IA (3 opções) + diagramação EPUB + publicação em 15+ plataformas + painel de royalties.
- Completo (R$397) — MAIS POPULAR: tudo do Essencial + PDF para impressão + capa completa (frente, contracapa, lombada e orelhas) + audiolivro com voz neural + ISBN + POD no Brasil.
- Pro (R$697): tudo do Completo + clonagem de voz do autor + tradução para 1 idioma + marketing kit IA + suporte prioritário com SLA de 4h úteis.

## Publicação e distribuição
Os livros são distribuídos via Draft2Digital para Amazon KDP, Apple Books, Kobo, Barnes & Noble e Google Play Books.
O processo de publicação leva 24–72 horas para aprovação das plataformas.

## Royalties
A Autoria retém 10% sobre cada venda de eBook ou audiolivro nas plataformas digitais. O autor recebe 90% — o melhor split do mercado brasileiro. ISBN, direitos autorais e propriedade da obra permanecem 100% com o autor. Os pagamentos são processados mensalmente via PIX. Para vendas de livro físico via POD, a Autoria retém 10-15% sobre o custo de impressão (margem da gráfica parceira); o autor define o preço de capa e recebe a margem restante.

## Comissão sobre vendas
A Autoria retém 10% sobre cada venda digital (eBook ou audiolivro). O autor fica com 90%. Esse é o melhor split do mercado brasileiro. Não há cobrança recorrente após a publicação — o autor paga uma vez pela esteira de produção e a comissão de 10% só se aplica quando há venda.

## Audiolivro
Gerado com ElevenLabs eleven_multilingual_v2. Plano gratuito ElevenLabs: 10K caracteres/mês (~2 capítulos curtos). Plano Creator: 100K/mês.
Os arquivos MP3 ficam disponíveis por 1 hora via link assinado. Para download permanente, acesse a página de audiolivro.

## Créditos
Cada plano B2C inclui o livro completo sem cobrança extra de créditos. Créditos avulsos são para serviços adicionais opcionais: regenerar capa custa 20 créditos, regenerar revisão completa custa 60 créditos, gerar audiolivro de capítulo extra custa 8 créditos por capítulo. Pacotes: 500 créditos por R$79; 2000 créditos por R$249. Para clientes B2B (Suite Editorial), os planos Starter/Pro/Enterprise incluem cota mensal de créditos (500/1500/3500) com possibilidade de compra avulsa nas mesmas condições.

## Problemas comuns
- "Manuscrito sem texto": execute o parse novamente ou verifique se o arquivo não está protegido por senha.
- "Capa não gerada": verifique se a GOOGLE_AI_API_KEY está configurada no Vercel.
- "Erro no upload de arquivo": verifique se o bucket do Supabase Storage está criado com as policies corretas.
- "Link expirado": links de download expiram em 1 hora. Acesse a página de diagramação ou audiolivro para regenerar.
- "PDF com formatação incorreta": verifique se o manuscrito usa marcações claras de capítulo (ex: "CAPÍTULO 1" em maiúsculas).

## ISBN e ficha catalográfica
A Autoria gera uma ficha catalográfica sugerida, mas o ISBN oficial deve ser obtido junto à Biblioteca Nacional (www.bn.gov.br) — gratuito para autores brasileiros.

## Contato humano
Para questões não resolvidas: oi@autoria.app. SLA: 24h úteis (plano Pro: 4h úteis).
`.trim();

// ─── POST /api/agentes/suporte ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (isDev) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    userId = user.id;
  }

  let body: { pergunta: string; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { pergunta, project_id = null } = body;
  if (!pergunta?.trim()) {
    return NextResponse.json({ error: "pergunta é obrigatória" }, { status: 400 });
  }

  // Load project context if provided
  let contextoProj = "";
  if (project_id && !isDev) {
    const { data } = await supabase
      .from("projects")
      .select("etapa_atual, dados_diagnostico, manuscript:manuscript_id(nome)")
      .eq("id", project_id)
      .single();

    if (data) {
      const ms = data.manuscript as { nome?: string } | null;
      contextoProj = `\nContexto do projeto atual: título "${ms?.nome ?? "N/A"}", etapa atual: "${data.etapa_atual}".`;
    }
  }

  const KNOWLEDGE_BASE = await getAgentPrompt("suporte", FALLBACK_KNOWLEDGE_BASE);
  const res = await traceClaudeCall({
    agentName: "suporte",
    projectId: project_id ?? undefined,
    userId: isDev ? undefined : userId,
    metadata: { model: "claude-sonnet-4-6" },
    fn: () => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: KNOWLEDGE_BASE + contextoProj,
      messages: [{ role: "user", content: pergunta }],
    }),
  });

  const resposta = extractText(res.content).trim();

  let ticketId: string | null = null;
  if (!isDev) {
    const { data } = await supabase
      .from("tickets")
      .insert({ user_id: userId, project_id, pergunta, resposta_ia: resposta })
      .select("id")
      .single();
    ticketId = data?.id ?? null;
  } else {
    ticketId = "dev-ticket-" + Date.now();
  }

  return NextResponse.json({ resposta, ticket_id: ticketId });
}

// ─── PATCH /api/agentes/suporte?id=... ───────────────────────────────────────

export async function PATCH(req: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({ ok: true });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await supabase.from("tickets").update({ resolvido: true }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

// ─── GET /api/agentes/suporte ─────────────────────────────────────────────────

export async function GET() {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.json([
      { id: "d1", project_id: null, pergunta: "Como faço para gerar o EPUB?", resposta_ia: "Para gerar o EPUB, acesse a página de Diagramação do seu projeto e clique em 'Gerar EPUB' após gerar o PDF.", resolvido: true,  criado_em: new Date(Date.now() - 86400000).toISOString() },
      { id: "d2", project_id: null, pergunta: "Quanto tempo demora a publicação na Amazon?", resposta_ia: "Após o envio, a Amazon leva entre 24 e 72 horas para revisar e publicar seu livro.", resolvido: false, criado_em: new Date(Date.now() - 3600000).toISOString() },
    ] satisfies Ticket[]);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", user.id)
    .order("criado_em", { ascending: false })
    .limit(50);

  return NextResponse.json(data ?? []);
}

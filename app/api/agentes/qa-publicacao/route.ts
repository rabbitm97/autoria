export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, extractText, traceClaudeCall } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlataformaAlvo =
  | "amazon_kdp_ebook"
  | "amazon_kdp_print"
  | "kobo"
  | "apple_books"
  | "google_play"
  | "spotify_audiobooks"
  | "draft2digital";

export type QAStatus = "ok" | "aviso" | "erro";

export interface QAChecagem {
  plataforma: PlataformaAlvo | "geral";
  status: QAStatus;
  campo: string;
  mensagem: string;
}

export interface QAPublicacaoResult {
  project_id: string;
  score: number;
  aprovado: boolean;
  checagens: QAChecagem[];
  recomendacao: string;
  bloqueantes: string[];
  analisado_em: string;
}

// ─── Requisitos por plataforma ────────────────────────────────────────────────
// Baseados nas guidelines oficiais de cada plataforma (2024/2025)

interface RequisitosArquivo {
  titulo: string;
  subtitulo?: string;
  autor: string;
  sinopse_curta: string;
  sinopse_longa: string;
  palavras_chave: string[];
  genero: string;
  idioma: string;
  paginas?: number;
  tem_isbn?: boolean;
  tem_miolo_pdf?: boolean;
  tem_capa_pdf?: boolean;
  tem_epub?: boolean;
  resolucao_capa?: number; // px largura
  tem_audiolivro?: boolean;
}

// ─── POST /api/agentes/qa-publicacao ─────────────────────────────────────────
// Body: { project_id, plataformas?, dados }

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

  let body: {
    project_id: string;
    plataformas?: PlataformaAlvo[];
    dados?: Partial<RequisitosArquivo>;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  const plataformas: PlataformaAlvo[] = body.plataformas ?? [
    "amazon_kdp_ebook", "amazon_kdp_print", "kobo", "apple_books", "google_play",
  ];

  // ── Carregar dados do projeto ─────────────────────────────────────────────
  let dados: RequisitosArquivo;

  if (isDev) {
    dados = {
      titulo: "O Último Horizonte",
      autor: "Carlos Silva",
      sinopse_curta: "Uma jornada épica de superação.",
      sinopse_longa: "Um protagonista enfrenta desafios extraordinários numa saga de descoberta e coragem que atravessa continentes e décadas.",
      palavras_chave: ["ficção", "aventura", "superação", "jornada", "épico", "Brasil", "literatura"],
      genero: "Ficção Contemporânea",
      idioma: "pt-BR",
      paginas: 280,
      tem_isbn: true,
      tem_miolo_pdf: true,
      tem_capa_pdf: true,
      tem_epub: true,
      resolucao_capa: 2560,
    };
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select(`
        dados_elementos,
        dados_capa,
        dados_pdf,
        dados_epub,
        usar_revisao,
        manuscript:manuscript_id(titulo, subtitulo, genero_principal, autor_primeiro_nome, autor_sobrenome, idioma)
      `)
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

    const el = project.dados_elementos as Record<string, unknown> | null;
    const ms = (Array.isArray(project.manuscript) ? project.manuscript[0] : project.manuscript) as Record<string, unknown> | null;

    dados = {
      ...((body.dados ?? {}) as Partial<RequisitosArquivo>),
      titulo:          ((el?.titulo_escolhido ?? ms?.titulo) as string) ?? "",
      subtitulo:       (ms?.subtitulo as string) ?? undefined,
      autor:           [`${ms?.autor_primeiro_nome ?? ""}`, `${ms?.autor_sobrenome ?? ""}`].filter(Boolean).join(" "),
      sinopse_curta:   (el?.sinopse_curta as string) ?? "",
      sinopse_longa:   (el?.sinopse_longa as string) ?? "",
      palavras_chave:  (el?.palavras_chave as string[]) ?? [],
      genero:          (ms?.genero_principal as string) ?? "",
      idioma:          (ms?.idioma as string) ?? "pt-BR",
      tem_isbn:        !!(el?.isbn as string),
      tem_miolo_pdf:   !!(project.dados_pdf as Record<string, unknown> | null)?.storage_path,
      tem_capa_pdf:    !!(project.dados_capa as Record<string, unknown> | null)?.url_escolhida,
      tem_epub:        !!(project.dados_epub as Record<string, unknown> | null)?.storage_path,
    };
  }

  // ── Checagens ─────────────────────────────────────────────────────────────
  const checagens: QAChecagem[] = [];

  // ── Checagens gerais (todas as plataformas) ──────────────────────────────

  // Título
  if (!dados.titulo?.trim()) {
    checagens.push({ plataforma: "geral", status: "erro", campo: "título", mensagem: "Título obrigatório — não pode ser publicado sem título." });
  } else if (dados.titulo.length > 200) {
    checagens.push({ plataforma: "geral", status: "aviso", campo: "título", mensagem: "Título muito longo (>200 caracteres). Considere encurtar." });
  } else {
    checagens.push({ plataforma: "geral", status: "ok", campo: "título", mensagem: `Título presente: "${dados.titulo}"` });
  }

  // Autor
  if (!dados.autor?.trim()) {
    checagens.push({ plataforma: "geral", status: "erro", campo: "autor", mensagem: "Nome do autor obrigatório em todas as plataformas." });
  } else {
    checagens.push({ plataforma: "geral", status: "ok", campo: "autor", mensagem: `Autor: ${dados.autor}` });
  }

  // Sinopse curta
  if (!dados.sinopse_curta?.trim()) {
    checagens.push({ plataforma: "geral", status: "erro", campo: "sinopse_curta", mensagem: "Sinopse curta obrigatória — usada como blurb em todas as plataformas." });
  } else if (dados.sinopse_curta.length < 50) {
    checagens.push({ plataforma: "geral", status: "aviso", campo: "sinopse_curta", mensagem: "Sinopse curta muito breve (<50 caracteres). Plataformas recomendam 150–400 caracteres." });
  } else {
    checagens.push({ plataforma: "geral", status: "ok", campo: "sinopse_curta", mensagem: `Sinopse curta: ${dados.sinopse_curta.length} caracteres.` });
  }

  // Sinopse longa
  if (!dados.sinopse_longa?.trim()) {
    checagens.push({ plataforma: "geral", status: "aviso", campo: "sinopse_longa", mensagem: "Sinopse longa ausente. Recomendada para melhor conversão nas páginas de produto." });
  } else if (dados.sinopse_longa.length < 300) {
    checagens.push({ plataforma: "geral", status: "aviso", campo: "sinopse_longa", mensagem: `Sinopse longa curta (${dados.sinopse_longa.length} char). Ideal: 600–4000 caracteres.` });
  } else {
    checagens.push({ plataforma: "geral", status: "ok", campo: "sinopse_longa", mensagem: "Sinopse longa adequada." });
  }

  // Palavras-chave
  const kwCount = dados.palavras_chave?.length ?? 0;
  if (kwCount < 3) {
    checagens.push({ plataforma: "geral", status: "aviso", campo: "palavras_chave", mensagem: `Apenas ${kwCount} palavra(s)-chave. Recomendado: 7 (máximo aceito pela maioria das plataformas).` });
  } else if (kwCount > 7) {
    checagens.push({ plataforma: "geral", status: "aviso", campo: "palavras_chave", mensagem: `${kwCount} palavras-chave. Amazon KDP e Kobo aceitam no máximo 7. Reduza para evitar rejeição.` });
  } else {
    checagens.push({ plataforma: "geral", status: "ok", campo: "palavras_chave", mensagem: `${kwCount} palavras-chave definidas — dentro do limite recomendado.` });
  }

  // Gênero
  if (!dados.genero?.trim()) {
    checagens.push({ plataforma: "geral", status: "erro", campo: "gênero", mensagem: "Gênero/categoria obrigatório em todas as plataformas." });
  } else {
    checagens.push({ plataforma: "geral", status: "ok", campo: "gênero", mensagem: `Gênero: ${dados.genero}` });
  }

  // ── Amazon KDP eBook ──────────────────────────────────────────────────────

  if (plataformas.includes("amazon_kdp_ebook")) {
    checagens.push(dados.tem_epub
      ? { plataforma: "amazon_kdp_ebook", status: "ok",   campo: "arquivo", mensagem: "EPUB presente. KDP aceita EPUB e DOCX para eBook." }
      : { plataforma: "amazon_kdp_ebook", status: "erro", campo: "arquivo", mensagem: "EPUB obrigatório para publicação no Kindle. Gere o EPUB antes de publicar." }
    );

    if (kwCount > 7) {
      checagens.push({ plataforma: "amazon_kdp_ebook", status: "erro", campo: "palavras_chave", mensagem: "Amazon KDP aceita no máximo 7 palavras-chave. Remova as excedentes." });
    }

    if (dados.sinopse_longa && dados.sinopse_longa.length > 4000) {
      checagens.push({ plataforma: "amazon_kdp_ebook", status: "erro", campo: "sinopse_longa", mensagem: "Amazon KDP limita a descrição a 4000 caracteres. Reduza a sinopse longa." });
    }

    checagens.push(dados.tem_isbn
      ? { plataforma: "amazon_kdp_ebook", status: "ok",   campo: "isbn", mensagem: "ISBN presente. Recomendado para distribuição ampla." }
      : { plataforma: "amazon_kdp_ebook", status: "aviso", campo: "isbn", mensagem: "ISBN ausente. KDP não exige ISBN para eBooks, mas é recomendado." }
    );
  }

  // ── Amazon KDP Print ──────────────────────────────────────────────────────

  if (plataformas.includes("amazon_kdp_print")) {
    checagens.push(dados.tem_miolo_pdf
      ? { plataforma: "amazon_kdp_print", status: "ok",   campo: "miolo_pdf", mensagem: "PDF de miolo presente." }
      : { plataforma: "amazon_kdp_print", status: "erro", campo: "miolo_pdf", mensagem: "PDF de miolo obrigatório para KDP Print. Faça a diagramação antes de publicar." }
    );

    checagens.push(dados.tem_capa_pdf
      ? { plataforma: "amazon_kdp_print", status: "ok",   campo: "capa_pdf", mensagem: "PDF de capa presente." }
      : { plataforma: "amazon_kdp_print", status: "erro", campo: "capa_pdf", mensagem: "PDF de capa (frente+lombada+contra) obrigatório para KDP Print." }
    );

    checagens.push(dados.tem_isbn
      ? { plataforma: "amazon_kdp_print", status: "ok",   campo: "isbn", mensagem: "ISBN presente — obrigatório para livros físicos." }
      : { plataforma: "amazon_kdp_print", status: "erro", campo: "isbn", mensagem: "ISBN obrigatório para publicação impressa no KDP." }
    );

    if (dados.paginas && dados.paginas < 24) {
      checagens.push({ plataforma: "amazon_kdp_print", status: "erro", campo: "páginas", mensagem: `Mínimo de 24 páginas para KDP Print. Seu livro tem ${dados.paginas} páginas.` });
    } else if (dados.paginas) {
      checagens.push({ plataforma: "amazon_kdp_print", status: "ok", campo: "páginas", mensagem: `${dados.paginas} páginas — dentro do limite KDP Print (24–828 páginas).` });
    }
  }

  // ── Kobo ──────────────────────────────────────────────────────────────────

  if (plataformas.includes("kobo")) {
    checagens.push(dados.tem_epub
      ? { plataforma: "kobo", status: "ok",   campo: "arquivo", mensagem: "EPUB presente. Kobo Writing Life aceita EPUB e DOCX." }
      : { plataforma: "kobo", status: "erro", campo: "arquivo", mensagem: "Kobo exige EPUB 3.0 para publicação." }
    );

    if ((dados.resolucao_capa ?? 0) < 1600) {
      checagens.push({ plataforma: "kobo", status: "aviso", campo: "capa_resolucao", mensagem: "Kobo recomenda capa mínima de 1600px de largura. Verifique a resolução." });
    } else if (dados.resolucao_capa) {
      checagens.push({ plataforma: "kobo", status: "ok", campo: "capa_resolucao", mensagem: `Resolução da capa ${dados.resolucao_capa}px — adequada para Kobo.` });
    }
  }

  // ── Apple Books ───────────────────────────────────────────────────────────

  if (plataformas.includes("apple_books")) {
    checagens.push(dados.tem_epub
      ? { plataforma: "apple_books", status: "ok",   campo: "arquivo", mensagem: "EPUB presente. Apple Books exige EPUB 3.0 válido." }
      : { plataforma: "apple_books", status: "erro", campo: "arquivo", mensagem: "Apple Books exige EPUB 3.0. Gere o EPUB antes de publicar." }
    );

    if ((dados.resolucao_capa ?? 0) < 1400) {
      checagens.push({ plataforma: "apple_books", status: "erro", campo: "capa_resolucao", mensagem: "Apple Books exige capa mínima de 1400px de largura." });
    } else if (dados.resolucao_capa) {
      checagens.push({ plataforma: "apple_books", status: "ok", campo: "capa_resolucao", mensagem: "Resolução da capa adequada para Apple Books." });
    }
  }

  // ── Google Play ───────────────────────────────────────────────────────────

  if (plataformas.includes("google_play")) {
    checagens.push(dados.tem_epub
      ? { plataforma: "google_play", status: "ok",   campo: "arquivo", mensagem: "EPUB presente. Google Play Books aceita EPUB e PDF." }
      : { plataforma: "google_play", status: "aviso", campo: "arquivo", mensagem: "Google Play aceita PDF, mas EPUB é preferido para melhor experiência de leitura." }
    );
  }

  // ── Spotify Audiobooks ────────────────────────────────────────────────────

  if (plataformas.includes("spotify_audiobooks")) {
    checagens.push(dados.tem_audiolivro
      ? { plataforma: "spotify_audiobooks", status: "ok",   campo: "audiolivro", mensagem: "Audiolivro presente. Spotify aceita MP3/M4B 192kbps mínimo." }
      : { plataforma: "spotify_audiobooks", status: "aviso", campo: "audiolivro", mensagem: "Audiolivro não gerado. Crie o audiolivro para distribuir no Spotify Audiobooks." }
    );

    checagens.push(dados.tem_isbn
      ? { plataforma: "spotify_audiobooks", status: "ok",   campo: "isbn", mensagem: "ISBN presente — necessário para Spotify Audiobooks." }
      : { plataforma: "spotify_audiobooks", status: "erro", campo: "isbn", mensagem: "Spotify Audiobooks exige ISBN para publicação. Obtenha o ISBN antes de publicar." }
    );
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const erros  = checagens.filter(c => c.status === "erro").length;
  const avisos = checagens.filter(c => c.status === "aviso").length;
  const score  = Math.max(0, Math.round(100 - erros * 15 - avisos * 5));
  const aprovado = score >= 75 && erros === 0;

  const bloqueantes = checagens
    .filter(c => c.status === "erro")
    .map(c => `[${c.plataforma}] ${c.campo}: ${c.mensagem}`);

  // ── Claude recommendation ─────────────────────────────────────────────────
  const resumo = checagens
    .map(c => `[${c.status.toUpperCase()}] ${c.plataforma} / ${c.campo}: ${c.mensagem}`)
    .join("\n");

  const claudeRes = await traceClaudeCall({
    agentName: "qa-publicacao",
    projectId: project_id,
    userId: isDev ? undefined : userId,
    metadata: { model: "claude-sonnet-4-6" },
    fn: () => anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Você é um consultor de publicação especialista em plataformas digitais globais. Analise o relatório de QA abaixo e escreva uma recomendação final em 3-4 frases em português para o autor. Seja direto, prático e útil. Mencione os itens mais críticos a corrigir. Sem título, sem listas.

Livro: "${dados.titulo}" por ${dados.autor}
Score: ${score}/100 | Aprovado para publicação: ${aprovado ? "sim" : "não"}
Plataformas analisadas: ${plataformas.join(", ")}

${resumo}`,
      }],
    }),
  });

  const recomendacao = extractText(claudeRes.content).trim();

  // ── Persist ───────────────────────────────────────────────────────────────
  const result: QAPublicacaoResult = {
    project_id,
    score,
    aprovado,
    checagens,
    recomendacao,
    bloqueantes,
    analisado_em: new Date().toISOString(),
  };

  if (!isDev) {
    await supabase
      .from("projects")
      .update({
        dados_qa_publicacao: result,
        etapa_atual: aprovado ? "publicado" : "qa",
      })
      .eq("id", project_id)
      .eq("user_id", userId);
  }

  return NextResponse.json(result);
}

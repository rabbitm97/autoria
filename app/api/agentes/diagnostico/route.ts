export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText, traceClaudeCall } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { updateProject, avancarEtapa } from "@/lib/supabase-helpers";
import { getAgentPrompt } from "@/lib/agent-prompts";
import { validarProjectData } from "@/lib/project-data";
import {
  FORMATOS_LIVRO,
  estimarLombadaMm,
  estimarPaginas,
  type FormatoLivro,
} from "@/lib/formatos";
import {
  fragmentarParaDiagnostico,
  type FragmentoDiagnostico,
} from "@/lib/parse-chapters";
import type {
  FormatoSugerido,
  CanaisRecomendados,
  FaixaPrecoDetalhada,
  DiagnosticoResult,
  DiagnosticoState,
} from "@/lib/project-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  FormatoSugerido,
  CanaisRecomendados,
  FaixaPrecoDetalhada,
  DiagnosticoResult,
  DiagnosticoState,
} from "@/lib/project-data";

// Estrutural: casa com `DiagnosticoState.fragmentos_cache` do project-data.ts.
// Mantido local porque é forma de trabalho interno do map-reduce, não contrato
// publicado — o consumidor externo enxerga via `DiagnosticoState`.
interface FragmentoAnalisado {
  hash: string;
  idx: number;
  titulo: string;
  num_palavras: number;
  num_caracteres: number;
  genero_local: string;
  tom_local: string;
  flesch_local: number;
  observacoes: string[];
  trecho_representativo: string;
  erro?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIMEOUT_INTERNO_MS = 50_000;
const LOTE_PARALELO = 5;
const WPM_LEITURA = 200;
const WPM_NARRACAO = 150;
const MIN_PAGINAS = 192;
const MAX_PAGINAS_PADRAO_BR = 400;

// ─── Prompts ──────────────────────────────────────────────────────────────────

const MAP_PROMPT_FALLBACK = `\
Você é um editor literário brasileiro analisando um FRAGMENTO de manuscrito.
NÃO tente diagnosticar o livro inteiro — analise APENAS este fragmento.

Retorne EXCLUSIVAMENTE um objeto JSON válido, sem markdown nem comentários.

SCHEMA OBRIGATÓRIO:
{
  "genero_local": "gênero observado neste fragmento em PT-BR",
  "tom_local": "tom narrativo em 3-5 palavras",
  "flesch_local": <inteiro 0–100, índice Flesch adaptado ao PT>,
  "observacoes": [
    "observação 1 sobre escrita/ritmo/qualidade deste fragmento",
    "observação 2",
    "observação 3"
  ],
  "trecho_representativo": "1-2 frases do fragmento que ilustram o tom"
}

DIRETRIZES:
- observacoes: 2-4 itens, específicas a este fragmento (cite elementos concretos).
- trecho_representativo: máximo 200 caracteres.
- Linguagem profissional em PT-BR.`;

const REDUCE_PROMPT_FALLBACK = `\
Você é um editor literário brasileiro sênior consolidando análises de N fragmentos
de um manuscrito em um diagnóstico ÚNICO e COERENTE do livro inteiro.

CONTEXTO DO MERCADO EDITORIAL BRASILEIRO (2024):
- Mercado total: R$6,6 bilhões com crescimento de +32,6% no segmento digital
- Gêneros mais vendidos (autopublicação BR): Romance (43%), Fantasia/FC (18%), Autoajuda (15%), Suspense/Thriller (9%)
- Faixa de preço eBook na Amazon BR: R$9,90–R$19,90 (massa), R$24,90–R$49,90 (nicho premium)
- Faixa de preço livro físico POD: R$29,90–R$59,90 (até 300 páginas)

ÍNDICE FLESCH ADAPTADO AO PORTUGUÊS:
- 75–100: Muito fácil — infantil/teen, autoajuda popular
- 60–74: Fácil — romance de massa, suspense comercial
- 45–59: Médio — literatura adulta, ficção literária acessível
- 30–44: Difícil — ensaios, ficção literária densa
- 0–29: Muito difícil — acadêmico, erudito

Você receberá um array de fragmentos JÁ analisados. Sua tarefa é CONSOLIDAR
em um diagnóstico único do livro completo.

Retorne EXCLUSIVAMENTE um objeto JSON válido com o schema abaixo:

{
  "genero_provavel": "gênero predominante (mais frequente entre fragmentos)",
  "confianca_genero": <inteiro 0–100>,
  "num_capitulos": <total de fragmentos>,
  "complexidade": "simples" | "médio" | "complexo",
  "complexidade_flesch": <média ponderada dos flesch_local por num_palavras>,
  "tom_narrativo": "síntese do tom (4-8 palavras)",
  "pontos_fortes": [
    "ponto forte 1 — extraído das observações, específico",
    "ponto forte 2",
    "ponto forte 3"
  ],
  "pontos_melhorar": [
    "sugestão 1 — acionável",
    "sugestão 2",
    "sugestão 3"
  ],
  "mercado_alvo": "parágrafo descrevendo o leitor-alvo brasileiro",
  "tamanho_mercado": "nicho" | "adequado" | "amplo",
  "potencial_comercial": "baixo" | "médio" | "alto",
  "faixa_preco_sugerida": "faixa de preço geral (ex: R$29,90 – R$39,90)",
  "faixa_preco_detalhada": {
    "ebook": "faixa eBook",
    "fisico": "faixa físico POD",
    "audiolivro": "faixa audiolivro"
  },
  "canais_recomendados": {
    "ebook": { "recomendado": true, "plataformas": ["Amazon Kindle", "Apple Books", "Kobo"], "descricao": "1 frase curta sobre por que" },
    "fisico": { "recomendado": true, "descricao": "1 frase curta" },
    "audiolivro": { "recomendado": true, "duracao_estimada_horas": 0, "descricao": "1 frase curta" }
  },
  "comparaveis_mercado": [
    "Autor/Título 1 — 1 frase",
    "Autor/Título 2"
  ],
  "proximos_passos": [
    "ação 1",
    "ação 2",
    "ação 3"
  ]
}

DIRETRIZES:
- Use as observações dos fragmentos como matéria-prima dos pontos_fortes/pontos_melhorar.
- pontos_fortes e pontos_melhorar devem ter exatamente 3 itens.
- comparaveis_mercado: 2-3 itens, autores BR ou traduzidos populares.
- proximos_passos: 3-5 itens ordenados por prioridade.
- duracao_estimada_horas: o backend sobrescreve, mas preencha algo.
- Descricoes em canais_recomendados: máximo 25 palavras cada.`;

// ─── Cálculos determinísticos (Node) ─────────────────────────────────────────

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

function calcularSugestaoFormato(numPalavras: number, numCaracteres: number, generoLower: string): FormatoSugerido {
  const categoria = detectarCategoriaEspecial(generoLower);

  // Cascade calcula páginas com a base do formato (corpoPt undefined).
  // Estimativa em caracteres, função única (lib/formatos.ts).
  const formatosCascata: FormatoLivro[] = ["padrao_br", "compacto", "bolso"];
  const cascataDetalhada = formatosCascata.map(fmt => {
    const def = FORMATOS_LIVRO.find(f => f.value === fmt)!;
    const paginas = estimarPaginas(def.specs, undefined, numCaracteres);
    return { formato: fmt, paginas, lombada_mm: estimarLombadaMm(paginas) };
  });

  if (categoria === "abnt") {
    const a4 = FORMATOS_LIVRO.find(f => f.value === "a4")!;
    const paginas = estimarPaginas(a4.specs, undefined, numCaracteres);
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
      motivo: "Poesia e teatro pedem decisões editoriais específicas. Escolha o formato manualmente na etapa de Elementos Editoriais.",
      aviso: "Sugestão automática não se aplica",
      cascata: cascataDetalhada,
    };
  }

  const padraoBr = cascataDetalhada[0];
  const compacto = cascataDetalhada[1];
  const bolso = cascataDetalhada[2];

  let escolhido = padraoBr;
  let aviso: string | undefined;

  if (padraoBr.paginas >= MIN_PAGINAS && padraoBr.paginas <= MAX_PAGINAS_PADRAO_BR) {
    escolhido = padraoBr;
  } else if (padraoBr.paginas > MAX_PAGINAS_PADRAO_BR) {
    escolhido = padraoBr;
    aviso = "Livro extenso (>400 páginas). Considere dividir em volumes.";
  } else if (compacto.paginas >= MIN_PAGINAS) {
    escolhido = compacto;
  } else if (bolso.paginas >= MIN_PAGINAS) {
    escolhido = bolso;
  } else {
    escolhido = bolso;
    aviso = "Livro curto. A lombada ficará fina.";
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
  return Math.round((numPalavras / (WPM_LEITURA * 60)) * 2) / 2;
}

function calcularDuracaoAudio(numPalavras: number): number {
  return Math.round((numPalavras / (WPM_NARRACAO * 60)) * 2) / 2;
}

// ─── MAP: analisar um fragmento ──────────────────────────────────────────────

async function analisarFragmento(
  fragmento: FragmentoDiagnostico,
  projectId: string,
  userId: string
): Promise<FragmentoAnalisado> {
  try {
    const SYSTEM_PROMPT = await getAgentPrompt("diagnostico_map", MAP_PROMPT_FALLBACK);

    const message = await traceClaudeCall({
      agentName: "diagnostico_map",
      projectId,
      userId,
      model: "claude-haiku-4-5-20251001",
      input: {
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Analise este fragmento (capítulo "${fragmento.titulo}", ${fragmento.num_palavras} palavras):\n\n${fragmento.texto}`,
        }],
      },
      fn: () => anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Analise este fragmento (capítulo "${fragmento.titulo}", ${fragmento.num_palavras} palavras):\n\n${fragmento.texto}`,
        }],
      }),
    });

    const parsed = parseLLMJson<{
      genero_local: string;
      tom_local: string;
      flesch_local: number;
      observacoes: string[];
      trecho_representativo: string;
    }>(extractText(message.content));

    return {
      hash: fragmento.hash,
      idx: fragmento.idx,
      titulo: fragmento.titulo,
      num_palavras: fragmento.num_palavras,
      num_caracteres: fragmento.texto.length,
      genero_local: parsed.genero_local ?? "Não identificado",
      tom_local: parsed.tom_local ?? "Não identificado",
      flesch_local: parsed.flesch_local ?? 50,
      observacoes: parsed.observacoes ?? [],
      trecho_representativo: parsed.trecho_representativo ?? "",
    };
  } catch (err) {
    console.error(`[diagnostico_map] Falha no fragmento ${fragmento.idx}:`, err);
    return {
      hash: fragmento.hash,
      idx: fragmento.idx,
      titulo: fragmento.titulo,
      num_palavras: fragmento.num_palavras,
      num_caracteres: fragmento.texto.length,
      genero_local: "",
      tom_local: "",
      flesch_local: 0,
      observacoes: [],
      trecho_representativo: "",
      erro: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── REDUCE: consolidar fragmentos em diagnóstico final ──────────────────────

async function consolidarDiagnostico(
  fragmentos: FragmentoAnalisado[],
  numPalavrasTotal: number,
  numCaracteresTotal: number,
  projectId: string,
  userId: string
): Promise<DiagnosticoResult> {
  const SYSTEM_PROMPT = await getAgentPrompt("diagnostico_reduce", REDUCE_PROMPT_FALLBACK);

  const fragmentosResumidos = fragmentos
    .filter(f => !f.erro)
    .map(f => ({
      idx: f.idx,
      titulo: f.titulo,
      num_palavras: f.num_palavras,
      genero_local: f.genero_local,
      tom_local: f.tom_local,
      flesch_local: f.flesch_local,
      observacoes: f.observacoes,
      trecho_representativo: f.trecho_representativo,
    }));

  const userMessage = `Consolide as análises destes ${fragmentosResumidos.length} fragmentos do manuscrito (total ${numPalavrasTotal} palavras) em um diagnóstico único:\n\n${JSON.stringify(fragmentosResumidos, null, 2)}`;

  const message = await traceClaudeCall({
    agentName: "diagnostico_reduce",
    projectId,
    userId,
    model: "claude-haiku-4-5-20251001",
    input: {
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    },
    fn: () => anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  const parsed = parseLLMJson<Omit<DiagnosticoResult, "num_palavras" | "paginas_estimadas" | "formato_sugerido" | "tempo_leitura_horas">>(
    extractText(message.content)
  );

  const generoLower = (parsed.genero_provavel ?? "").toLowerCase();
  const formato_sugerido = calcularSugestaoFormato(numPalavrasTotal, numCaracteresTotal, generoLower);

  return {
    ...parsed,
    num_palavras: numPalavrasTotal,
    paginas_estimadas: formato_sugerido.paginas_estimadas || Math.round(numPalavrasTotal / 250),
    formato_sugerido,
    tempo_leitura_horas: calcularTempoLeitura(numPalavrasTotal),
    canais_recomendados: {
      ...parsed.canais_recomendados,
      audiolivro: {
        ...parsed.canais_recomendados.audiolivro,
        duracao_estimada_horas: calcularDuracaoAudio(numPalavrasTotal),
      },
    },
  };
}

// ─── Handler POST ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { texto?: string; project_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { texto, project_id } = body;

  if (!project_id || typeof project_id !== "string") {
    return NextResponse.json({ error: "Campo 'project_id' obrigatório." }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, diagnostico, manuscripts(titulo, texto, nome)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as { titulo?: string | null; texto?: string | null; nome?: string | null } | null;
  const titulo = ms?.titulo?.trim() || ms?.nome || "Manuscrito";
  let textoCompleto = ms?.texto ?? "";
  let estado = (project.diagnostico as unknown as DiagnosticoState | null) ?? null;

  // ── INÍCIO: texto novo veio no body, resetar estado ─────────────────────
  if (texto && texto.trim().length >= 50) {
    textoCompleto = texto;

    // Persistir texto em manuscripts (commit imediato)
    if (project.manuscript_id) {
      const { error: msErr } = await supabase
        .from("manuscripts")
        .update({ texto: textoCompleto })
        .eq("id", project.manuscript_id)
        .eq("user_id", user.id);
      if (msErr) {
        console.error("[diagnostico] Falha ao persistir texto normalizado:", msErr.message);
        return NextResponse.json(
          { error: "Falha ao salvar o texto do manuscrito. Tente novamente." },
          { status: 500 }
        );
      }
    }

    const fragmentos = fragmentarParaDiagnostico(textoCompleto, titulo);

    estado = {
      status: "processando_capitulos",
      progresso: { atual: 0, total: fragmentos.length },
      iniciado_em: new Date().toISOString(),
      fragmentos_cache: [],
      _fragmentos_pendentes: fragmentos,
    };

    validarProjectData("diagnostico", estado, { modo: "observador", contexto: "diagnostico" });
    const { ok: estadoOk } = await updateProject(supabase, project_id, user.id, {
      diagnostico: estado,
    }, "diagnostico");
    if (!estadoOk) {
      return NextResponse.json(
        { error: "Falha ao iniciar o diagnóstico. Tente novamente." },
        { status: 500 }
      );
    }
    await avancarEtapa(supabase, project_id, user.id, "diagnostico", "diagnostico");
  }

  if (!estado) {
    return NextResponse.json({ error: "Estado de diagnóstico não encontrado. Reenvie o manuscrito." }, { status: 400 });
  }

  if (estado.status === "concluido") {
    return NextResponse.json({ status: "concluido", progresso: estado.progresso, diagnostico: estado.resultado });
  }

  if (estado.status === "erro") {
    // Retomada (FIX-13): erro não é terminal. Voltamos a "processando_capitulos"
    // preservando fragmentos_cache — o próprio fluxo abaixo detecta o que falta
    // (map só dos pendentes; se nada pende, promove a consolidando na MESMA
    // request). Se só o reduce falhou, refaz só o reduce.
    console.info(`[diagnostico] retomando após erro: "${estado.erro_mensagem ?? ""}" (cache: ${estado.fragmentos_cache.length} fragmentos)`);
    estado.status = "processando_capitulos";
    delete estado.erro_mensagem;
    validarProjectData("diagnostico", estado, { modo: "observador", contexto: "diagnostico" });
    const { ok: okRetomada } = await updateProject(supabase, project_id, user.id, {
      diagnostico: estado,
    }, "diagnostico");
    if (!okRetomada) {
      return NextResponse.json(
        { erro: "Falha ao retomar o diagnóstico. Tente novamente." },
        { status: 500 }
      );
    }
    // segue o fluxo — NÃO retornar aqui
  }

  // ── PROCESSANDO CAPÍTULOS ───────────────────────────────────────────────
  if (estado.status === "processando_capitulos") {
    const fragmentosPendentes = estado._fragmentos_pendentes ?? fragmentarParaDiagnostico(textoCompleto, titulo);

    const hashesProcessados = new Set(estado.fragmentos_cache.map(f => f.hash));
    const faltantes = fragmentosPendentes.filter(f => !hashesProcessados.has(f.hash));

    while (faltantes.length > 0 && (Date.now() - startTime) < TIMEOUT_INTERNO_MS) {
      const lote = faltantes.splice(0, LOTE_PARALELO);
      const resultados = await Promise.allSettled(
        lote.map(f => analisarFragmento(f, project_id, user.id))
      );

      for (const r of resultados) {
        if (r.status === "fulfilled") {
          estado.fragmentos_cache.push(r.value);
          estado.progresso.atual = estado.fragmentos_cache.length;
        }
      }

      const estadoFrag = { ...estado, _fragmentos_pendentes: fragmentosPendentes };
      validarProjectData("diagnostico", estadoFrag, { modo: "observador", contexto: "diagnostico" });
      const { ok: okFrag } = await updateProject(supabase, project_id, user.id, {
        diagnostico: estadoFrag,
      }, "diagnostico");
      if (!okFrag) {
        return NextResponse.json(
          { error: "Falha ao salvar o progresso do diagnóstico. Tente novamente." },
          { status: 500 }
        );
      }
    }

    if (faltantes.length === 0) {
      estado.status = "consolidando";
      estado.progresso.total = estado.fragmentos_cache.length;
      estado.progresso.atual = estado.fragmentos_cache.length;
      delete estado._fragmentos_pendentes;

      validarProjectData("diagnostico", estado, { modo: "observador", contexto: "diagnostico" });
      const { ok: okConsol } = await updateProject(supabase, project_id, user.id, {
        diagnostico: estado,
      }, "diagnostico");
      if (!okConsol) {
        return NextResponse.json(
          { error: "Falha ao salvar o progresso do diagnóstico. Tente novamente." },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json({ status: estado.status, progresso: estado.progresso });
    }
  }

  // ── CONSOLIDANDO ────────────────────────────────────────────────────────
  if (estado.status === "consolidando") {
    if ((Date.now() - startTime) > TIMEOUT_INTERNO_MS - 15_000) {
      return NextResponse.json({ status: estado.status, progresso: estado.progresso });
    }

    try {
      const numPalavrasTotal = estado.fragmentos_cache.reduce((sum, f) => sum + f.num_palavras, 0);
      const numCaracteresTotal = estado.fragmentos_cache.reduce((sum, f) => sum + f.num_caracteres, 0);
      const resultado = await consolidarDiagnostico(
        estado.fragmentos_cache,
        numPalavrasTotal,
        numCaracteresTotal,
        project_id,
        user.id
      );

      estado.status = "concluido";
      estado.concluido_em = new Date().toISOString();
      estado.resultado = resultado;

      const estadoFinal: DiagnosticoState = {
        ...estado,
        fragmentos_cache: [],
      };

      validarProjectData("diagnostico", estadoFinal, { modo: "observador", contexto: "diagnostico" });
      const { ok: okFinal } = await updateProject(supabase, project_id, user.id, {
        diagnostico: estadoFinal,
      }, "diagnostico");
      if (!okFinal) {
        return NextResponse.json(
          { error: "Falha ao salvar o progresso do diagnóstico. Tente novamente." },
          { status: 500 }
        );
      }

      return NextResponse.json({ status: "concluido", progresso: estado.progresso, diagnostico: resultado });
    } catch (err) {
      console.error("[diagnostico_reduce] Falhou:", err);
      const estadoErro: DiagnosticoState = {
        ...estado,
        status: "erro",
        erro_mensagem: err instanceof Error ? err.message : String(err),
      };

      validarProjectData("diagnostico", estadoErro, { modo: "observador", contexto: "diagnostico" });
      const { ok: okErro } = await updateProject(supabase, project_id, user.id, {
        diagnostico: estadoErro,
      }, "diagnostico");
      if (!okErro) {
        console.error("[diagnostico] Falha ao persistir estado de erro (erro original mantido na resposta).");
      }

      return NextResponse.json({ status: "erro", erro: estadoErro.erro_mensagem }, { status: 500 });
    }
  }

  return NextResponse.json({ status: estado.status, progresso: estado.progresso });
}

// ─── GET (status check rápido) ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const project_id = request.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("diagnostico")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const estado = project.diagnostico as DiagnosticoState | null;
  if (!estado) {
    return NextResponse.json({ status: "ausente" });
  }

  return NextResponse.json({
    status: estado.status,
    progresso: estado.progresso,
    diagnostico: estado.status === "concluido" ? estado.resultado : undefined,
    erro: estado.erro_mensagem,
  });
}

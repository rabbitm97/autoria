export const maxDuration = 10;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import type { AnaliseTecnica } from "@/lib/capa-analyzer";
import { LIMITE_DIVERGENCIA_LOMBADA_MM } from "@/lib/formatos";
import { type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";
import { validarProjectData } from "@/lib/project-data";
import type { ProvaItem, ProvaResult } from "./types";
export type { ProvaCategoria, ProvaStatus, ProvaItem, ProvaResult } from "./types";

/**
 * Constrói mensagem contextual quando a capa não está estruturalmente
 * apta para gráfica. Não trata lombada divergente (essa vai em item
 * separado, com mensagem própria contendo os valores).
 *
 * Critério de bloqueio estrutural (alinhado com o pipeline real da
 * Autoria):
 *  - `is_frente_pura === true` → capa só eBook
 *  - `configuracao === "C"` → sem sangria (filete branco na impressão)
 *  - `configuracao === "desconhecida"` → dimensões atípicas
 *
 * Não bloqueia por RGB (Sharp converte para CMYK via FOGRA39 no
 * `preparar-capa-grafica`), por Config B (sangria presente = aceitável
 * para POD), nem por DPI baixo (Sharp reamostra na composição).
 */
function montarMensagemCapaEstrutural(
  analise: AnaliseTecnica | undefined,
): string {
  if (!analise) {
    return "A capa atual não está pronta para publicação impressa. Envie uma capa panorâmica ou volte para o editor.";
  }
  if (analise.is_frente_pura) {
    return "A capa atual é só a frente do livro (formato eBook). Para publicação impressa, envie uma capa panorâmica completa (frente + lombada + contracapa) com sangria de 3mm.";
  }
  if (analise.configuracao === "C") {
    return "A capa atual está no formato de eBook, sem sangria nem marcas de corte. Para publicação impressa, envie uma capa panorâmica com sangria de 3mm e marcas de corte.";
  }
  if (analise.configuracao === "desconhecida") {
    return `As dimensões da capa (${analise.largura_mm}mm × ${analise.altura_mm}mm) não batem com o formato do livro (esperado ${analise.largura_esperada_mm}mm × ${analise.altura_esperada_mm}mm). Confira o formato ou reexporte a capa panorâmica.`;
  }
  return "A capa atual não está apta para publicação impressa. Envie uma capa panorâmica com sangria de 3mm e marcas de corte.";
}

// ─── POST /api/agentes/prova ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (isDev()) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  let body: { project_id: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Load project ──────────────────────────────────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("dados_capa, dados_miolo, dados_creditos, dados_pdf, dados_pdf_digital, dados_qa, formato")
    .eq("id", project_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (projErr) {
    console.error("[prova] erro na query do projeto:", {
      project_id, userId, code: projErr.code, message: projErr.message,
    });
    return NextResponse.json(
      { error: "Erro ao consultar o projeto.", detail: projErr.message },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const capa = project.dados_capa as Record<string, unknown> | null;
  const miolo = project.dados_miolo as {
    html_storage_path?: string;
    lombada_mm?: number;
    paginas_reais?: number;
    paginas_estimadas?: number;
  } | null;
  const creditos = project.dados_creditos as { html_storage_path?: string } | null;
  const pdfEbook = project.dados_pdf_digital as { storage_path?: string } | null;
  const pdfMioloGrafica = project.dados_pdf as { storage_path?: string } | null;
  const formatoKey = (project.formato ?? "padrao_br") as FormatKey;

  const capaResolvida = resolveCapaCompleta(capa, formatoKey);
  const pdfCapaGrafica = capa?.pdf_grafica as { storage_path?: string } | undefined;

  // ── Trilha digital ────────────────────────────────────────────────────────
  const itensDigital: ProvaItem[] = [];

  if (!capaResolvida.pronta) {
    itensDigital.push({
      categoria: "capa",
      status: "erro",
      mensagem: "A capa ainda não foi confirmada.",
      acao: { label: "Voltar para Capa", etapa: "capa" },
    });
  }
  if (!miolo?.html_storage_path) {
    itensDigital.push({
      categoria: "miolo",
      status: "erro",
      mensagem: "O miolo ainda não foi diagramado.",
      acao: { label: "Voltar para Diagramação", etapa: "miolo" },
    });
  }
  if (!creditos?.html_storage_path) {
    itensDigital.push({
      categoria: "creditos",
      status: "erro",
      mensagem: "A página de créditos ainda não foi aprovada.",
      acao: { label: "Voltar para Créditos", etapa: "creditos" },
    });
  }
  if (!pdfEbook?.storage_path) {
    itensDigital.push({
      categoria: "pdf_ebook",
      status: "erro",
      mensagem: "Não foi possível preparar o PDF eBook.",
      acao: { label: "Tentar novamente", etapa: "__gerar_pdf_digital__" },
    });
  }

  // ── Trilha impressa ───────────────────────────────────────────────────────
  const itensImpressa: ProvaItem[] = [];

  if (!pdfMioloGrafica?.storage_path) {
    itensImpressa.push({
      categoria: "pdf_miolo_grafica",
      status: "erro",
      mensagem: "Não foi possível preparar o PDF do miolo para a gráfica.",
      acao: { label: "Tentar novamente", etapa: "__gerar_pdf_miolo__" },
    });
  }
  // Critério customizado alinhado com o pipeline real da Autoria (não
  // usa analiseTec.ok_grafica diretamente porque ele bloqueia RGB e o
  // preparar-capa-grafica já converte RGB → CMYK via Sharp + FOGRA39).
  //
  // Prioridade em cascata:
  //  1. Bloqueio estrutural (frente pura, sem sangria, dimensões atípicas)
  //  2. Bloqueio de lombada (capa diverge do miolo real)
  //  3. Auto-preparação silenciosa (capa apta mas PDF gráfica ainda não gerado)
  const analiseTec = capaResolvida.analise_tecnica;

  const capaAptaEstrutural = analiseTec !== undefined
    ? !analiseTec.is_frente_pura &&
      analiseTec.configuracao !== "C" &&
      analiseTec.configuracao !== "desconhecida"
    : capaResolvida.is_panoramica;

  // Lombada divergente: só faz sentido comparar quando a capa é
  // estruturalmente apta E o analyzer conseguiu deduzir a lombada da capa
  // (lombada_deduzida_mm) E o miolo já rodou gerar-pdf (lombada_mm real).
  let lombadaDivergente: { capa: number; miolo: number; diff: number } | null = null;
  if (
    capaAptaEstrutural &&
    analiseTec !== undefined &&
    analiseTec.lombada_deduzida_mm !== null &&
    miolo?.lombada_mm !== undefined
  ) {
    const diff = Math.abs(analiseTec.lombada_deduzida_mm - miolo.lombada_mm);
    if (diff > LIMITE_DIVERGENCIA_LOMBADA_MM) {
      lombadaDivergente = {
        capa: analiseTec.lombada_deduzida_mm,
        miolo: miolo.lombada_mm,
        diff,
      };
    }
  }

  if (!capaAptaEstrutural) {
    // Bloqueio estrutural (frente pura, Config C, dimensões atípicas).
    itensImpressa.push({
      categoria: "pdf_capa_grafica",
      status: "erro",
      mensagem: montarMensagemCapaEstrutural(analiseTec),
      acao: { label: "Alterar capa", etapa: "__alterar_capa__" },
    });
  } else if (lombadaDivergente !== null) {
    // Bloqueio por lombada — capa vai sair torta na gráfica.
    itensImpressa.push({
      categoria: "pdf_capa_grafica",
      status: "erro",
      mensagem: `A lombada da capa (${lombadaDivergente.capa.toFixed(1)}mm) diverge da lombada real do miolo (${lombadaDivergente.miolo.toFixed(1)}mm). Para publicação impressa, envie uma capa com a lombada correta.`,
      acao: { label: "Alterar capa", etapa: "__alterar_capa__" },
    });
  } else if (!pdfCapaGrafica?.storage_path) {
    // Capa apta mas PDF gráfica ainda não foi preparado.
    // Item de auto-preparação silenciosa (client dispara sem expor ao autor).
    itensImpressa.push({
      categoria: "pdf_capa_grafica",
      status: "erro",
      mensagem: "Não foi possível preparar o PDF da capa para a gráfica.",
      acao: { label: "Tentar novamente", etapa: "__preparar_capa_grafica__" },
    });
  }

  // ── Consolidar ────────────────────────────────────────────────────────────
  const digital = {
    aprovado: itensDigital.every(i => i.status !== "erro"),
    pendencias: itensDigital.filter(i => i.status === "erro"),
    avisos: itensDigital.filter(i => i.status === "aviso"),
  };
  const grafica = {
    aprovado: itensImpressa.every(i => i.status !== "erro"),
    preparado: Boolean(pdfCapaGrafica?.storage_path),
    pendencias: itensImpressa.filter(i => i.status === "erro"),
    avisos: itensImpressa.filter(i => i.status === "aviso"),
  };

  const result: ProvaResult = {
    project_id,
    digital,
    grafica,
    detalhes: {
      formato: project.formato as string | undefined,
      paginas: miolo?.paginas_reais ?? miolo?.paginas_estimadas ?? undefined,
      lombada_capa_mm: capaResolvida.lombada_mm ?? undefined,
      lombada_miolo_mm: miolo?.lombada_mm ?? undefined,
    },
    analisado_em: new Date().toISOString(),
  };

  // C5-02: preserva o resultado do gate qa-publicacao se existir. A substituição
  // total (mata shape legado) continua valendo para o resto da coluna.
  const publicacaoExistente =
    (project.dados_qa as { publicacao?: unknown } | null)?.publicacao;
  const novoDadosQa = publicacaoExistente
    ? { ...result, publicacao: publicacaoExistente }
    : result;

  validarProjectData("dados_qa", novoDadosQa, {
    modo: "observador", contexto: "prova",
  });

  const { ok: qaOk } = await updateProject(supabase, project_id, userId, {
    dados_qa: novoDadosQa,
  }, "prova");
  if (!qaOk) {
    return NextResponse.json(
      { error: "Conferência concluída, mas falha ao salvar o resultado. Tente novamente." },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}

// ─── GET /api/agentes/prova?project_id=... ────────────────────────────────────

export async function GET(req: NextRequest) {
  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  if (isDev()) return NextResponse.json(null);

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("projects")
    .select("dados_qa")
    .eq("id", project_id)
    .single();

  const raw = data?.dados_qa as Record<string, unknown> | null;

  // Filtra schemas legados — só retorna se tem o shape novo (digital + grafica).
  // Schemas antigos quebram o frontend ao acessar result.digital.aprovado.
  // Retornando null, o front oferece "Analisar agora" e gera no shape correto.
  if (!raw || typeof raw !== "object") return NextResponse.json(null);
  if (!("digital" in raw) || !("grafica" in raw)) {
    console.warn("[prova GET] dados_qa em schema legado para project_id:", project_id);
    return NextResponse.json(null);
  }

  return NextResponse.json(raw);
}

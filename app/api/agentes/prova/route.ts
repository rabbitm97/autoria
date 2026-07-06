export const maxDuration = 10;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { LIMITE_DIVERGENCIA_LOMBADA_MM } from "@/lib/formatos";
import { type FormatKey } from "@/app/editor/capa/[project_id]/lib/dimensions";
import type { ProvaItem, ProvaResult } from "./types";
export type { ProvaCategoria, ProvaStatus, ProvaItem, ProvaResult } from "./types";

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
    .select("dados_capa, dados_miolo, dados_creditos, dados_pdf, dados_pdf_digital, formato")
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
  if (!pdfCapaGrafica?.storage_path) {
    itensImpressa.push({
      categoria: "pdf_capa_grafica",
      status: "erro",
      mensagem: "Não foi possível preparar o PDF da capa para a gráfica.",
      acao: { label: "Tentar novamente", etapa: "__preparar_capa_grafica__" },
    });
  }

  // Checagem crítica: lombada da capa vs lombada real do miolo.
  // Se divergir acima da tolerância, o PDF da gráfica precisa ser regerado
  // com a lombada correta — se o autor mandar como está, a capa vai
  // desalinhada da lombada real do livro impresso.
  if (
    capaResolvida.pronta &&
    capaResolvida.lombada_mm !== null &&
    miolo?.lombada_mm &&
    pdfCapaGrafica?.storage_path
  ) {
    const diff = Math.abs(capaResolvida.lombada_mm - miolo.lombada_mm);
    if (diff > LIMITE_DIVERGENCIA_LOMBADA_MM) {
      itensImpressa.push({
        categoria: "lombada",
        status: "aviso",
        mensagem: `Lombada da capa (${capaResolvida.lombada_mm.toFixed(1)}mm) diverge da lombada real do miolo (${miolo.lombada_mm.toFixed(1)}mm). Prepare o PDF da gráfica novamente.`,
        acao: { label: "Preparar novamente", etapa: "__preparar_capa_grafica__" },
      });
    }
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

  await supabase
    .from("projects")
    .update({ dados_qa: result })
    .eq("id", project_id)
    .eq("user_id", userId);

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

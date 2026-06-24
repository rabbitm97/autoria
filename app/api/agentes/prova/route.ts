export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { PDFDocument } from "pdf-lib";
import {
  FORMATS,
  SANGRIA_MM,
  ORELHA_MM,
  calcularLombada,
} from "@/app/editor/capa/[project_id]/lib/dimensions";
import type { ProvaCategoria, ProvaStatus, ProvaItem, ProvaResult } from "./types";
export type { ProvaCategoria, ProvaStatus, ProvaItem, ProvaResult };

// ─── Constants ────────────────────────────────────────────────────────────────

const MARKS_MM = 10;
const PDF_DIMENSAO_TOLERANCIA_MM = 0.5;

// ─── Análise de capa gráfica ─────────────────────────────────────────────────

async function analisarCapaGrafica(params: {
  pdf_grafica: {
    storage_path: string;
    gerado_em: string;
    formato: string;
    paginas_no_momento: number;
    com_orelhas: boolean;
  };
  paginas_atuais: number;
  formato_atual: string;
  com_orelhas_atual: boolean;
}): Promise<ProvaItem[]> {
  const itens: ProvaItem[] = [];
  const { pdf_grafica, paginas_atuais, formato_atual, com_orelhas_atual } = params;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Assinar URL para download
  const { data: signed, error: signErr } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(pdf_grafica.storage_path, 300);

  if (signErr || !signed?.signedUrl) {
    itens.push({
      id: "capa_grafica_inacessivel",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: "PDF da capa para gráfica não está acessível. Prepare novamente.",
      etapa: "__preparar_capa_grafica__",
    });
    return itens;
  }

  // 2. Baixar o PDF
  let buffer: Buffer;
  try {
    const res = await fetch(signed.signedUrl);
    if (!res.ok) throw new Error(`status ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("[prova:capa_grafica] falha ao baixar PDF:", err);
    itens.push({
      id: "capa_grafica_download_falhou",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: "Falha ao baixar o PDF da capa. Prepare novamente.",
      etapa: "__preparar_capa_grafica__",
    });
    return itens;
  }

  // 3. Medir MediaBox via pdf-lib
  let widthMm: number;
  let heightMm: number;
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    if (pdfDoc.getPageCount() < 1) throw new Error("PDF sem páginas");
    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize(); // pontos (72 pt/in)
    widthMm  = (width  / 72) * 25.4;
    heightMm = (height / 72) * 25.4;
  } catch (err) {
    console.error("[prova:capa_grafica] PDF inválido:", err);
    itens.push({
      id: "capa_grafica_pdf_invalido",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: "PDF da capa está corrompido ou inválido. Prepare novamente.",
      etapa: "__preparar_capa_grafica__",
    });
    return itens;
  }

  // 4. Calcular dimensões esperadas (mesma fórmula do exportar-pdf)
  const f = FORMATS[formato_atual as keyof typeof FORMATS];
  if (!f) {
    itens.push({
      id: "capa_grafica_formato_invalido",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: `Formato '${formato_atual}' não reconhecido.`,
      etapa: null,
    });
    return itens;
  }

  const lombadaMmEsperada = calcularLombada(paginas_atuais);
  const orelhaMm = com_orelhas_atual ? ORELHA_MM : 0;
  const totalWMm = f.width_mm * 2 + lombadaMmEsperada + orelhaMm * 2 + SANGRIA_MM * 2;
  const totalHMm = f.height_mm + SANGRIA_MM * 2;
  const expectedW = totalWMm + MARKS_MM * 2;
  const expectedH = totalHMm + MARKS_MM * 2;

  const diffW = Math.abs(widthMm - expectedW);
  const diffH = Math.abs(heightMm - expectedH);
  const dimensoesBatem = diffW <= PDF_DIMENSAO_TOLERANCIA_MM && diffH <= PDF_DIMENSAO_TOLERANCIA_MM;

  // 5. Check: zona de marcas (a MediaBox deve ser >= área útil + 2×MARKS_MM)
  const totalWNoPdf = widthMm - MARKS_MM * 2;
  const totalHNoPdf = heightMm - MARKS_MM * 2;
  const temZonaDeMarcas =
    (widthMm  - totalWNoPdf) >= MARKS_MM * 2 - PDF_DIMENSAO_TOLERANCIA_MM &&
    (heightMm - totalHNoPdf) >= MARKS_MM * 2 - PDF_DIMENSAO_TOLERANCIA_MM;

  if (!temZonaDeMarcas) {
    itens.push({
      id: "capa_grafica_sem_marcas",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: "PDF da capa não tem marcas de corte — não pode ir para gráfica. Prepare novamente.",
      etapa: "__preparar_capa_grafica__",
    });
  }

  if (!dimensoesBatem) {
    itens.push({
      id: "capa_grafica_dimensoes_divergentes",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: `Dimensões do PDF (${widthMm.toFixed(1)}×${heightMm.toFixed(1)}mm) não correspondem ao esperado (${expectedW.toFixed(1)}×${expectedH.toFixed(1)}mm). Prepare novamente.`,
      etapa: "__preparar_capa_grafica__",
    });
  }

  // 6. Aviso de lombada divergente — páginas quando gerou vs páginas atuais
  if (pdf_grafica.paginas_no_momento !== paginas_atuais) {
    const lombadaQuandoGerou = calcularLombada(pdf_grafica.paginas_no_momento);
    itens.push({
      id: "capa_grafica_lombada_divergente",
      categoria: "consistencia",
      status: "aviso",
      mensagem: `Lombada do PDF foi calculada para ${pdf_grafica.paginas_no_momento} páginas (${lombadaQuandoGerou.toFixed(1)}mm), mas o miolo atual tem ${paginas_atuais} páginas (${lombadaMmEsperada.toFixed(1)}mm). Prepare o PDF da capa novamente para corrigir.`,
      etapa: "__preparar_capa_grafica__",
    });
  }

  return itens;
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
    .select("dados_capa, dados_miolo, dados_creditos, dados_pdf_digital, formato")
    .eq("id", project_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (projErr) {
    console.error("[prova] erro na query do projeto:", {
      project_id,
      userId,
      code: projErr.code,
      message: projErr.message,
      details: projErr.details,
      hint: projErr.hint,
    });
    return NextResponse.json(
      { error: "Erro ao consultar o projeto.", detail: projErr.message, code: projErr.code },
      { status: 500 },
    );
  }

  if (!project) {
    console.warn("[prova] projeto não encontrado (resultado vazio)", { project_id, userId });
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  // ── Pendency list ─────────────────────────────────────────────────────────
  const itens: ProvaItem[] = [];

  const capa = project.dados_capa as Record<string, unknown> | null;

  // 1. Capa digital (imagem confirmada)
  const capaResolvida = resolveCapaCompleta(capa);
  if (!capaResolvida.pronta) {
    itens.push({
      categoria: "capa",
      status: "erro",
      mensagem: "A capa ainda não foi gerada e confirmada.",
      acao: { label: "Voltar para Capa", etapa: "capa" },
    });
  }

  // 2. Miolo
  const miolo = project.dados_miolo as {
    html_storage_path?: string;
    lombada_mm?: number;
    paginas_reais?: number;
    gerado_em?: string;
  } | null;
  if (!miolo?.html_storage_path) {
    itens.push({
      categoria: "miolo",
      status: "erro",
      mensagem: "O miolo do livro ainda não foi diagramado.",
      acao: { label: "Voltar para Diagramação", etapa: "miolo" },
    });
  }

  // 3. Créditos
  const creditos = project.dados_creditos as { html_storage_path?: string } | null;
  if (!creditos?.html_storage_path) {
    itens.push({
      categoria: "creditos",
      status: "erro",
      mensagem: "A página de créditos ainda não foi aprovada.",
      acao: { label: "Voltar para Créditos", etapa: "creditos" },
    });
  }

  // 4. PDF digital
  const pdfDigital = project.dados_pdf_digital as {
    storage_path?: string;
    gerado_em?: string;
  } | null;

  if (!pdfDigital?.storage_path) {
    itens.push({
      categoria: "pdf",
      status: "erro",
      mensagem: "O PDF digital ainda não foi gerado.",
      acao: { label: "Gerar PDF digital", etapa: "__gerar_pdf_digital__" },
    });
  } else if (miolo?.gerado_em && pdfDigital.gerado_em && pdfDigital.gerado_em < miolo.gerado_em) {
    itens.push({
      categoria: "pdf",
      status: "aviso",
      mensagem: "O miolo foi alterado após o PDF. Regere o PDF para garantir a versão atualizada.",
      acao: { label: "Regenerar PDF", etapa: "__gerar_pdf_digital__" },
    });
  }

  // 5. Consistência: lombada da capa vs miolo
  if (capaResolvida.pronta && capaResolvida.lombada_mm !== null && miolo?.lombada_mm) {
    const diff = Math.abs(capaResolvida.lombada_mm - miolo.lombada_mm);
    if (diff > 2) {
      itens.push({
        categoria: "consistencia",
        status: "aviso",
        mensagem: `A lombada da capa (${capaResolvida.lombada_mm}mm) está ${diff.toFixed(1)}mm diferente da lombada real do miolo (${miolo.lombada_mm}mm).`,
        acao: { label: "Ajustar lombada", etapa: "capa" },
      });
    }
  }

  // ── Análise de capa gráfica (Prompt 4A) ──────────────────────────────────
  const paginasReais = miolo?.paginas_reais ?? 0;

  const pdfGrafica = capa?.pdf_grafica as
    | {
        storage_path: string;
        gerado_em: string;
        formato: string;
        paginas_no_momento: number;
        com_orelhas: boolean;
      }
    | undefined;

  const editorData = capa?.editor_data as
    | { version?: number; comOrelhas?: boolean }
    | undefined;
  const comOrelhasAtual = Boolean(editorData?.comOrelhas);

  const itensCapaGrafica: ProvaItem[] = [];

  if (!pdfGrafica) {
    itensCapaGrafica.push({
      id: "capa_grafica_nao_preparada",
      categoria: "capa_grafica",
      status: "erro",
      mensagem: "PDF da capa para gráfica ainda não foi preparado.",
      etapa: "__preparar_capa_grafica__",
    });
  } else if (paginasReais > 0 && project.formato) {
    const analiseItens = await analisarCapaGrafica({
      pdf_grafica: pdfGrafica,
      paginas_atuais: paginasReais,
      formato_atual: project.formato as string,
      com_orelhas_atual: comOrelhasAtual,
    });
    itensCapaGrafica.push(...analiseItens);
  }

  // Agrega itens da gráfica (mantém compatibilidade com itens[])
  itens.push(...itensCapaGrafica);

  // ── Trilhas ───────────────────────────────────────────────────────────────
  const itensDigital = itens.filter(i => i.categoria !== "capa_grafica");
  const itensGrafica = itens;

  const digital = {
    aprovado: itensDigital.every(i => i.status !== "erro"),
    pendencias: itensDigital.filter(i => i.status === "erro"),
    avisos: itensDigital.filter(i => i.status === "aviso"),
  };

  const grafica = {
    aprovado: itensGrafica.every(i => i.status !== "erro"),
    preparado: Boolean(pdfGrafica),
    pendencias: itensGrafica.filter(i => i.status === "erro"),
    avisos: itensGrafica.filter(i => i.status === "aviso"),
  };

  // ── Score / legado ────────────────────────────────────────────────────────
  const erros  = itens.filter(i => i.status === "erro").length;
  const avisos = itens.filter(i => i.status === "aviso").length;
  const score  = Math.max(0, 100 - erros * 30 - avisos * 10);
  const aprovado = erros === 0 && avisos === 0;

  const result: ProvaResult = {
    project_id,
    score,
    aprovado,
    itens,
    digital,
    grafica,
    detalhes: {
      formato: project.formato as string | undefined,
      paginas: paginasReais || undefined,
    },
    analisado_em: new Date().toISOString(),
  };

  await supabase
    .from("projects")
    .update({ dados_qa: result, etapa_atual: aprovado ? "qa" : "diagramacao" })
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

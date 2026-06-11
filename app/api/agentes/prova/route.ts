export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveCapaCompleta } from "@/lib/capa-resolver";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProvaCategoria = "capa" | "miolo" | "creditos" | "pdf" | "consistencia";
export type ProvaStatus    = "ok" | "aviso" | "erro";

export interface ProvaAcao {
  /** Label do botão que a UI deve mostrar. Ex: "Voltar para Capa". */
  label: string;
  /** Slug da etapa para onde redirecionar. Ex: "capa", "diagramacao", "creditos". */
  etapa: string;
}

export interface ProvaItem {
  categoria: ProvaCategoria;
  status: ProvaStatus;
  mensagem: string;
  /** Quando presente, a UI deve mostrar um botão "Resolver" que leva à etapa. */
  acao?: ProvaAcao;
}

export interface ProvaResult {
  project_id: string;
  score: number;        // 0–100
  aprovado: boolean;    // erros === 0 && avisos === 0 (score 100)
  itens: ProvaItem[];   // SÓ contém pendências — vazio quando tudo OK
  analisado_em: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (isDev) {
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
    .select("dados_capa, dados_miolo, dados_creditos, dados_pdf_digital")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  // ── Build pendency list ──────────────────────────────────────────────────
  // Princípio: só lista o que ESTÁ PENDENTE. Itens OK não entram na lista —
  // a UI sabe que "lista vazia" = tudo pronto. Cada etapa anterior já gateia
  // suas validações próprias (título, sinopse, palavras-chave, etc), então
  // a Prova só revisita 4 coisas: capa, miolo, créditos e consistência cross.
  const itens: ProvaItem[] = [];

  // 1. Capa
  const capaResolvida = resolveCapaCompleta(project.dados_capa as Record<string, unknown> | null);
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
  const creditos = project.dados_creditos as {
    html_storage_path?: string;
  } | null;
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
  // Só checa quando temos os dois lados. Caso da capa do Editor (que não
  // registra lombada_mm) recebe tratamento melhor no Prompt 4.
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

  // ── Score ─────────────────────────────────────────────────────────────────
  const erros  = itens.filter(i => i.status === "erro").length;
  const avisos = itens.filter(i => i.status === "aviso").length;
  const score  = Math.max(0, 100 - erros * 30 - avisos * 10);
  const aprovado = erros === 0 && avisos === 0;

  // ── Persist ───────────────────────────────────────────────────────────────
  // Mantém o campo `dados_qa` no DB e `etapa_atual: "qa"` (legado, sem
  // migration neste prompt). Apenas o nome conceitual e os endpoints mudam.
  const result: ProvaResult = {
    project_id,
    score,
    aprovado,
    itens,
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

  if (process.env.NODE_ENV === "development") return NextResponse.json(null);

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("projects")
    .select("dados_qa")
    .eq("id", project_id)
    .single();

  return NextResponse.json(data?.dados_qa ?? null);
}

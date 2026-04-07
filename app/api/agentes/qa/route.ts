import { NextRequest, NextResponse } from "next/server";
import { anthropic, extractText } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QACategoria = "texto" | "metadados" | "capa" | "diagramacao";
export type QAStatus   = "ok" | "aviso" | "erro";

export interface QAItem {
  categoria: QACategoria;
  status: QAStatus;
  mensagem: string;
}

export interface QAResult {
  project_id: string;
  score: number;        // 0–100
  aprovado: boolean;    // score >= 70 e sem erros críticos
  itens: QAItem[];
  recomendacao: string;
  analisado_em: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

// ─── POST /api/agentes/qa ─────────────────────────────────────────────────────

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

  // ── Load project data ─────────────────────────────────────────────────────
  let texto = "";
  let titulo = "";
  let sinopseCurta = "";
  let sinopseLonga = "";
  let palavrasChave: string[] = [];
  let temCapa = false;
  let temPdf = false;
  let temCreditos = false;
  let lombadaCapaMm: number | null = null;
  let lombadaMioloMm: number | null = null;
  let capaLarguraPx: number | null = null;
  let capaAlturaPx: number | null = null;
  let capaFormatoDpi = 300;

  if (isDev) {
    texto = "Lorem ipsum ".repeat(3000);
    titulo = "O Último Manuscrito";
    sinopseCurta = "Uma história sobre descoberta e superação.";
    sinopseLonga = "Um protagonista enfrenta desafios extraordinários em uma jornada épica.";
    palavrasChave = ["ficção", "aventura", "superação"];
    temCapa = true;
    temPdf = true;
    temCreditos = true;
    lombadaCapaMm = 14;
    lombadaMioloMm = 14;
    capaLarguraPx = 3543;
    capaAlturaPx = 2244;
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_elementos, dados_capa, dados_miolo, dados_creditos, dados_pdf, manuscript:manuscript_id(texto)")
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    const el    = project.dados_elementos as Record<string, unknown> | null;
    const capa  = project.dados_capa  as Record<string, unknown> | null;
    const miolo = project.dados_miolo as Record<string, unknown> | null;
    const ms    = project.manuscript  as { texto?: string } | null;

    texto         = ms?.texto ?? "";
    titulo        = (el?.titulo_escolhido as string) ?? (el?.opcoes_titulo as string[])?.[0] ?? "";
    sinopseCurta  = (el?.sinopse_curta as string) ?? "";
    sinopseLonga  = (el?.sinopse_longa as string) ?? "";
    palavrasChave = (el?.palavras_chave as string[]) ?? [];
    temCapa       = !!(capa?.url_escolhida ?? capa?.url);
    temPdf        = !!(project.dados_pdf as Record<string, unknown> | null)?.storage_path
                    || !!(miolo?.html_storage_path);
    temCreditos   = !!(project.dados_creditos as Record<string, unknown> | null)?.html_storage_path;

    // Lombada cross-check data
    lombadaMioloMm = (miolo?.lombada_mm as number) ?? null;

    // From upload: validacao has expected lombada embedded in expected dimensions
    const validacao = capa?.validacao as Record<string, unknown> | null;
    if (validacao) {
      // Back-calculate lombada from expected width: totalW = sangria + orelha + frente + lombada + frente + orelha + sangria
      // We stored largura_esperada_mm in validacao
      // Simpler: just compare lombadaMm stored on upload result if available
      lombadaCapaMm = (capa?.lombada_mm_na_validacao as number) ?? null;
    }
    if (!lombadaCapaMm && capa?.modo === "manual") {
      // Manual editor uses paginas too
      const pags = (capa.paginas as number) ?? 0;
      if (pags) lombadaCapaMm = Math.round(pags * 0.07 * 10) / 10;
    }

    capaLarguraPx = (capa?.largura_px as number) ?? null;
    capaAlturaPx  = (capa?.altura_px  as number) ?? null;
    capaFormatoDpi = (capa?.dpi as number) ?? 300;
  }

  // ── Structural checks ─────────────────────────────────────────────────────
  const itens: QAItem[] = [];
  const palavras = countWords(texto);

  if (!texto.trim()) {
    itens.push({ categoria: "texto", status: "erro", mensagem: "Nenhum texto encontrado. Execute o parse." });
  } else if (palavras < 1000) {
    itens.push({ categoria: "texto", status: "aviso", mensagem: `Manuscrito muito curto (${palavras} palavras). Mínimo recomendado: 10.000.` });
  } else if (palavras < 10000) {
    itens.push({ categoria: "texto", status: "aviso", mensagem: `Manuscrito curto (${palavras.toLocaleString("pt-BR")} palavras). Considere expandir.` });
  } else {
    itens.push({ categoria: "texto", status: "ok", mensagem: `${palavras.toLocaleString("pt-BR")} palavras — tamanho adequado.` });
  }

  if (!titulo) {
    itens.push({ categoria: "metadados", status: "erro", mensagem: "Título não definido. Complete a etapa de Elementos." });
  } else {
    itens.push({ categoria: "metadados", status: "ok", mensagem: `Título: "${titulo}"` });
  }

  itens.push(sinopseCurta
    ? { categoria: "metadados", status: "ok",    mensagem: "Sinopse curta presente." }
    : { categoria: "metadados", status: "aviso", mensagem: "Sinopse curta não preenchida." });

  itens.push(sinopseLonga
    ? { categoria: "metadados", status: "ok",    mensagem: "Sinopse longa presente." }
    : { categoria: "metadados", status: "aviso", mensagem: "Sinopse longa não preenchida." });

  itens.push(palavrasChave.length >= 3
    ? { categoria: "metadados", status: "ok",    mensagem: `${palavrasChave.length} palavras-chave definidas.` }
    : { categoria: "metadados", status: "aviso", mensagem: `Poucas palavras-chave (${palavrasChave.length}). Recomendado: 7–10.` });

  // Ficha catalográfica now lives in Créditos
  itens.push(temCreditos
    ? { categoria: "metadados", status: "ok",    mensagem: "Página de créditos com ficha catalográfica presente." }
    : { categoria: "metadados", status: "aviso", mensagem: "Página de créditos não gerada. Complete a etapa de Créditos." });

  // Cover
  if (!temCapa) {
    itens.push({ categoria: "capa", status: "erro", mensagem: "Capa não gerada. Complete a etapa de Capa." });
  } else {
    itens.push({ categoria: "capa", status: "ok", mensagem: "Capa gerada e selecionada." });

    // Cover resolution check (upload mode)
    if (capaLarguraPx !== null && capaAlturaPx !== null) {
      const minPx = Math.round(300 / capaFormatoDpi * capaLarguraPx);
      if (capaFormatoDpi < 300) {
        itens.push({
          categoria: "capa",
          status: "aviso",
          mensagem: `Capa em ${capaFormatoDpi}dpi. Plataformas de impressão exigem 300dpi para qualidade máxima.`,
        });
      } else {
        itens.push({ categoria: "capa", status: "ok", mensagem: `Capa em ${capaFormatoDpi}dpi — resolução adequada para impressão.` });
      }
    }

    // Lombada cross-check
    if (lombadaCapaMm !== null && lombadaMioloMm !== null) {
      const diff = Math.abs(lombadaCapaMm - lombadaMioloMm);
      if (diff > 2) {
        itens.push({
          categoria: "capa",
          status: "erro",
          mensagem: `Lombada da capa (${lombadaCapaMm}mm) diverge do miolo real (${lombadaMioloMm}mm) em ${diff.toFixed(1)}mm. Re-envie a capa com a lombada correta.`,
        });
      } else {
        itens.push({
          categoria: "capa",
          status: "ok",
          mensagem: `Lombada consistente: capa ${lombadaCapaMm}mm vs miolo ${lombadaMioloMm}mm (diferença ${diff.toFixed(1)}mm ≤ 2mm).`,
        });
      }
    } else if (lombadaMioloMm !== null && lombadaCapaMm === null) {
      itens.push({
        categoria: "capa",
        status: "aviso",
        mensagem: `Lombada do miolo real: ${lombadaMioloMm}mm. Verifique se a capa foi dimensionada com este valor.`,
      });
    }
  }

  // Miolo / PDF
  itens.push(temPdf
    ? { categoria: "diagramacao", status: "ok",    mensagem: "Miolo diagramado com sucesso." }
    : { categoria: "diagramacao", status: "aviso", mensagem: "Miolo não gerado. Complete a etapa de Diagramação." });

  // Credits injected into miolo
  itens.push(temCreditos && temPdf
    ? { categoria: "diagramacao", status: "ok",    mensagem: "Página de créditos incluída no miolo." }
    : temCreditos && !temPdf
    ? { categoria: "diagramacao", status: "aviso", mensagem: "Créditos prontos mas miolo ainda não foi gerado — regenere o miolo para incluí-los." }
    : { categoria: "diagramacao", status: "aviso", mensagem: "Página de créditos não encontrada no miolo." });

  // ── Score ─────────────────────────────────────────────────────────────────
  const erros  = itens.filter(i => i.status === "erro").length;
  const avisos = itens.filter(i => i.status === "aviso").length;
  const score  = Math.max(0, Math.round(100 - erros * 20 - avisos * 7));
  const aprovado = score >= 70 && erros === 0;

  // ── Claude recommendation ─────────────────────────────────────────────────
  const resumo = itens
    .map(i => `[${i.status.toUpperCase()}] ${i.categoria}: ${i.mensagem}`)
    .join("\n");

  const claudeRes = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Você é um consultor editorial. Analise o relatório QA abaixo e escreva UMA recomendação final em 2-3 frases em português. Seja direto e útil. Sem título, sem listas.

Título: ${titulo || "Não definido"}
Palavras: ${palavras.toLocaleString("pt-BR")}
Score: ${score}/100 | Aprovado: ${aprovado ? "sim" : "não"}

${resumo}`,
    }],
  });

  const recomendacao = extractText(claudeRes.content).trim();

  // ── Persist ───────────────────────────────────────────────────────────────
  const dados_qa: QAResult = {
    project_id,
    score,
    aprovado,
    itens,
    recomendacao,
    analisado_em: new Date().toISOString(),
  };

  await supabase
    .from("projects")
    .update({ dados_qa, etapa_atual: aprovado ? "qa" : "diagramacao" })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(dados_qa);
}

// ─── GET /api/agentes/qa?project_id=... ───────────────────────────────────────

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

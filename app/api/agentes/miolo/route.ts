export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import type { MioloConfig, CapituloInfo } from "@/lib/miolo-builder";
import { buildBookHtml, clampCorpoPt } from "@/lib/miolo-builder";
import { isFormatoValido, FORMATOS_VALORES, getFormatoDef, estimarPaginas, estimarLombadaMm } from "@/lib/formatos";
import { calcularCreditosInputHash } from "@/lib/creditos-hash";
import { buildCreditosContentHtml } from "@/lib/creditos-render";
import type { CreditosConfig, FichaOficialCRB } from "@/app/api/agentes/creditos/route";
import type { MioloResult } from "@/lib/project-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { MioloConfig, CapituloInfo } from "@/lib/miolo-builder";
export type { FormatoLivro, TemplateId } from "@/lib/miolo-builder";
export type { MioloResult } from "@/lib/project-data";

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: { project_id: string; config: MioloConfig };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id, config } = body;
  if (!project_id || !config) {
    return NextResponse.json({ error: "Campos obrigatórios: project_id, config." }, { status: 400 });
  }

  // Sanitiza corpo_pt: se vier fora da faixa válida (9.0–14.0) ou em tipo
  // errado, descarta — o builder aplica o default do template.
  const configMut = config as unknown as Record<string, unknown>;
  if ("corpo_pt" in configMut) {
    const cleaned = clampCorpoPt(configMut.corpo_pt);
    if (cleaned === undefined) {
      delete configMut.corpo_pt;
    } else {
      configMut.corpo_pt = cleaned;
    }
  }

  if (!isFormatoValido(config.formato)) {
    return NextResponse.json(
      {
        error: `Formato inválido. Valores aceitos: ${FORMATOS_VALORES.join(", ")}.`,
        received: (config as { formato?: unknown }).formato ?? null,
      },
      { status: 400 }
    );
  }

  // Load project data including credits for injection
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, manuscript_id, dados_creditos, manuscripts(titulo, subtitulo, texto, texto_revisado, autor_primeiro_nome, autor_sobrenome, genero_principal, capitulos_aprovados, capitulos_aprovados_texto_hash)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string; subtitulo?: string; texto?: string; texto_revisado?: string;
    autor_primeiro_nome?: string; autor_sobrenome?: string;
    genero_principal?: string;
    capitulos_aprovados?: { titulo: string; pos: number }[] | null;
    capitulos_aprovados_texto_hash?: string | null;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const subtitulo = ms?.subtitulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  // Prefer revised text if the author approved revisions
  const texto = ms?.texto_revisado ?? ms?.texto ?? "";

  if (!texto || texto.trim().length < 50) {
    return NextResponse.json(
      { error: "Texto do manuscrito não encontrado. Faça o upload primeiro." },
      { status: 422 }
    );
  }

  const livroSemCapitulos = config.tem_capitulos === false;

  // Enforce: sumário is incompatible with continuous-text books
  if (livroSemCapitulos && config.sumario) {
    (config as unknown as Record<string, unknown>).sumario = false;
  }

  let capitulos: { titulo: string; pos: number }[] = [];

  if (!livroSemCapitulos) {
    // Read approved chapters from the manuscript. The author approves these via
    // /api/agentes/miolo/propor-capitulos and /aprovar-capitulos before generating
    // the miolo. No fallback heuristic — explicit approval is required.
    const capitulosAprovados = ms?.capitulos_aprovados as
      | { titulo: string; pos: number }[]
      | null
      | undefined;

    const hashSalvo = ms?.capitulos_aprovados_texto_hash as string | null | undefined;

    if (!Array.isArray(capitulosAprovados) || capitulosAprovados.length === 0) {
      return NextResponse.json(
        {
          error: "Aprove os capítulos do livro antes de gerar o miolo.",
          action: "approve_chapters",
          reason: "no_approval",
        },
        { status: 422 }
      );
    }

    // Validar que o texto não mudou desde a aprovação
    const hashAtual = createHash("md5").update(texto).digest("hex");
    if (hashSalvo !== hashAtual) {
      console.log("[miolo] Hash do texto mudou desde a aprovação — forçando re-aprovação", {
        project_id,
        hashSalvo: hashSalvo?.slice(0, 8),
        hashAtual: hashAtual.slice(0, 8),
      });
      return NextResponse.json(
        {
          error: "O texto do manuscrito mudou desde a última aprovação de capítulos. Reaprove os capítulos.",
          action: "approve_chapters",
          reason: "text_changed",
        },
        { status: 422 }
      );
    }

    // Sort by position (defensive — UI should already send sorted, but enforce here)
    capitulos = [...capitulosAprovados].sort((a, b) => a.pos - b.pos);

    console.log("[miolo] Capítulos aprovados:", {
      project_id,
      total: capitulos.length,
      primeiros_5: capitulos.slice(0, 5).map(c => c.titulo),
    });
  } else {
    console.log("[miolo] Livro sem capítulos — gerando como texto contínuo", { project_id });
  }

  // Créditos aprovados são obrigatórios — sem fallback.
  const dadosCreditos = project.dados_creditos as {
    html_storage_path?: string | null;
    input_hash?: string;
    paginas_usadas?: number;
    config?: CreditosConfig;
    ficha_oficial?: FichaOficialCRB;
  } | null;

  // Sem etapa de créditos concluída: exige o step antes de gerar miolo.
  // Nota: bypass "sem créditos" também passa pela etapa (input_hash é gravado)
  // — o que muda é apenas que `html_storage_path` fica null.
  if (!dadosCreditos?.input_hash || !dadosCreditos?.config) {
    return NextResponse.json(
      {
        error: "Gere e aprove a página de créditos antes de gerar o miolo final.",
        action: "generate_creditos",
        reason: "no_creditos",
      },
      { status: 422 }
    );
  }

  // Bloco 1h: normaliza propósito legado antes de propagar para o builder.
  const propositoRaw = dadosCreditos.config.proposito as string | undefined;
  const propositoCreditos: "digital" | "completa" =
    propositoRaw === "livrarias" ? "completa"
    : propositoRaw === "pessoal" || propositoRaw === "digital" ? "digital"
    : propositoRaw === "completa" ? "completa"
    : "digital";
  // Bypass "sem créditos": marcado pela ausência de html persistido.
  const semCreditos = dadosCreditos.html_storage_path === null;

  // Verificar drift de dados — hash usa as mesmas páginas que o créditos usou,
  // evitando deadlock na primeira passagem quando dados_miolo ainda não existe.
  const hashAtualCreditos = calcularCreditosInputHash({
    titulo,
    subtitulo,
    autor,
    genero: ms?.genero_principal ?? "Literatura",
    paginas: dadosCreditos.paginas_usadas ?? 0,
    formato: config.formato,
    proposito: propositoCreditos,
    ano_copyright: dadosCreditos.config.ano_copyright ?? 0,
    ano_edicao: dadosCreditos.config.ano_edicao ?? null,
    isbn: dadosCreditos.config.isbn ?? "",
    titular_direitos: dadosCreditos.config.titular_direitos ?? "",
    nome_editora: dadosCreditos.config.nome_editora ?? "",
  });

  if (hashAtualCreditos !== dadosCreditos.input_hash) {
    console.log("[miolo] Créditos desatualizados — forçando reaprovação", {
      project_id,
      hashSalvo: dadosCreditos.input_hash.slice(0, 8),
      hashAtual: hashAtualCreditos.slice(0, 8),
    });
    return NextResponse.json(
      {
        error: "Os dados do livro mudaram desde a aprovação da página de créditos. Reaprove a página de créditos.",
        action: "generate_creditos",
        reason: "data_changed",
      },
      { status: 422 }
    );
  }

  // Render dos créditos em runtime — fonte única da verdade.
  // Bloco 1h: se o autor optou por não incluir créditos, passa string vazia;
  // o builder insere verso branco no lugar (paridade recto/verso preservada).
  const creditosInnerHtml = semCreditos
    ? ""
    : buildCreditosContentHtml({
        config: dadosCreditos.config,
        fichaOficial: dadosCreditos.ficha_oficial,
        titulo,
        subtitulo,
        autor,
      });

  // Bloco 1h: propaga apenas o propósito. Half-title e folha de rosto são
  // sempre emitidos pelo builder.
  const configComProposito: MioloConfig = {
    ...config,
    proposito: propositoCreditos,
  };

  // Build HTML — two passes when sumário is on so TOC shows real page numbers.
  // Pass 1 (no TOC): get chapterStartPages from actual page counter.
  // Pass 2: rebuild with those real numbers injected into the TOC.
  const buildArgs = { titulo, subtitulo, autor, texto, capitulos, config: configComProposito, creditosInnerHtml };
  const pass1 = buildBookHtml({ ...buildArgs, config: { ...configComProposito, sumario: false } });
  const { html, capitulosInfo, paginasReais } =
    configComProposito.sumario && pass1.capitulosInfo.length > 1
      ? buildBookHtml({ ...buildArgs, chapterStartPagesOverride: pass1.chapterStartPages })
      : pass1;

  const numPalavras = texto.split(/\s+/).filter(Boolean).length;
  const numCaracteres = texto.length;
  const spec = getFormatoDef(config.formato).specs;
  const paginasEstimadas = estimarPaginas(spec, config.corpo_pt, numCaracteres);
  // Fórmula gráfica BR para papéis lisos: lombada (cm) = (gsm × pgs) / 14400
  // Multiplica por 10 para mm, arredonda para 1 casa decimal.
  // Usa paginasReais do builder (estimativa detalhada) para a lombada
  // exibida pré-PDF; o gerar-pdf recalcula com a contagem real depois.
  const lombadaMm = estimarLombadaMm(paginasReais);

  // Upload HTML to storage
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = `${user.id}/miolo_${project_id}.html`;

  const htmlBuffer = Buffer.from(html, "utf-8");
  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, htmlBuffer, {
      contentType: "text/html",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[miolo] Erro upload — contexto completo:", {
      storagePath,
      contentType: "text/html",
      bufferBytes: htmlBuffer.length,
      bufferKB: Math.round(htmlBuffer.length / 1024),
      errorName: uploadErr.name,
      errorMessage: uploadErr.message,
      errorJSON: JSON.stringify(uploadErr, Object.getOwnPropertyNames(uploadErr)),
    });
    return NextResponse.json(
      {
        error: "Erro ao salvar o miolo gerado.",
        detail: uploadErr.message,
        debug: {
          storagePath,
          bufferKB: Math.round(htmlBuffer.length / 1024),
          contentType: "text/html",
        },
      },
      { status: 500 }
    );
  }

  const mioloResult: MioloResult = {
    config,
    html_storage_path: storagePath,
    capitulos: capitulosInfo,
    paginas_estimadas: paginasEstimadas,
    // paginas_reais começa null. Só o `gerar-pdf` (que conta o PDF gerado
    // via pdf-lib) sabe o valor real. Consumidores fazem
    // `paginas_reais ?? paginas_estimadas` como fallback honesto.
    paginas_reais: null,
    lombada_mm: lombadaMm,
    palavras: numPalavras,
    caracteres: numCaracteres,
    gerado_em: new Date().toISOString(),
  };

  // Save to project. Invalida dados_pdf: ao regerar o miolo, qualquer PDF
  // antigo perde validade (a configuração mudou). Sem isso, a sidebar da
  // Diagramação continua exibindo "Páginas" e "Lombada" como se o PDF
  // ainda fosse válido, induzindo o autor ao erro.
  //
  // Também invalida pdf_grafica de dados_capa quando a contagem estimada de
  // páginas diverge — a lombada usada no PDF gráfica anterior fica errada.
  // Se a estimativa bater com o valor gravado, preserva.
  const { data: capaRow } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const capaAtual = (capaRow?.dados_capa ?? null) as Record<string, unknown> | null;
  let novoDadosCapa: Record<string, unknown> | null = capaAtual;
  if (capaAtual?.pdf_grafica) {
    const pg = capaAtual.pdf_grafica as { paginas_no_momento?: number } | null;
    if (pg?.paginas_no_momento !== paginasEstimadas) {
      novoDadosCapa = { ...capaAtual, pdf_grafica: null };
    }
  }

  const updatePayload: Record<string, unknown> = {
    dados_miolo: mioloResult,
    dados_pdf: null,
  };
  if (novoDadosCapa !== capaAtual) {
    updatePayload.dados_capa = novoDadosCapa;
  }

  const { error: updateErr } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[miolo] Erro ao salvar:", updateErr);
    return NextResponse.json({ error: "Miolo gerado, mas falha ao salvar no banco." }, { status: 500 });
  }

  // Return signed URL for preview (1 hour)
  const { data: signed } = await storageClient.storage
    .from("manuscripts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    ok: true,
    miolo: mioloResult,
    preview_url: signed?.signedUrl ?? null,
    html,
    creditos_input_hash: dadosCreditos.input_hash,
  });
  } catch (err) {
    console.error("[miolo] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar o miolo. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET — refresh signed URL ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const project_id = request.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório." }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project?.dados_miolo) return NextResponse.json(null);

  const miolo = project.dados_miolo as MioloResult;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const [{ data: signed }, { data: htmlBlob }] = await Promise.all([
    storageClient.storage.from("manuscripts").createSignedUrl(miolo.html_storage_path, 3600),
    storageClient.storage.from("manuscripts").download(miolo.html_storage_path),
  ]);

  const html = htmlBlob ? await htmlBlob.text() : null;

  return NextResponse.json({ miolo, preview_url: signed?.signedUrl ?? null, html });
  } catch (err) {
    console.error("[miolo] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter o miolo. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

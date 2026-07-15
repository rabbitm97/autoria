export const maxDuration = 60;

// Bloco 1f: rota síncrona, sem IA. A ficha oficial é entrada humana
// (elaborada por bibliotecário CRB) ou é omitida por completo.
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { createClient } from "@supabase/supabase-js";
import { type FormatoLivro, getFormatoDef, isFormatoValido, estimarPaginas } from "@/lib/formatos";
import { calcularCreditosInputHash } from "@/lib/creditos-hash";
import { buildCreditosContentHtml } from "@/lib/creditos-render";
import { getBodyFontFamily, type TemplateId } from "@/lib/miolo-builder";
import { validarProjectData } from "@/lib/project-data";
import type {
  PropositoPublicacao,
  CreditosConfig,
  FichaOficialCRB,
  CreditosResult,
} from "@/lib/project-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type {
  PropositoPublicacao,
  CreditosConfig,
  FichaOficialCRB,
  CreditosResult,
} from "@/lib/project-data";

// ─── HTML builder — standalone preview/download envelope ─────────────────────

function buildCreditosStandaloneHtml(params: {
  config: CreditosConfig;
  fichaOficial?: FichaOficialCRB;
  titulo: string;
  subtitulo: string;
  autor: string;
  bodyFontFamily?: string;
}): string {
  const content = buildCreditosContentHtml(params);
  const { width_cm, height_cm } = getFormatoDef(params.config.formato).specs;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; }
.page { width: ${width_cm}cm; min-height: ${height_cm}cm; margin: 0 auto; padding: 3cm 2.2cm 2.5cm 2.5cm; display: flex; flex-direction: column; }
@media print { @page { size: ${width_cm}cm ${height_cm}cm; margin: 0; } body { background: #fff; } }
</style>
</head>
<body>
<div class="page">
${content}
</div>
</body>
</html>`;
}

// ─── POST — generate credits page ────────────────────────────────────────────

const PROPOSITOS_VALIDOS: readonly PropositoPublicacao[] = ["digital", "completa"];

export async function POST(request: NextRequest) {
  try {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  let body: {
    project_id: string;
    config: CreditosConfig;
    ficha_oficial_input?: {
      numero_chamada: string;
      entrada_autor: string;
      descricao_bibliografica: string;
      notas_gerais?: string;
      assuntos: string;
      cdd: string;
      cdu: string;
      bibliotecario_nome: string;
      bibliotecario_crb: string;
      declaracao_aceita: boolean;
    };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id, config } = body;
  if (!project_id || !config) {
    return NextResponse.json(
      { error: "Campos obrigatórios: project_id, config." },
      { status: 400 }
    );
  }

  // Bloco 1h: normalização retrocompat. Valores antigos ("pessoal",
  // "livrarias") são convertidos silenciosamente para os novos.
  const propositoRaw = config.proposito as string;
  if (propositoRaw === "pessoal") {
    config.proposito = "digital";
    config.incluir_creditos = false;
  } else if (propositoRaw === "livrarias") {
    config.proposito = "completa";
  }

  if (!PROPOSITOS_VALIDOS.includes(config.proposito)) {
    return NextResponse.json(
      { error: "Campo 'proposito' obrigatório. Valores: digital, completa." },
      { status: 400 }
    );
  }

  const exigeOficial = config.proposito === "completa";
  const incluirCreditos =
    exigeOficial ? true : (config.incluir_creditos !== false);

  // Bloco 1h: validação só quando créditos serão gerados.
  if (incluirCreditos) {
    if (typeof config.ano_copyright !== "number" || !Number.isFinite(config.ano_copyright)) {
      return NextResponse.json(
        { error: "Campo obrigatório: ano_copyright (número)." },
        { status: 400 }
      );
    }

    if (!config.titular_direitos || typeof config.titular_direitos !== "string" || !config.titular_direitos.trim()) {
      return NextResponse.json(
        { error: "Campo obrigatório: titular_direitos (texto não vazio)." },
        { status: 400 }
      );
    }
  }

  // Publicação completa: exige dados completos do bibliotecário CRB.
  const CRB_REGEX = /^CRB-([1-9]|1[0-5])\/\d{1,6}$/;

  if (exigeOficial) {
    const fo = body.ficha_oficial_input;
    if (!fo) {
      return NextResponse.json(
        { error: "Modo 'completa' requer ficha oficial preenchida pelo bibliotecário." },
        { status: 400 }
      );
    }

    const camposObrigatorios: Array<[string, string | undefined]> = [
      ["numero_chamada",           fo.numero_chamada],
      ["entrada_autor",            fo.entrada_autor],
      ["descricao_bibliografica",  fo.descricao_bibliografica],
      ["assuntos",                 fo.assuntos],
      ["cdd",                      fo.cdd],
      ["cdu",                      fo.cdu],
      ["bibliotecario_nome",       fo.bibliotecario_nome],
    ];
    for (const [nome, valor] of camposObrigatorios) {
      if (!valor?.trim()) {
        return NextResponse.json(
          { error: `Campo obrigatório no modo completa: ${nome}.` },
          { status: 400 }
        );
      }
    }
    if (!CRB_REGEX.test(fo.bibliotecario_crb?.trim() ?? "")) {
      return NextResponse.json(
        { error: "CRB inválido. Formato esperado: CRB-X/YYYY (ex: CRB-8/12345)." },
        { status: 400 }
      );
    }
    if (fo.declaracao_aceita !== true) {
      return NextResponse.json(
        { error: "Declaração de veracidade deve ser aceita." },
        { status: 400 }
      );
    }
  }

  // Load project data
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, formato, dados_elementos, dados_miolo, manuscripts(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, genero_principal, texto, texto_revisado)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const formatoDb = (project as unknown as { formato?: string }).formato;
  if (!formatoDb || !isFormatoValido(formatoDb)) {
    return NextResponse.json(
      {
        error: "Formato do projeto não definido. Configure o formato antes de gerar a página de créditos.",
        action: "set_format",
      },
      { status: 422 }
    );
  }
  const configResolved: CreditosConfig = { ...config, formato: formatoDb as FormatoLivro };

  // Páginas: preferir reais (do miolo já gerado), cair para estimadas, ou estimar do texto.
  const mioloData = project.dados_miolo as {
    paginas_reais?: number;
    paginas_estimadas?: number;
    config?: { template?: TemplateId };
  } | null;
  let paginasParaFicha = mioloData?.paginas_reais ?? mioloData?.paginas_estimadas ?? 0;
  let paginasOrigem: "real" | "estimada" = mioloData?.paginas_reais ? "real" : "estimada";

  if (paginasParaFicha < 1) {
    const msText = project.manuscripts as unknown as { texto_revisado?: string; texto?: string } | null;
    const textoFull = msText?.texto_revisado ?? msText?.texto ?? "";
    const numCaracteres = textoFull.length;
    const spec = getFormatoDef(configResolved.formato).specs;
    paginasParaFicha = estimarPaginas(spec, undefined, numCaracteres);
    paginasOrigem = "estimada";
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
  } | null;

  const el = project.dados_elementos as { titulo_escolhido?: string; subtitulo?: string } | null;
  const titulo = el?.titulo_escolhido ?? ms?.titulo ?? "Sem título";
  const subtitulo = el?.subtitulo ?? ms?.subtitulo?.trim() ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const genero = ms?.genero_principal ?? "Literatura";

  // Modo completa: monta ficha_oficial com log de aceite (IP + user_agent).
  let fichaOficial: FichaOficialCRB | undefined = undefined;

  if (exigeOficial && body.ficha_oficial_input) {
    const fo = body.ficha_oficial_input;
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "desconhecido";
    const userAgent = request.headers.get("user-agent") ?? undefined;

    fichaOficial = {
      numero_chamada:          fo.numero_chamada.trim(),
      entrada_autor:           fo.entrada_autor.trim(),
      descricao_bibliografica: fo.descricao_bibliografica.trim(),
      notas_gerais:            fo.notas_gerais?.trim() || undefined,
      assuntos:                fo.assuntos.trim(),
      cdd:                     fo.cdd.trim(),
      cdu:                     fo.cdu.trim(),
      bibliotecario_nome:      fo.bibliotecario_nome.trim(),
      bibliotecario_crb:       fo.bibliotecario_crb.trim(),
      declaracao_aceita_em:    new Date().toISOString(),
      declaracao_ip:           ip,
      declaracao_user_agent:   userAgent,
    };
  }

  const inputHash = calcularCreditosInputHash({
    titulo,
    subtitulo,
    autor,
    genero,
    paginas: paginasParaFicha,
    formato: configResolved.formato,
    proposito: configResolved.proposito,
    ano_copyright: configResolved.ano_copyright,
    ano_edicao: configResolved.ano_edicao ?? null,
    isbn: (configResolved.isbn ?? "").trim(),
    titular_direitos: configResolved.titular_direitos,
    nome_editora: configResolved.nome_editora ?? "",
  });

  // Bloco 1h: bypass quando autor optou por não incluir créditos.
  // Persiste o marcador para o miolo-builder pular a página de créditos
  // e inserir verso branco no lugar (paridade recto/verso).
  if (!incluirCreditos) {
    const result: CreditosResult = {
      config: configResolved,
      html_storage_path: null,
      input_hash: inputHash,
      paginas_usadas: paginasParaFicha,
      paginas_origem: paginasOrigem,
      gerado_em: new Date().toISOString(),
    };

    validarProjectData("dados_creditos", result, {
      modo: "observador", contexto: "creditos-bypass",
    });

    const { ok: bypassOk } = await updateProject(supabase, project_id, user.id, {
      dados_creditos: result,
    }, "creditos-bypass");

    if (!bypassOk) {
      return NextResponse.json(
        { error: "Falha ao salvar configuração no banco." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, creditos: result, preview_url: null, html: null });
  }

  // Créditos incluídos: monta e persiste HTML.
  const template = mioloData?.config?.template;
  const bodyFontFamily = template ? getBodyFontFamily(template) : undefined;
  const html = buildCreditosStandaloneHtml({
    config: configResolved,
    fichaOficial,
    titulo,
    subtitulo,
    autor,
    bodyFontFamily,
  });

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = `${user.id}/creditos_${project_id}.html`;

  const buffer = Buffer.from(html, "utf-8");
  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, buffer, {
      contentType: "text/html",
      upsert: true,
    });

  if (uploadErr) {
    console.error("[creditos] Erro upload — contexto completo:", {
      storagePath,
      contentType: "text/html",
      bufferBytes: buffer.length,
      bufferKB: Math.round(buffer.length / 1024),
      errorName: uploadErr.name,
      errorMessage: uploadErr.message,
      errorJSON: JSON.stringify(uploadErr, Object.getOwnPropertyNames(uploadErr)),
    });
    return NextResponse.json(
      {
        error: "Erro ao salvar a página de créditos.",
        detail: uploadErr.message,
        debug: {
          storagePath,
          bufferKB: Math.round(buffer.length / 1024),
          contentType: "text/html",
        },
      },
      { status: 500 }
    );
  }

  const result: CreditosResult = {
    config: configResolved,
    ficha_oficial: fichaOficial,
    html_storage_path: storagePath,
    input_hash: inputHash,
    paginas_usadas: paginasParaFicha,
    paginas_origem: paginasOrigem,
    gerado_em: new Date().toISOString(),
  };

  validarProjectData("dados_creditos", result, {
    modo: "observador", contexto: "creditos",
  });

  const { ok: creditosOk } = await updateProject(supabase, project_id, user.id, {
    dados_creditos: result,
  }, "creditos");

  if (!creditosOk) {
    return NextResponse.json(
      { error: "Página gerada, mas falha ao salvar no banco." },
      { status: 500 }
    );
  }

  const { data: signed } = await storageClient.storage
    .from("manuscripts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({ ok: true, creditos: result, preview_url: signed?.signedUrl ?? null, html });
  } catch (err) {
    console.error("[creditos] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar a página de créditos. A equipe foi notificada.",
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
    .select("dados_creditos")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (!project?.dados_creditos) return NextResponse.json(null);

  const creditos = project.dados_creditos as CreditosResult;

  // Sem créditos: HTML não é persistido.
  if (!creditos.html_storage_path) {
    return NextResponse.json({ creditos, preview_url: null, html: null });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const [{ data: signed }, { data: htmlBlob }] = await Promise.all([
    storageClient.storage.from("manuscripts").createSignedUrl(creditos.html_storage_path, 3600),
    storageClient.storage.from("manuscripts").download(creditos.html_storage_path),
  ]);

  const html = htmlBlob ? await htmlBlob.text() : null;

  return NextResponse.json({ creditos, preview_url: signed?.signedUrl ?? null, html });
  } catch (err) {
    console.error("[creditos] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter a página de créditos. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

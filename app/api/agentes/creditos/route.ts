export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { anthropic, parseLLMJson, extractText, traceClaudeCall } from "@/lib/anthropic";
import { requireAuth } from "@/lib/supabase-server";
import { getAgentPrompt } from "@/lib/agent-prompts";
import { createClient } from "@supabase/supabase-js";
import { type FormatoLivro, getFormatoDef, isFormatoValido, estimarPaginas } from "@/lib/formatos";
import { calcularCreditosInputHash } from "@/lib/creditos-hash";
import { buildCreditosContentHtml, type FichaCatalografica } from "@/lib/creditos-render";
import { getBodyFontFamily, type TemplateId } from "@/lib/miolo-builder";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreditosConfig {
  formato: FormatoLivro;

  // Direitos autorais
  ano_copyright: number;
  titular_direitos: string;       // Nome do detentor dos direitos

  // Tradução (opcional)
  titulo_original?: string;
  idioma_original?: string;

  // Equipe técnica (todos opcionais)
  traducao?: string;
  revisao_tecnica?: string;
  revisao?: string;
  preparacao?: string;
  diagramacao?: string;
  projeto_capa?: string;
  ilustracao_capa?: string;
  producao_editorial?: string;
  outros_creditos?: string;       // Campo livre para outros créditos

  // Editora
  nome_editora?: string;
  numero_edicao?: string;         // ex: "1ª edição"
  ano_edicao?: number;
  local_edicao?: string;
  endereco_editora?: string;
  cidade_estado?: string;
  cep?: string;
  site_editora?: string;
  email_editora?: string;

  // Ficha catalográfica — sugestão IA por padrão
  incluir_ficha: boolean;
  tipo_ficha?: "sugestao_ia" | "oficial_crb"; // default: 'sugestao_ia'
  isbn?: string;
  assuntos_livres?: string;       // ex: "1. Romance brasileiro. 2. Ficção."
  cdd?: string;
  cdu?: string;
}

export interface FichaOficialCRB {
  // Campos elaborados pelo bibliotecário
  numero_chamada: string;
  entrada_autor: string;
  descricao_bibliografica: string;
  assuntos: string;               // texto, uma linha por assunto
  cdd: string;
  cdu: string;

  // Identificação e log de aceite
  bibliotecario_nome: string;
  bibliotecario_crb: string;      // formato: CRB-X/YYYY (ex: CRB-8/12345)
  declaracao_aceita_em: string;   // ISO timestamp
  declaracao_ip: string;
  declaracao_user_agent?: string;
}

export interface CreditosResult {
  config: CreditosConfig;
  ficha_catalografica?: FichaCatalografica;
  ficha_oficial?: FichaOficialCRB;
  html_storage_path: string;
  input_hash: string;
  paginas_usadas: number;
  paginas_origem: "real" | "estimada";
  gerado_em: string;
}

// ─── Claude prompt — ficha catalográfica ─────────────────────────────────────

const FALLBACK_PROMPT = `\
Você é um catalogador de bibliotecas brasileiro, especializado em gerar fichas catalográficas \
seguindo o padrão AACR2/RDA e a norma ABNT NBR 6029. Gere a ficha catalográfica para o livro descrito.

## REGRAS DE OURO — LEIA COM ATENÇÃO

1. **Caracteres permitidos em CDU, CDD e numero_chamada:** APENAS caracteres ASCII latinos.
   Use somente dígitos (0-9), letras latinas (A-Z, a-z), ponto (.), dois pontos (:),
   barra (/), hífen (-), parênteses (), ponto-e-vírgula (;) e espaço.
   NUNCA use caracteres não-latinos (cirílico, chinês, árabe, grego, etc.),
   NUNCA use letras acentuadas dentro desses códigos, NUNCA use símbolos exóticos.

2. **Data de nascimento do autor:** só inclua se a data for informada explicitamente
   no input. Se o input NÃO informar a data de nascimento (ou informar "não informado",
   "desconhecido" ou similar), a entrada do autor DEVE ser apenas:

   \`SOBRENOME, Nome.\`  (com ponto final, sem vírgula, sem traço, sem placeholder)

   Exemplos CORRETOS:
   - Com data informada: \`COELHO, Mateus, 1985-\`
   - Sem data informada: \`COELHO, Mateus.\`
   - Autor falecido:     \`COELHO, Mateus, 1974-2020.\`

   Exemplos ERRADOS (NUNCA usar):
   - \`COELHO, Mateus, 199?-\`  (placeholder inventado)
   - \`COELHO, Mateus, XXXX-\`  (placeholder literal)
   - \`COELHO, Mateus, -\`      (traço solto)

3. **Subtítulo:** se houver, incluí-lo na descrição bibliográfica no padrão
   \`Título principal : Subtítulo / Autor.\`

## FORMATO DE RESPOSTA

Retorne EXCLUSIVAMENTE um objeto JSON válido com exatamente estes campos:
{
  "numero_chamada": "código Cutter-Sanborn ou PHA: 1 letra maiúscula do sobrenome do autor + 3 dígitos numéricos + 1 letra minúscula inicial do título (ex: M854i, C672e). Apenas ASCII.",
  "entrada_autor": "SOBRENOME, Nome[, YYYY-][ | , YYYY-YYYY.] — ver Regra 2 acima",
  "descricao_bibliografica": "Título principal : Subtítulo / Nome Autor. – X. ed. – Local : Editora, Ano. (Se não houver subtítulo, omitir ' : Subtítulo'. Se não houver indicação de edição, omitir ' – X. ed.')",
  "extensao": "XXXp. : XX × XX cm",
  "isbn_formatado": "ISBN XXX-XX-XXXXX-XX-X  (ou string vazia se não informado)",
  "assuntos": ["1. Assunto principal. I. Título.", "mais itens numerados se relevante"],
  "cdd": "classificação CDD numérica em ASCII (ex: 869.3, 658.421). APENAS dígitos e ponto.",
  "cdu": "classificação CDU numérica em ASCII (ex: 821.134.3-3, 658.012.4:004.8). APENAS dígitos, ponto, dois pontos, barra, hífen, parênteses e espaço."
}`;

// ─── Validação e fallbacks ─────────────────────────────────────────────────

// Regex ASCII-only para códigos de catalogação.
// CDU aceita: dígitos, . : / - ( ) espaço ;   (ex: 658.012.4:004.8)
// CDD aceita: dígitos, . espaço                (ex: 658.421)
// numero_chamada aceita: 1 letra ASCII + dígitos + letra opcional (ex: C672e, M854i)
const CDU_REGEX = /^[0-9.:/\-()\s;]+$/;
const CDD_REGEX = /^[0-9.\s]+$/;
const NUMERO_CHAMADA_REGEX = /^[A-Z][0-9]{1,4}[.\-]?[a-z]?[0-9]?$/;

// Detecta entrada_autor com placeholder alucinado.
// Casa: `, 199?-`, `, XXXX-`, `, ?-`, `, X-`, trailing `- ` com nada antes,
// ou qualquer `X`/`?` na área da data.
const ENTRADA_AUTOR_PLACEHOLDER = /,\s*(?:[X?]+[-]?|[0-9]*\?[-]?|X{2,}[-]?)\s*\.?$/;

// Tabela de fallback CDU/CDD por gênero — usada se o Claude falhar 2x.
// Baseada em classificações CDU/CDD padrão para autopublicação BR.
const FALLBACK_CATALOGACAO: Record<string, { cdu: string; cdd: string }> = {
  // Ficção
  "ficcao":                 { cdu: "82-3",         cdd: "800"    },
  "romance":                { cdu: "82-31",        cdd: "808.3"  },
  "romance_brasileiro":     { cdu: "82-31(81)",    cdd: "869.3"  },
  "conto":                  { cdu: "82-32",        cdd: "808.31" },
  "poesia":                 { cdu: "82-1",         cdd: "800.1"  },
  "poesia_brasileira":      { cdu: "82-1(81)",     cdd: "869.1"  },
  "teatro":                 { cdu: "82-2",         cdd: "808.2"  },
  "fantasia":               { cdu: "82-312.9",     cdd: "808.3"  },
  "ficcao_cientifica":      { cdu: "82-312.9",     cdd: "808.3"  },
  "suspense":               { cdu: "82-312.4",     cdd: "808.3"  },
  // Não-ficção pessoal
  "biografia":              { cdu: "929",          cdd: "920"    },
  "autobiografia":          { cdu: "929",          cdd: "920"    },
  "memorias":               { cdu: "82-94",        cdd: "920"    },
  "ensaio":                 { cdu: "82-4",         cdd: "814"    },
  // Autoajuda / desenvolvimento pessoal
  "autoajuda":              { cdu: "159.9.019",    cdd: "158"    },
  "desenvolvimento_pessoal":{ cdu: "159.923",      cdd: "158.1"  },
  // Negócios
  "empreendedorismo":       { cdu: "658.421",      cdd: "658.421"},
  "administracao":          { cdu: "658",          cdd: "658"    },
  "gestao":                 { cdu: "658",          cdd: "658"    },
  "marketing":              { cdu: "658.8",        cdd: "658.8"  },
  "financas":               { cdu: "332.024",      cdd: "332.024"},
  "financas_pessoais":      { cdu: "332.024",      cdd: "332.024"},
  // Educação / conhecimento
  "educacao":               { cdu: "37",           cdd: "370"    },
  "psicologia":             { cdu: "159.9",        cdd: "150"    },
  "filosofia":              { cdu: "1",            cdd: "100"    },
  "historia":               { cdu: "94",           cdd: "900"    },
  // Religião
  "religiao":               { cdu: "2",            cdd: "200"    },
  "cristianismo":           { cdu: "27",           cdd: "230"    },
  "espiritualidade":        { cdu: "133",          cdd: "133"    },
  // Infantojuvenil
  "infantil":               { cdu: "82-93",        cdd: "808.899"},
  "juvenil":                { cdu: "82-93",        cdd: "808.899"},
  // Técnico
  "tecnico":                { cdu: "62",           cdd: "600"    },
  "tecnologia":             { cdu: "004",          cdd: "004"    },
  "programacao":            { cdu: "004.4",        cdd: "005.1"  },
  // Saúde
  "saude":                  { cdu: "61",           cdd: "610"    },
  "medicina":               { cdu: "61",           cdd: "610"    },
  "nutricao":               { cdu: "612.3",        cdd: "613.2"  },
  "culinaria":              { cdu: "641",          cdd: "641"    },
  // Outros
  "esportes":               { cdu: "796",          cdd: "796"    },
  "arte":                   { cdu: "7",            cdd: "700"    },
  "literatura":             { cdu: "82",           cdd: "800"    },
};

const FALLBACK_GENERICO = { cdu: "82", cdd: "800" };

function normalizarGenero(g: string): string {
  return g
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function fallbackPorGenero(genero: string): { cdu: string; cdd: string } {
  const key = normalizarGenero(genero);
  if (FALLBACK_CATALOGACAO[key]) return FALLBACK_CATALOGACAO[key];
  for (const [k, v] of Object.entries(FALLBACK_CATALOGACAO)) {
    if (key.startsWith(k) || key.includes(k)) return v;
  }
  return FALLBACK_GENERICO;
}

function sanearFicha(
  ficha: FichaCatalografica,
  genero: string,
  autorNome: string
): { ficha: FichaCatalografica; correcoes: string[] } {
  const correcoes: string[] = [];
  const saneada: FichaCatalografica = { ...ficha };

  if (ENTRADA_AUTOR_PLACEHOLDER.test(saneada.entrada_autor)) {
    const partes = autorNome.trim().split(/\s+/);
    if (partes.length >= 2) {
      const sobrenome = partes[partes.length - 1].toUpperCase();
      const nome = partes.slice(0, -1).join(" ");
      saneada.entrada_autor = `${sobrenome}, ${nome}.`;
    } else {
      saneada.entrada_autor = `${autorNome}.`;
    }
    correcoes.push("entrada_autor_placeholder_removido");
  }

  if (!CDU_REGEX.test(saneada.cdu)) {
    saneada.cdu = fallbackPorGenero(genero).cdu;
    correcoes.push("cdu_fallback");
  }

  if (!CDD_REGEX.test(saneada.cdd)) {
    saneada.cdd = fallbackPorGenero(genero).cdd;
    correcoes.push("cdd_fallback");
  }

  if (!NUMERO_CHAMADA_REGEX.test(saneada.numero_chamada)) {
    const partes = autorNome.trim().split(/\s+/);
    const sobrenome = partes[partes.length - 1] || "A";
    const inicial = sobrenome.charAt(0).toUpperCase();
    saneada.numero_chamada = `${inicial}000`;
    correcoes.push("numero_chamada_fallback");
  }

  return { ficha: saneada, correcoes };
}

async function gerarFichaCatalografica(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  paginas: number;
  ano: number;
  editora: string;
  local: string;
  isbn: string;
  formato: FormatoLivro;
  context?: { userId?: string; projectId?: string };
}): Promise<FichaCatalografica | null> {
  const { titulo, subtitulo, autor, genero, paginas, ano, editora, local, isbn, formato, context } = params;
  const { width_cm, height_cm } = getFormatoDef(formato).specs;
  const dim = { w: `${width_cm}cm`, h: `${height_cm}cm` };
  const FICHA_PROMPT = await getAgentPrompt("creditos", FALLBACK_PROMPT);

  const fichaUserContent = `Gere a ficha catalográfica para:\n\nTítulo: ${titulo}\n` +
    (subtitulo ? `Subtítulo: ${subtitulo}\n` : "") +
    `Autor: ${autor}\n` +
    `Data de nascimento do autor: não informada (aplicar Regra 2: entrada apenas com SOBRENOME, Nome.)\n` +
    `Gênero: ${genero}\n` +
    `Páginas: ${paginas}\nAno: ${ano}\nEditora: ${editora || "Autoria"}\nLocal: ${local || "São Paulo"}\n` +
    `ISBN: ${isbn || "não informado"}\nFormato: ${dim.w} × ${dim.h}`;

  const RETRY_REINFORCEMENT = `\n\n## ATENÇÃO — TENTATIVA 2 DE 2

A tentativa anterior violou uma ou mais regras. Verifique:
- CDU, CDD e numero_chamada usam APENAS caracteres ASCII latinos (0-9, A-Z, a-z, . : / - ( ) ; espaço).
- Se o input diz "Data de nascimento não informada", a entrada_autor é APENAS "SOBRENOME, Nome." — não inclua ano, traço ou placeholder.
- Retorne APENAS o JSON, sem texto adicional.`;

  async function callClaude(reforcado: boolean): Promise<FichaCatalografica | null> {
    try {
      const system = reforcado ? FICHA_PROMPT + RETRY_REINFORCEMENT : FICHA_PROMPT;
      const msg = await traceClaudeCall({
        agentName: reforcado ? "creditos-retry" : "creditos",
        projectId: context?.projectId,
        userId: context?.userId,
        model: "claude-sonnet-4-6",
        input: { system, messages: [{ role: "user", content: fichaUserContent }] },
        fn: () => anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system,
          messages: [{ role: "user", content: fichaUserContent }],
        }),
      });
      const raw = extractText(msg.content);
      const data = parseLLMJson<FichaCatalografica>(raw);
      if (!data?.numero_chamada) return null;
      return data;
    } catch (err) {
      console.error(`[creditos] gerarFichaCatalografica ${reforcado ? "(retry)" : ""} falhou:`, err);
      return null;
    }
  }

  const t1 = await callClaude(false);
  if (t1) {
    const cduOk = CDU_REGEX.test(t1.cdu);
    const cddOk = CDD_REGEX.test(t1.cdd);
    const numeroOk = NUMERO_CHAMADA_REGEX.test(t1.numero_chamada);
    const autorOk = !ENTRADA_AUTOR_PLACEHOLDER.test(t1.entrada_autor);
    if (cduOk && cddOk && numeroOk && autorOk) return t1;
    console.warn("[creditos] Tentativa 1 falhou validação:", { cduOk, cddOk, numeroOk, autorOk, cdu: t1.cdu, cdd: t1.cdd, entrada_autor: t1.entrada_autor });
  }

  const t2 = await callClaude(true);
  const base = t2 ?? t1;
  if (!base) {
    console.error("[creditos] Ambas tentativas retornaram null. Sem ficha.");
    return null;
  }

  const { ficha: sanitizada, correcoes } = sanearFicha(base, genero, autor);
  if (correcoes.length) {
    console.warn("[creditos] Ficha sanitizada por fallback determinístico:", correcoes);
  }
  return sanitizada;
}

// ─── HTML builder — standalone preview/download envelope ─────────────────────

function buildCreditosStandaloneHtml(params: {
  config: CreditosConfig;
  ficha: FichaCatalografica | null;
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

  if (typeof config.incluir_ficha !== "boolean") {
    return NextResponse.json(
      { error: "Campo obrigatório: incluir_ficha (booleano)." },
      { status: 400 }
    );
  }

  // Se modo oficial CRB: validar dados do bibliotecário
  const CRB_REGEX = /^CRB-([1-9]|1[0-5])\/\d{1,6}$/;
  const isOficial = config.tipo_ficha === "oficial_crb";

  if (isOficial) {
    const fo = body.ficha_oficial_input;
    if (!fo) {
      return NextResponse.json(
        { error: "Modo ficha oficial requer dados do bibliotecário." },
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
          { error: `Campo obrigatório no modo oficial: ${nome}.` },
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

  // Resolve canonical format from project — ignore body's config.formato silently
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
    // Sem corpoPt no CreditosConfig: assume base do formato.
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

  // Cascata: escolha em Elementos > original do manuscrito > fallback.
  // Autor pode ter refinado o título em Elementos Editoriais — a ficha
  // catalográfica e a página de copyright precisam refletir a decisão
  // final dele.
  const el = project.dados_elementos as { titulo_escolhido?: string; subtitulo?: string } | null;
  const titulo = el?.titulo_escolhido ?? ms?.titulo ?? "Sem título";
  const subtitulo = el?.subtitulo ?? ms?.subtitulo?.trim() ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const genero = ms?.genero_principal ?? "Literatura";

  // Modo oficial CRB: pula Claude e monta ficha_oficial com log de aceite
  let ficha: FichaCatalografica | null = null;
  let fichaOficial: FichaOficialCRB | undefined = undefined;

  if (isOficial && body.ficha_oficial_input) {
    const fo = body.ficha_oficial_input;
    // Log de IP + user_agent para blindagem legal
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwardedFor?.split(",")[0]?.trim() || realIp || "desconhecido";
    const userAgent = request.headers.get("user-agent") ?? undefined;

    fichaOficial = {
      numero_chamada:          fo.numero_chamada.trim(),
      entrada_autor:           fo.entrada_autor.trim(),
      descricao_bibliografica: fo.descricao_bibliografica.trim(),
      assuntos:                fo.assuntos.trim(),
      cdd:                     fo.cdd.trim(),
      cdu:                     fo.cdu.trim(),
      bibliotecario_nome:      fo.bibliotecario_nome.trim(),
      bibliotecario_crb:       fo.bibliotecario_crb.trim(),
      declaracao_aceita_em:    new Date().toISOString(),
      declaracao_ip:           ip,
      declaracao_user_agent:   userAgent,
    };
  } else if (configResolved.incluir_ficha) {
    ficha = await gerarFichaCatalografica({
      titulo,
      subtitulo,
      autor,
      genero,
      paginas: paginasParaFicha,
      ano: configResolved.ano_edicao ?? configResolved.ano_copyright,
      editora: configResolved.nome_editora ?? "Edição do Autor",
      local: configResolved.local_edicao ?? "São Paulo",
      isbn: configResolved.isbn ?? "",
      formato: configResolved.formato,
      context: { userId: user.id, projectId: project_id },
    });
  }

  // Build HTML — passa a fonte editorial do template do miolo (se disponível)
  // para os créditos ficarem tipograficamente coerentes com o resto do livro.
  const template = mioloData?.config?.template;
  const bodyFontFamily = template ? getBodyFontFamily(template) : undefined;
  const html = buildCreditosStandaloneHtml({ config: configResolved, ficha, fichaOficial, titulo, subtitulo, autor, bodyFontFamily });

  const inputHash = calcularCreditosInputHash({
    titulo,
    subtitulo,
    autor,
    genero,
    paginas: paginasParaFicha,
    formato: configResolved.formato,
    ano_copyright: configResolved.ano_copyright,
    ano_edicao: configResolved.ano_edicao ?? null,
    isbn: (configResolved.isbn ?? "").trim(),
    incluir_ficha: configResolved.incluir_ficha,
    titular_direitos: configResolved.titular_direitos,
    nome_editora: configResolved.nome_editora ?? "",
  });

  // Upload to storage
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
    ficha_catalografica: ficha ?? undefined,
    ficha_oficial: fichaOficial,
    html_storage_path: storagePath,
    input_hash: inputHash,
    paginas_usadas: paginasParaFicha,
    paginas_origem: paginasOrigem,
    gerado_em: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_creditos: result, etapa_atual: "creditos" })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[creditos] Erro ao salvar:", updateErr);
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

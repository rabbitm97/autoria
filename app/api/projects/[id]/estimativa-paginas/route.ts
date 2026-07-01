import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { isFormatoValido, getFormatoDef, estimarLombadaCapaMm, type FormatoLivro } from "@/lib/formatos";

// ─── GET /api/projects/[id]/estimativa-paginas?formato=padrao_br ──────────────
//
// Retorna estimativa de páginas e lombada. Duas fontes:
//   1. Se `dados_miolo.paginas_reais` existe → usa esse valor (miolo já diagramado)
//   2. Senão → estima a partir do texto do manuscrito, com `cpp` do formato e
//      `+6` páginas fixas de pré-textuais.
//
// Nunca lê `dados_miolo.lombada_mm` — esse campo é denormalizado e pode estar
// fossilizado com fórmula legada. Lombada sempre recalculada via
// `estimarLombadaCapaMm(paginas)`.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dev = isDev();

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (dev) {
    userId = "dev-user";
    supabase = await createSupabaseServerClient();
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  const formatoParam = req.nextUrl.searchParams.get("formato");
  if (!isFormatoValido(formatoParam)) {
    return NextResponse.json(
      { error: "Parâmetro 'formato' inválido. Use um slug canônico: padrao_br, compacto, bolso, quadrado, a4." },
      { status: 400 }
    );
  }
  const formato: FormatoLivro = formatoParam;

  const { data: project, error } = await supabase
    .from("projects")
    .select("dados_miolo, manuscripts:manuscript_id(texto, texto_revisado)")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // Miolo já gerado: usa paginas_reais e recalcula lombada (nunca lê o
  // lombada_mm do banco, que pode estar fossilizado).
  const miolo = project.dados_miolo as { paginas_reais?: number } | null;
  if (miolo?.paginas_reais) {
    return NextResponse.json({
      caracteres: null,
      paginas_base: miolo.paginas_reais,
      paginas_estimadas: miolo.paginas_reais,
      lombada_estimada_mm: estimarLombadaCapaMm(miolo.paginas_reais),
      formato,
      fonte: "miolo_real" as const,
    });
  }

  // Estimativa a partir do manuscrito: prefer texto_revisado.
  const ms = project.manuscripts as { texto?: string; texto_revisado?: string } | null;
  const textoRevisado = ms?.texto_revisado?.trim() ?? "";
  const textoOriginal = ms?.texto?.trim() ?? "";
  const texto = textoRevisado.length >= 50 ? textoRevisado : textoOriginal;
  const fonte: "texto_revisado" | "texto" = textoRevisado.length >= 50 ? "texto_revisado" : "texto";

  if (texto.length < 50) {
    return NextResponse.json(
      { error: "Upload o manuscrito primeiro." },
      { status: 422 }
    );
  }

  const specs = getFormatoDef(formato).specs;
  // cpp é a métrica canônica calibrada no 14.F. Se algum formato ainda não
  // tiver o campo `cpp` em lib/formatos.ts, retorna 500 explicando — não
  // reintroduzir fallback silencioso pela métrica legada de palavras/página.
  const cpp = (specs as { cpp?: number }).cpp;
  if (typeof cpp !== "number" || cpp <= 0) {
    return NextResponse.json(
      { error: `Formato '${formato}' não tem 'cpp' configurado em lib/formatos.ts. Migração 14.F incompleta.` },
      { status: 500 }
    );
  }

  const numCaracteres = texto.length;
  const paginas_base = Math.max(1, Math.round(numCaracteres / cpp));
  // Pré-textuais fixas: +6 (rosto, verso, dedicatória, epígrafe, sumário, meio-título).
  const paginas_estimadas = paginas_base + 6;
  const lombada_estimada_mm = estimarLombadaCapaMm(paginas_estimadas);

  return NextResponse.json({
    caracteres: numCaracteres,
    paginas_base,
    paginas_estimadas,
    lombada_estimada_mm,
    formato,
    fonte,
  });
}

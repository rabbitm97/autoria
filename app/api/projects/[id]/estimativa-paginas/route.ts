import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { isFormatoValido, getFormatoDef, type FormatoLivro } from "@/lib/formatos";

// ─── GET /api/projects/[id]/estimativa-paginas?formato=padrao_br ──────────────

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
    .eq("user_id", dev ? (userId as string) : userId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // If miolo was already generated, return real values
  const miolo = project.dados_miolo as { paginas_reais?: number; lombada_mm?: number } | null;
  if (miolo?.paginas_reais && miolo?.lombada_mm) {
    return NextResponse.json({
      palavras: null,
      paginas_base: miolo.paginas_reais,
      paginas_estimadas: miolo.paginas_reais,
      lombada_estimada_mm: miolo.lombada_mm,
      formato,
      fonte: "miolo_real" as const,
    });
  }

  // Extract manuscript text — prefer texto_revisado
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

  const numPalavras = texto.split(/\s+/).filter(Boolean).length;
  const wpp = getFormatoDef(formato).specs.wpp;

  const paginas_base = Math.max(1, Math.round(numPalavras / wpp));
  const paginas_estimadas = Math.ceil(paginas_base * 1.10);
  const lombada_estimada_mm = Math.round(paginas_estimadas * 0.07 * 10) / 10;

  return NextResponse.json({
    palavras: numPalavras,
    paginas_base,
    paginas_estimadas,
    lombada_estimada_mm,
    formato,
    fonte,
  });
}

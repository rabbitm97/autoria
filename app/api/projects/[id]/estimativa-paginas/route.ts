import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { FORMAT_DIMS } from "@/lib/miolo-builder";
import { CAPA_TO_MIOLO, type CapaFormatoId } from "@/lib/format-mapping";

// ─── GET /api/projects/[id]/estimativa-paginas?formato=16x23 ─────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isDev = process.env.NODE_ENV === "development";

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev) {
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

  const formato = req.nextUrl.searchParams.get("formato") as CapaFormatoId | null;
  if (!formato || !(formato in CAPA_TO_MIOLO)) {
    return NextResponse.json(
      { error: "Parâmetro 'formato' obrigatório. Valores válidos: 16x23, 14x21, 11x18, 20x20, a4." },
      { status: 400 }
    );
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("dados_miolo, manuscripts:manuscript_id(texto, texto_revisado)")
    .eq("id", id)
    .eq("user_id", isDev ? (userId as string) : userId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // If miolo was already generated, return real values instead of estimating
  const miolo = project.dados_miolo as { paginas_reais?: number; lombada_mm?: number } | null;
  if (miolo?.paginas_reais && miolo?.lombada_mm) {
    return NextResponse.json({
      palavras: null,
      paginas_base: miolo.paginas_reais,
      paginas_estimadas: miolo.paginas_reais,
      lombada_estimada_mm: miolo.lombada_mm,
      formato_capa: formato,
      formato_miolo: CAPA_TO_MIOLO[formato],
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
  const mioloFormato = CAPA_TO_MIOLO[formato];
  const wpp = FORMAT_DIMS[mioloFormato].wpp;

  const paginas_base = Math.max(1, Math.round(numPalavras / wpp));
  const paginas_estimadas = Math.ceil(paginas_base * 1.10);
  const lombada_estimada_mm = Math.round(paginas_estimadas * 0.07 * 10) / 10;

  return NextResponse.json({
    palavras: numPalavras,
    paginas_base,
    paginas_estimadas,
    lombada_estimada_mm,
    formato_capa: formato,
    formato_miolo: mioloFormato,
    fonte,
  });
}

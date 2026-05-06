import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { buildBookHtml } from "@/lib/miolo-builder";
import type { MioloConfig } from "@/lib/miolo-builder";

// GET /api/preview/render?project_id=...&config=<json>
// Returns text/html. No Claude calls — uses capitulos_detectados cache only.
export async function GET(request: NextRequest) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof import("@/lib/supabase-server")["requireAuth"]>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const { searchParams } = request.nextUrl;
  const project_id = searchParams.get("project_id");
  const configRaw = searchParams.get("config");

  if (!project_id) {
    return new NextResponse("project_id obrigatório", { status: 400 });
  }

  let config: MioloConfig;
  try {
    config = JSON.parse(configRaw ?? "");
  } catch {
    return new NextResponse("config JSON inválido", { status: 400 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("dados_creditos, manuscripts(titulo, subtitulo, texto, texto_revisado, autor_primeiro_nome, autor_sobrenome, capitulos_detectados)")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    return new NextResponse("Projeto não encontrado", { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string; subtitulo?: string;
    texto?: string; texto_revisado?: string;
    autor_primeiro_nome?: string; autor_sobrenome?: string;
    capitulos_detectados?: { titulo: string; pos: number }[] | null;
  } | null;

  const titulo = ms?.titulo ?? "Sem título";
  const subtitulo = ms?.subtitulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const texto = ms?.texto_revisado ?? ms?.texto ?? "";
  const capitulos = Array.isArray(ms?.capitulos_detectados) ? ms.capitulos_detectados : [];

  if (!texto || texto.trim().length < 50) {
    return new NextResponse("Texto não encontrado. Faça o upload primeiro.", { status: 422 });
  }

  // Two-pass build for accurate TOC page numbers
  const buildArgs = { titulo, subtitulo, autor, texto, capitulos, config, creditosInnerHtml: null };
  const pass1 = buildBookHtml({ ...buildArgs, config: { ...config, sumario: false } });
  const { html } =
    config.sumario && pass1.capitulosInfo.length > 1
      ? buildBookHtml({ ...buildArgs, chapterStartPagesOverride: pass1.chapterStartPages })
      : pass1;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

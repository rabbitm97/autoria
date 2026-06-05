import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { proporCapitulos } from "@/lib/chapter-detection";

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await requireAuth();

    const body = await req.json();
    const { project_id } = body as { project_id?: string };
    if (!project_id) {
      return NextResponse.json(
        { error: "project_id obrigatório" },
        { status: 400 }
      );
    }

    const { data: project } = await supabase
      .from("projects")
      .select("manuscript_id, manuscripts(texto, texto_revisado)")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json(
        { error: "Projeto não encontrado" },
        { status: 404 }
      );
    }

    const ms = project.manuscripts as
      | { texto?: string; texto_revisado?: string }
      | null;
    const texto = ms?.texto_revisado ?? ms?.texto ?? "";

    if (!texto || texto.trim().length < 50) {
      return NextResponse.json(
        { error: "Texto do manuscrito não encontrado" },
        { status: 422 }
      );
    }

    const candidatos = proporCapitulos(texto);

    return NextResponse.json({
      candidatos,
      total: candidatos.length,
      sugeridos: candidatos.filter(c => c.sugerido).length,
    });
  } catch (err) {
    console.error("[propor-capitulos] Erro:", err);
    return NextResponse.json(
      { error: "Erro interno ao detectar capítulos" },
      { status: 500 }
    );
  }
}

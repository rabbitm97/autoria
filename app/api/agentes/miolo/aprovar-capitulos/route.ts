import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

interface CapituloAprovado {
  titulo: string;
  pos: number;
}

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await requireAuth();

    const body = await req.json();
    const { project_id, capitulos_aprovados } = body as {
      project_id?: string;
      capitulos_aprovados?: CapituloAprovado[];
    };

    if (!project_id) {
      return NextResponse.json(
        { error: "project_id obrigatório" },
        { status: 400 }
      );
    }

    if (!Array.isArray(capitulos_aprovados)) {
      return NextResponse.json(
        { error: "capitulos_aprovados deve ser array" },
        { status: 400 }
      );
    }

    for (const c of capitulos_aprovados) {
      if (typeof c.titulo !== "string" || c.titulo.trim().length === 0) {
        return NextResponse.json(
          { error: "Cada capítulo precisa de título não vazio" },
          { status: 400 }
        );
      }
      if (typeof c.pos !== "number" || c.pos < 0) {
        return NextResponse.json(
          { error: "Cada capítulo precisa de pos numérico >= 0" },
          { status: 400 }
        );
      }
    }

    const ordenados = [...capitulos_aprovados].sort((a, b) => a.pos - b.pos);

    const { data: project } = await supabase
      .from("projects")
      .select("manuscript_id")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project?.manuscript_id) {
      return NextResponse.json(
        { error: "Projeto não encontrado" },
        { status: 404 }
      );
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: updateErr } = await admin
      .from("manuscripts")
      .update({ capitulos_aprovados: ordenados })
      .eq("id", project.manuscript_id);

    if (updateErr) {
      console.error("[aprovar-capitulos] Erro update:", updateErr);
      return NextResponse.json(
        { error: "Falha ao salvar capítulos aprovados" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      total_aprovados: ordenados.length,
    });
  } catch (err) {
    console.error("[aprovar-capitulos] Erro:", err);
    return NextResponse.json(
      { error: "Erro interno ao aprovar capítulos" },
      { status: 500 }
    );
  }
}

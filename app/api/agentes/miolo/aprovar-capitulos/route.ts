import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

interface CapituloAprovado {
  titulo: string;
  pos: number;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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

    const admin = adminClient();

    // Carrega texto atual para calcular hash
    const { data: ms } = await admin
      .from("manuscripts")
      .select("texto, texto_revisado")
      .eq("id", project.manuscript_id)
      .single();

    const textoAtual = ((ms?.texto_revisado ?? ms?.texto) as string | null | undefined) ?? "";
    const textoHash = createHash("md5").update(textoAtual).digest("hex");

    const { error: updateErr } = await admin
      .from("manuscripts")
      .update({
        capitulos_aprovados: ordenados,
        capitulos_aprovados_texto_hash: textoHash,
      })
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

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await requireAuth();

    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) {
      return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("manuscript_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project?.manuscript_id) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    const admin = adminClient();

    const { data: ms } = await admin
      .from("manuscripts")
      .select("texto, texto_revisado, capitulos_aprovados, capitulos_aprovados_texto_hash")
      .eq("id", project.manuscript_id)
      .single();

    const lista = (ms?.capitulos_aprovados as { titulo: string; pos: number }[] | null) ?? null;
    const hashSalvo = (ms?.capitulos_aprovados_texto_hash as string | null) ?? null;

    if (!lista || lista.length === 0) {
      return NextResponse.json({ aprovado: false, total: 0, hash_valido: false });
    }

    const textoAtual = ((ms?.texto_revisado ?? ms?.texto) as string | null | undefined) ?? "";
    const hashAtual = createHash("md5").update(textoAtual).digest("hex");
    const hashValido = hashSalvo === hashAtual;

    return NextResponse.json({
      aprovado: true,
      total: lista.length,
      hash_valido: hashValido,
    });
  } catch (err) {
    console.error("[aprovar-capitulos GET] Erro:", err);
    return NextResponse.json(
      { error: "Erro interno ao consultar aprovação" },
      { status: 500 }
    );
  }
}

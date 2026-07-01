import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import type { EditorData } from "@/app/editor/capa/[project_id]/lib/editor-serializer";

// ─── GET /api/projects/[id]/cover-editor ─────────────────────────────────────
// Returns dados_capa.editor_data or null

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { data: project, error } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", id)
    .eq("user_id", dev ? userId : userId)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const capa = project.dados_capa as Record<string, unknown> | null;
  const editorData = capa?.editor_data ?? null;

  return NextResponse.json({ editor_data: editorData });
}

// ─── PUT /api/projects/[id]/cover-editor ─────────────────────────────────────
// Merges editor_data into dados_capa without overwriting other keys

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev()) {
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

  let body: EditorData;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  if (body.version !== 1) {
    return NextResponse.json({ error: "Versão de editor_data inválida." }, { status: 400 });
  }

  // Load current dados_capa to merge without overwriting other keys
  const { data: project, error: loadErr } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (loadErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const existingCapa = (project.dados_capa as Record<string, unknown>) ?? {};
  const savedAt = new Date().toISOString();

  const newEditorData: EditorData = {
    ...body,
    meta: {
      ...body.meta,
      last_saved_by: userId,
      last_saved_at: savedAt,
      autosave_count: (body.meta?.autosave_count ?? 0) + 1,
    },
  };

  // Autosave sinaliza que o autor mexeu em algo depois de confirmar. Invalida
  // qualquer pdf_grafica pré-gerado — ele será regerado no próximo confirm ou
  // por demanda na tela de Prova.
  const novoDadosCapa = {
    ...existingCapa,
    editor_data: newEditorData,
    pdf_grafica: null,
  };

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_capa: novoDadosCapa })
    .eq("id", id)
    .eq("user_id", userId);

  if (updateErr) {
    return NextResponse.json({ error: "Falha ao salvar." }, { status: 500 });
  }

  return NextResponse.json({ saved_at: savedAt });
}

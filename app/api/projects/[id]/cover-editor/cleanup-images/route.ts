export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/projects/[id]/cover-editor/cleanup-images
 *
 * Housekeeping (C5-05): remove de editor-assets/{user}/{project}/images/
 * tudo que NÃO está referenciado no dados_capa atual. Chamada fire-and-forget
 * pelo confirm da capa. Best-effort: falha aqui nunca afeta o autor — o lixo
 * fica pra próxima confirmação.
 *
 * "Referenciado" = qualquer path de editor-assets presente em QUALQUER campo
 * de dados_capa (elements[].src, backgroundUrl, imagem_url, pdf_grafica...).
 * As URLs são signed URLs contendo o path — extração por regex sobre o JSON
 * serializado é determinística e cobre campos futuros.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (isDev()) return NextResponse.json({ ok: true, dev: true });

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    const auth = await requireAuth();
    userId = auth.user.id;
    supabase = auth.supabase;
  } catch (e) {
    return e as Response;
  }

  const { data: project, error: loadErr } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (loadErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // Set de paths referenciados (relativos ao bucket).
  const serialized = JSON.stringify(project.dados_capa ?? {});
  const referenced = new Set<string>();
  for (const m of serialized.matchAll(/editor-assets\/([^?"\\]+)/g)) {
    referenced.add(decodeURIComponent(m[1]));
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const prefix = `${userId}/${id}/images`;
  const { data: files, error: listErr } = await storageClient.storage
    .from("editor-assets")
    .list(prefix, { limit: 1000 });

  if (listErr) {
    console.warn("[cleanup-images] falha ao listar:", listErr.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const orphans = (files ?? [])
    .filter((f) => f.name)
    .map((f) => `${prefix}/${f.name}`)
    .filter((path) => !referenced.has(path));

  if (orphans.length > 0) {
    const { error: rmErr } = await storageClient.storage
      .from("editor-assets")
      .remove(orphans);
    if (rmErr) {
      console.warn("[cleanup-images] falha ao remover órfãos:", rmErr.message);
      return NextResponse.json({ ok: false, orphans: orphans.length }, { status: 500 });
    }
  }

  console.log(`[cleanup-images] projeto ${id}: ${orphans.length} órfão(s) removido(s), ${referenced.size} referenciado(s).`);
  return NextResponse.json({ ok: true, removed: orphans.length });
}

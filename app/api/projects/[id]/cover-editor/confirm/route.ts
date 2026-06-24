export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

export async function POST(
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

  // Parse multipart form
  const formData = await req.formData();
  const pngFile = formData.get("png") as File | null;
  if (!pngFile) {
    return NextResponse.json({ error: "PNG obrigatório." }, { status: 400 });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Upload PNG thumbnail to storage
  const timestamp = Date.now();
  const pngPath = `${userId}/${id}/cover-confirmed-${timestamp}.png`;
  const pngBuffer = Buffer.from(await pngFile.arrayBuffer());

  const { error: pngUploadErr } = await storageClient.storage
    .from("editor-assets")
    .upload(pngPath, pngBuffer, { contentType: "image/png", upsert: true });

  if (pngUploadErr) {
    return NextResponse.json({ error: pngUploadErr.message }, { status: 500 });
  }

  const { data: pngSigned } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(pngPath, 365 * 24 * 3600);

  const imagemUrl = pngSigned?.signedUrl ?? null;

  // Update dados_capa
  const { data: currentProject } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", id)
    .single();

  const currentCapa = ((currentProject?.dados_capa as Record<string, unknown>) ?? {});
  const confirmedAt = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      dados_capa: {
        ...currentCapa,
        imagem_url: imagemUrl,
        source: "editor",
        confirmed_at: confirmedAt,
      },
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    imagem_url: imagemUrl,
    confirmed_at: confirmedAt,
  });
}

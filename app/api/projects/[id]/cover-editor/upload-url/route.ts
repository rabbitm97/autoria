export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

// Gera signed upload URL para o PNG panorâmico confirmado do editor.
// O cliente sobe o blob direto para o storage e depois chama /confirm com
// apenas `{ path, layout }` — assim o body da rota `/confirm` fica < 1KB e
// evita o limite de 4.5 MB do Vercel para multipart/PNG panorâmico 4K.
export async function POST(
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

  // Ownership — projeto pertence ao usuário
  const { data: project, error: ownErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (ownErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // Path canônico (mesmo do confirm) — BLOCO-02-B-housekeeping: 1 arquivo por projeto.
  const path = `${userId}/${id}/cover-confirmed.png`;

  if (dev) {
    // Em dev, retorna path fake; o cliente pula upload direto.
    return NextResponse.json({ path, signed_url: null, token: null });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await storageClient.storage
    .from("editor-assets")
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: `Erro ao gerar URL de upload: ${error?.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    path,
    signed_url: data.signedUrl,
    token: data.token,
  });
}

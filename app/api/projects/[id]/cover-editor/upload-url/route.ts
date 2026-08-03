export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

// Gera signed upload URL para dois alvos do editor de capa:
//   - "confirm" (default): PNG panorâmico final → cover-confirmed.png
//   - "temp"             : JPEG intermediário do export gráfico → temp-cover.jpg
// O cliente sobe o blob direto no storage; o body das rotas /confirm e
// /export-pdf fica compacto (JSON < 1KB) e evita o limite de 4.5 MB do
// Vercel (PNG panorâmico 4K no confirm; JPEG panorâmico 15-22 MB pior
// caso no export gráfico — B2-06 EXEC-C, 03/ago/2026).
//
// O cliente NUNCA dita path — o server monta a partir de userId+projectId
// e escolhe entre dois alvos whitelisted.
type UploadTarget = "confirm" | "temp";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dev = isDev();

  // Body opcional. Ausente/malformado → "confirm" (compat com confirm-button
  // que faz POST sem body).
  let target: UploadTarget = "confirm";
  try {
    const body = (await req.json()) as { target?: unknown };
    if (body?.target === "temp" || body?.target === "confirm") {
      target = body.target;
    }
  } catch {
    // sem body ou JSON inválido — segue default
  }

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

  // Paths canônicos (contratos com housekeeping — capa/reset e cleanup-images
  // conhecem esses nomes; NÃO renomear).
  const path =
    target === "temp"
      ? `${userId}/${id}/temp-cover.jpg`
      : `${userId}/${id}/cover-confirmed.png`;

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

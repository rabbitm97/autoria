export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

// Gera signed upload URL para os alvos do editor de capa:
//   - "confirm" (default): PNG panorâmico final → cover-confirmed.png
//   - "temp"             : JPEG intermediário do export gráfico → temp-cover.jpg
//   - "export-frente-avulso"  : JPG da frente (300 DPI) para a capa avulsa
//   - "export-completa-avulso": JPG completo (300 DPI) para a capa avulsa
// O cliente sobe o blob direto no storage; o body das rotas /confirm e
// /export-pdf fica compacto (JSON < 1KB) e evita o limite de 4.5 MB do
// Vercel (PNG panorâmico 4K no confirm; JPEG panorâmico 15-22 MB pior
// caso no export gráfico — B2-06 EXEC-C, 03/ago/2026).
//
// FERR-3.4g: os targets `export-*-avulso` são versionados por timestamp
// (a mudança 5 fez o mesmo com o PDF gráfico) para invalidar cache e o
// PATCH em ferramenta_jobs persiste o storage_path resolvido em
// `entrada.exports_jpeg.{frente,completa}`, que a rota `capa-avulsa/concluir`
// lê para montar 4 entregáveis.
//
// O cliente NUNCA dita path — o server monta a partir de userId+projectId
// e escolhe entre alvos whitelisted.
type UploadTarget = "confirm" | "temp" | "export-frente-avulso" | "export-completa-avulso";

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
    if (
      body?.target === "temp" ||
      body?.target === "confirm" ||
      body?.target === "export-frente-avulso" ||
      body?.target === "export-completa-avulso"
    ) {
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
  // conhecem esses nomes; NÃO renomear). Os targets export-*-avulso são
  // versionados por timestamp para invalidar cache — o PATCH em
  // ferramenta_jobs persiste o path resolvido em entrada.exports_jpeg.
  let path: string;
  if (target === "temp") {
    path = `${userId}/${id}/temp-cover.jpg`;
  } else if (target === "export-frente-avulso") {
    path = `${userId}/${id}/exports/frente_${Date.now()}.jpg`;
  } else if (target === "export-completa-avulso") {
    path = `${userId}/${id}/exports/completa_${Date.now()}.jpg`;
  } else {
    path = `${userId}/${id}/cover-confirmed.png`;
  }

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

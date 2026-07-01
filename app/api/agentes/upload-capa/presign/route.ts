export const maxDuration = 30;

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  let userId: string;

  if (isDev()) {
    userId = "dev-user";
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
    } catch (e) {
      return e as Response;
    }
  }

  let body: { project_id: string; mime_type: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, mime_type } = body;
  if (!project_id || !mime_type) {
    return NextResponse.json(
      { error: "project_id e mime_type são obrigatórios" },
      { status: 400 }
    );
  }

  // O PDF entra em paralelo ao PNG convertido: mesma pasta, sufixo `_original`.
  // Assim o PNG (usado como capa final) e o PDF (preservado para o autor
  // reimprimir/redistribuir) coexistem sem sobrescrever um ao outro.
  const isPdf = mime_type === "application/pdf";
  const ext = isPdf ? "pdf" : mime_type.includes("png") ? "png" : "jpg";
  const filenameSuffix = isPdf ? "_original" : "";
  const storagePath = `${userId}/${project_id}/capa_upload${filenameSuffix}.${ext}`;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await storageClient.storage
    .from("capas")
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: `Erro ao gerar URL de upload: ${error?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    signed_url: data.signedUrl,
    token: data.token,
    storage_path: storagePath,
  });
}

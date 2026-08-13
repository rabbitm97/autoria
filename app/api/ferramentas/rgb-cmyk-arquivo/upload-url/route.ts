export const maxDuration = 15;

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

// Signed upload URL para o arquivo temporário da ferramenta RGB→CMYK.
// Serve o caso >4,5 MB, que não cabe no body de função da Vercel — o
// cliente sobe direto no Storage e depois envia { storage_path } na rota
// de conversão. Espelha o padrão do editor de capa (upload-url + service
// role + createSignedUploadUrl no bucket `editor-assets`).
//
// Path FIXO ditado pelo server: `cmyk-tmp/{userId}/{uuid}.jpg`. Sempre .jpg
// porque tanto JPG quanto PNG quanto páginas de PDF (rasterizadas no
// cliente a 300dpi) sobem como JPEG.

export async function POST() {
  if (isDev()) {
    const path = `cmyk-tmp/dev-user/${randomUUID()}.jpg`;
    return NextResponse.json({ path, signed_url: null, token: null });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const path = `cmyk-tmp/${user.id}/${randomUUID()}.jpg`;

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await storageClient.storage
    .from("editor-assets")
    .createSignedUploadUrl(path, { upsert: false });

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

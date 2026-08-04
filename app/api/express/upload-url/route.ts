export const maxDuration = 30;

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

// Signed upload URL para o PDF do miolo enviado pela porta Express.
//
// Fase 1 (anti-órfão): nesta chamada o projeto AINDA NÃO EXISTE — só criamos
// `manuscripts` + `projects` depois da verificação passar e o autor confirmar
// (`confirmar-miolo`). Por isso a rota NÃO é `[id]`d e não checa ownership de
// projeto — só exige auth.
//
// Path FIXO ditado pelo server: `${userId}/express-temp.pdf` no bucket `livros`,
// com upsert=true (reenvios sobrescrevem; no máx. 1 arquivo temp por usuário
// vivo simultaneamente). O `move` no `confirmar-miolo` esvazia o temp no
// caminho feliz. Client sobe direto no Storage via `uploadToSignedUrl` — o
// body do Vercel não recebe o arquivo (PDFs de miolo podem ter dezenas de MB).

export async function POST() {
  const dev = isDev();

  let userId: string;
  if (dev) {
    userId = "dev-user";
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
    } catch (e) {
      return e as Response;
    }
  }

  const path = `${userId}/express-temp.pdf`;

  if (dev) {
    return NextResponse.json({ path, signed_url: null, token: null });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await storageClient.storage
    .from("livros")
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

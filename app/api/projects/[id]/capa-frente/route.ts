export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { extractFrontCover } from "@/lib/capa-frente-extractor";
import type { FormatoLivro } from "@/lib/formatos";

// Frente canônica da capa para thumbnails do painel.
// MESMO mecanismo do gerar-epub (lib/capa-frente-extractor), com cache em
// storage keyed pela identidade da capa (URL sem querystring — o token de
// assinatura varia, o path não; verdade 30). Capa trocada => hash novo =>
// re-extração. Sem escrita em dados_capa.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (isDev()) return new NextResponse(null, { status: 404 });

  let userId: string;
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];
  try {
    const auth = await requireAuth();
    userId = auth.user.id;
    supabase = auth.supabase;
  } catch (e) {
    return e as Response;
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, formato, dados_capa, dados_miolo")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[capa-frente] falha ao carregar projeto:", error.message);
    return new NextResponse(null, { status: 404 });
  }
  if (!project) return new NextResponse(null, { status: 404 });

  const formato = ((project.formato as string) ?? "padrao_br") as FormatoLivro;
  const capa = resolveCapaCompleta(
    project.dados_capa as Record<string, unknown> | null,
    formato,
  );
  const capaUrl = capa.url_area_util ?? capa.url_principal;   // = gerar-epub
  if (!capa.pronta || !capaUrl) return new NextResponse(null, { status: 404 });

  // Frente pura: a imagem JÁ é a frente — redireciona direto.
  if (!capa.is_panoramica) {
    return NextResponse.redirect(capaUrl, 302);
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Identidade da capa: URL sem querystring (path estável entre assinaturas).
  const hash = createHash("sha1").update(capaUrl.split("?")[0]).digest("hex").slice(0, 8);
  const cachePath = `${userId}/${id}/exports/capa-frente-${hash}.jpg`;

  // Probe de cache: createSignedUrl falha se o objeto não existe.
  const { data: cached } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(cachePath, 3600);
  if (cached?.signedUrl) {
    return NextResponse.redirect(cached.signedUrl, 302);
  }

  // Miss: extrai com os MESMOS inputs do gerar-epub.
  const miolo = project.dados_miolo as {
    paginas_reais?: number;
    config?: { paginas_estimadas?: number };
  } | null;
  const front = await extractFrontCover({
    url: capaUrl,
    formato,
    paginas: miolo?.paginas_reais ?? miolo?.config?.paginas_estimadas ?? 0,
    orelhaMm: capa.orelha_mm ?? 0,
  });
  if (!front) {
    // Difere do gerar-epub (que cai na panorâmica inteira): num thumb
    // portrait a panorâmica espremida é pior que o mock — 404 e o
    // componente cliente mostra o fallback.
    console.warn(`[capa-frente] extração falhou para ${id}`);
    return new NextResponse(null, { status: 404 });
  }

  const { error: upErr } = await storageClient.storage
    .from("editor-assets")
    .upload(cachePath, front.buffer, { contentType: "image/jpeg", upsert: true });
  if (upErr) {
    console.warn("[capa-frente] falha ao cachear:", upErr.message);
    // segue sem cache: assina nada — melhor 404 que servir bytes pela função
    return new NextResponse(null, { status: 404 });
  }

  const { data: signed, error: signErr } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(cachePath, 3600);
  if (signErr || !signed?.signedUrl) {
    console.warn("[capa-frente] falha ao assinar cache:", signErr?.message);
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}

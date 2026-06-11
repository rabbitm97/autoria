export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { applyDigitalCss } from "@/lib/miolo-builder-digital";
import type { FormatoLivro } from "@/lib/formatos";

// ─── CSS injetado para visualização ──────────────────────────────────────────
// Transforma cada <section> do miolo em uma página visual quando renderizado
// em iframe (modo screen). As regras @media screen evitam afetar a versão PDF
// (modo print), embora essa rota só sirva preview — o PDF real é gerado por
// gerar-pdf, que consome o HTML cru direto do Storage sem passar por aqui.

const PREVIEW_CSS = `<style id="prova-preview-overrides">
@media screen {
  html, body {
    background: #efe9da;
    margin: 0;
    padding: 0;
  }
  body {
    padding: 32px 16px 64px;
  }
  /* Cada <section> vira uma "página visual" */
  section.front-page,
  section.blank-page,
  section.chapter {
    max-width: 600px;
    margin: 32px auto;
    background: #fefefe;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0, 0, 0, 0.04);
    padding: 64px 56px 80px;
    border-radius: 3px;
    /* Anular page-break do CSS print no preview screen */
    break-after: auto !important;
    page-break-after: auto !important;
    break-before: auto !important;
    page-break-before: auto !important;
    min-height: 800px;
    position: relative;
  }
  section.blank-page {
    min-height: 240px;
    opacity: 0.45;
  }
  /* Suaviza imagens grandes (capa-like na half-title, etc) */
  section img {
    max-width: 100%;
    height: auto;
  }
  /* Marca canto inferior direito com indicador discreto de página */
  section.chapter::after {
    content: "";
    position: absolute;
    bottom: 24px;
    right: 24px;
    width: 6px;
    height: 6px;
    background: #d4cfb8;
    border-radius: 50%;
  }
}
</style>`;

const EMPTY_HTML = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><style>
  body { font-family: system-ui, -apple-system, sans-serif; padding: 48px 24px; text-align: center; color: #888; background: #efe9da; margin: 0; }
  .icon { font-size: 32px; opacity: 0.4; }
  p { margin: 12px 0; }
  .hint { font-size: 13px; color: #aaa; margin-top: 16px; }
</style></head><body>
  <div class="icon">📖</div>
  <p>O miolo ainda não foi diagramado.</p>
  <p class="hint">Volte à etapa Diagramação para gerá-lo.</p>
</body></html>`;

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return new NextResponse("project_id obrigatório", { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("dados_miolo")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  const miolo = project?.dados_miolo as {
    html_storage_path?: string;
    config?: { formato?: FormatoLivro };
  } | null;

  if (!miolo?.html_storage_path) {
    return new NextResponse(EMPTY_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Download HTML from Storage using service-role client (bypasses RLS)
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: blob, error: dlErr } = await storageClient.storage
    .from("manuscripts")
    .download(miolo.html_storage_path);

  if (dlErr || !blob) {
    console.error("[prova/preview-miolo] download error:", dlErr);
    return new NextResponse(EMPTY_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  let html = await blob.text();

  // Remove sangria + marcas de corte (versão digital)
  if (miolo.config?.formato) {
    html = applyDigitalCss(html, miolo.config.formato);
  }

  // Injeta o CSS de preview antes de </head>. Se não houver </head> (HTML
  // mal-formado), injeta no início do <body>.
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${PREVIEW_CSS}</head>`);
  } else {
    html = PREVIEW_CSS + html;
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
}

export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/projects/[id]/capa/reset
 *
 * Zera `dados_capa` para que a próxima entrada na etapa de Capa
 * (upload, IA ou editor) parta de um estado limpo. Também limpa
 * arquivos residuais no Storage: PNG do upload, capa exportada do
 * editor e PDF gráfica antigos.
 *
 * Chamada pelo botão "Refazer capa" na tela de Capa quando o autor
 * quer descartar completamente a capa atual (upload ou IA) e recomeçar.
 * Sem essa limpeza, o editor abre "continuando" de onde parou.
 */
export async function POST(
  _req: NextRequest,
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

  // Ler dados_capa atual para saber quais paths do Storage limpar,
  // e dados_miolo/dados_pdf/dados_pdf_digital para decidir se destravar.
  const { data: project, error: loadErr } = await supabase
    .from("projects")
    .select("dados_capa, dados_miolo, dados_pdf, dados_pdf_digital")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (loadErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const capa = project.dados_capa as Record<string, unknown> | null;

  // Coleta paths de storage para remoção — best-effort, sem falhar se
  // já não existirem.
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const pathsBucketCapas: string[] = [];
  const pathsBucketEditorAssets: string[] = [];

  if (capa) {
    // Upload (bucket "capas")
    const uploadPath = capa.storage_path as string | undefined;
    if (uploadPath) pathsBucketCapas.push(uploadPath);

    // PDF gráfica e PNG exportado do editor (bucket "editor-assets")
    const pdfGraf = capa.pdf_grafica as { storage_path?: string } | null;
    if (pdfGraf?.storage_path) pathsBucketEditorAssets.push(pdfGraf.storage_path);

    // imagem_url do editor é uma signed URL — extrair o path
    const imagemUrl = capa.imagem_url as string | undefined;
    if (imagemUrl) {
      const match = imagemUrl.match(/\/editor-assets\/([^?]+)/);
      if (match) pathsBucketEditorAssets.push(match[1]);
    }
  }

  // C5-05: reset descarta a capa por completo — a pasta images/ e o
  // temp-cover.jpg não têm mais referência viva. Remove tudo, best-effort.
  const imagesPrefix = `${userId}/${id}/images`;
  const { data: imgFiles } = await storageClient.storage
    .from("editor-assets")
    .list(imagesPrefix, { limit: 1000 });
  for (const f of imgFiles ?? []) {
    if (f.name) pathsBucketEditorAssets.push(`${imagesPrefix}/${f.name}`);
  }
  pathsBucketEditorAssets.push(`${userId}/${id}/temp-cover.jpg`);

  // Remove — best-effort, ignora erros
  if (pathsBucketCapas.length > 0) {
    await storageClient.storage.from("capas").remove(pathsBucketCapas).catch(() => null);
  }
  if (pathsBucketEditorAssets.length > 0) {
    await storageClient.storage.from("editor-assets").remove(pathsBucketEditorAssets).catch(() => null);
  }

  // C5-03 (item #31): sem capa (acabou de ser zerada) e sem miolo/PDF, nada
  // mais depende do formato — destrava. Se miolo ou PDF existem, eles foram
  // gerados NESTE formato e a trava permanece. Nota: dados_pdf = { epub }
  // sozinho não segura a trava (EPUB é reflowable), por isso o critério é
  // storage_path do PDF de miolo, não a existência da coluna.
  const miolo = project.dados_miolo as { html_storage_path?: string } | null;
  const pdf = project.dados_pdf as { storage_path?: string } | null;
  const pdfDigital = project.dados_pdf_digital as { storage_path?: string } | null;
  const temArtefatoDependenteDoFormato =
    !!miolo?.html_storage_path || !!pdf?.storage_path || !!pdfDigital?.storage_path;

  // Zera dados_capa e volta etapa para "capa" (garantia). Regressão de etapa =
  // exceção canônica (verdade #19) — update próprio, NÃO usar helpers.
  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      dados_capa: null,
      etapa_atual: "capa",
      ...(temArtefatoDependenteDoFormato ? {} : { formato_locked_at: null }),
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (updateErr) {
    console.error("[capa/reset] erro ao zerar dados_capa:", updateErr);
    return NextResponse.json({ error: "Falha ao resetar a capa." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

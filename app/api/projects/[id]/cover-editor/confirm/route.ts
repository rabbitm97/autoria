export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { lockFormato } from "@/lib/projects";
import { isDev } from "@/lib/anthropic";
import { validarProjectData } from "@/lib/project-data";
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

  // Upload PNG thumbnail — path fixo, upsert sobrescreve versão anterior.
  // BLOCO-02-B-housekeeping: sem timestamp, 1 arquivo por projeto.
  const pngPath = `${userId}/${id}/cover-confirmed.png`;
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

  // Decisão d (C.4): root `orelha_mm` é a fonte canônica. O confirm espelha
  // o rascunho do editor (editor_data.orelhaMm) pro root; se não houver
  // rascunho numérico, preserva o root existente.
  const editorOrelha = (currentCapa.editor_data as { orelhaMm?: unknown } | null | undefined)?.orelhaMm;
  const orelhaRoot =
    typeof editorOrelha === "number" && Number.isFinite(editorOrelha)
      ? editorOrelha
      : (currentCapa.orelha_mm as number | undefined) ?? 0;

  const novoDadosCapa = {
    ...currentCapa,
    imagem_url: imagemUrl,
    source: "editor",
    confirmed_at: confirmedAt,
    orelha_mm: orelhaRoot,
  };

  const vCapa = validarProjectData("dados_capa", novoDadosCapa, {
    modo: "estrito", contexto: "cover-editor-confirm",
  });
  if (!vCapa.ok) {
    console.error("[zod-reject][cover-editor-confirm][dados_capa]", vCapa.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação. Tente novamente.", issues: vCapa.issues },
      { status: 500 }
    );
  }

  const { ok } = await updateProject(supabase, id, null, {
    dados_capa: novoDadosCapa,
  }, "cover-editor-confirm");
  if (!ok) {
    return NextResponse.json({ error: "Falha ao confirmar a capa." }, { status: 500 });
  }

  // C5-03 (item #31): capa confirmada no editor foi desenhada nas dimensões
  // do formato atual — trava igual upload/montar. Idempotente.
  await lockFormato(id);

  // Dispara PDF gráfica em background (fire-and-forget). Não bloqueia a
  // resposta — se falhar, o autor pode tentar novamente pela tela de Prova.
  // Só faz sentido se o miolo já foi gerado; a rota lida com esse caso.
  fetch(`${req.nextUrl.origin}/api/agentes/prova/preparar-capa-grafica`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ project_id: id }),
  }).catch((err) => {
    console.warn("[cover-editor/confirm] preparar-capa-grafica fire-and-forget falhou:", err);
  });

  // Fire-and-forget análise técnica (14.M.1). Detecta colorspace/sangria/DPI
  // da capa exportada pelo editor e persiste em dados_capa.analise_tecnica.
  fetch(`${req.nextUrl.origin}/api/projects/${id}/capa/analisar`, {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") ?? "" },
  }).catch((err) => {
    console.warn("[cover-editor/confirm] analisar fire-and-forget falhou:", err);
  });

  return NextResponse.json({
    imagem_url: imagemUrl,
    confirmed_at: confirmedAt,
  });
}

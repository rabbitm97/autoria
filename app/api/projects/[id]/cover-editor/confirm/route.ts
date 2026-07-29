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

  // Body JSON compacto — { path, layout }. O PNG já foi enviado direto ao
  // storage via signed URL (rota /upload-url), então o body aqui é < 1KB
  // e evita o limite multipart de 4.5 MB do Vercel.
  let body: { path?: string; layout?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { path, layout } = body;

  // Path canônico — evita cliente injetar path arbitrário no dados_capa.
  const expectedPath = `${userId}/${id}/cover-confirmed.png`;
  if (path !== expectedPath) {
    return NextResponse.json(
      { error: "Path inválido para este projeto." },
      { status: 400 },
    );
  }

  const layoutValidado: "frente" | "panoramica" =
    layout === "frente" ? "frente" : "panoramica";

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verifica que o objeto realmente existe no storage antes de gravar signed URL.
  // Em dev o cliente pula upload; nesse caso apenas confia no path.
  if (!isDev()) {
    const { data: listing, error: listErr } = await storageClient.storage
      .from("editor-assets")
      .list(`${userId}/${id}`, { search: "cover-confirmed.png" });
    if (listErr) {
      return NextResponse.json(
        { error: `Falha ao verificar upload: ${listErr.message}` },
        { status: 500 },
      );
    }
    const encontrado = listing?.some((o) => o.name === "cover-confirmed.png");
    if (!encontrado) {
      return NextResponse.json(
        { error: "Upload não encontrado no storage. Tente confirmar novamente." },
        { status: 400 },
      );
    }
  }

  const { data: pngSigned } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(path, 365 * 24 * 3600);

  const imagemUrl = pngSigned?.signedUrl ?? null;

  // Update dados_capa
  const { data: currentProject, error: capaLoadErr } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", id)
    .single();

  if (capaLoadErr) {
    // C5-04: erro transiente aqui + merge sobre {} apagaria dados_capa inteira.
    console.error("[cover-editor-confirm] falha ao carregar dados_capa:", capaLoadErr.message);
    return NextResponse.json(
      { error: "Falha ao carregar a capa atual. Tente novamente." },
      { status: 500 }
    );
  }

  const currentCapa = ((currentProject?.dados_capa as Record<string, unknown>) ?? {});
  const confirmedAt = new Date().toISOString();

  // Decisão d (C.4): root `orelha_mm` é a fonte canônica. O confirm espelha
  // o rascunho do editor (editor_data.orelhaMm) pro root; se não houver
  // rascunho numérico, preserva o root existente. Em layout=frente o valor
  // canônico é 0 (sem orelhas).
  const currentEditorData = (currentCapa.editor_data as Record<string, unknown> | null | undefined) ?? {};
  const editorOrelha = (currentEditorData as { orelhaMm?: unknown }).orelhaMm;
  const orelhaRoot =
    layoutValidado === "frente"
      ? 0
      : typeof editorOrelha === "number" && Number.isFinite(editorOrelha)
        ? editorOrelha
        : (currentCapa.orelha_mm as number | undefined) ?? 0;

  // Grava layout no editor_data também (fonte da verdade pra reabrir o editor).
  const novoEditorData = {
    ...currentEditorData,
    layout: layoutValidado,
  };

  const novoDadosCapa = {
    ...currentCapa,
    imagem_url: imagemUrl,
    source: "editor",
    confirmed_at: confirmedAt,
    orelha_mm: orelhaRoot,
    editor_data: novoEditorData,
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
  // Em layout=frente (trilha digital) a capa não tem verso/lombada/sangria
  // completa — não faz sentido gerar PDF de gráfica.
  if (layoutValidado === "panoramica") {
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
  }

  // Fire-and-forget análise técnica (14.M.1). Detecta colorspace/sangria/DPI
  // da capa exportada pelo editor e persiste em dados_capa.analise_tecnica.
  fetch(`${req.nextUrl.origin}/api/projects/${id}/capa/analisar`, {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") ?? "" },
  }).catch((err) => {
    console.warn("[cover-editor/confirm] analisar fire-and-forget falhou:", err);
  });

  // Housekeeping (C5-05): remove imagens não-referenciadas de images/.
  // Best-effort — se falhar, fica pra próxima confirmação.
  fetch(`${req.nextUrl.origin}/api/projects/${id}/cover-editor/cleanup-images`, {
    method: "POST",
    headers: { cookie: req.headers.get("cookie") ?? "" },
  }).catch((err) => {
    console.warn("[cover-editor/confirm] cleanup-images fire-and-forget falhou:", err);
  });

  return NextResponse.json({
    imagem_url: imagemUrl,
    confirmed_at: confirmedAt,
  });
}

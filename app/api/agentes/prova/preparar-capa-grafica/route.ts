export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

/**
 * Extrai o storage path de uma URL signed do Supabase.
 * Padrão: https://xxx.supabase.co/storage/v1/object/sign/editor-assets/USERID/PROJECT/file.jpg?token=...
 */
function extractStoragePath(url: string): string | null {
  const match = url.match(/\/editor-assets\/([^?]+)/);
  return match ? match[1] : null;
}

export async function POST(req: NextRequest) {
  let userId: string;
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];

  try {
    const auth = await requireAuth();
    userId = auth.user.id;
    supabase = auth.supabase;
  } catch (e) {
    return e as Response;
  }

  const body = await req.json().catch(() => ({})) as { project_id?: string };
  const projectId = body.project_id;

  if (!projectId) {
    return NextResponse.json({ error: "project_id é obrigatório." }, { status: 400 });
  }

  // Carrega o projeto
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, user_id, formato, dados_capa, dados_miolo")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectErr) {
    console.error("[preparar-capa-grafica] erro ao buscar projeto:", projectErr);
    return NextResponse.json({ error: "Erro ao buscar projeto." }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const capa = (project.dados_capa ?? null) as Record<string, unknown> | null;
  const miolo = (project.dados_miolo ?? null) as { paginas_reais?: number } | null;

  if (!capa) {
    return NextResponse.json(
      { error: "Capa ainda não foi gerada. Volte para a etapa de Capa antes de preparar o PDF para gráfica." },
      { status: 422 },
    );
  }

  // Pré-requisito: capa precisa ter passado pelo Editor (editor_data)
  const editorData = capa.editor_data as { version?: number; comOrelhas?: boolean; elements?: unknown[] } | undefined;
  if (!editorData || editorData.version !== 1) {
    return NextResponse.json(
      {
        error: "Para preparar o PDF para gráfica, a capa precisa passar pelo Editor de Capa.",
        action: "ir_para_editor_capa",
      },
      { status: 422 },
    );
  }

  // Pré-requisito: precisa ter imagem da capa no storage
  const imagemUrl = capa.imagem_url as string | undefined;
  if (!imagemUrl) {
    return NextResponse.json(
      { error: "Imagem da capa não encontrada. Reabra o Editor de Capa e confirme novamente." },
      { status: 422 },
    );
  }

  const coverImagePath = extractStoragePath(imagemUrl);
  if (!coverImagePath) {
    return NextResponse.json(
      { error: "Não foi possível identificar o arquivo da capa. Reabra o Editor de Capa e confirme novamente." },
      { status: 422 },
    );
  }

  // Pré-requisito: precisa ter miolo gerado pra saber o número de páginas
  const paginasReais = miolo?.paginas_reais;
  if (!paginasReais) {
    return NextResponse.json(
      { error: "Miolo ainda não foi gerado. Conclua a etapa de Diagramação antes de preparar o PDF para gráfica." },
      { status: 422 },
    );
  }

  // Chama internamente a rota exportar-pdf
  const baseUrl = req.nextUrl.origin;
  const exportUrl = `${baseUrl}/api/projects/${projectId}/cover-editor/export-pdf`;

  let exportRes: Response;
  try {
    exportRes = await fetch(exportUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        versao: "grafica",
        editorData,
        coverImagePath,
        format: project.formato,
        pages: paginasReais,
      }),
    });
  } catch (fetchErr) {
    console.error("[preparar-capa-grafica] fetch interno falhou:", fetchErr);
    return NextResponse.json(
      { error: "Falha de comunicação ao gerar o PDF da capa. Tente novamente." },
      { status: 500 },
    );
  }

  const exportData = await exportRes.json().catch(() => ({}));

  if (!exportRes.ok) {
    console.error("[preparar-capa-grafica] exportar-pdf retornou erro:", exportRes.status, exportData);
    return NextResponse.json(
      { error: (exportData as { error?: string })?.error ?? "Falha na geração do PDF gráfica." },
      { status: 500 },
    );
  }

  const storagePath = (exportData as { storage_path?: string }).storage_path;
  if (!storagePath) {
    return NextResponse.json(
      { error: "PDF gerado mas storage_path não foi retornado." },
      { status: 500 },
    );
  }

  // Persiste em dados_capa.pdf_grafica
  const newCapa = {
    ...capa,
    pdf_grafica: {
      storage_path: storagePath,
      gerado_em: new Date().toISOString(),
      formato: project.formato,
      paginas_no_momento: paginasReais,
      com_orelhas: Boolean(editorData.comOrelhas),
    },
  };

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ dados_capa: newCapa })
    .eq("id", projectId);

  if (updateErr) {
    console.error("[preparar-capa-grafica] erro ao salvar dados_capa.pdf_grafica:", updateErr);
    return NextResponse.json(
      { error: "PDF gerado mas falhou ao persistir em dados_capa. Tente novamente." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    storage_path: storagePath,
    paginas_no_momento: paginasReais,
  });
}

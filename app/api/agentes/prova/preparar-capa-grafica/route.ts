export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  buildGraficaPdf,
  ICC_PROFILE_PATH,
} from "@/app/editor/capa/[project_id]/lib/cover-grafica-pdf";
import {
  clampOrelhaMm,
  getOrelhaDefault,
  type FormatKey,
} from "@/app/editor/capa/[project_id]/lib/dimensions";
import type { AnaliseTecnica } from "@/lib/capa-analyzer";

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

  const paginasReais = miolo?.paginas_reais;
  if (!paginasReais) {
    return NextResponse.json(
      { error: "Miolo ainda não foi gerado. Conclua a etapa de Diagramação antes de preparar o PDF para gráfica." },
      { status: 422 },
    );
  }

  // ── Bloqueio: capa em formato eBook (frente pura) ─────────────────────────
  // Se a capa atual é só a frente do livro (140×210mm), não é possível gerar
  // PDF panorâmico para gráfica sem inventar contracapa/lombada. O client
  // deve exibir CTA "Alterar capa" na trilha impressa e enviar o autor de
  // volta ao editor (se veio do editor) ou para /dashboard/capa (se veio
  // de upload/IA). Aqui é a defesa em profundidade — protege contra
  // chamada direta via curl/URL.
  if (capa.is_frente_pura === true) {
    return NextResponse.json(
      {
        error: "A capa atual é somente para eBook (frente pura). Para publicação impressa, envie uma capa panorâmica ou refaça no editor.",
        action: capa.source === "editor" ? "ir_para_editor" : "ir_para_capa",
      },
      { status: 422 },
    );
  }

  // ── Bloqueio: capa não passou no analyzer ─────────────────────────────────
  // Defesa em profundidade para os outros cenários que o capa-analyzer
  // marca como inapta: Config B/C (sem marcas de corte ou sem sangria),
  // configuração "desconhecida" (dimensões atípicas), DPI abaixo de 300
  // em imagens rasterizadas, colorspace inválido. A Prova já filtra esses
  // casos no client — este check protege contra chamada direta via
  // curl/URL ou race condition.
  const analiseTec = capa.analise_tecnica as AnaliseTecnica | undefined;
  if (analiseTec && analiseTec.ok_grafica === false) {
    return NextResponse.json(
      {
        error: "A capa atual não está apta para publicação impressa. Envie uma capa panorâmica em CMYK, com sangria de 3mm e marcas de corte.",
        action: capa.source === "editor" ? "ir_para_editor" : "ir_para_capa",
      },
      { status: 422 },
    );
  }

  const formatoAtual = (project.formato ?? "padrao_br") as FormatKey;

  const editorData = capa.editor_data as
    | { version?: number; orelhaMm?: number; comOrelhas?: boolean; elements?: unknown[] }
    | undefined;

  const isEditorSource = capa.source === "editor" && editorData?.version === 1;
  const isUploadSource = capa.modo === "upload" && typeof capa.url === "string";

  // ── Branch A: editor (proxy para /cover-editor/export-pdf) ─────────────────
  if (isEditorSource) {
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

    const orelhaMmAtual =
      typeof editorData.orelhaMm === "number"
        ? clampOrelhaMm(formatoAtual, editorData.orelhaMm)
        : editorData.comOrelhas
          ? getOrelhaDefault(formatoAtual)
          : 0;

    const newCapa = {
      ...capa,
      pdf_grafica: {
        storage_path: storagePath,
        gerado_em: new Date().toISOString(),
        formato: project.formato,
        paginas_no_momento: paginasReais,
        orelha_mm: orelhaMmAtual,
        com_orelhas: orelhaMmAtual > 0,
        fonte: "editor" as const,
      },
    };

    const { error: updateErr } = await supabase
      .from("projects")
      .update({ dados_capa: newCapa })
      .eq("id", projectId);

    if (updateErr) {
      console.error("[preparar-capa-grafica] erro ao salvar pdf_grafica (editor):", updateErr);
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

  // ── Branch B: upload puro (pdf-lib + Sharp direto, sem Puppeteer) ──────────
  if (isUploadSource) {
    const url = capa.url as string;
    const orelhaMmRaw = capa.orelha_mm;
    const usarOrelhas = capa.usar_orelhas;
    let orelhaMmAtual = 0;
    if (typeof orelhaMmRaw === "number" && Number.isFinite(orelhaMmRaw)) {
      orelhaMmAtual = clampOrelhaMm(formatoAtual, orelhaMmRaw);
    } else if (typeof usarOrelhas === "boolean") {
      orelhaMmAtual = usarOrelhas ? getOrelhaDefault(formatoAtual) : 0;
    }

    let coverBuffer: Buffer;
    try {
      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status} ao baixar capa do upload`);
      coverBuffer = Buffer.from(await imgRes.arrayBuffer());
    } catch (dlErr) {
      console.error("[preparar-capa-grafica] falha ao baixar upload:", dlErr);
      return NextResponse.json({ error: "Falha ao baixar imagem da capa." }, { status: 500 });
    }

    let pdfBytes: Uint8Array;
    try {
      // Sharp aplica o ICC profile FOGRA39 para CMYK, mesmo fluxo do editor.
      const cmykJpegBuffer = await sharp(coverBuffer)
        .withIccProfile(ICC_PROFILE_PATH)
        .jpeg({ quality: 95 })
        .toBuffer();

      pdfBytes = await buildGraficaPdf(cmykJpegBuffer, {
        format: formatoAtual,
        pages: paginasReais,
        orelhaMm: orelhaMmAtual,
        projectName: "",
        withCmykGuides: true,
      });
    } catch (buildErr) {
      console.error("[preparar-capa-grafica] falha ao montar PDF do upload:", buildErr);
      return NextResponse.json({ error: "Falha ao gerar PDF da capa do upload." }, { status: 500 });
    }

    const storageClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const timestamp = Date.now();
    const storagePath = `${userId}/${projectId}/exports/capa-grafica-${timestamp}.pdf`;

    const { error: uploadErr } = await storageClient.storage
      .from("editor-assets")
      .upload(storagePath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("[preparar-capa-grafica] falha ao salvar PDF do upload:", uploadErr);
      return NextResponse.json({ error: "PDF gerado mas falhou ao salvar no storage." }, { status: 500 });
    }

    const newCapa = {
      ...capa,
      pdf_grafica: {
        storage_path: storagePath,
        gerado_em: new Date().toISOString(),
        formato: project.formato,
        paginas_no_momento: paginasReais,
        orelha_mm: orelhaMmAtual,
        com_orelhas: orelhaMmAtual > 0,
        fonte: "upload_direto" as const,
      },
    };

    const { error: updateErr } = await supabase
      .from("projects")
      .update({ dados_capa: newCapa })
      .eq("id", projectId);

    if (updateErr) {
      console.error("[preparar-capa-grafica] erro ao salvar pdf_grafica (upload):", updateErr);
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

  // ── Nenhuma fonte válida ──────────────────────────────────────────────────
  return NextResponse.json(
    {
      error:
        "Para preparar o PDF para gráfica, é necessário confirmar a capa no Editor ou enviar uma capa panorâmica via Upload.",
      action: "ir_para_editor_capa",
    },
    { status: 422 },
  );
}

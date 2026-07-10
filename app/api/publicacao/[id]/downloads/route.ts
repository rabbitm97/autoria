import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import type { FormatoLivro } from "@/lib/formatos";

export const maxDuration = 30;

interface DownloadItem {
  url: string;
  filename: string;
  storage_path: string | null;
}

interface CapituloAudioItem {
  index: number;
  titulo: string;
  url: string;
  filename: string;
}

export interface PublicacaoDownloadsResponse {
  miolo: {
    pdf_impressao: DownloadItem | null;
    pdf_digital: DownloadItem | null;
    docx: DownloadItem | null;
    html_preview: DownloadItem | null;
  };
  ebook: {
    epub: DownloadItem | null;
  };
  capa: {
    origem: "editor" | "ia" | "upload" | null;
    jpeg_ebook: DownloadItem | null;
    jpeg_completa: DownloadItem | null;
    pdf_cmyk: DownloadItem | null;
    pdf_rgb: DownloadItem | null;
    capa_original: DownloadItem | null;
  };
  audiolivro: {
    capitulos: CapituloAudioItem[];
    total_gerados: number;
    total_esperados: number;
  };
  qa_grafica: {
    aprovado: boolean;
    pendencias: Array<{ mensagem: string; categoria: string }>;
  } | null;
  migracao_disparada: {
    jpeg_ebook: boolean;
    pdf_rgb: boolean;
  };
}

type StorageOnlyClient = { storage: ReturnType<typeof createClient>["storage"] };

async function signedFromBucket(
  storageClient: StorageOnlyClient,
  bucket: string,
  path: string | null | undefined,
  filename: string,
): Promise<DownloadItem | null> {
  if (!path) return null;
  const { data } = await storageClient.storage.from(bucket).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  return { url: data.signedUrl, filename, storage_path: path };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;

  let userId: string;
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];

  try {
    const auth = await requireAuth();
    userId = auth.user.id;
    supabase = auth.supabase;
  } catch (e) {
    return e as Response;
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("dados_capa, dados_pdf, dados_pdf_digital, dados_miolo, dados_audio, dados_qa, formato")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projErr) {
    console.error("[publicacao/downloads] erro ao buscar projeto:", projErr);
    return NextResponse.json({ error: "Erro ao buscar projeto." }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const dadosPdf = project.dados_pdf as {
    storage_path?: string;
    filename?: string;
    epub?: { storage_path?: string; capitulos?: number; gerado_em?: string };
    docx?: { storage_path?: string; filename?: string };
    html_preview_path?: string;
  } | null;
  const dadosPdfDigital = project.dados_pdf_digital as {
    storage_path?: string;
    filename?: string;
  } | null;

  const pdfImpressao = await signedFromBucket(
    storageClient,
    "livros",
    dadosPdf?.storage_path ?? null,
    dadosPdf?.filename ?? "livro-impressao.pdf",
  );
  const pdfDigital = await signedFromBucket(
    storageClient,
    "livros",
    dadosPdfDigital?.storage_path ?? null,
    dadosPdfDigital?.filename ?? "livro-digital.pdf",
  );
  const docx = await signedFromBucket(
    storageClient,
    "livros",
    dadosPdf?.docx?.storage_path ?? null,
    dadosPdf?.docx?.filename ?? "livro.docx",
  );
  const htmlPreview = await signedFromBucket(
    storageClient,
    "livros",
    dadosPdf?.html_preview_path ?? null,
    "miolo-preview.html",
  );

  const epub = await signedFromBucket(
    storageClient,
    "livros",
    dadosPdf?.epub?.storage_path ?? null,
    "livro.epub",
  );

  const dadosCapa = project.dados_capa as Record<string, unknown> | null;
  const capaOrigem: "editor" | "ia" | "upload" | null =
    dadosCapa?.source === "editor" ? "editor" :
    dadosCapa?.modo === "ia" ? "ia" :
    dadosCapa?.modo === "upload" ? "upload" :
    null;

  const exportsCapa = (dadosCapa?.exports as Record<string, { storage_path?: string; ext?: string }> | undefined) ?? {};

  const jpegEbook = await signedFromBucket(
    storageClient,
    "editor-assets",
    exportsCapa.jpeg_ebook?.storage_path ?? null,
    `capa-ebook.${exportsCapa.jpeg_ebook?.ext ?? "jpg"}`,
  );

  const pdfCmyk = await signedFromBucket(
    storageClient,
    "editor-assets",
    (dadosCapa?.pdf_grafica as { storage_path?: string } | undefined)?.storage_path ?? null,
    "capa-CMYK-grafica.pdf",
  );

  const pdfRgb = await signedFromBucket(
    storageClient,
    "editor-assets",
    exportsCapa.pdf_rgb?.storage_path ?? null,
    "capa-RGB-grafica.pdf",
  );

  let jpegCompleta: DownloadItem | null = null;
  if (capaOrigem === "editor" || capaOrigem === "ia") {
    try {
      const capaResolvida = resolveCapaCompleta(
        dadosCapa ?? undefined,
        (project.formato as FormatoLivro) ?? "padrao_br",
      );
      if (capaResolvida?.url_principal) {
        jpegCompleta = {
          url: capaResolvida.url_principal,
          filename: "capa-completa-300dpi.jpg",
          storage_path: null,
        };
      }
    } catch (err) {
      console.warn("[publicacao/downloads] falha ao resolver capa completa:", err);
    }
  }

  let capaOriginal: DownloadItem | null = null;
  if (capaOrigem === "upload") {
    const storagePathUpload = dadosCapa?.storage_path as string | undefined;
    if (storagePathUpload) {
      const { url: signedUrl } = await signedUrlCapas(storageClient, storagePathUpload);
      if (signedUrl) {
        const ext = storagePathUpload.split(".").pop() ?? "jpg";
        capaOriginal = {
          url: signedUrl,
          filename: `capa-original.${ext}`,
          storage_path: storagePathUpload,
        };
      }
    }
  }

  const dadosAudio = project.dados_audio as {
    capitulos?: Array<{
      index: number;
      titulo: string;
      storage_path: string;
    }>;
  } | null;

  const capitulosAudio: CapituloAudioItem[] = [];
  if (dadosAudio?.capitulos?.length) {
    for (const cap of dadosAudio.capitulos) {
      const { data: signed } = await storageClient.storage
        .from("audiolivros")
        .createSignedUrl(cap.storage_path, 3600);
      if (signed?.signedUrl) {
        capitulosAudio.push({
          index: cap.index,
          titulo: cap.titulo,
          url: signed.signedUrl,
          filename: `cap_${String(cap.index).padStart(3, "0")}.mp3`,
        });
      }
    }
  }

  const dadosQa = project.dados_qa as {
    grafica?: {
      aprovado?: boolean;
      pendencias?: Array<{ mensagem: string; categoria: string }>;
    };
  } | null;

  const qaGrafica = dadosQa?.grafica
    ? {
        aprovado: dadosQa.grafica.aprovado ?? false,
        pendencias: dadosQa.grafica.pendencias ?? [],
      }
    : null;

  const migracao = { jpeg_ebook: false, pdf_rgb: false };

  if (!jpegEbook && dadosPdf?.epub?.storage_path) {
    migracao.jpeg_ebook = true;
    const baseUrl = req.nextUrl.origin;
    fetch(`${baseUrl}/api/agentes/gerar-epub`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ project_id: projectId }),
    }).catch((err) => {
      console.warn("[publicacao/downloads] migração jpeg_ebook falhou:", err);
    });
  }

  if (!pdfRgb && capaOrigem === "editor") {
    migracao.pdf_rgb = true;
    const baseUrl = req.nextUrl.origin;
    fetch(`${baseUrl}/api/agentes/prova/preparar-capa-grafica`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ project_id: projectId }),
    }).catch((err) => {
      console.warn("[publicacao/downloads] migração pdf_rgb falhou:", err);
    });
  }

  const response: PublicacaoDownloadsResponse = {
    miolo: { pdf_impressao: pdfImpressao, pdf_digital: pdfDigital, docx, html_preview: htmlPreview },
    ebook: { epub },
    capa: {
      origem: capaOrigem,
      jpeg_ebook: jpegEbook,
      jpeg_completa: jpegCompleta,
      pdf_cmyk: pdfCmyk,
      pdf_rgb: pdfRgb,
      capa_original: capaOriginal,
    },
    audiolivro: {
      capitulos: capitulosAudio,
      total_gerados: capitulosAudio.length,
      total_esperados: dadosAudio?.capitulos?.length ?? 0,
    },
    qa_grafica: qaGrafica,
    migracao_disparada: migracao,
  };

  return NextResponse.json(response);
}

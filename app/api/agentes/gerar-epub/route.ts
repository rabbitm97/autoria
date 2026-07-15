export const maxDuration = 60;

import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { extractFrontCover, type FormatoCapa } from "@/lib/capa-frente-extractor";
import { segmentByCapitulosAprovados, type CapituloAprovado } from "@/lib/parse-chapters";
import type { EpubResult } from "@/lib/project-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { EpubResult } from "@/lib/project-data";

// ─── Chapters → Paragraphs ───────────────────────────────────────────────────
// Q.6: capítulos vêm de manuscripts.capitulos_aprovados (mesma fonte que o
// miolo). A segmentação por posições acontece em segmentByCapitulosAprovados
// (lib/parse-chapters.ts). Aqui apenas quebramos cada segmento em parágrafos
// por linhas em branco — comportamento visual do EPUB.

interface ChapterLocal {
  title: string;
  paragraphs: string[];
}

function chapterToParagraphs(chapter: { title: string; text: string }): ChapterLocal {
  const paragraphs = chapter.text
    .split(/\n\s*\n+/)
    .map(p => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
  return { title: chapter.title, paragraphs };
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chapterXhtml(chapter: ChapterLocal, _idx: number): string {
  const paras = chapter.paragraphs
    .map((p, i) => `    <p class="${i === 0 ? "first" : "body"}">${esc(p)}</p>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt">
<head>
  <meta charset="UTF-8"/>
  <title>${esc(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body>
  <div class="chapter">
    <h2 class="chapter-title">${esc(chapter.title)}</h2>
${paras}
  </div>
</body>
</html>`;
}

const CSS = `
body { font-family: Georgia, "Times New Roman", serif; font-size: 1em; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 0; }
.chapter { margin: 0 auto; max-width: 38em; padding: 2em 1.5em; }
.chapter-title { font-size: 1.4em; font-weight: bold; text-align: center; margin: 0 0 2em; padding-bottom: 0.5em; border-bottom: 1px solid #ddd; }
p.first { text-indent: 0; margin-top: 0; }
p.body { text-indent: 1.5em; margin: 0; }
`;

function navXhtml(chapters: ChapterLocal[], bookTitle: string): string {
  const items = chapters
    .map((c, i) => `    <li><a href="chapters/chapter-${String(i + 1).padStart(3, "0")}.xhtml">${esc(c.title)}</a></li>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="pt">
<head><meta charset="UTF-8"/><title>Índice</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${esc(bookTitle)}</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`;
}

function ncxXml(chapters: ChapterLocal[], bookTitle: string, autor: string, uid: string): string {
  const navPoints = chapters
    .map((c, i) => `  <navPoint id="np-${i + 1}" playOrder="${i + 1}">
    <navLabel><text>${esc(c.title)}</text></navLabel>
    <content src="chapters/chapter-${String(i + 1).padStart(3, "0")}.xhtml"/>
  </navPoint>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
  <meta name="dtb:uid" content="${uid}"/>
  <meta name="dtb:depth" content="1"/>
  <meta name="dtb:totalPageCount" content="0"/>
  <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${esc(bookTitle)}</text></docTitle>
<docAuthor><text>${esc(autor)}</text></docAuthor>
<navMap>
${navPoints}
</navMap>
</ncx>`;
}

function opfXml(
  chapters: ChapterLocal[],
  bookTitle: string,
  subtitulo: string,
  autor: string,
  uid: string,
  lang = "pt-BR",
  coverExt: "jpg" | "png" | null = null,
  palavrasChave: string[] = [],
): string {
  const items = chapters
    .map((_, i) => `    <item id="ch${i + 1}" href="chapters/chapter-${String(i + 1).padStart(3, "0")}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spine = chapters
    .map((_, i) => `    <itemref idref="ch${i + 1}"/>`)
    .join("\n");

  const coverManifest = coverExt
    ? `\n  <item id="cover" href="cover.${coverExt}" media-type="image/${coverExt === "png" ? "png" : "jpeg"}" properties="cover-image"/>`
    : "";

  const subjects = palavrasChave
    .map(kw => `  <dc:subject>${esc(kw)}</dc:subject>`)
    .join("\n");

  const subtitleMeta = subtitulo
    ? `\n  <dc:title id="subtitle">${esc(subtitulo)}</dc:title>\n  <meta refines="#subtitle" property="title-type">subtitle</meta>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">${uid}</dc:identifier>
  <dc:title id="main-title">${esc(bookTitle)}</dc:title>
  <meta refines="#main-title" property="title-type">main</meta>${subtitleMeta}
  <dc:creator>${esc(autor)}</dc:creator>
  <dc:language>${lang}</dc:language>
  <dc:date>${new Date().toISOString().slice(0, 10)}</dc:date>
  <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
${subjects}
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="css" href="styles.css" media-type="text/css"/>${coverManifest}
${items}
</manifest>
<spine toc="ncx">
${spine}
</spine>
</package>`;
}

// ─── POST /api/agentes/gerar-epub ─────────────────────────────────────────────
// Body: { project_id }

export async function POST(req: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (isDev()) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    userId = user.id;
  }

  let body: { project_id: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const { project_id } = body;
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  // ── Load data ─────────────────────────────────────────────────────────────
  let titulo = "Sem título";
  let subtitulo = "";
  let autor = "";
  let texto = "";
  let capaUrl: string | null = null;
  let palavrasChave: string[] = [];
  let dadosMiolo: { paginas_reais?: number; config?: { paginas_estimadas?: number } } | null = null;
  let projectFormato: FormatoCapa | null = null;
  let capaResolvida: ReturnType<typeof resolveCapaCompleta> | null = null;
  let capitulosAprovados: CapituloAprovado[] | null = null;
  let hashSalvo: string | null = null;

  if (isDev()) {
    titulo    = "O Último Manuscrito";
    subtitulo = "Uma noite que mudou tudo";
    autor     = "Dev Author";
    texto     = [
      "CAPÍTULO 1\n\nEra uma noite escura e tempestuosa quando tudo começou.",
      "O protagonista olhou pela janela e viu algo que mudaria sua vida para sempre.",
      "CAPÍTULO 2\n\nO dia seguinte trouxe novas revelações.",
      "A cidade acordou sob uma neblina densa. Cada passo revelava um novo mistério.",
    ].join("\n\n");
  } else {
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("dados_elementos, dados_capa, dados_miolo, formato, manuscripts(titulo, subtitulo, texto, texto_revisado, nome, autor_primeiro_nome, autor_sobrenome, capitulos_aprovados, capitulos_aprovados_texto_hash)")
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (projErr || !project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

    const el = project.dados_elementos as Record<string, unknown> | null;
    const ms = project.manuscripts as {
      titulo?: string;
      subtitulo?: string;
      texto?: string;
      texto_revisado?: string;
      nome?: string;
      autor_primeiro_nome?: string;
      autor_sobrenome?: string;
      capitulos_aprovados?: CapituloAprovado[] | null;
      capitulos_aprovados_texto_hash?: string | null;
    } | null;
    projectFormato = project.formato as FormatoCapa | null;
    capaResolvida = resolveCapaCompleta(
      project.dados_capa as Record<string, unknown> | null,
      projectFormato ?? "padrao_br",
    );
    dadosMiolo = project.dados_miolo as { paginas_reais?: number; config?: { paginas_estimadas?: number } } | null;

    // Cascata: escolha em Elementos > original. O <dc:title> no OPF é
    // o que Amazon/Apple/Kobo mostram como título do eBook para o
    // leitor. Bug permanente se sair errado.
    const titEsc = (el as { titulo_escolhido?: string })?.titulo_escolhido?.trim();
    const subEsc = (el as { subtitulo?: string })?.subtitulo?.trim();
    titulo       = titEsc || ms?.titulo?.trim() || "Sem título";
    subtitulo    = subEsc ?? ms?.subtitulo?.trim() ?? "";
    texto        = ms?.texto_revisado ?? ms?.texto ?? "";
    capaUrl      = capaResolvida.url_area_util ?? capaResolvida.url_principal;
    palavrasChave = (el?.palavras_chave as string[] | undefined) ?? [];
    autor        = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "";
    capitulosAprovados = ms?.capitulos_aprovados ?? null;
    hashSalvo = ms?.capitulos_aprovados_texto_hash ?? null;
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: "Manuscrito sem texto. Execute o parse primeiro." }, { status: 422 });
  }

  // ── Validate approved chapters ────────────────────────────────────────────
  // Q.6: EPUB usa a mesma fonte que o miolo — capitulos_aprovados +
  // validação de hash. Zero heurística no artefato final.
  if (!isDev()) {
    if (capitulosAprovados == null) {
      return NextResponse.json(
        {
          error: "Aprove os capítulos do livro antes de gerar o EPUB.",
          action: "approve_chapters",
          reason: "no_approval",
        },
        { status: 422 },
      );
    }
    const hashAtual = createHash("md5").update(texto).digest("hex");
    if (hashSalvo !== hashAtual) {
      console.log("[gerar-epub] hash do texto mudou desde a aprovação", {
        project_id,
        hashSalvo: hashSalvo?.slice(0, 8),
        hashAtual: hashAtual.slice(0, 8),
      });
      return NextResponse.json(
        {
          error: "O texto mudou desde a última aprovação de capítulos. Reaprove os capítulos.",
          action: "approve_chapters",
          reason: "text_changed",
        },
        { status: 422 },
      );
    }
  }

  // ── Fetch cover image (optional) ─────────────────────────────────────────
  // Para capas panorâmicas do Editor (frente + lombada + contracapa + sangria
  // lado a lado), recorta apenas a frente — capa de EPUB precisa ser portrait
  // limpa, não panorâmica esticada.
  let coverBuffer: Buffer | null = null;
  let coverExt: "jpg" | "png" | null = null;

  if (capaUrl) {
    const paginas =
      dadosMiolo?.paginas_reais ??
      dadosMiolo?.config?.paginas_estimadas ??
      null;

    // Recorta a frente de qualquer capa panorâmica — sem depender de miolo
    // gerado. A inferência da geometria dentro do extractor usa as dimensões
    // reais da imagem (largura em mm) para deduzir lombada e orelhas; só o
    // fallback interno precisa de páginas, mas ele quase nunca é acionado.
    //
    // Autor pode gerar EPUB antes do miolo (fluxo permitido), então
    // exigir paginas >= 1 aqui cortava esse caso indevidamente e forçava
    // EPUB com capa panorâmica inteira.
    const podeRecortar =
      capaResolvida?.is_panoramica === true &&
      !!projectFormato;

    if (podeRecortar) {
      const front = await extractFrontCover({
        url: capaUrl,
        formato: projectFormato!,
        // paginas: 0 quando miolo ainda não foi gerado. O extractor tenta
        // inferir via largura da imagem primeiro; só cai no fallback via
        // páginas em casos exóticos (imagem com altura fora de tolerância).
        paginas: paginas ?? 0,
        // orelha_mm canônico do resolver — funciona para editor/upload/IA.
        // Fallback 0 se o resolver não populou por algum motivo.
        orelhaMm: capaResolvida?.orelha_mm ?? 0,
      });
      if (front) {
        coverBuffer = front.buffer;
        coverExt = front.ext;
        console.log(
          `[gerar-epub] frente recortada: ${front.widthPx}x${front.heightPx}`,
        );
      } else {
        console.warn("[gerar-epub] recorte falhou — usando capa panorâmica completa como fallback");
      }
    }

    // Fallback: baixa a imagem inteira (panorâmica ou não)
    if (!coverBuffer) {
      try {
        const res = await fetch(capaUrl);
        if (res.ok) {
          const contentType = res.headers.get("content-type") ?? "";
          coverExt = contentType.includes("png") ? "png" : "jpg";
          coverBuffer = Buffer.from(await res.arrayBuffer());
        }
      } catch {
        console.warn("[gerar-epub] falha ao baixar capa, continuando sem ela.");
      }
    }
  }

  // ── Build EPUB ────────────────────────────────────────────────────────────
  const uid = `urn:uuid:${randomUUID()}`;
  // Segmentar via posições aprovadas → converter cada Chapter em ChapterLocal
  // (com parágrafos derivados de linhas em branco). Em dev mode não temos
  // capitulos_aprovados → cai em [] (capítulo único).
  const segmentedChapters = segmentByCapitulosAprovados(
    texto,
    capitulosAprovados ?? [],
    titulo,
  );
  const chapters = segmentedChapters.map(chapterToParagraphs);

  const zip = new JSZip();

  // mimetype MUST be first and uncompressed
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  // META-INF
  zip.folder("META-INF")!.file("container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // OEBPS
  const oebps = zip.folder("OEBPS")!;
  oebps.file("content.opf", opfXml(chapters, titulo, subtitulo, autor, uid, "pt-BR", coverExt, palavrasChave));
  oebps.file("toc.ncx",     ncxXml(chapters, titulo, autor, uid));
  oebps.file("nav.xhtml",   navXhtml(chapters, titulo));
  oebps.file("styles.css",  CSS);

  if (coverBuffer && coverExt) {
    oebps.file(`cover.${coverExt}`, coverBuffer);
  }

  const chaptersFolder = oebps.folder("chapters")!;
  chapters.forEach((ch, i) => {
    chaptersFolder.file(`chapter-${String(i + 1).padStart(3, "0")}.xhtml`, chapterXhtml(ch, i));
  });

  const epubBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // ── Upload ────────────────────────────────────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `${userId}/${project_id}/livro.epub`;

  const { error: uploadError } = await storageClient.storage
    .from("livros")
    .upload(storagePath, epubBuffer, { contentType: "application/epub+zip", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Erro no upload: ${uploadError.message}` }, { status: 500 });
  }

  const { data: signedData, error: signError } = await storageClient.storage
    .from("livros")
    .createSignedUrl(storagePath, 3600);

  if (signError || !signedData) {
    return NextResponse.json({ error: "Erro ao gerar URL de download" }, { status: 500 });
  }

  const result: EpubResult = {
    project_id,
    storage_path: storagePath,
    url_download: signedData.signedUrl,
    capitulos: chapters.length,
    gerado_em: new Date().toISOString(),
  };

  // ── Persistir a JPEG frente pura standalone (BLOCO-02-B0) ────────────────
  // Fonte única: mesma coverBuffer embutida no zip do EPUB, agora também
  // uploadada standalone para consumo da página de Publicação e das lojas
  // (Amazon KDP, Kobo, Apple Books) que pedem capa separada para thumbnails.
  // Merge preserva outros exports já populados (ex.: pdf_rgb do preparar-capa-grafica).
  // Falha é não-fatal: EPUB continua funcional.
  if (coverBuffer && coverExt) {
    try {
      // BLOCO-02-B-housekeeping: path fixo, upsert sobrescreve versão anterior.
      const jpegEbookPath = `${userId}/${project_id}/exports/capa-ebook.${coverExt}`;
      const jpegContentType = coverExt === "png" ? "image/png" : "image/jpeg";

      const { error: jpegUploadErr } = await storageClient.storage
        .from("editor-assets")
        .upload(jpegEbookPath, coverBuffer, {
          contentType: jpegContentType,
          upsert: true,
        });

      if (jpegUploadErr) {
        console.warn("[gerar-epub] falha ao persistir JPEG eBook standalone:", jpegUploadErr.message);
      } else {
        const { data: projRow } = await supabase
          .from("projects")
          .select("dados_capa")
          .eq("id", project_id)
          .eq("user_id", userId)
          .single();

        const capaAtual = (projRow?.dados_capa as Record<string, unknown>) ?? {};
        const exportsAtual = (capaAtual.exports as Record<string, unknown>) ?? {};

        const novaCapa = {
          ...capaAtual,
          exports: {
            ...exportsAtual,
            jpeg_ebook: {
              storage_path: jpegEbookPath,
              gerado_em: new Date().toISOString(),
              fonte: "gerar-epub" as const,
              ext: coverExt,
            },
          },
        };

        const { error: updateCapaErr } = await supabase
          .from("projects")
          .update({ dados_capa: novaCapa })
          .eq("id", project_id)
          .eq("user_id", userId);

        if (updateCapaErr) {
          console.warn("[gerar-epub] JPEG eBook uploadada mas falha ao persistir path em dados_capa:", updateCapaErr.message);
        } else {
          console.log(`[gerar-epub] JPEG eBook standalone persistida: ${jpegEbookPath}`);
        }
      }
    } catch (jpegErr) {
      console.warn("[gerar-epub] erro não-fatal ao persistir JPEG eBook standalone:", jpegErr);
    }
  }

  // Store in dados_pdf alongside PDF data (reuse column)
  const { data: existing } = await supabase
    .from("projects")
    .select("dados_pdf")
    .eq("id", project_id)
    .single();

  const dadosPdfAtual = (existing?.dados_pdf as Record<string, unknown>) ?? {};
  const { ok: epubOk } = await updateProject(supabase, project_id, userId, {
    dados_pdf: { ...dadosPdfAtual, epub: result },
  }, "gerar-epub");
  if (!epubOk) {
    return NextResponse.json(
      { error: "EPUB gerado, mas falha ao registrar no banco. Tente novamente." },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
  } catch (err) {
    console.error("[gerar-epub] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar o EPUB. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET /api/agentes/gerar-epub?project_id=... ───────────────────────────────

export async function GET(req: NextRequest) {
  try {
  const supabase = await createSupabaseServerClient();

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  if (isDev()) return NextResponse.json(null);

  const { data } = await supabase
    .from("projects")
    .select("dados_pdf")
    .eq("id", project_id)
    .single();

  const epub = (data?.dados_pdf as Record<string, unknown> | null)?.epub ?? null;
  if (!epub) return NextResponse.json(null);

  // Refresh signed URL
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const r = epub as EpubResult;
  const { data: signed } = await storageClient.storage
    .from("livros")
    .createSignedUrl(r.storage_path, 3600);

  return NextResponse.json({ ...r, url_download: signed?.signedUrl ?? r.url_download } satisfies EpubResult);
  } catch (err) {
    console.error("[gerar-epub] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter o EPUB. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

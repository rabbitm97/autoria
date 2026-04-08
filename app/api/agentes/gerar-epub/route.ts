export const maxDuration = 60;

import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EpubResult {
  project_id: string;
  storage_path: string;
  url_download: string;   // signed URL (1h)
  capitulos: number;
  gerado_em: string;
}

// ─── Text → Chapters ─────────────────────────────────────────────────────────

interface Chapter {
  title: string;
  paragraphs: string[];
}

function parseChapters(texto: string, bookTitle: string): Chapter[] {
  const CHAPTER_RE = /^(cap[íi]tulo\s+\d+[.:–—\s].*|chapter\s+\d+[.:–—\s].*|\d+\.\s+.{3,60}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/;
  const lines = texto.replace(/\r\n/g, "\n").split("\n");
  const chapters: Chapter[] = [];
  let current: Chapter = { title: bookTitle, paragraphs: [] };
  let paraBuffer = "";

  const flushPara = () => {
    const t = paraBuffer.trim();
    if (t) current.paragraphs.push(t);
    paraBuffer = "";
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); continue; }

    const isHeading =
      CHAPTER_RE.test(line) ||
      (line.length < 60 && line === line.toUpperCase() && line.length > 3);

    if (isHeading) {
      flushPara();
      if (current.paragraphs.length > 0) chapters.push(current);
      current = { title: line, paragraphs: [] };
    } else {
      paraBuffer += (paraBuffer ? " " : "") + line;
    }
  }
  flushPara();
  if (current.paragraphs.length > 0 || chapters.length === 0) chapters.push(current);
  return chapters;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chapterXhtml(chapter: Chapter, _idx: number): string {
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

function navXhtml(chapters: Chapter[], bookTitle: string): string {
  const items = chapters
    .map((c, i) => `    <li><a href="chapters/chapter-${String(i + 1).padStart(2, "0")}.xhtml">${esc(c.title)}</a></li>`)
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

function ncxXml(chapters: Chapter[], bookTitle: string, autor: string, uid: string): string {
  const navPoints = chapters
    .map((c, i) => `  <navPoint id="np-${i + 1}" playOrder="${i + 1}">
    <navLabel><text>${esc(c.title)}</text></navLabel>
    <content src="chapters/chapter-${String(i + 1).padStart(2, "0")}.xhtml"/>
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

function opfXml(chapters: Chapter[], bookTitle: string, autor: string, uid: string, lang = "pt-BR"): string {
  const items = chapters
    .map((_, i) => `    <item id="ch${i + 1}" href="chapters/chapter-${String(i + 1).padStart(2, "0")}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n");
  const spine = chapters
    .map((_, i) => `    <itemref idref="ch${i + 1}"/>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:identifier id="uid">${uid}</dc:identifier>
  <dc:title>${esc(bookTitle)}</dc:title>
  <dc:creator>${esc(autor)}</dc:creator>
  <dc:language>${lang}</dc:language>
  <dc:date>${new Date().toISOString().slice(0, 10)}</dc:date>
  <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
</metadata>
<manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  <item id="css" href="styles.css" media-type="text/css"/>
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
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (process.env.NODE_ENV === "development") {
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
  let autor = "";
  let texto = "";

  if (process.env.NODE_ENV === "development") {
    titulo = "O Último Manuscrito";
    autor  = "Dev Author";
    texto  = [
      "CAPÍTULO 1\n\nEra uma noite escura e tempestuosa quando tudo começou.",
      "O protagonista olhou pela janela e viu algo que mudaria sua vida para sempre.",
      "CAPÍTULO 2\n\nO dia seguinte trouxe novas revelações.",
      "A cidade acordou sob uma neblina densa. Cada passo revelava um novo mistério.",
    ].join("\n\n");
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_elementos, manuscript:manuscript_id(texto, nome)")
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });

    const el = project.dados_elementos as Record<string, unknown> | null;
    const ms = project.manuscript as { texto?: string; nome?: string } | null;

    titulo = (el?.titulo_escolhido as string) ?? (el?.opcoes_titulo as string[])?.[0] ?? ms?.nome ?? "Sem título";
    texto  = ms?.texto ?? "";

    const { data: profile } = await supabase.from("users").select("nome").eq("id", userId).single();
    autor = profile?.nome ?? "";
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: "Manuscrito sem texto. Execute o parse primeiro." }, { status: 422 });
  }

  // ── Build EPUB ────────────────────────────────────────────────────────────
  const uid = `urn:uuid:${randomUUID()}`;
  const chapters = parseChapters(texto, titulo);

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
  oebps.file("content.opf", opfXml(chapters, titulo, autor, uid));
  oebps.file("toc.ncx",     ncxXml(chapters, titulo, autor, uid));
  oebps.file("nav.xhtml",   navXhtml(chapters, titulo));
  oebps.file("styles.css",  CSS);

  const chaptersFolder = oebps.folder("chapters")!;
  chapters.forEach((ch, i) => {
    chaptersFolder.file(`chapter-${String(i + 1).padStart(2, "0")}.xhtml`, chapterXhtml(ch, i));
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

  // Store in dados_pdf alongside PDF data (reuse column)
  const { data: existing } = await supabase
    .from("projects")
    .select("dados_pdf")
    .eq("id", project_id)
    .single();

  const dadosPdfAtual = (existing?.dados_pdf as Record<string, unknown>) ?? {};
  await supabase
    .from("projects")
    .update({ dados_pdf: { ...dadosPdfAtual, epub: result } })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(result);
}

// ─── GET /api/agentes/gerar-epub?project_id=... ───────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });

  if (process.env.NODE_ENV === "development") return NextResponse.json(null);

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
}

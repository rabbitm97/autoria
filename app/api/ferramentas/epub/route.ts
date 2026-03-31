import JSZip from "jszip";
import { NextRequest } from "next/server";

// ─── Text parsing ─────────────────────────────────────────────────────────────

interface Chapter { title: string; text: string }

function parseChapters(texto: string, bookTitle: string): Chapter[] {
  const CHAPTER_RE = /^(cap[íi]tulo\s+\d+[.:–\s].*|\d+\.\s+.{3,}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/;
  const lines = texto.replace(/\r\n/g, "\n").split("\n");
  const chapters: Chapter[] = [];
  let current: Chapter = { title: bookTitle, text: "" };

  for (const raw of lines) {
    const line = raw.trim();
    const isHeading = CHAPTER_RE.test(line) || (line.length < 60 && line === line.toUpperCase() && line.length > 3);
    if (isHeading && line) {
      if (current.text.trim()) chapters.push(current);
      current = { title: line, text: "" };
    } else {
      current.text += (current.text ? " " : "") + line;
    }
  }
  if (current.text.trim()) chapters.push(current);
  if (chapters.length === 0) chapters.push({ title: bookTitle, text: texto });
  return chapters;
}

function textToXhtml(title: string, text: string): string {
  const paras = text.split(/\n+/).filter(Boolean).map(
    (p) => `    <p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="pt-BR">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
  <title>${title.replace(/&/g, "&amp;")}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body>
  <h1 class="chapter-title">${title.replace(/&/g, "&amp;")}</h1>
${paras}
</body>
</html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { titulo?: string; autor?: string; texto: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Body inválido" }, { status: 400 }); }

  const { titulo = "Sem Título", autor = "Autor Desconhecido", texto } = body;
  if (!texto?.trim()) return Response.json({ error: "Texto obrigatório" }, { status: 400 });

  const chapters = parseChapters(texto, titulo);
  const uid = `urn:uuid:${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString().split("T")[0];

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );

  // styles
  zip.file("OEBPS/styles.css",
    `body{font-family:Georgia,serif;font-size:11pt;line-height:1.7;margin:1.5em 2em;}h1.chapter-title{font-size:1.4em;margin:2em 0 1em;color:#1a1a2e;}p{margin:0 0 0.8em;text-align:justify;}`
  );

  // chapter files
  const chapterItems = chapters.map((ch, i) => {
    const fn = `chapters/chapter-${String(i + 1).padStart(2, "0")}.xhtml`;
    zip.file(`OEBPS/${fn}`, textToXhtml(ch.title, ch.text));
    return { fn, title: ch.title, id: `chapter-${i + 1}` };
  });

  // content.opf
  const manifest = chapterItems.map(
    (c) => `    <item id="${c.id}" href="${c.fn}" media-type="application/xhtml+xml"/>`
  ).join("\n");
  const spine = chapterItems.map((c) => `    <itemref idref="${c.id}"/>`).join("\n");
  zip.file("OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${titulo}</dc:title>
    <dc:creator>${autor}</dc:creator>
    <dc:language>pt-BR</dc:language>
    <meta property="dcterms:modified">${now}T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifest}
  </manifest>
  <spine>
${spine}
  </spine>
</package>`
  );

  const buf = await zip.generateAsync({ type: "arraybuffer", mimeType: "application/epub+zip" });
  const slug = titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${slug}.epub"`,
    },
  });
}

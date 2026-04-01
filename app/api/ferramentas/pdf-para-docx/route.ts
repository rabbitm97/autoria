import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { requireAuth } from "@/lib/supabase-server";

// ─── XML helpers ──────────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // Strip invalid XML control characters (keep tab, newline, CR)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

// ─── Text parsing ─────────────────────────────────────────────────────────────

interface Block {
  type: "chapter" | "paragraph";
  text: string;
}

const CHAPTER_RE =
  /^(cap[íi]tulo\s+\d+|chapter\s+\d+|\d+\.\s|\*{3}|—{3}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/i;

function parseText(raw: string): Block[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (
      CHAPTER_RE.test(line) ||
      (line.length < 60 && line === line.toUpperCase() && line.length > 3)
    ) {
      blocks.push({ type: "chapter", text: line });
      i++;
      continue;
    }

    // Accumulate paragraph: merge consecutive non-empty lines
    let para = line;
    i++;
    while (i < lines.length && lines[i].trim()) {
      para += " " + lines[i].trim();
      i++;
    }
    blocks.push({ type: "paragraph", text: para });
  }

  return blocks;
}

// ─── DOCX XML templates ───────────────────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="0" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="480" w:after="240"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:sz w:val="28"/>
      <w:szCs w:val="28"/>
    </w:rPr>
  </w:style>
</w:styles>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="708"/>
  <w:compat/>
</w:settings>`;

// ─── DOCX document.xml builder ────────────────────────────────────────────────

function buildDocumentXml(blocks: Block[]): string {
  const paras = blocks.map((block) => {
    const t = escapeXml(block.text);
    if (block.type === "chapter") {
      return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
    }
    return `<w:p><w:pPr><w:ind w:firstLine="720"/><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paras.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ─── JSZip assembler ──────────────────────────────────────────────────────────

async function buildDocx(rawText: string): Promise<Buffer> {
  const blocks = parseText(rawText);
  const zip = new JSZip();

  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);

  zip.folder("_rels")!.file(".rels", RELS_XML);

  const word = zip.folder("word")!;
  word.file("document.xml", buildDocumentXml(blocks));
  word.file("styles.xml", STYLES_XML);
  word.file("settings.xml", SETTINGS_XML);
  word.folder("_rels")!.file("document.xml.rels", DOCUMENT_RELS_XML);

  return zip.generateAsync({
    type: "nodebuffer",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// ─── POST /api/ferramentas/pdf-para-docx ─────────────────────────────────────
// Body: multipart/form-data — field "file" (PDF, máx 50 MB)

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    try {
      await requireAuth();
    } catch (res) {
      return res as Response;
    }
  }

  // ── Parse multipart ───────────────────────────────────────────────────────
  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Campo 'file' obrigatório." }, { status: 400 });
  }

  const nameLower = file.name.toLowerCase();
  if (!nameLower.endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Apenas arquivos PDF são aceitos." },
      { status: 400 }
    );
  }

  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Arquivo muito grande. Máximo: 50 MB." },
      { status: 400 }
    );
  }

  // ── Extract text from PDF ─────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rawText: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
      b: Buffer
    ) => Promise<{ text: string }>;
    const result = await pdfParse(buffer);
    rawText = result.text;
  } catch (e) {
    return NextResponse.json(
      {
        error: `Falha ao extrair texto do PDF: ${
          e instanceof Error ? e.message : "erro desconhecido"
        }`,
      },
      { status: 422 }
    );
  }

  if (!rawText.trim()) {
    return NextResponse.json(
      {
        error:
          "O PDF não contém texto extraível. PDFs escaneados (imagem) não são suportados.",
      },
      { status: 422 }
    );
  }

  // ── Build DOCX ────────────────────────────────────────────────────────────
  const docxBuffer = await buildDocx(rawText);
  const outName = file.name.replace(/\.pdf$/i, ".docx");

  return new NextResponse(docxBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(outName)}"`,
      "Content-Length": String(docxBuffer.byteLength),
    },
  });
}

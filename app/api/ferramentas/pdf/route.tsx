import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { NextRequest } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

type Formato = "kdp_6x9" | "a5" | "letter";

const FORMATOS: Record<Formato, { width: number; height: number }> = {
  kdp_6x9: { width: 432, height: 648  },
  a5:       { width: 420, height: 595  },
  letter:   { width: 612, height: 792  },
};

// ─── Text parsing ─────────────────────────────────────────────────────────────

interface Block { type: "chapter" | "paragraph"; text: string }

function parse(texto: string): Block[] {
  const CHAPTER_RE = /^(cap[íi]tulo\s+\d+|chapter\s+\d+|\d+\.\s|\*{3}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/i;
  const blocks: Block[] = [];
  for (const raw of texto.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (CHAPTER_RE.test(line) || (line.length < 60 && line === line.toUpperCase() && line.length > 3)) {
      blocks.push({ type: "chapter", text: line });
    } else {
      blocks.push({ type: "paragraph", text: line });
    }
  }
  return blocks;
}

// ─── PDF styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page:      { fontFamily: "Times-Roman", fontSize: 11, lineHeight: 1.6, color: "#1a1a1a", paddingTop: 54, paddingBottom: 72, paddingLeft: 54, paddingRight: 54 },
  title:     { fontFamily: "Helvetica-Bold", fontSize: 26, textAlign: "center", marginBottom: 12, color: "#1a1a2e" },
  author:    { fontFamily: "Helvetica", fontSize: 13, textAlign: "center", color: "#555", marginBottom: 40 },
  chapter:   { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 28, marginBottom: 12, color: "#1a1a2e" },
  paragraph: { marginBottom: 8, textAlign: "justify" },
  pageNum:   { position: "absolute", bottom: 24, left: 0, right: 0, textAlign: "center", fontSize: 10, color: "#999" },
});

// ─── Book component ───────────────────────────────────────────────────────────

function BookPDF({ titulo, autor, blocks, size }: {
  titulo: string; autor: string; blocks: Block[];
  size: { width: number; height: number };
}) {
  return (
    <Document>
      <Page size={size} style={styles.page}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={styles.title}>{titulo}</Text>
          <Text style={styles.author}>{autor}</Text>
        </View>
      </Page>
      <Page size={size} style={styles.page}>
        {blocks.map((b, i) =>
          b.type === "chapter"
            ? <Text key={i} style={styles.chapter}>{b.text}</Text>
            : <Text key={i} style={styles.paragraph}>{b.text}</Text>
        )}
        <Text style={styles.pageNum} render={({ pageNumber }) => `${pageNumber}`} fixed />
      </Page>
    </Document>
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { titulo?: string; autor?: string; texto: string; formato?: Formato };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Body inválido" }, { status: 400 }); }

  const { titulo = "Sem Título", autor = "Autor Desconhecido", texto, formato = "kdp_6x9" } = body;
  if (!texto?.trim()) return Response.json({ error: "Texto obrigatório" }, { status: 400 });

  const size = FORMATOS[formato] ?? FORMATOS.kdp_6x9;
  const blocks = parse(texto);

  const buffer = await renderToBuffer(
    <BookPDF titulo={titulo} autor={autor} blocks={blocks} size={size} />
  );

  const slug = titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  return new Response(buffer.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"`,
    },
  });
}

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Formato = "kdp_6x9" | "a5" | "letter";

export interface PdfResult {
  project_id: string;
  formato: Formato;
  storage_path: string;
  url_download: string;   // signed URL (60 min)
  paginas: number;
  gerado_em: string;
}

// ─── Page size definitions (points) ──────────────────────────────────────────

const FORMATOS: Record<Formato, { width: number; height: number; label: string }> = {
  kdp_6x9:  { width: 432, height: 648,  label: "KDP 6×9 pol." },
  a5:       { width: 420, height: 595,  label: "A5" },
  letter:   { width: 612, height: 792,  label: "Carta (8,5×11)" },
};

const MARGIN = { top: 54, bottom: 72, side: 54 };

// ─── Text parsing ─────────────────────────────────────────────────────────────

interface Block {
  type: "chapter" | "paragraph" | "blank";
  text: string;
}

function parseManuscript(texto: string): Block[] {
  const CHAPTER_RE = /^(cap[íi]tulo\s+\d+|chapter\s+\d+|\d+\.\s|\*{3}|—{3}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/i;
  const lines = texto.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    // Chapter heading: short line that matches pattern or is ALL CAPS
    if (
      CHAPTER_RE.test(line) ||
      (line.length < 60 && line === line.toUpperCase() && line.length > 3)
    ) {
      blocks.push({ type: "chapter", text: line });
      i++;
      continue;
    }

    // Accumulate paragraph (consecutive non-empty lines)
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

// ─── PDF Template ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    lineHeight: 1.6,
    color: "#1a1a1a",
    paddingTop: MARGIN.top,
    paddingBottom: MARGIN.bottom,
    paddingLeft: MARGIN.side,
    paddingRight: MARGIN.side,
  },
  // Title page
  titlePage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  bookTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 28,
    textAlign: "center",
    marginBottom: 16,
    color: "#111111",
  },
  bookSubtitle: {
    fontFamily: "Helvetica",
    fontSize: 13,
    textAlign: "center",
    color: "#555555",
    marginBottom: 8,
  },
  authorName: {
    fontFamily: "Times-Roman",
    fontSize: 14,
    textAlign: "center",
    color: "#444444",
    marginTop: 32,
  },
  // Body
  chapter: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    marginTop: 36,
    marginBottom: 18,
    textAlign: "center",
    color: "#111111",
  },
  firstParagraph: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 0,
    textAlign: "justify",
  },
  paragraph: {
    fontFamily: "Times-Roman",
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 0,
    textAlign: "justify",
    textIndent: 24,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 28,
    left: MARGIN.side,
    right: MARGIN.side,
    textAlign: "center",
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#aaaaaa",
  },
});

interface BookDocProps {
  titulo: string;
  autor: string;
  blocks: Block[];
  formato: Formato;
}

function BookDocument({ titulo, autor, blocks, formato }: BookDocProps) {
  const fmt = FORMATOS[formato];
  const size = { width: fmt.width, height: fmt.height };

  return (
    <Document title={titulo} author={autor} creator="Autoria">
      {/* Title page */}
      <Page size={size} style={styles.page}>
        <View style={styles.titlePage}>
          <Text style={styles.bookTitle}>{titulo}</Text>
          {autor && <Text style={styles.authorName}>{autor}</Text>}
        </View>
      </Page>

      {/* Body */}
      <Page size={size} style={styles.page} wrap>
        {blocks.map((block, idx) => {
          if (block.type === "chapter") {
            return <Text key={idx} style={styles.chapter} break={idx > 0}>{block.text}</Text>;
          }
          // First paragraph after chapter heading is not indented
          const prev = blocks[idx - 1];
          const isFirst = !prev || prev.type === "chapter";
          return (
            <Text key={idx} style={isFirst ? styles.firstParagraph : styles.paragraph}>
              {block.text}
            </Text>
          );
        })}

        {/* Page numbers */}
        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            pageNumber > 1 ? `${pageNumber - 1}` : ""
          }
          fixed
        />
      </Page>
    </Document>
  );
}

// ─── POST /api/agentes/gerar-pdf ─────────────────────────────────────────────
// Body: { project_id, formato?: Formato }

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  let userId: string;
  if (process.env.NODE_ENV === "development") {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { project_id: string; formato?: Formato };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, formato = "kdp_6x9" } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // ── Load project data ─────────────────────────────────────────────────────
  let titulo = "Sem título";
  let autor = "";
  let texto = "";

  if (process.env.NODE_ENV === "development") {
    titulo = "O Último Manuscrito";
    autor = "Dev Author";
    texto = [
      "CAPÍTULO 1\n\nEra uma noite escura e tempestuosa quando tudo começou.",
      "O protagonista olhou pela janela e viu algo que mudaria sua vida para sempre.",
      "CAPÍTULO 2\n\nO dia seguinte trouxe novas revelações. A cidade acordou sob uma neblina densa.",
      "Cada passo levava a um novo mistério, cada porta abria para um novo caminho.",
    ].join("\n\n");
  } else {
    const { data: project } = await supabase
      .from("projects")
      .select("dados_elementos, manuscript:manuscript_id(texto, nome)")
      .eq("id", project_id)
      .eq("user_id", userId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    }

    const el = project.dados_elementos as Record<string, unknown> | null;
    const ms = project.manuscript as { texto?: string; nome?: string } | null;

    titulo = (el?.titulo_escolhido as string) ?? (el?.opcoes_titulo as string[])?.[0] ?? ms?.nome ?? "Sem título";
    texto = ms?.texto ?? "";

    // Try to get author name from user profile
    const { data: profile } = await supabase.from("users").select("nome").eq("id", userId).single();
    autor = profile?.nome ?? "";
  }

  if (!texto.trim()) {
    return NextResponse.json({ error: "Manuscrito sem texto. Execute o parse primeiro." }, { status: 422 });
  }

  // ── Generate PDF ──────────────────────────────────────────────────────────
  const blocks = parseManuscript(texto);
  const pdfBuffer = await renderToBuffer(
    <BookDocument titulo={titulo} autor={autor} blocks={blocks} formato={formato} />
  );

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `${userId}/${project_id}/livro_${formato}.pdf`;

  const { error: uploadError } = await storageClient.storage
    .from("livros")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: `Erro no upload: ${uploadError.message}` }, { status: 500 });
  }

  // Signed URL valid for 1 hour
  const { data: signedData, error: signError } = await storageClient.storage
    .from("livros")
    .createSignedUrl(storagePath, 3600);

  if (signError || !signedData) {
    return NextResponse.json({ error: "Erro ao gerar URL de download" }, { status: 500 });
  }

  // ── Persist metadata ──────────────────────────────────────────────────────
  const dados_pdf: PdfResult = {
    project_id,
    formato,
    storage_path: storagePath,
    url_download: signedData.signedUrl,
    paginas: 0, // @react-pdf doesn't expose page count easily after render
    gerado_em: new Date().toISOString(),
  };

  await supabase
    .from("projects")
    .update({ dados_pdf, etapa_atual: "diagramacao" })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json(dados_pdf);
}

// ─── GET /api/agentes/gerar-pdf?project_id=... ────────────────────────────────
// Returns saved PDF metadata + fresh signed URL

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );

  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json(null);
  }

  const { data } = await supabase
    .from("projects")
    .select("dados_pdf")
    .eq("id", project_id)
    .single();

  if (!data?.dados_pdf) return NextResponse.json(null);

  // Refresh signed URL
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const pdf = data.dados_pdf as PdfResult;
  const { data: signedData } = await storageClient.storage
    .from("livros")
    .createSignedUrl(pdf.storage_path, 3600);

  return NextResponse.json({
    ...pdf,
    url_download: signedData?.signedUrl ?? pdf.url_download,
  } satisfies PdfResult);
}

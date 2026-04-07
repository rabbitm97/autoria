import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

// ─── POST /api/agentes/prova-revisao ──────────────────────────────────────────
// Builds a clean HTML proof of the revised text, saves it to Storage,
// and returns a signed URL so the author can review before diagramação.

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";

  let userId: string;
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;

  if (isDev) {
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

  let body: { project_id: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 }); }

  const { project_id } = body;
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  // Load project, manuscript and revisions
  const { data: project } = await supabase
    .from("projects")
    .select("manuscript_id, dados_revisao, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome, texto)")
    .eq("id", project_id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    texto?: string;
  } | null;

  const titulo = ms?.titulo ?? "Manuscrito";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "Autor";
  const textoOriginal = ms?.texto ?? "";

  // Apply accepted revisions to get revised text
  const revisao = project.dados_revisao as {
    sugestoes?: Array<{ id: string; trecho_original: string; sugestao: string }>;
    aceitas?: string[];
  } | null;

  let textoRevisado = textoOriginal;
  if (revisao?.sugestoes && revisao?.aceitas) {
    const aceitasSet = new Set(revisao.aceitas);
    for (const s of revisao.sugestoes) {
      if (aceitasSet.has(s.id)) {
        textoRevisado = textoRevisado.replace(s.trecho_original, s.sugestao);
      }
    }
  }

  if (!textoRevisado.trim()) {
    return NextResponse.json({ error: "Texto não encontrado" }, { status: 422 });
  }

  // Save revised text back to manuscript
  if (project.manuscript_id) {
    await supabase
      .from("manuscripts")
      .update({ texto_revisado: textoRevisado })
      .eq("id", project.manuscript_id as string);
  }

  // Build HTML proof document
  function esc(s: string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const paragraphs = textoRevisado
    .split(/\n{2,}/)
    .filter(p => p.trim())
    .map(p => `<p>${esc(p.trim())}</p>`)
    .join("\n");

  const aceitasCount = revisao?.aceitas?.length ?? 0;
  const totalCount = revisao?.sugestoes?.length ?? 0;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Prova de Revisão — ${esc(titulo)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.8;
         max-width: 700px; margin: 40px auto; padding: 0 32px; color: #1a1a1a; background: #fff; }
  .header { border-bottom: 2px solid #c9a227; padding-bottom: 24px; margin-bottom: 32px; }
  .header h1 { font-size: 24pt; font-weight: 400; margin: 0 0 4px; }
  .header p  { font-size: 11pt; color: #666; margin: 0; }
  .meta { background: #f8f5ef; border: 1px solid #e8d9a0; border-radius: 8px;
          padding: 16px 20px; margin-bottom: 32px; font-size: 10pt; color: #555; }
  .meta strong { color: #1a1a1a; }
  p { text-indent: 1.5em; margin: 0 0 0.4em; }
  p:first-of-type { text-indent: 0; }
  @media print {
    body { margin: 20mm; }
    .meta { break-after: page; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(titulo)}</h1>
    <p>${esc(autor)}</p>
  </div>
  <div class="meta">
    <strong>Prova de revisão</strong> — gerada em ${new Date().toLocaleString("pt-BR")}<br>
    Revisões aplicadas: <strong>${aceitasCount} de ${totalCount}</strong> sugestões aceitas.<br>
    Este documento reflete o texto que será usado na diagramação.
  </div>
  ${paragraphs}
</body>
</html>`;

  // Upload to Supabase Storage
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `${userId}/prova_${project_id}.html`;
  const { error: uploadErr } = await storageClient.storage
    .from("manuscripts")
    .upload(storagePath, Buffer.from(html, "utf-8"), {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: "Erro ao salvar prova" }, { status: 500 });
  }

  const { data: signed } = await storageClient.storage
    .from("manuscripts")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    ok: true,
    url: signed?.signedUrl ?? null,
    aceitas: aceitasCount,
    total: totalCount,
    palavras: textoRevisado.split(/\s+/).filter(Boolean).length,
  });
}

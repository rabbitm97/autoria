import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  // 2. Parse body
  let body: { project_id: string; storage_path: string; manuscript_id: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { project_id, storage_path, manuscript_id } = body;

  if (!project_id || !storage_path || !manuscript_id) {
    return Response.json(
      { error: "Campos obrigatórios: project_id, storage_path, manuscript_id." },
      { status: 400 }
    );
  }

  // 3. Verify project belongs to user
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project) {
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // 4. Download file from Supabase Storage
  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from("manuscripts")
    .download(storage_path);

  if (downloadErr || !fileBlob) {
    console.error("[parse-manuscript] Erro ao baixar arquivo:", downloadErr);
    return Response.json(
      { error: "Falha ao acessar o arquivo. Verifique se o upload foi concluído." },
      { status: 500 }
    );
  }

  // 5. Extract text based on file extension
  const ext = storage_path.split(".").pop()?.toLowerCase() ?? "txt";
  let texto = "";

  try {
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as typeof import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      texto = result.value;
    } else if (ext === "pdf") {
      // Use lib path to avoid pdf-parse test file bundling issue
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (
        dataBuffer: Buffer
      ) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      texto = result.text;
    } else {
      // .txt — UTF-8 decode
      texto = buffer.toString("utf-8");
    }
  } catch (e) {
    console.error("[parse-manuscript] Erro ao extrair texto:", e);
    return Response.json(
      { error: "Falha ao extrair texto do arquivo. Verifique o formato." },
      { status: 500 }
    );
  }

  texto = texto.trim();
  if (!texto) {
    return Response.json(
      { error: "O arquivo parece estar vazio ou sem texto extraível." },
      { status: 422 }
    );
  }

  // 6. Save extracted text and storage_path to manuscripts
  const { error: updateErr } = await supabase
    .from("manuscripts")
    .update({ texto, storage_path })
    .eq("id", manuscript_id)
    .eq("user_id", user.id);

  if (updateErr) {
    console.error("[parse-manuscript] Erro ao salvar texto:", updateErr);
    // Return text even if DB save failed — caller can retry
  }

  return Response.json({ ok: true, texto });
}

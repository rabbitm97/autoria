import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

// GET /api/agentes/prova/preview-pdf?project_id=...
// Serves the stored PDF bytes directly so react-pdf can render it in the browser.
export async function GET(req: NextRequest) {
  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

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

  const { data: project } = await supabase
    .from("projects")
    .select("dados_pdf_digital")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  const storagePath = (project?.dados_pdf_digital as { storage_path?: string } | null)?.storage_path;
  if (!storagePath) {
    return NextResponse.json({ error: "PDF não encontrado" }, { status: 404 });
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: fileData, error: dlErr } = await serviceClient.storage
    .from("livros")
    .download(storagePath);

  if (dlErr || !fileData) {
    return NextResponse.json({ error: "Erro ao baixar PDF" }, { status: 500 });
  }

  const bytes = await fileData.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}

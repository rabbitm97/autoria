import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const isDev = process.env.NODE_ENV === "development";

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Campo 'file' obrigatório" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de arquivo não suportado. Use JPG, PNG ou WebP." }, { status: 415 });
  }

  if (isDev) {
    return NextResponse.json({ url: `https://placehold.co/600x800?text=${encodeURIComponent(file.name)}`, dev: true });
  }

  let userId: string;
  try {
    const auth = await requireAuth();
    userId = auth.user.id;
    const supabase = auth.supabase;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (error || !project) {
      return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
    }
  } catch (e) {
    return e as Response;
  }

  const ext = EXT_MAP[file.type] ?? "jpg";
  const storagePath = `${userId}/${id}/images/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error: uploadErr } = await storageClient.storage
    .from("editor-assets")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) {
    console.error("[images] upload error:", uploadErr);
    return NextResponse.json({ error: "Falha ao enviar arquivo." }, { status: 500 });
  }

  const { data: signedData } = await storageClient.storage
    .from("editor-assets")
    .createSignedUrl(storagePath, 365 * 24 * 3600);

  return NextResponse.json({ url: signedData?.signedUrl ?? null });
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isFormatoValido } from "@/lib/formatos";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({ formato: null, locked: false });
  }

  const { data, error } = await supabase
    .from("projects")
    .select("formato, formato_locked_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    formato: isFormatoValido(data.formato) ? data.formato : null,
    locked: data.formato_locked_at != null,
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (process.env.NODE_ENV === "development") {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    userId = user.id;
  }

  let body: { formato: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!isFormatoValido(body.formato)) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 422 });
  }

  // Check lock status before writing
  if (process.env.NODE_ENV !== "development") {
    const { data: proj } = await supabase
      .from("projects")
      .select("formato_locked_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (!proj) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    if (proj.formato_locked_at != null) {
      return NextResponse.json(
        { error: "Formato bloqueado após geração da capa." },
        { status: 409 }
      );
    }
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ formato: body.formato })
    .eq("id", id)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ formato: body.formato, locked: false });
}

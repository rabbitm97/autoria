export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { converterImagemParaCmyk } from "@/lib/cmyk-imagem";

const LIMITE_DIA = 3;
const MAX_BYTES = 4 * 1024 * 1024;
const AGENT_NAME = "ferramenta-rgb-cmyk-arquivo";

// ─── POST /api/ferramentas/rgb-cmyk-arquivo ─────────────────────────────────
// Body: multipart/form-data — field "arquivo" (JPG/PNG, máx 4 MB)
// Espelha o padrão da ferramenta PDF→DOCX (auth + limite diário via usage_logs).

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let admin: SupabaseClient | null = null;

  if (!isDev()) {
    // Auth obrigatória.
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    userId = user.id;

    // Limite diário — mesmo mecanismo do PDF→DOCX (count em usage_logs pela
    // janela UTC do dia). Fail-open: erro de contagem não trava o usuário.
    admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const inicioDoDia = new Date();
    inicioDoDia.setUTCHours(0, 0, 0, 0);
    const { count, error: cntErr } = await admin
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("agent_name", AGENT_NAME)
      .eq("user_id", userId)
      .gte("created_at", inicioDoDia.toISOString());
    if (cntErr) {
      console.error("[ferramenta/rgb-cmyk-arquivo] contagem do limite falhou:", cntErr.message);
    } else if ((count ?? 0) >= LIMITE_DIA) {
      return NextResponse.json(
        { error: `Limite diário atingido (${LIMITE_DIA} conversões/dia). Volte amanhã.` },
        { status: 429 },
      );
    }
  }

  // Parse multipart.
  let arquivo: File | null = null;
  try {
    const form = await req.formData();
    arquivo = form.get("arquivo") as File | null;
  } catch {
    return NextResponse.json({ error: "Formulário inválido." }, { status: 400 });
  }

  if (!arquivo) {
    return NextResponse.json({ error: "Campo 'arquivo' obrigatório." }, { status: 400 });
  }

  const nomeLower = arquivo.name.toLowerCase();
  const tipoOk = arquivo.type === "image/jpeg" || arquivo.type === "image/png";
  const nomeOk =
    nomeLower.endsWith(".jpg") ||
    nomeLower.endsWith(".jpeg") ||
    nomeLower.endsWith(".png");
  if (!tipoOk && !nomeOk) {
    return NextResponse.json(
      { error: "Apenas arquivos JPG ou PNG são aceitos." },
      { status: 400 },
    );
  }

  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Arquivo muito grande. Máximo: 4 MB." },
      { status: 400 },
    );
  }

  const entrada = Buffer.from(await arquivo.arrayBuffer());

  let saida: Buffer;
  try {
    saida = await converterImagemParaCmyk(entrada);
  } catch (e) {
    return NextResponse.json(
      {
        error: `Falha ao converter: ${
          e instanceof Error ? e.message : "erro desconhecido"
        }`,
      },
      { status: 422 },
    );
  }

  const nomeBase = arquivo.name.replace(/\.(jpe?g|png)$/i, "");
  const outName = `${nomeBase}-CMYK-fogra39.jpg`;

  // Telemetria best-effort.
  if (!isDev() && admin && userId) {
    const { error: logErr } = await admin.from("usage_logs").insert({
      agent_name: AGENT_NAME,
      user_id: userId,
      metadata: { bytes: arquivo.size, nome: arquivo.name },
    });
    if (logErr) console.error("[ferramenta/rgb-cmyk-arquivo] usage_logs falhou:", logErr.message);
  }

  return new NextResponse(saida as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(outName)}"`,
      "Content-Length": String(saida.byteLength),
    },
  });
}

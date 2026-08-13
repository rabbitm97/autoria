export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { converterImagemParaCmyk } from "@/lib/cmyk-imagem";

const LIMITE_DIA = 3;
const MAX_BODY_BYTES = 4 * 1024 * 1024;         // teto do body direto (Vercel ~4,5 MB)
const MAX_STORAGE_BYTES = 10 * 1024 * 1024;     // teto do fluxo via storage
const AGENT_NAME = "ferramenta-rgb-cmyk-arquivo";
const TMP_BUCKET = "editor-assets";
const TMP_PREFIX = "cmyk-tmp/";

// ─── POST /api/ferramentas/rgb-cmyk-arquivo ─────────────────────────────────
// Dois modos:
//   1. multipart/form-data — field "arquivo" (JPG/PNG, ≤ 4 MB — cabe no body)
//   2. application/json { storage_path } — arquivo já subiu via upload-url
//      (≤ 10 MB; após a conversão o temp é apagado, sempre)
// Espelha o padrão da ferramenta PDF→DOCX (auth + limite diário via usage_logs).

function ehTipoImagemValido(nome: string, mimetype: string | null): boolean {
  const nomeLower = nome.toLowerCase();
  const mimeOk = mimetype === "image/jpeg" || mimetype === "image/png";
  const extOk =
    nomeLower.endsWith(".jpg") ||
    nomeLower.endsWith(".jpeg") ||
    nomeLower.endsWith(".png");
  return mimeOk || extOk;
}

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

  // ── Roteamento por content-type ─────────────────────────────────────────
  const contentType = req.headers.get("content-type") ?? "";

  let entrada: Buffer;
  let nomeOriginal: string;
  let bytesEntrada: number;
  let storagePath: string | null = null;
  let storageClient: SupabaseClient | null = null;

  try {
    if (contentType.includes("application/json")) {
      // Fluxo via storage (arquivos > 4 MB e ≤ 10 MB).
      const body = (await req.json().catch(() => ({}))) as { storage_path?: unknown };
      if (typeof body.storage_path !== "string" || !body.storage_path.startsWith(TMP_PREFIX)) {
        return NextResponse.json({ error: "storage_path inválido." }, { status: 400 });
      }
      storagePath = body.storage_path;
      // Server monta o prefixo esperado do usuário — impede cliente pegar temp
      // de outra pessoa.
      if (!isDev() && userId && !storagePath.startsWith(`${TMP_PREFIX}${userId}/`)) {
        return NextResponse.json({ error: "storage_path não pertence ao usuário." }, { status: 403 });
      }

      storageClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );

      const { data: baixado, error: dlErr } = await storageClient.storage
        .from(TMP_BUCKET)
        .download(storagePath);
      if (dlErr || !baixado) {
        return NextResponse.json(
          { error: `Arquivo temporário não encontrado: ${dlErr?.message ?? "desconhecido"}` },
          { status: 404 },
        );
      }

      if (baixado.size > MAX_STORAGE_BYTES) {
        return NextResponse.json(
          { error: "Arquivo muito grande. Máximo: 10 MB." },
          { status: 400 },
        );
      }

      const nomeStorage = storagePath.split("/").pop() ?? "arquivo.jpg";
      if (!ehTipoImagemValido(nomeStorage, baixado.type || null)) {
        return NextResponse.json(
          { error: "Apenas arquivos JPG ou PNG são aceitos." },
          { status: 400 },
        );
      }

      entrada = Buffer.from(await baixado.arrayBuffer());
      nomeOriginal = nomeStorage;
      bytesEntrada = baixado.size;
    } else {
      // Fluxo body direto (arquivos pequenos).
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
      if (!ehTipoImagemValido(arquivo.name, arquivo.type || null)) {
        return NextResponse.json(
          { error: "Apenas arquivos JPG ou PNG são aceitos." },
          { status: 400 },
        );
      }
      if (arquivo.size > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: "Arquivo muito grande pra este envio. Use o upload assinado (o cliente cuida disso automaticamente)." },
          { status: 400 },
        );
      }
      entrada = Buffer.from(await arquivo.arrayBuffer());
      nomeOriginal = arquivo.name;
      bytesEntrada = arquivo.size;
    }

    // ── Conversão (núcleo compartilhado) ──────────────────────────────────
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

    const nomeBase = nomeOriginal.replace(/\.(jpe?g|png)$/i, "");
    const outName = `${nomeBase}-CMYK-fogra39.jpg`;

    // Telemetria best-effort.
    if (!isDev() && admin && userId) {
      const { error: logErr } = await admin.from("usage_logs").insert({
        agent_name: AGENT_NAME,
        user_id: userId,
        metadata: {
          bytes: bytesEntrada,
          nome: nomeOriginal,
          via_storage: storagePath !== null,
        },
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
  } finally {
    // Limpeza obrigatória do temporário — sempre roda, inclusive em erro.
    if (storagePath && storageClient) {
      const { error: rmErr } = await storageClient.storage
        .from(TMP_BUCKET)
        .remove([storagePath]);
      if (rmErr) {
        console.error("[ferramenta/rgb-cmyk-arquivo] falha ao apagar temp:", rmErr.message);
      }
    }
  }
}

export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { BUCKET_FERRAMENTAS, type FerramentaJob } from "@/lib/ferramenta-jobs";

// ─── GET /api/ferramentas/jobs/[id]/download?i=N ─────────────────────────────
// Redireciona para URL assinada (60s) do entregável N do job do próprio
// usuário. Bucket sem policies: assinatura só via service_role.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;
  const dev = isDev();

  let userId: string | null = null;
  if (!dev) {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
    } catch (e) {
      return e as Response;
    }
  }

  const i = Number.parseInt(req.nextUrl.searchParams.get("i") ?? "0", 10);
  if (!Number.isInteger(i) || i < 0) {
    return NextResponse.json({ error: "Entregável inválido." }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: job, error } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, estado, entregaveis")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !job) {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
  const j = job as Pick<FerramentaJob, "id" | "user_id" | "estado" | "entregaveis">;
  if (!dev && j.user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  }
  if (j.estado === "expirado") {
    return NextResponse.json(
      { error: "Este arquivo expirou (disponibilidade de 90 dias)." },
      { status: 410 },
    );
  }
  const entregavel = (j.entregaveis ?? [])[i];
  if (!entregavel?.storage_path) {
    return NextResponse.json({ error: "Entregável não encontrado." }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET_FERRAMENTAS)
    .createSignedUrl(entregavel.storage_path, 60, {
      download: entregavel.nome_exibicao || true,
    });
  if (signErr || !signed?.signedUrl) {
    console.error("[jobs/download] assinatura falhou:", signErr?.message);
    return NextResponse.json({ error: "Falha ao gerar o link." }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl, 307);
}

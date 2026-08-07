// GET /api/admin/aceites?email=…&projectId=… — consulta de legal_acceptances.
// Somente leitura. Residual LEGAL-1C resolvido pelo LEGAL-1D.

export const runtime = "nodejs";
export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }

  const url = new URL(req.url);
  const email = url.searchParams.get("email")?.trim() ?? "";
  const projectId = url.searchParams.get("projectId")?.trim() ?? "";

  if (!email && !projectId) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let q = admin
    .from("legal_acceptances")
    .select("id, user_email, project_id, doc_slug, doc_versao, doc_hash, contexto, artefato_ref, aceito_em")
    .order("aceito_em", { ascending: false })
    .limit(200);

  if (email) q = q.ilike("user_email", email);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;
  if (error) {
    console.error("[admin/aceites] list falhou:", error.message);
    return NextResponse.json({ error: "Falha ao consultar aceites." }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}

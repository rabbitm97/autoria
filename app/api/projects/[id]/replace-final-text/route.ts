// ─────────────────────────────────────────────────────────────────────────────
// POST /api/projects/[id]/replace-final-text
//
// Aceita texto novo do autor (já parseado) após revisão e:
//   - Salva como texto final do manuscrito
//   - Descarta dados_revisao (sugestões antigas são incoerentes)
//   - Limpa texto_revisado e capitulos_aprovados (também incoerentes)
//   - Avança projects.etapa_atual = "elementos"
//
// Usado quando autor sobe novo arquivo na etapa Revisão. NÃO dispara
// reprocessamento de IA — o texto novo é tratado como definitivo.
// ─────────────────────────────────────────────────────────────────────────────

import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/supabase-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let user: { id: string };
  let supabase: Awaited<ReturnType<typeof requireAuth>>["supabase"];

  try {
    ({ user, supabase } = await requireAuth());
  } catch (res) {
    return res as Response;
  }

  const { id: project_id } = await params;

  let body: { texto: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { texto } = body;
  if (!texto || typeof texto !== "string" || !texto.trim()) {
    return Response.json({ error: "Texto vazio ou inválido." }, { status: 400 });
  }

  // Verifica projeto e pega manuscript_id
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("manuscript_id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();

  if (projErr || !project?.manuscript_id) {
    return Response.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  // Atualiza manuscript: novo texto, limpa derivados
  const { error: msErr } = await supabase
    .from("manuscripts")
    .update({
      texto: texto.trim(),
      texto_revisado: null,
      capitulos_aprovados: null,
      capitulos_aprovados_texto_hash: null,
    })
    .eq("id", project.manuscript_id)
    .eq("user_id", user.id);

  if (msErr) {
    console.error("[replace-final-text] erro ao atualizar manuscript:", msErr);
    return Response.json({ error: "Falha ao salvar texto." }, { status: 500 });
  }

  // Atualiza project: descarta revisão, avança etapa
  const { error: projUpdateErr } = await supabase
    .from("projects")
    .update({
      dados_revisao: null,
      etapa_atual: "elementos",
    })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (projUpdateErr) {
    console.error("[replace-final-text] erro ao atualizar project:", projUpdateErr);
    return Response.json({ error: "Falha ao avançar etapa." }, { status: 500 });
  }

  return Response.json({ ok: true, next_step: "elementos" });
}

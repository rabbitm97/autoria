export const maxDuration = 15;

// FERR-3.4a: preparar sombra da CAPA AVULSA a partir do form do wizard.
// Copia título/autor/gênero para manuscripts do sombra, sinopse para
// dados_elementos, páginas para job.entrada (fonte de páginas no sombra
// sem miolo), e transiciona o job para "aguardando_autor" (autor entra
// no editor de capa via /dashboard/capa/[id]?avulso=<job>).
//
// Fora do escopo: formato (o wizard usa PATCH /api/projects/[id]/formato,
// que já bloqueia troca depois de gerar capa).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase-server";
import { atualizarJob } from "@/lib/ferramenta-jobs";
import { updateProject } from "@/lib/supabase-helpers";
import { validarProjectData } from "@/lib/project-data";

const bodySchema = z.object({
  job_id: z.string().min(1),
  titulo: z.string().min(1).max(200),
  subtitulo: z.string().max(200).optional(),
  autor: z.string().max(200).optional(),
  genero: z.string().min(1).max(60),
  sinopse: z.string().min(20).max(1200),
  paginas: z.number().int().min(24).max(1200),
});

// Split autor em primeiro nome + sobrenome no primeiro espaço — mesmo padrão
// do novo-projeto. Nome único vai todo em primeiro_nome (sobrenome vazio).
function splitAutor(autor: string): { primeiro: string; sobrenome: string } {
  const t = autor.trim();
  if (!t) return { primeiro: "", sobrenome: "" };
  const idx = t.indexOf(" ");
  if (idx < 0) return { primeiro: t, sobrenome: "" };
  return { primeiro: t.slice(0, idx), sobrenome: t.slice(idx + 1).trim() };
}

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    const auth = await requireAuth();
    userId = auth.user.id;
  } catch (e) {
    return e as Response;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload inválido.", detalhes: parsed.error.issues },
      { status: 400 },
    );
  }
  const { job_id, titulo, subtitulo, autor, genero, sinopse, paginas } = parsed.data;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: jobRow } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, estado, projeto_sombra_id, entrada")
    .eq("id", job_id)
    .maybeSingle();

  const job = jobRow as {
    id: string;
    user_id: string;
    ferramenta_id: string;
    estado: string;
    projeto_sombra_id: string | null;
    entrada: Record<string, unknown> | null;
  } | null;

  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }
  if (job.ferramenta_id !== "capa-ia") {
    return NextResponse.json({ error: "Job de ferramenta incompatível." }, { status: 400 });
  }
  if (!job.projeto_sombra_id) {
    return NextResponse.json({ error: "Projeto sombra ausente." }, { status: 400 });
  }

  const { data: proj } = await admin
    .from("projects")
    .select("id, manuscript_id")
    .eq("id", job.projeto_sombra_id)
    .eq("user_id", userId)
    .maybeSingle();
  const manuscriptId = (proj as { manuscript_id?: string } | null)?.manuscript_id ?? null;
  if (!manuscriptId) {
    return NextResponse.json({ error: "Manuscrito do sombra ausente." }, { status: 400 });
  }

  const { primeiro, sobrenome } = splitAutor(autor ?? "");

  const { error: msErr } = await admin
    .from("manuscripts")
    .update({
      titulo,
      subtitulo: subtitulo ?? null,
      autor_primeiro_nome: primeiro || null,
      autor_sobrenome: sobrenome || null,
      genero_principal: genero,
    })
    .eq("id", manuscriptId);
  if (msErr) {
    console.error("[capa-avulsa/preparar] update manuscript falhou:", msErr.message);
    return NextResponse.json({ error: "Falha ao salvar manuscrito." }, { status: 500 });
  }

  // dados_elementos.sinopse_curta: merge sobre existente + defaults dos
  // campos obrigatórios do schema (loose exige as 4 chaves como strings).
  const { data: projElem } = await admin
    .from("projects")
    .select("dados_elementos")
    .eq("id", job.projeto_sombra_id)
    .maybeSingle();
  const elemAtual = ((projElem as { dados_elementos?: Record<string, unknown> } | null)
    ?.dados_elementos) ?? {};
  const dadosElementos = {
    sinopse_curta: sinopse,
    sinopse_longa: typeof elemAtual.sinopse_longa === "string" ? elemAtual.sinopse_longa : "",
    palavras_chave: Array.isArray(elemAtual.palavras_chave) ? elemAtual.palavras_chave : [],
    ficha_catalografica:
      typeof elemAtual.ficha_catalografica === "string" ? elemAtual.ficha_catalografica : "",
  };
  const vElem = validarProjectData("dados_elementos", dadosElementos, {
    modo: "estrito",
    contexto: "capa-avulsa/preparar",
  });
  if (!vElem.ok) {
    console.error("[capa-avulsa/preparar] zod dados_elementos:", vElem.issues.join(" | "));
    return NextResponse.json(
      { error: "Falha ao validar sinopse.", issues: vElem.issues },
      { status: 500 },
    );
  }
  const { ok: elemOk } = await updateProject(
    admin,
    job.projeto_sombra_id,
    userId,
    { dados_elementos: dadosElementos },
    "capa-avulsa/preparar",
  );
  if (!elemOk) {
    return NextResponse.json({ error: "Falha ao salvar sinopse." }, { status: 500 });
  }

  const entrada = { ...(job.entrada ?? {}), titulo, autor: autor ?? "", genero, paginas };
  const ok = await atualizarJob(admin, job.id, {
    entrada,
    estado: "aguardando_autor",
  });
  if (!ok) {
    return NextResponse.json({ error: "Falha ao atualizar job." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

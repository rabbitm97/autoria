export const maxDuration = 10;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { atualizarJob, type EstadoJob, type FerramentaJob } from "@/lib/ferramenta-jobs";
import { isEditorCapa } from "@/lib/capa-resolver";

// ─── GET /api/ferramentas/jobs/[id] ──────────────────────────────────────────
// Retomada do wizard (?job=): devolve o job do próprio usuário com o que
// o client precisa para reidratar o passo. Nunca expõe job de outro.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userId: string;
  try {
    userId = (await requireAuth()).user.id;
  } catch (e) {
    return e as Response;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, estado, projeto_sombra_id, entrada, custo_creditos, debitado_em, entregaveis, expira_em")
    .eq("id", id)
    .maybeSingle();
  const job = data as FerramentaJob | null;
  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }
  // Estado do sombra útil pra reidratar: formato, créditos, miolo, capa
  // confirmada (FERR-3.4b — wizard de capa avulsa pula pra passo "Gerar
  // arquivos" quando o autor já confirmou no editor) e revisão (FERR-3.5a
  // — tela de revisão avulsa decide onde parar quando o autor volta).
  //   revisao_estado:
  //     null        → nunca começou (job ainda em rascunho)
  //     "processing"→ batch da Anthropic em andamento (polling na tela)
  //     "concluida" → sugestões geradas, autor ainda pode aceitar/rejeitar
  //     "finalizada"→ autor selou (finalizado_em) — parte 2 vira entregável
  let sombra:
    | {
        formato: string | null;
        tem_creditos: boolean;
        tem_miolo: boolean;
        tem_capa_confirmada: boolean;
        tem_capitulos: boolean;
        revisao_estado: null | "processing" | "concluida" | "finalizada";
      }
    | null = null;
  if (job.projeto_sombra_id) {
    const { data: p } = await admin
      .from("projects")
      .select("formato, dados_creditos, dados_miolo, dados_capa, dados_revisao, manuscripts:manuscript_id(capitulos_aprovados)")
      .eq("id", job.projeto_sombra_id)
      .maybeSingle();
    const row = p as {
      formato?: string | null;
      dados_creditos?: { input_hash?: string } | null;
      dados_miolo?: { html_storage_path?: string } | null;
      dados_capa?: Record<string, unknown> | null;
      dados_revisao?: Record<string, unknown> | null;
      manuscripts?: { capitulos_aprovados?: unknown[] | null } | null;
    } | null;
    const dr = row?.dados_revisao as
      | { status?: string; finalizado_em?: string; revisado_em?: string }
      | null
      | undefined;
    let revisaoEstado: null | "processing" | "concluida" | "finalizada" = null;
    if (dr) {
      if (dr.status === "processing") revisaoEstado = "processing";
      else if (dr.finalizado_em) revisaoEstado = "finalizada";
      else if (dr.revisado_em) revisaoEstado = "concluida";
    }
    sombra = {
      formato: row?.formato ?? null,
      tem_creditos: !!row?.dados_creditos?.input_hash,
      tem_miolo: !!row?.dados_miolo?.html_storage_path,
      tem_capa_confirmada: isEditorCapa(row?.dados_capa ?? null),
      tem_capitulos: Array.isArray(row?.manuscripts?.capitulos_aprovados)
        && (row!.manuscripts!.capitulos_aprovados!.length > 0),
      revisao_estado: revisaoEstado,
    };
  }
  const { user_id: _omit, ...publico } = job;
  return NextResponse.json({ job: publico, sombra });
}

// ─── PATCH /api/ferramentas/jobs/[id] ────────────────────────────────────────
// FERR-3.4g: única superfície client → escrita canônica em ferramenta_jobs
// (verdade #20). Aceita apenas campos autorais de capa avulsa: `paginas`
// (editável no editor, refluí lombada/dobras) e `exports_jpeg` (paths das
// capturas de confirmação que viram entregáveis). Merge no `entrada`; jamais
// mexe em estado, débito ou entregáveis.
const ESTADOS_TERMINAIS: EstadoJob[] = ["concluido", "falhou", "expirado", "cancelado"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userId: string;
  try {
    userId = (await requireAuth()).user.id;
  } catch (e) {
    return e as Response;
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const patch = body as { paginas?: unknown; exports_jpeg?: unknown };

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await admin
    .from("ferramenta_jobs")
    .select("id, user_id, ferramenta_id, estado, projeto_sombra_id, entrada")
    .eq("id", id)
    .maybeSingle();
  const job = data as Pick<FerramentaJob, "id" | "user_id" | "ferramenta_id" | "estado" | "projeto_sombra_id" | "entrada"> | null;
  if (!job || job.user_id !== userId) {
    return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  }
  if (job.ferramenta_id !== "capa-ia") {
    return NextResponse.json({ error: "PATCH só aceito para capa avulsa." }, { status: 403 });
  }
  if (ESTADOS_TERMINAIS.includes(job.estado)) {
    return NextResponse.json({ error: "Job já finalizado." }, { status: 403 });
  }

  const entrada: Record<string, unknown> = { ...(job.entrada ?? {}) };
  let mudou = false;

  if (patch.paginas !== undefined) {
    const n = Number(patch.paginas);
    if (!Number.isInteger(n) || n < 24 || n > 1200) {
      return NextResponse.json({ error: "paginas deve ser inteiro entre 24 e 1200." }, { status: 400 });
    }
    entrada.paginas = n;
    mudou = true;
  }

  if (patch.exports_jpeg !== undefined) {
    const ej = patch.exports_jpeg as { frente?: unknown; completa?: unknown } | null;
    if (!ej || typeof ej !== "object") {
      return NextResponse.json({ error: "exports_jpeg inválido." }, { status: 400 });
    }
    const prefixo = job.projeto_sombra_id ? `${userId}/${job.projeto_sombra_id}/exports/` : null;
    if (!prefixo) {
      return NextResponse.json({ error: "Job sem sombra — exports_jpeg não aplicável." }, { status: 400 });
    }
    const atuais = (entrada.exports_jpeg as { frente?: string; completa?: string } | undefined) ?? {};
    const merge: { frente?: string; completa?: string } = { ...atuais };
    for (const chave of ["frente", "completa"] as const) {
      const v = ej[chave];
      if (v === undefined) continue;
      if (typeof v !== "string" || !v.startsWith(prefixo)) {
        return NextResponse.json({ error: `exports_jpeg.${chave} fora do prefixo do sombra.` }, { status: 400 });
      }
      merge[chave] = v;
    }
    entrada.exports_jpeg = merge;
    mudou = true;
  }

  if (!mudou) {
    return NextResponse.json({ error: "Nada a atualizar." }, { status: 400 });
  }

  const ok = await atualizarJob(admin, id, { entrada });
  if (!ok) {
    return NextResponse.json({ error: "Falha ao atualizar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, entrada });
}

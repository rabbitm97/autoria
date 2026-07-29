export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import type { GaleriaCapaItem } from "@/lib/project-data";

/**
 * GET /api/projects/[id]/capa/galeria
 *
 * Lista arquivos `capa_ia_*` do bucket `capas` sob o prefixo do projeto.
 * Storage é a FONTE DE VERDADE — sobrevive a reset/troca de modo, mesmo
 * quando `dados_capa.galeria` foi zerado ou é de outro modo. `dados_capa`
 * vira cache de conveniência.
 *
 * Retorna itens ordenados do mais recente para o mais antigo (timestamp
 * derivado do nome do arquivo: `capa_ia_<rodadaTs>_<i>.<ext>`).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const dev = isDev();

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: SupabaseClient<any>;
  if (dev) {
    userId = "dev-user";
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();
  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const prefix = `${userId}/${projectId}`;
  const { data: files, error: listErr } = await storageClient.storage
    .from("capas")
    .list(prefix, { limit: 100, sortBy: { column: "name", order: "desc" } });
  if (listErr) {
    console.error("[capa/galeria] list falhou:", listErr.message);
    return NextResponse.json({ error: "Falha ao listar galeria." }, { status: 500 });
  }

  // Nome canônico: `capa_ia_<rodadaTs>_<i>.<png|jpg>` — ver gerar-capa
  const nomeRegex = /^capa_ia_(\d+)_(\d+)\.(png|jpg)$/i;
  const iaFiles = (files ?? []).filter((f) => nomeRegex.test(f.name));

  iaFiles.sort((a, b) => {
    const ta = Number(a.name.match(nomeRegex)?.[1] ?? "0");
    const tb = Number(b.name.match(nomeRegex)?.[1] ?? "0");
    return tb - ta;
  });

  const itens: GaleriaCapaItem[] = [];
  for (const f of iaFiles) {
    const storagePath = `${prefix}/${f.name}`;
    const { url, error: signErr } = await signedUrlCapas(storageClient, storagePath);
    if (signErr || !url) {
      console.warn("[capa/galeria] falha ao assinar", storagePath, signErr);
      continue;
    }
    const ts = Number(f.name.match(nomeRegex)?.[1] ?? "0");
    itens.push({
      url,
      storage_path: storagePath,
      tipo: "frente",
      gerado_em: ts > 0 ? new Date(ts).toISOString() : new Date().toISOString(),
    });
  }

  return NextResponse.json({ itens });
}

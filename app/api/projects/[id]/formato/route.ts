import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import { isFormatoValido } from "@/lib/formatos";
import { validarProjectData } from "@/lib/project-data";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  if (isDev()) {
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
  if (isDev()) {
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
  if (!isDev()) {
    const { data: proj, error: projError } = await supabase
      .from("projects")
      .select("formato_locked_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (projError) {
      console.error("[projects/formato] erro SELECT:", projError);
      return NextResponse.json(
        { error: "Erro ao buscar projeto no banco", detail: projError.message },
        { status: 500 }
      );
    }

    if (!proj) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    if (proj.formato_locked_at != null) {
      return NextResponse.json(
        { error: "Formato bloqueado após geração da capa." },
        { status: 409 }
      );
    }
  }

  // Lê estado atual: formato (detecção de mudança) + miolo/capa (invalidação)
  const { data: current } = await supabase
    .from("projects")
    .select("formato, dados_miolo, dados_capa")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  const formatoMudou = !!current?.formato && current.formato !== body.formato;

  // Regra de invalidação (C.4, decisão c-ii, 14/jul/2026):
  // mudar o formato invalida tudo que foi GERADO no formato antigo —
  // créditos (hash inclui formato), PDFs (página física errada) e os
  // DERIVADOS do miolo (páginas/lombada/html). As ESCOLHAS do autor
  // (config: template, corpo, sumário...) são preservadas, com o snapshot
  // config.formato atualizado — o dashboard/miolo pré-preenche a partir
  // dele. A capa NÃO é destruída (pode ter custado créditos): o front
  // recebe flag e avisa o autor.
  const updatePayload: Record<string, unknown> = { formato: body.formato };
  let capaPodeEstarDesatualizada = false;

  if (formatoMudou) {
    updatePayload.dados_creditos = null;
    updatePayload.dados_pdf = null;
    updatePayload.dados_pdf_digital = null;

    const mioloAtual = current?.dados_miolo as { config?: Record<string, unknown> } | null;
    if (mioloAtual) {
      const novoMiolo = {
        config: mioloAtual.config
          ? { ...mioloAtual.config, formato: body.formato }
          : null,
        html_storage_path: null,
        capitulos: null,
        paginas_estimadas: null,
        paginas_reais: null,
        lombada_mm: null,
        palavras: null,
        caracteres: null,
        gerado_em: null,
      };
      const vMiolo = validarProjectData("dados_miolo", novoMiolo, {
        modo: "estrito", contexto: "formato-patch",
      });
      if (!vMiolo.ok) {
        console.error("[zod-reject][formato-patch][dados_miolo]", vMiolo.issues.join(" | "));
        return NextResponse.json(
          { error: "Falha ao invalidar a diagramação antiga.", issues: vMiolo.issues },
          { status: 500 }
        );
      }
      updatePayload.dados_miolo = novoMiolo;
    }

    const capa = current?.dados_capa as Record<string, unknown> | null;
    capaPodeEstarDesatualizada =
      !!capa && capa.modo !== "skip" &&
      !!(capa.url ?? capa.url_escolhida ?? capa.imagem_url);

    console.log(
      `[formato PATCH] ${current?.formato} → ${body.formato}: invalidando ` +
      `creditos/pdf/pdf_digital/derivados do miolo` +
      (capaPodeEstarDesatualizada ? " · capa marcada como possivelmente desatualizada" : "")
    );
  }

  const { ok: saveOk, error: saveErr } = await updateProject(
    supabase, id, userId, updatePayload, "formato-patch"
  );
  if (!saveOk) {
    return NextResponse.json({ error: saveErr?.message ?? "Falha ao salvar formato." }, { status: 500 });
  }

  return NextResponse.json({
    formato: body.formato,
    locked: false,
    creditos_invalidated: formatoMudou,
    diagramacao_invalidated: formatoMudou,
    capa_pode_estar_desatualizada: capaPodeEstarDesatualizada,
  });
}

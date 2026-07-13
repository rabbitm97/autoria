export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import {
  calcularOrcamento,
  type ConfigImpressao,
} from "@/lib/impressao-pricing";
import type { FormatoLivro } from "@/lib/formatos";

/**
 * BLOCO-02-C — Carrinho de compras unificado.
 *
 * Estrutura genérica desde o dia 1: `tipo` + `config` JSONB permitem outros
 * produtos futuros (revisão, marketing, plano) sem migração.
 *
 * REGRA DE OURO: preço é sempre recalculado server-side com
 * `calcularOrcamento`. O client envia a config, nunca o total.
 */

interface PostBody {
  tipo?: string;
  project_id?: string;
  config?: Partial<ConfigImpressao>;
}

export async function GET() {
  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as Response;
  }
  const { user, supabase } = auth;

  const { data, error } = await supabase
    .from("cart_items")
    .select(`
      id, tipo, project_id, config, preco_centavos, adicionado_em, updated_at,
      projects (
        id, formato, dados_capa, dados_elementos,
        manuscripts (titulo, autor_primeiro_nome, autor_sobrenome)
      )
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as Response;
  }
  const { user, supabase } = auth;

  const body = (await req.json().catch(() => ({}))) as PostBody;

  if (body.tipo !== "impressao_livro") {
    return NextResponse.json(
      { error: "tipo inválido. Aceito no momento: 'impressao_livro'." },
      { status: 400 },
    );
  }

  if (!body.project_id || typeof body.project_id !== "string") {
    return NextResponse.json(
      { error: "project_id obrigatório." },
      { status: 400 },
    );
  }

  if (!body.config || typeof body.config !== "object") {
    return NextResponse.json(
      { error: "config obrigatória." },
      { status: 400 },
    );
  }

  // BLOCO-02-C-FIX-3: busca dados do projeto para enriquecer o config
  // server-side. Formato e páginas SEMPRE vêm do banco (nunca do client)
  // para evitar manipulação. Orelhas caem no valor do projeto se o client
  // não sobrescrever. Mesmo padrão da rota /impressao/orcamento.
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, formato, dados_miolo, dados_capa")
    .eq("id", body.project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectErr) {
    console.error("[carrinho POST] erro ao buscar projeto:", projectErr);
    return NextResponse.json(
      { error: "Erro ao verificar acesso ao projeto." },
      { status: 500 },
    );
  }

  if (!project) {
    return NextResponse.json(
      { error: "Projeto não encontrado ou sem acesso." },
      { status: 404 },
    );
  }

  const formato = (project.formato ?? "padrao_br") as FormatoLivro;
  const miolo = (project.dados_miolo ?? null) as { paginas_reais?: number } | null;
  const paginas = miolo?.paginas_reais ?? 0;

  if (!paginas || paginas < 4) {
    return NextResponse.json(
      { error: "Miolo ainda não foi gerado. Gere o PDF do miolo antes de adicionar ao carrinho." },
      { status: 409 },
    );
  }

  const capa = (project.dados_capa ?? {}) as { orelha_mm?: number; usar_orelhas?: boolean };
  const orelhasProjeto = typeof capa.orelha_mm === "number"
    ? capa.orelha_mm > 0
    : capa.usar_orelhas === true;

  const clientConfig = (body.config ?? {}) as Partial<ConfigImpressao>;

  const config: ConfigImpressao = {
    formato,
    paginas,
    papel_miolo: clientConfig.papel_miolo ?? "offset_75g",
    cor_miolo: clientConfig.cor_miolo ?? "pb",
    acabamento_capa: clientConfig.acabamento_capa ?? "fosca_bopp",
    com_orelhas: clientConfig.com_orelhas ?? orelhasProjeto,
    tiragem: clientConfig.tiragem ?? 10,
    cep_entrega: clientConfig.cep_entrega,
  };

  const resultado = calcularOrcamento(config);

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.erro, codigo: resultado.codigo },
      { status: 422 },
    );
  }

  const precoCentavos = resultado.orcamento.total_centavos;

  // Upsert por (user_id, project_id, tipo) — sobrescreve item existente
  // para não acumular vários orçamentos do mesmo livro.
  const { data: existing } = await supabase
    .from("cart_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("project_id", body.project_id)
    .eq("tipo", "impressao_livro")
    .maybeSingle();

  const now = new Date().toISOString();
  const payload = {
    user_id: user.id,
    project_id: body.project_id,
    tipo: "impressao_livro",
    config: config as unknown as Record<string, unknown>,
    preco_centavos: precoCentavos,
    updated_at: now,
  };

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("cart_items")
      .update(payload)
      .eq("id", existing.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      item_id: existing.id,
      updated: true,
      preco_centavos: precoCentavos,
    });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("cart_items")
    .insert(payload)
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    item_id: inserted.id,
    updated: false,
    preco_centavos: precoCentavos,
  });
}

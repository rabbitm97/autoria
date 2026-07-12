export const maxDuration = 15;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import {
  calcularOrcamento,
  type ConfigImpressao,
  type PapelMiolo,
  type CorMiolo,
  type AcabamentoCapa,
} from "@/lib/impressao-pricing";
import type { FormatoLivro } from "@/lib/formatos";

/**
 * BLOCO-02-C — Endpoint de orçamento de impressão.
 *
 * Recebe overrides parciais do simulador e retorna o cálculo completo.
 * O formato + número de páginas vêm sempre do projeto (nunca do client)
 * para evitar manipulação.
 */

interface PostBody {
  papel_miolo?: PapelMiolo;
  cor_miolo?: CorMiolo;
  acabamento_capa?: AcabamentoCapa;
  com_orelhas?: boolean;
  tiragem?: number;
  cep_entrega?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let auth: Awaited<ReturnType<typeof requireAuth>>;
  try {
    auth = await requireAuth();
  } catch (e) {
    return e as Response;
  }
  const { user, supabase } = auth;

  const { data: project } = await supabase
    .from("projects")
    .select("id, formato, dados_capa, dados_miolo")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { error: "Projeto não encontrado ou sem acesso." },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;

  const formato = (project.formato ?? "padrao_br") as FormatoLivro;
  const miolo = (project.dados_miolo ?? null) as { paginas_reais?: number } | null;
  const paginas = miolo?.paginas_reais ?? 0;

  if (!paginas || paginas < 4) {
    return NextResponse.json(
      { error: "Miolo ainda não foi gerado. Gere o PDF do miolo antes de calcular impressão." },
      { status: 409 },
    );
  }

  const capa = (project.dados_capa ?? {}) as { orelha_mm?: number; usar_orelhas?: boolean };
  const orelhasProjeto = typeof capa.orelha_mm === "number"
    ? capa.orelha_mm > 0
    : capa.usar_orelhas === true;

  const config: ConfigImpressao = {
    formato,
    paginas,
    papel_miolo: body.papel_miolo ?? "offset_75g",
    cor_miolo: body.cor_miolo ?? "pb",
    acabamento_capa: body.acabamento_capa ?? "fosca_bopp",
    com_orelhas: body.com_orelhas ?? orelhasProjeto,
    tiragem: body.tiragem ?? 10,
    cep_entrega: body.cep_entrega,
  };

  const resultado = calcularOrcamento(config);

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.erro, codigo: resultado.codigo, config },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    config,
    orcamento: resultado.orcamento,
  });
}

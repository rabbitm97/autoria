export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import { isFormatoValido, type FormatoLivro } from "@/lib/formatos";
import {
  verificarMioloPdf,
  type MarcasVisuaisHint,
} from "@/app/api/express/_verificacao";

/**
 * Aceita um hint visual do cliente e o valida em forma antes de repassar
 * ao motor. Números finitos apenas; qualquer coisa estranha → `null` (o motor
 * trata como ausente e cai no fluxo normal).
 *
 * v2 (FIX-F-PUB-5-02): preserva `insets_mm` quando os 4 campos são finitos —
 * o motor prefere esse caminho sobre a fórmula legada simétrica.
 */
function parseMarcasVisuais(raw: unknown): MarcasVisuaisHint | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const cantos = Number(obj.cantos_detectados);
  const dist = Number(obj.distancia_borda_mm);
  if (!Number.isFinite(cantos) || !Number.isFinite(dist)) return null;

  let insets_mm: MarcasVisuaisHint["insets_mm"];
  const rawInsets = obj.insets_mm;
  if (rawInsets && typeof rawInsets === "object") {
    const i = rawInsets as Record<string, unknown>;
    const topo = Number(i.topo);
    const fundo = Number(i.fundo);
    const esq = Number(i.esq);
    const dir = Number(i.dir);
    if (
      Number.isFinite(topo) &&
      Number.isFinite(fundo) &&
      Number.isFinite(esq) &&
      Number.isFinite(dir)
    ) {
      insets_mm = { topo, fundo, esq, dir };
    }
  }

  return {
    cantos_detectados: cantos,
    distancia_borda_mm: dist,
    ...(insets_mm ? { insets_mm } : {}),
  };
}

// Verificação declara→confere do PDF de miolo enviado pela porta Express.
// PURA: não escreve no banco, não move arquivo. Reexecutada tantas vezes
// quanto o autor precisar (troca de formato, novo upload etc.). A persistência
// canônica é `confirmar-miolo`, que re-executa este mesmo motor server-side.

export async function POST(req: NextRequest) {
  const dev = isDev();

  let userId: string;
  if (dev) {
    userId = "dev-user";
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
    } catch (e) {
      return e as Response;
    }
  }

  let body: {
    formato?: unknown;
    paginas_declaradas?: unknown;
    marcas_visuais?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!isFormatoValido(body.formato)) {
    return NextResponse.json({ error: "Formato inválido." }, { status: 422 });
  }
  const formato = body.formato as FormatoLivro;

  const paginasDeclaradas = Number(body.paginas_declaradas);
  if (!Number.isFinite(paginasDeclaradas) || paginasDeclaradas <= 0) {
    return NextResponse.json(
      { error: "Informe a quantidade de páginas do PDF." },
      { status: 422 },
    );
  }

  const resultado = await verificarMioloPdf({
    userId,
    formato,
    paginas_declaradas: Math.round(paginasDeclaradas),
    marcas_visuais: parseMarcasVisuais(body.marcas_visuais),
  });

  if (!resultado.ok) {
    const status =
      resultado.motivo === "pdf_ausente" || resultado.motivo === "pdf_ilegivel"
        ? 422
        : 200;
    return NextResponse.json(
      {
        ok: false,
        paginas_reais: resultado.paginas_reais ?? 0,
        largura_mm: resultado.largura_mm ?? 0,
        altura_mm: resultado.altura_mm ?? 0,
        com_sangria: false,
        sangria_detectada: false,
        marcas_detectadas: false,
        sangria_mm: null,
        deteccao_fonte: "none" as const,
        lombada_mm: 0,
        formato_provavel: resultado.formato_provavel,
        divergencias: resultado.divergencias,
        avisos: [] as string[],
      },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    paginas_reais: resultado.paginas_reais,
    largura_mm: resultado.largura_mm,
    altura_mm: resultado.altura_mm,
    com_sangria: resultado.com_sangria,
    sangria_detectada: resultado.sangria_detectada,
    marcas_detectadas: resultado.marcas_detectadas,
    sangria_mm: resultado.sangria_mm,
    deteccao_fonte: resultado.deteccao_fonte,
    lombada_mm: resultado.lombada_mm,
    divergencias: [] as string[],
    avisos: resultado.avisos,
  });
}

// MORTA em 03/ago/2026 (Bloco FERR-1A — sessão FERRAMENTAS).
//
// Síncrona, trecho 8k; divergente do motor batch canônico.
// Substituta: Revisão completa (150 créditos) sobre o motor batch — FERR-3.x
//
// Handler mantido em 410 para não gerar 404 numa aba antiga aberta durante
// o deploy; se aparecer no log, é caller esquecido. Remoção física do
// arquivo fica pra limpeza pós-beta.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Ferramenta descontinuada. Use a Revisão dentro do seu projeto." },
    { status: 410 },
  );
}

// MORTA em 03/ago/2026 (Bloco FERR-1A — sessão FERRAMENTAS).
//
// @react-pdf/renderer (lib descartada) + formato "a5" (viola verdade 2).
// Substituta: Diagramação avulsa sobre o miolo-builder — FERR-3.x
//
// Handler mantido em 410 para não gerar 404 numa aba antiga aberta durante
// o deploy; se aparecer no log, é caller esquecido. Remoção física do
// arquivo fica pra limpeza pós-beta.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Ferramenta descontinuada. Use a Diagramação dentro do seu projeto." },
    { status: 410 },
  );
}

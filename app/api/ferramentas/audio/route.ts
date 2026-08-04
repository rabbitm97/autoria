// MORTA em 03/ago/2026 (Bloco FERR-1A — sessão FERRAMENTAS).
//
// ElevenLabs (provider descartado no D.1).
// Substituta: Audiolivro avulso — depois do Bloco A
//
// Handler mantido em 410 para não gerar 404 numa aba antiga aberta durante
// o deploy; se aparecer no log, é caller esquecido. Remoção física do
// arquivo fica pra limpeza pós-beta.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Ferramenta descontinuada. Audiolivro chega em breve." },
    { status: 410 },
  );
}

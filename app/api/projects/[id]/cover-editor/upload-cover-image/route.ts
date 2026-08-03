// DEPRECADA em 03/ago/2026 (B2-06 EXEC-C).
//
// Substituta: POST /api/projects/[id]/cover-editor/upload-url com body
// { target: "temp" } — o cliente sobe o JPEG direto via signed upload, evitando
// o limite de 4.5 MB do body na rota Vercel (JPEG panorâmico pior caso ~15-22
// MB). Ver app/editor/capa/[project_id]/lib/use-cover-export.ts.
//
// Handler mantido em 410 para não gerar 404 numa aba antiga aberta durante o
// deploy; se aparecer no log, é caller esquecido. Remoção física do arquivo
// fica pra limpeza pós-beta.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Rota descontinuada. O export usa signed upload (upload-url target=temp).",
    },
    { status: 410 },
  );
}

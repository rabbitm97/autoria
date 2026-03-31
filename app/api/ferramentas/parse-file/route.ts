import { NextRequest, NextResponse } from "next/server";

// ─── POST /api/ferramentas/parse-file ─────────────────────────────────────────
// Body: FormData { file: File }
// Returns: { texto: string }

export async function POST(req: NextRequest) {
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "FormData inválido" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Campo 'file' obrigatório" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "txt";
  const allowed = ["pdf", "docx", "txt"];
  if (!allowed.includes(ext)) {
    return NextResponse.json(
      { error: "Formato não suportado. Use PDF, DOCX ou TXT." },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let texto = "";

  try {
    if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as typeof import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      texto = result.value;
    } else if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      texto = result.text;
    } else {
      texto = buffer.toString("utf-8");
    }
  } catch (e) {
    console.error("[parse-file]", e);
    return NextResponse.json({ error: "Falha ao extrair texto do arquivo." }, { status: 500 });
  }

  return NextResponse.json({ texto: texto.trim() });
}

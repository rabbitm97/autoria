import { NextRequest, NextResponse } from "next/server";
import type { CreditosConfig, FichaOficialCRB } from "@/app/api/agentes/creditos/route";
import { isDev } from "@/lib/anthropic";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { type FormatoLivro, getFormatoDef } from "@/lib/formatos";
import { buildCreditosContentHtml } from "@/lib/creditos-render";

// ─── Re-export for page use ───────────────────────────────────────────────────

export type { CreditosConfig };
export type { FormatoLivro as CreditosFormato };

// ─── Format dimensions helper ─────────────────────────────────────────────────

function fmtDim(formato: FormatoLivro) {
  const { width_cm, height_cm } = getFormatoDef(formato).specs;
  return { w: `${width_cm}cm`, h: `${height_cm}cm` };
}

// ─── HTML builder (standalone envelope for the dev tool) ─────────────────────

export function buildCreditosHtml(params: {
  config: CreditosConfig;
  fichaOficial?: FichaOficialCRB;
  titulo: string;
  subtitulo?: string;
  autor: string;
}): string {
  const fmt = fmtDim(params.config.formato);
  const content = buildCreditosContentHtml({
    config: params.config,
    fichaOficial: params.fichaOficial,
    titulo: params.titulo,
    subtitulo: params.subtitulo ?? "",
    autor: params.autor,
  });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #fff; }
.page {
  width: ${fmt.w}; min-height: ${fmt.h};
  margin: 0 auto;
  padding: 3cm 2.2cm 2.5cm 2.5cm;
  display: flex; flex-direction: column;
}
@media print { @page { size: ${fmt.w} ${fmt.h}; margin: 0; } body { background: #fff; } }
</style>
</head>
<body>
<div class="page">
${content}
</div>
</body>
</html>`;
}

// ─── POST /api/ferramentas/creditos ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isDev()) {
    // ── Auth obrigatória (BLOCO-D2-04) ──────────────────────────────────────
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
  }

  let body: {
    config: CreditosConfig;
    fichaOficial?: FichaOficialCRB;
    titulo?: string;
    subtitulo?: string;
    autor?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  const { config, fichaOficial, titulo = "Meu Livro", subtitulo = "", autor = "Autor" } = body;

  if (!config?.titular_direitos?.trim()) {
    return NextResponse.json(
      { error: "Campo 'titular_direitos' obrigatório." },
      { status: 400 }
    );
  }

  const html = buildCreditosHtml({ config, fichaOficial, titulo, subtitulo, autor });

  return NextResponse.json({ ok: true, html });
}

import type { NextRequest } from "next/server";
import {
  calcularOrcamento,
  type ConfigImpressao,
  type CorMiolo,
  type PapelMiolo,
  type AcabamentoCapa,
} from "@/lib/impressao-pricing";
import type { FormatoLivro } from "@/lib/formatos";

// ─── Enums aceitos (batem com os tipos do motor) ─────────────────────────────

const FORMATOS: readonly FormatoLivro[] = ["compacto", "padrao_br", "bolso", "quadrado", "a4"] as const;
const PAPEIS: readonly PapelMiolo[] = ["offset_75g", "avena_80g", "polen_bold_90g", "couche_fosco_90g"] as const;
const CORES: readonly CorMiolo[] = ["pb", "cor"] as const;
const ACABAMENTOS: readonly AcabamentoCapa[] = ["fosca_bopp", "brilho_bopp"] as const;

function isOneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

// ─── Handler ─────────────────────────────────────────────────────────────────
// PÚBLICO — não requer autenticação. Não persiste nada.

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, erro: "Body JSON inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, erro: "Body deve ser um objeto JSON." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  if (!isOneOf(raw.formato, FORMATOS)) {
    return Response.json({ ok: false, erro: "Campo 'formato' inválido." }, { status: 400 });
  }
  if (!isOneOf(raw.papel_miolo, PAPEIS)) {
    return Response.json({ ok: false, erro: "Campo 'papel_miolo' inválido." }, { status: 400 });
  }
  if (!isOneOf(raw.cor_miolo, CORES)) {
    return Response.json({ ok: false, erro: "Campo 'cor_miolo' inválido." }, { status: 400 });
  }
  if (!isOneOf(raw.acabamento_capa, ACABAMENTOS)) {
    return Response.json({ ok: false, erro: "Campo 'acabamento_capa' inválido." }, { status: 400 });
  }
  if (typeof raw.com_orelhas !== "boolean") {
    return Response.json({ ok: false, erro: "Campo 'com_orelhas' deve ser boolean." }, { status: 400 });
  }
  if (typeof raw.paginas !== "number" || !Number.isFinite(raw.paginas)) {
    return Response.json({ ok: false, erro: "Campo 'paginas' deve ser um número." }, { status: 400 });
  }
  if (typeof raw.tiragem !== "number" || !Number.isFinite(raw.tiragem)) {
    return Response.json({ ok: false, erro: "Campo 'tiragem' deve ser um número." }, { status: 400 });
  }
  if (raw.cep_entrega !== undefined && typeof raw.cep_entrega !== "string") {
    return Response.json({ ok: false, erro: "Campo 'cep_entrega' deve ser string ou omitido." }, { status: 400 });
  }

  const config: ConfigImpressao = {
    formato: raw.formato,
    papel_miolo: raw.papel_miolo,
    cor_miolo: raw.cor_miolo,
    acabamento_capa: raw.acabamento_capa,
    com_orelhas: raw.com_orelhas,
    paginas: raw.paginas,
    tiragem: raw.tiragem,
    cep_entrega: raw.cep_entrega,
  };

  // Erros de negócio saem com 200 + { ok: false } — são estados do motor,
  // não falhas HTTP.
  const resultado = calcularOrcamento(config);
  return Response.json(resultado);
}

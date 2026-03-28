import type { NextRequest } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RgbInput {
  r: number;
  g: number;
  b: number;
}

export interface CmykResult {
  c: number;
  m: number;
  y: number;
  k: number;
  hex: string;
}

// ─── Conversion math ─────────────────────────────────────────────────────────

function rgbToCmyk(r: number, g: number, b: number): CmykResult {
  const rp = r / 255;
  const gp = g / 255;
  const bp = b / 255;

  const k = 1 - Math.max(rp, gp, bp);

  // Pure black edge case
  if (k === 1) {
    return { c: 0, m: 0, y: 0, k: 100, hex: rgbToHex(r, g, b) };
  }

  const c = (1 - rp - k) / (1 - k);
  const m = (1 - gp - k) / (1 - k);
  const y = (1 - bp - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
    hex: rgbToHex(r, g, b),
  };
}

function hexToRgb(hex: string): RgbInput | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return null;
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: Partial<RgbInput & { hex: string }>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body JSON inválido." }, { status: 400 });
  }

  let r: number, g: number, b: number;

  // Accept hex OR r/g/b
  if (body.hex) {
    const rgb = hexToRgb(body.hex);
    if (!rgb) {
      return Response.json({ error: "Hex inválido. Use formato #RRGGBB." }, { status: 400 });
    }
    ({ r, g, b } = rgb);
  } else if (body.r !== undefined && body.g !== undefined && body.b !== undefined) {
    r = body.r;
    g = body.g;
    b = body.b;
  } else {
    return Response.json(
      { error: "Forneça 'hex' (#RRGGBB) ou 'r', 'g', 'b' (0–255)." },
      { status: 400 }
    );
  }

  // Validate range
  for (const [name, val] of [["r", r], ["g", g], ["b", b]] as [string, number][]) {
    if (!Number.isInteger(val) || val < 0 || val > 255) {
      return Response.json(
        { error: `Valor de '${name}' inválido. Deve ser inteiro entre 0 e 255.` },
        { status: 400 }
      );
    }
  }

  const result = rgbToCmyk(r, g, b);
  return Response.json({ ok: true, ...result });
}

// Also support GET with query params: /api/ferramentas/rgb-cmyk?r=255&g=0&b=0
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hex = searchParams.get("hex");
  const rStr = searchParams.get("r");
  const gStr = searchParams.get("g");
  const bStr = searchParams.get("b");

  let r: number, g: number, b: number;

  if (hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      return Response.json({ error: "Hex inválido. Use formato RRGGBB ou #RRGGBB." }, { status: 400 });
    }
    ({ r, g, b } = rgb);
  } else if (rStr && gStr && bStr) {
    r = parseInt(rStr, 10);
    g = parseInt(gStr, 10);
    b = parseInt(bStr, 10);
    if ([r, g, b].some((v) => isNaN(v) || v < 0 || v > 255)) {
      return Response.json({ error: "Valores r/g/b devem ser inteiros entre 0 e 255." }, { status: 400 });
    }
  } else {
    return Response.json(
      { error: "Use ?hex=RRGGBB ou ?r=R&g=G&b=B" },
      { status: 400 }
    );
  }

  const result = rgbToCmyk(r, g, b);
  return Response.json({ ok: true, ...result });
}

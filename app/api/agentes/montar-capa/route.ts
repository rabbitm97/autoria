import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import sharp from "sharp";

// ─── Constants ────────────────────────────────────────────────────────────────

const DPI = 150;                     // composite preview resolution
const PX_PER_CM = DPI / 2.54;        // ≈ 59.06 px/cm
const MM_PER_PAGE = 0.07;            // spine thickness per page (75g offset paper)
const MIN_SPINE_PX = 4;

const FORMATO_DIMS: Record<string, { w: number; h: number }> = {
  "16x23": { w: 16,   h: 23   },
  "14x21": { w: 14,   h: 21   },
  "11x18": { w: 11,   h: 18   },
  "20x20": { w: 20,   h: 20   },
  "a4":    { w: 21,   h: 29.7 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar imagem: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function resizeTo(url: string, w: number, h: number): Promise<Buffer> {
  const buf = await fetchBuf(url);
  return sharp(buf).resize(w, h, { fit: "cover", position: "center" }).png().toBuffer();
}

async function blankPanel(w: number, h: number, r = 245, g = 245, b = 245): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } },
  }).png().toBuffer();
}

// ─── POST /api/agentes/montar-capa ───────────────────────────────────────────
// Assembles all cover elements into one flat image:
//   [orelha_verso?] | contra-capa | lombada | frente | [orelha_frente?]

export async function POST(req: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (isDev) {
    userId = "dev-user";
  } else {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    userId = user.id;
  }

  let body: {
    project_id: string;
    formato: string;
    paginas: number;
    usar_orelhas: boolean;
    elementos: {
      frente_url: string;
      contra_url: string;
      lombada_url?: string;
      orelha_frente_url?: string;
      orelha_verso_url?: string;
    };
  };

  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { project_id, formato, paginas, usar_orelhas, elementos } = body;

  if (!project_id || !elementos.frente_url || !elementos.contra_url) {
    return NextResponse.json({ error: "project_id, frente_url e contra_url são obrigatórios" }, { status: 400 });
  }

  // ── Dev mode ──────────────────────────────────────────────────────────────
  if (isDev) {
    return NextResponse.json({
      url: "https://placehold.co/2000x1000/1a1a2e/e8c97b?text=Capa+Completa+Mock",
      storage_path: `dev-user/${project_id}/capa_completa.png`,
    });
  }

  // ── Calculate dimensions ──────────────────────────────────────────────────
  const dims = FORMATO_DIMS[formato] ?? FORMATO_DIMS["16x23"];
  const frontW = Math.round(dims.w * PX_PER_CM);
  const frontH = Math.round(dims.h * PX_PER_CM);
  const spineW = Math.max(MIN_SPINE_PX, Math.round(paginas * MM_PER_PAGE * (DPI / 25.4)));
  const flapW  = usar_orelhas ? Math.round(frontW * 0.6) : 0;

  // Layout (left → right): back-flap | back | spine | front | front-flap
  const totalW = flapW + frontW + spineW + frontW + flapW;

  // ── Build each panel ──────────────────────────────────────────────────────
  const [frentePanel, contraPanel] = await Promise.all([
    resizeTo(elementos.frente_url, frontW, frontH),
    resizeTo(elementos.contra_url, frontW, frontH),
  ]);

  let lombadaPanel: Buffer;
  if (elementos.lombada_url) {
    lombadaPanel = await resizeTo(elementos.lombada_url, spineW, frontH);
  } else {
    // Dark spine with no image: brand-primary (#1a1a2e)
    lombadaPanel = await blankPanel(spineW, frontH, 26, 26, 46);
  }

  // Spine SVG text overlay (title rotated 90°)
  // Note: uses SVG composite — sharp supports this natively
  if (spineW >= 12) {
    const fontSize = Math.min(spineW * 0.55, 16);
    const svgOverlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${spineW}" height="${frontH}">
        <text
          transform="rotate(-90 ${spineW / 2} ${frontH / 2})"
          x="${spineW / 2}" y="${frontH / 2}"
          font-family="serif" font-size="${fontSize}" fill="rgba(255,255,255,0.9)"
          text-anchor="middle" dominant-baseline="middle"
        >${body.elementos.frente_url ? "" : ""}</text>
      </svg>`
    );
    lombadaPanel = await sharp(lombadaPanel).composite([{ input: svgOverlay, top: 0, left: 0 }]).png().toBuffer();
  }

  // Flap panels
  let flapFrentePanel: Buffer | null = null;
  let flapVersoPanel: Buffer | null = null;
  if (usar_orelhas) {
    flapFrentePanel = elementos.orelha_frente_url
      ? await resizeTo(elementos.orelha_frente_url, flapW, frontH)
      : await blankPanel(flapW, frontH);
    flapVersoPanel = elementos.orelha_verso_url
      ? await resizeTo(elementos.orelha_verso_url, flapW, frontH)
      : await blankPanel(flapW, frontH);
  }

  // ── Composite ─────────────────────────────────────────────────────────────
  const layers: sharp.OverlayOptions[] = [];
  let x = 0;

  if (usar_orelhas && flapVersoPanel) {
    layers.push({ input: flapVersoPanel, left: x, top: 0 });
  }
  x += flapW;

  layers.push({ input: contraPanel, left: x, top: 0 });
  x += frontW;

  layers.push({ input: lombadaPanel, left: x, top: 0 });
  x += spineW;

  layers.push({ input: frentePanel, left: x, top: 0 });
  x += frontW;

  if (usar_orelhas && flapFrentePanel) {
    layers.push({ input: flapFrentePanel, left: x, top: 0 });
  }

  const assembled = await sharp({
    create: { width: totalW, height: frontH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(layers)
    .png()
    .toBuffer();

  // ── Upload ────────────────────────────────────────────────────────────────
  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const storagePath = `${userId}/${project_id}/capa_completa.png`;

  const { error: uploadError } = await storageClient.storage
    .from("capas")
    .upload(storagePath, assembled, { contentType: "image/png", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Erro no upload: ${uploadError.message}` }, { status: 500 });
  }

  const { data: { publicUrl } } = storageClient.storage.from("capas").getPublicUrl(storagePath);

  // ── Persist in project ────────────────────────────────────────────────────
  await supabase
    .from("projects")
    .update({ etapa_atual: "diagramacao" })
    .eq("id", project_id)
    .eq("user_id", userId);

  return NextResponse.json({ url: publicUrl, storage_path: storagePath });
}

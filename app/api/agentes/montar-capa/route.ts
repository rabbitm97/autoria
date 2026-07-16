export const maxDuration = 60;

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject } from "@/lib/supabase-helpers";
import { isDev } from "@/lib/anthropic";
import sharp from "sharp";
import { getFormatoDef } from "@/lib/formatos";
import { getProjectFormato, lockFormato } from "@/lib/projects";
import { signedUrlCapas } from "@/lib/capa-signed-url";
import { validarProjectData } from "@/lib/project-data";

// ─── Constants ────────────────────────────────────────────────────────────────

const DPI_PREVIEW  = 150;   // fast composite for on-screen preview
const DPI_PRINT    = 300;   // minimum required by KDP and most POD services
const MM_PER_PAGE  = 0.07;  // spine thickness per page (75g offset paper)
const MIN_SPINE_PX = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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
  try {
  const dev = isDev();
  const supabase = await createSupabaseServerClient();

  let userId: string;
  if (dev) {
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
    usar_orelhas: boolean;
    qualidade?: "preview" | "impressao";
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

  const { project_id, usar_orelhas, elementos, qualidade = "preview" } = body;

  if (!project_id || !elementos.frente_url || !elementos.contra_url) {
    return NextResponse.json({ error: "project_id, frente_url e contra_url são obrigatórios" }, { status: 400 });
  }

  // ── Dev mode ──────────────────────────────────────────────────────────────
  if (dev) {
    return NextResponse.json({
      url: "https://placehold.co/2000x1000/1a1a2e/e8c97b?text=Capa+Completa+Mock",
      storage_path: `dev-user/${project_id}/capa_completa.png`,
      qualidade,
    });
  }

  // ── Resolve canonical format ──────────────────────────────────────────────
  const formato = await getProjectFormato(project_id);
  if (!formato) {
    return NextResponse.json(
      { error: "Formato do livro não definido. Configure em Elementos antes de montar a capa." },
      { status: 422 }
    );
  }

  // ── Fetch titulo, autor, paginas from DB ──────────────────────────────────
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, dados_miolo, manuscripts(titulo, autor_primeiro_nome, autor_sobrenome)")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const ms = project.manuscripts as unknown as {
    titulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
  } | null;

  const titulo = ms?.titulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "";

  const dadosMiolo = project.dados_miolo as { paginas_reais?: number; paginas_estimadas?: number } | null;
  const paginas = dadosMiolo?.paginas_reais ?? dadosMiolo?.paginas_estimadas ?? 200;

  // ── Calculate dimensions ──────────────────────────────────────────────────
  const t0 = Date.now();
  const DPI = qualidade === "impressao" ? DPI_PRINT : DPI_PREVIEW;
  const PX_PER_CM = DPI / 2.54;

  const def = getFormatoDef(formato);
  const frontW = Math.round(def.specs.width_cm * PX_PER_CM);
  const frontH = Math.round(def.specs.height_cm * PX_PER_CM);
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

  // Spine SVG text overlay — title + author rotated -90° along the spine.
  // Only rendered when spineW is wide enough to be legible.
  if (spineW >= 12) {
    const cx = spineW / 2;
    const cy = frontH / 2;
    const fontSizeTitle  = Math.min(spineW * 0.55, 16);
    const fontSizeAuthor = Math.min(spineW * 0.40, 12);
    // Offset the two text lines so they don't overlap when rotated.
    // After -90° rotation the visual "vertical" gap becomes a horizontal offset
    // in the rotated coordinate system; we shift along the original Y axis.
    const gap = fontSizeTitle * 1.6;
    const yTitle  = cy - gap * 0.5;
    const yAuthor = cy + gap * 0.5 + fontSizeAuthor;

    const svgOverlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${spineW}" height="${frontH}">
        <text
          transform="rotate(-90 ${cx} ${yTitle})"
          x="${cx}" y="${yTitle}"
          font-family="serif" font-size="${fontSizeTitle}" font-weight="600"
          fill="rgba(255,255,255,0.95)"
          text-anchor="middle" dominant-baseline="middle"
        >${esc(titulo)}</text>
        <text
          transform="rotate(-90 ${cx} ${yAuthor})"
          x="${cx}" y="${yAuthor}"
          font-family="serif" font-size="${fontSizeAuthor}" font-weight="400"
          fill="rgba(255,255,255,0.75)"
          text-anchor="middle" dominant-baseline="middle"
        >${esc(autor)}</text>
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

  const { url: publicUrl, error: signErr } = await signedUrlCapas(storageClient, storagePath);
  if (signErr || !publicUrl) {
    return NextResponse.json({ error: `Falha ao gerar URL da capa composta: ${signErr}` }, { status: 500 });
  }

  const elapsed = Date.now() - t0;
  console.info(
    `[montar-capa] qualidade=${qualidade} DPI=${DPI} ` +
    `dimensões=${totalW}×${frontH}px lombada=${spineW}px ` +
    `tempo=${elapsed}ms`
  );

  // ── Persist in project ────────────────────────────────────────────────────
  // Lê o dados_capa atual e faz MERGE — não substituição. Os campos do pipeline
  // original (modo, url_escolhida, opcoes, source, imagem_url, editor_data...)
  // precisam ser preservados; só adicionamos os campos da montagem em cima.
  const { data: currentProject, error: capaLoadErr } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", project_id)
    .eq("user_id", userId)
    .single();

  if (capaLoadErr) {
    // C5-04: erro transiente aqui + merge sobre {} apagaria dados_capa inteira.
    console.error("[montar-capa] falha ao carregar dados_capa:", capaLoadErr.message);
    return NextResponse.json(
      { error: "Falha ao carregar a capa atual. Tente novamente." },
      { status: 500 }
    );
  }

  const dadosCapaAtual = (currentProject?.dados_capa as Record<string, unknown> | null) ?? {};

  const dadosCapaAtualizado = {
    ...dadosCapaAtual,
    url_completa: publicUrl,
    composta_storage_path: storagePath,
    montada_em: new Date().toISOString(),
    dimensoes_montada: { largura_px: totalW, altura_px: frontH, dpi: DPI },
  };

  const vCapa = validarProjectData("dados_capa", dadosCapaAtualizado, {
    modo: "estrito", contexto: "montar-capa",
  });
  if (!vCapa.ok) {
    console.error("[zod-reject][montar-capa][dados_capa]", vCapa.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação. Tente novamente.", issues: vCapa.issues },
      { status: 500 }
    );
  }

  const { ok: capaOk } = await updateProject(supabase, project_id, userId, {
    dados_capa: dadosCapaAtualizado,
  }, "montar-capa");
  if (!capaOk) {
    return NextResponse.json(
      { error: "Capa montada, mas falha ao salvar no banco. Tente novamente." },
      { status: 500 }
    );
  }
  await lockFormato(project_id);

  return NextResponse.json({
    url: publicUrl,
    storage_path: storagePath,
    qualidade,
    dimensoes: { largura_px: totalW, altura_px: frontH, dpi: DPI },
    tempo_ms: elapsed,
  });
  } catch (err) {
    console.error("[montar-capa] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao montar a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

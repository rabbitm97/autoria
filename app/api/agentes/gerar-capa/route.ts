export const maxDuration = 120;

import { GoogleGenAI, type Part } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, createSupabaseServerClient } from "@/lib/supabase-server";
import { updateProject, negarPorPlano } from "@/lib/supabase-helpers";
import { lockFormato } from "@/lib/projects";
import { isDev } from "@/lib/anthropic";
import {
  estimarLombadaCapaMm,
  estimarPaginas,
  getFormatoDef,
  isFormatoValido,
  getRatioArteUnica,
  type ArteUnicaAspectRatio,
} from "@/lib/formatos";
import { signedUrlCapas, storagePathDaUrl } from "@/lib/capa-signed-url";
import { jobDoSombra } from "@/lib/ferramenta-jobs";
import { validarProjectData } from "@/lib/project-data";
import type {
  EstiloCapa,
  OpcaoCapa,
  CapaGeradaResult,
  GaleriaCapaItem,
  DadosVersoIa,
  ModoVersoIa,
} from "@/lib/project-data";
import {
  briefingCapaSchema,
  processarBriefingCapa,
  saldoImagensCapa,
  getSaldoCreditos,
  type ContextoLivro,
  type AlvoCapa,
} from "@/lib/capa-briefing";

// Re-export types for consumers that import from this route path
export type { EstiloCapa, OpcaoCapa, CapaGeradaResult } from "@/lib/project-data";

/**
 * Monta o payload de `parts` para o Gemini. Aceita uma LISTA de referências
 * (no máximo 2 hoje: frente + verso anterior na iteração da continuação).
 * A intenção diz ao modelo o papel da PRIMEIRA referência; a segunda, quando
 * presente na continuação, é sempre "improve on previous attempt" — texto
 * verbatim para não deixar o modelo confundir com estilo.
 *
 * B2-05q M2: 2ª referência = verso anterior. Sem ela, o autor "regenera" e
 * a IA não tem de quê iterar — o resultado é uma nova tentativa aleatória.
 */
function buildContents(
  prompt: string,
  refs: string[],
  intencao: "estilo" | "conteudo" | "verso_continuacao" = "estilo",
  // B2-06 FIX-02: só na continuação. Verdade 33 no nível do Nano — quando o
  // autor pediu conteúdo específico pro verso, o TEXTO manda; imagem fica só
  // como referência técnica. Sem ajuste, imagem continua soberana (entorno).
  temAjusteDeConteudo: boolean = false,
): Part[] {
  const parsedRefs = refs
    .slice(0, 2)
    .map((r) => r.match(/^data:([^;]+);base64,(.+)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m));

  if (parsedRefs.length === 0) {
    return [{ text: prompt } as Part];
  }

  const instrucaoPrimeiraRef =
    intencao === "conteudo"
      ? " Incorporate the provided reference image as actual subject matter of the artwork — integrate it naturally into the composition while matching the requested style and palette."
      : intencao === "verso_continuacao"
        ? (temAjusteDeConteudo
            ? " This is the FRONT cover of the book. Generate the BACK cover that sits to its LEFT. The reference image defines ONLY the artistic technique, palette, lighting and the world of the story. The SUBJECT MATTER of the back cover is defined by the TEXT prompt — follow the TEXT for content and the IMAGE for technique. Do NOT copy, mirror or repeat the front or its main subject; keep generous quiet space for text."
            : " This is the FRONT cover of the book. Generate the BACK cover that sits to its LEFT as a natural continuation of the same artwork: same world, palette, technique and lighting. Do NOT copy, mirror or repeat the front or its main subject — paint the surrounding/preceding region of the same scene, calmer and less dense, with generous quiet space for text. The reference image defines the artistic technique and palette — follow the IMAGE over any stylistic wording in the prompt.")
        : " Use the provided reference image as a style and mood guide only — do not copy it literally.";

  const instrucaoSegundaRef =
    intencao === "verso_continuacao" && parsedRefs.length === 2
      ? (temAjusteDeConteudo
          ? " The second image is the PREVIOUS attempt for the back cover. The TEXT prompt defines the NEW content — do not repeat the previous attempt's subject; keep only technique, palette and lighting continuity with both images."
          : " The second image is the PREVIOUS attempt for the back cover. Improve on it according to the briefing adjustments while keeping full continuity with the front (first image). Do not simply repeat the previous attempt.")
      : "";

  const parts: Part[] = [
    { text: prompt + instrucaoPrimeiraRef + instrucaoSegundaRef } as Part,
  ];
  for (const m of parsedRefs) {
    parts.push({ inlineData: { mimeType: m[1], data: m[2] } } as Part);
  }
  return parts;
}

const gerarCapaBodySchema = z.object({
  project_id: z.string().min(1),
  briefing: briefingCapaSchema,
  // B2-05: alvo triplo. Frente = capa frontal (retrato). Verso = contracapa
  // (retrato, aceita continuação da frente como referência). Unica = UMA
  // arte landscape cobrindo verso+lombada+frente; o terço direito vira a
  // capa frontal no editor.
  alvo: z.enum(["frente", "verso", "unica"]).optional().default("frente"),
  imagemRef: z.string().max(5_000_000).optional(),
  imagemRefIntencao: z.enum(["estilo", "conteudo"]).optional().default("estilo"),
  // B2-05b: quando true, mantém as opções anteriores no mesmo alvo (append).
  // Quando false (default), reseta as opções — briefing novo/mudou.
  manter_opcoes: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
  const dev = isDev();

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabase: SupabaseClient<any>;
  if (dev) {
    userId = "dev-user";
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  } else {
    try {
      const auth = await requireAuth();
      userId = auth.user.id;
      supabase = auth.supabase;
    } catch (e) {
      return e as Response;
    }
  }

  if (!process.env.GOOGLE_AI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_AI_API_KEY não configurada." },
      { status: 503 }
    );
  }

  const parsed = gerarCapaBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    console.warn("[gerar-capa] payload inválido:", JSON.stringify(parsed.error.issues));
    return NextResponse.json(
      {
        error: "Não foi possível preparar a geração. Tente novamente.",
        detalhes: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const { project_id } = body;

  // Fetch project — includes dados_capa for galeria merge
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select(
      "id, user_id, plano, origem, formato, dados_elementos, dados_miolo, dados_capa, manuscripts(titulo, subtitulo, autor_primeiro_nome, autor_sobrenome, genero_principal, texto, texto_revisado)",
    )
    .eq("id", project_id)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }
  if (!dev && (project as { user_id: string }).user_id !== userId) {
    return NextResponse.json({ error: "Sem acesso a este projeto." }, { status: 403 });
  }

  // FERR-3.4a: sombra da capa avulsa dispensa gate por plano — pool cobra
  // por imagem em /capa/comprar-imagens; nenhum débito ocorre aqui.
  const ehSombra = (project as { origem?: unknown }).origem === "ferramenta";
  let jobAvulso: Awaited<ReturnType<typeof jobDoSombra>> = null;
  if (ehSombra) {
    jobAvulso = await jobDoSombra(supabase, project_id, userId);
    if (!jobAvulso || jobAvulso.ferramenta_id !== "capa-ia") {
      return NextResponse.json(
        { error: "Projeto de ferramenta sem job de capa ativo." },
        { status: 404 },
      );
    }
  } else {
    const gate = negarPorPlano((project as { plano?: unknown }).plano, "essencial", "gerar-capa");
    if (gate) return gate;
  }

  const ms = (project as Record<string, unknown>).manuscripts as {
    titulo?: string;
    subtitulo?: string;
    autor_primeiro_nome?: string;
    autor_sobrenome?: string;
    genero_principal?: string;
    texto?: string;
    texto_revisado?: string;
  } | null;

  const dadosElementos = (project as Record<string, unknown>).dados_elementos as {
    sinopse_curta?: string;
    sinopse_longa?: string;
    palavras_chave?: string[];
  } | null;

  const titulo = ms?.titulo ?? "";
  const autor = [ms?.autor_primeiro_nome, ms?.autor_sobrenome].filter(Boolean).join(" ") || "";
  const genero = ms?.genero_principal || "literatura";
  const sinopse = dadosElementos?.sinopse_longa || dadosElementos?.sinopse_curta || "";

  const dadosMiolo = (project as Record<string, unknown>).dados_miolo as {
    paginas_reais?: number;
    paginas_estimadas?: number;
  } | null;

  // B2-04e: nada de fallback silencioso `?? 200`. O 200 falseava a lombada
  // para livros longos/curtos que geravam capa antes do miolo. Se o miolo
  // ainda não rodou, reusamos `estimarPaginas` (mesma métrica de todo o
  // resto da stack) com o texto disponível. 200 só resta como último
  // recurso se não houver miolo nem texto — projeto vazio, essencialmente.
  const formatoDb = (project as { formato?: unknown }).formato;
  const textoRevisadoTrim = ms?.texto_revisado?.trim() ?? "";
  const textoBase = textoRevisadoTrim.length >= 50
    ? textoRevisadoTrim
    : (ms?.texto?.trim() ?? "");
  let paginas: number;
  // FERR-3.4a: no sombra, páginas vêm do job (autor digita no wizard). Elas
  // definem a lombada — cascata de miolo/texto não faz sentido aqui (sem
  // miolo, sem manuscrito). Se o job não tiver páginas por algum motivo,
  // cai na cascata normal como último recurso.
  const paginasJob = Number(
    (jobAvulso?.entrada as { paginas?: unknown } | undefined)?.paginas,
  );
  if (ehSombra && Number.isInteger(paginasJob) && paginasJob > 0) {
    paginas = paginasJob;
  } else if (typeof dadosMiolo?.paginas_reais === "number") {
    paginas = dadosMiolo.paginas_reais;
  } else if (typeof dadosMiolo?.paginas_estimadas === "number") {
    paginas = dadosMiolo.paginas_estimadas;
  } else if (isFormatoValido(formatoDb) && textoBase.length > 0) {
    paginas = estimarPaginas(getFormatoDef(formatoDb).specs, undefined, textoBase.length);
  } else {
    paginas = 200;
  }

  if (!titulo) {
    return NextResponse.json(
      { error: "Título do livro ausente. Configure no upload do manuscrito." },
      { status: 422 }
    );
  }

  if (!sinopse) {
    return NextResponse.json(
      { error: "Sinopse ausente. Gere os elementos editoriais antes de criar a capa." },
      { status: 422 }
    );
  }

  const storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const alvo: AlvoCapa = body.alvo;

  // Modo "cor" no verso não passa por esta rota — o editor pinta a região
  // com a cor da frente. Bloqueia por defesa (rota /capa/verso é a certa).
  if (alvo === "verso" && body.briefing.verso?.modo === "cor") {
    return NextResponse.json(
      {
        error:
          "Modo 'cor' não gera imagem — use POST /api/projects/[id]/capa/verso.",
      },
      { status: 400 },
    );
  }

  // Saldo de imagens server-side (B2-05b, regra canônica 05k).
  // Nenhum débito de créditos aqui — compra de pool é rota própria
  // (/api/projects/[id]/capa/comprar-imagens). Cada rodada consome de UMA
  // origem (incluso | pool) computada AGORA e gravada no metadata do log.
  // Fail-closed no erro de leitura (dentro de saldoImagensCapa).
  const saldoAntes = await saldoImagensCapa(
    storageClient,
    project_id,
    (project as { plano?: unknown }).plano,
  );
  const origemConsumo = saldoAntes.origemProximoConsumo(alvo);
  if (origemConsumo === "nenhum") {
    return NextResponse.json(
      {
        error: "Saldo de imagens de capa esgotado. Compre imagens extras para continuar.",
        saldo: {
          incluso: saldoAntes.incluso,
          restante_frente: saldoAntes.restanteFrente,
          restante_verso: saldoAntes.restanteVerso,
          restante_pool: saldoAntes.restantePool,
        },
      },
      { status: 402 },
    );
  }
  // "Regeneração" agora é informacional (2ª+ imagem do alvo neste projeto).
  const ehRegeneracao =
    alvo === "verso"
      ? saldoAntes.consumido.verso + saldoAntes.consumido.unica > 0
      : alvo === "unica"
        ? saldoAntes.consumido.unica + saldoAntes.consumido.frente + saldoAntes.consumido.verso > 0
        : saldoAntes.consumido.frente + saldoAntes.consumido.unica > 0;

  const contexto: ContextoLivro = {
    titulo,
    subtitulo: ms?.subtitulo ?? "",
    autor,
    genero,
    sinopse: sinopse.slice(0, 1200),
    temas: JSON.stringify(dadosElementos?.palavras_chave ?? []).slice(0, 400),
  };

  // B2-05a Mudança 4: verso herda a frente. Sem frente escolhida ainda,
  // 409 — o cliente não deveria conseguir chegar aqui, mas defesa em
  // profundidade (o botão "Continuação" no verso reconstrói o briefing
  // da frente e assume que ela existe).
  const dadosCapaAtual = (project as Record<string, unknown>).dados_capa as Record<string, unknown> | null;
  let frenteHeredada:
    | { prompt_usado: string; estilo: string; estilo_personalizado?: string; frase?: string }
    | undefined;
  if (alvo === "verso") {
    const promptUsado = typeof dadosCapaAtual?.prompt_usado === "string" ? dadosCapaAtual.prompt_usado : "";
    const estiloFrente = typeof dadosCapaAtual?.estilo === "string" ? dadosCapaAtual.estilo : "";
    const estiloPersonalizadoFrente =
      typeof dadosCapaAtual?.estilo_personalizado === "string"
        ? dadosCapaAtual.estilo_personalizado
        : "";
    const urlEscolhida = typeof dadosCapaAtual?.url_escolhida === "string" ? dadosCapaAtual.url_escolhida : "";
    // B2-05h: só url_escolhida é obrigatória. prompt_usado="" é estado
    // legítimo (frente vinda do fallback da galeria, 04d) — a continuidade
    // visual vem da imagem da frente enviada como referência.
    if (!urlEscolhida) {
      return NextResponse.json(
        { error: "Escolha a arte da capa (frente) antes de gerar o verso." },
        { status: 409 },
      );
    }
    const fraseFrente =
      typeof dadosCapaAtual?.frase_confirmacao === "string" ? dadosCapaAtual.frase_confirmacao : undefined;
    frenteHeredada = promptUsado
      ? {
          prompt_usado: promptUsado,
          estilo: estiloFrente,
          estilo_personalizado: estiloPersonalizadoFrente,
          frase: fraseFrente,
        }
      : estiloFrente
        ? {
            prompt_usado: "",
            estilo: estiloFrente,
            estilo_personalizado: estiloPersonalizadoFrente,
            frase: fraseFrente,
          }
        : undefined;
  }

  // Prompt via agente intermediário (server-side — nunca do front)
  let prompt_imagem: string;
  let frase_confirmacao: string;
  try {
    const agente = await processarBriefingCapa({
      contexto,
      briefing: body.briefing,
      alvo,
      projectId: project_id,
      userId,
      frente: frenteHeredada,
    });
    prompt_imagem = agente.prompt_imagem;
    frase_confirmacao = agente.frase_confirmacao;
  } catch (err) {
    console.error("[gerar-capa] agente briefing falhou:", err);
    return NextResponse.json(
      { error: "Não foi possível preparar a geração. Tente novamente." },
      { status: 502 },
    );
  }

  // Verso em modo "continuacao": a frente REAL é referência obrigatória
  // (sem ela, a IA gera cega e o autor recebe uma cena desconexa). B2-05q:
  // identidade do arquivo vem do PATH estável da URL, nunca por comparação
  // de URL assinada (tokens divergem a cada createSignedUrl). Se a frente
  // não puder ser carregada, retornamos 502 — falha visível > silêncio.
  //
  // Segunda referência (também B2-05q M2): a tentativa ANTERIOR do verso.
  // Sem ela, "regenerar" produz uma nova aleatória em vez de iterar sobre
  // o que já existe. Best-effort — se o download falhar, degrada com warn
  // (a frente sozinha ainda é uma continuação válida).
  const imagemRefs: string[] = [];
  let imagemRefIntencao: "estilo" | "conteudo" | "verso_continuacao" = body.imagemRefIntencao;
  if (body.imagemRef) {
    imagemRefs.push(body.imagemRef);
  }
  if (
    alvo === "verso" &&
    body.briefing.verso?.modo === "continuacao" &&
    imagemRefs.length === 0
  ) {
    const frenteRef =
      (dadosCapaAtual?.url_escolhida as string | null | undefined) ??
      (dadosCapaAtual?.imagem_url as string | null | undefined) ??
      null;
    const frenteStoragePath = storagePathDaUrl(frenteRef);
    if (!frenteStoragePath) {
      console.warn(
        "[gerar-capa] verso continuacao: path da frente não derivou de",
        frenteRef,
      );
      return NextResponse.json(
        { error: "Não foi possível carregar a arte da frente para a continuação. Tente novamente." },
        { status: 502 },
      );
    }
    const { data: fileFrente, error: dlErrFrente } = await storageClient.storage
      .from("capas")
      .download(frenteStoragePath);
    if (dlErrFrente || !fileFrente) {
      console.warn(
        "[gerar-capa] verso continuacao: download da frente falhou —",
        dlErrFrente?.message,
      );
      return NextResponse.json(
        { error: "Não foi possível carregar a arte da frente para a continuação. Tente novamente." },
        { status: 502 },
      );
    }
    const bufFrente = Buffer.from(await fileFrente.arrayBuffer());
    const mimeFrente = fileFrente.type || "image/png";
    imagemRefs.push(`data:${mimeFrente};base64,${bufFrente.toString("base64")}`);
    // B2-05j M3b: anti-cópia — a frente é referência de MUNDO, não de
    // repetição. Instrução verbatim acompanha a imagemRef.
    imagemRefIntencao = "verso_continuacao";

    // Verso anterior — url_escolhida do verso OU último item de verso.opcoes.
    // Sem ele, "gerar outra opção" é uma nova aleatória, não uma iteração.
    const versoAtual = dadosCapaAtual?.verso as DadosVersoIa | null | undefined;
    const versoAnteriorUrl =
      (versoAtual?.url_escolhida as string | null | undefined) ??
      (versoAtual?.opcoes?.[versoAtual.opcoes.length - 1]?.url ?? null);
    if (versoAnteriorUrl) {
      const versoAnteriorPath = storagePathDaUrl(versoAnteriorUrl);
      if (versoAnteriorPath) {
        const { data: fileVerso, error: dlErrVerso } = await storageClient.storage
          .from("capas")
          .download(versoAnteriorPath);
        if (!dlErrVerso && fileVerso) {
          const bufVerso = Buffer.from(await fileVerso.arrayBuffer());
          const mimeVerso = fileVerso.type || "image/png";
          imagemRefs.push(`data:${mimeVerso};base64,${bufVerso.toString("base64")}`);
        } else {
          console.warn(
            "[gerar-capa] verso continuacao: download do verso anterior falhou (segue só com frente) —",
            dlErrVerso?.message,
          );
        }
      } else {
        console.warn(
          "[gerar-capa] verso continuacao: path do verso anterior não derivou de",
          versoAnteriorUrl,
        );
      }
    }
  }

  const aspectRatio: "2:3" | ArteUnicaAspectRatio =
    alvo === "unica"
      ? getRatioArteUnica(
          isFormatoValido(formatoDb) ? formatoDb : "padrao_br",
          paginas,
        )
      : "2:3";

  // B2-06 FIX-02: fio direto — deriva da presença de `verso.descricao`
  // não-vazia no briefing. Sem ajuste, imagem continua soberana (entorno).
  const temAjusteDeConteudo = Boolean(
    body.briefing.verso?.descricao?.trim().length,
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const rodadaTs = Date.now();

  async function gerarUmaOpcao(i: number): Promise<OpcaoCapa | null> {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: [{ role: "user", parts: buildContents(prompt_imagem, imagemRefs, imagemRefIntencao, temAjusteDeConteudo) }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio, imageSize: "4K" },
        },
      });
      const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p) => p.inlineData);
      if (!imgPart?.inlineData?.data) {
        console.warn(`[gerar-capa] opção ${i}: inlineData ausente`);
        return null;
      }
      const mimeType = imgPart.inlineData.mimeType ?? "image/png";
      const ext = mimeType.includes("png") ? "png" : "jpg";
      // Naming por alvo permite auditar galeria por origem e evita colisão
      // entre rodadas de frente/verso/unica dentro da mesma janela ts.
      const storagePath = `${userId}/${project_id}/capa_ia_${alvo}_${rodadaTs}_${i}.${ext}`;
      const buffer = Buffer.from(imgPart.inlineData.data, "base64");
      console.log(`[DEBUG-B2] opção ${i} (${alvo}): ${buffer.length} bytes, mime ${mimeType}`);
      // B2-05j M1d: telemetria do ratio real recebido vs pedido. NUNCA gate —
      // a saída generativa é insumo de dimensão não-garantida; o encaixe
      // visual (cover no ImageNode) é determinístico do nosso lado.
      if (alvo === "unica") {
        try {
          const meta = await sharp(buffer).metadata();
          const w = meta.width ?? 0;
          const h = meta.height ?? 0;
          const r = h > 0 ? (w / h).toFixed(3) : "?";
          console.log(
            `[DEBUG-B2] unica: pedido ${aspectRatio}, recebido ${w}x${h} (ratio ${r})`,
          );
        } catch (measureErr) {
          console.warn(`[DEBUG-B2] unica: falha ao medir imagem`, measureErr);
        }
      }
      const { error: uploadError } = await storageClient.storage
        .from("capas")
        .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
      if (uploadError) {
        console.error(`[gerar-capa] upload (opção ${i}):`, uploadError.message);
        return null;
      }
      const { url: publicUrl, error: signErr } = await signedUrlCapas(storageClient, storagePath);
      if (signErr || !publicUrl) {
        console.error(`[gerar-capa] signed URL (opção ${i}):`, signErr);
        return null;
      }
      return { url: publicUrl, storage_path: storagePath };
    } catch (err) {
      console.error(`[gerar-capa] generateContent (opção ${i}):`, err);
      return null;
    }
  }

  // B2-05b: sempre 1 imagem por chamada. Falha = zero consumo (usage_logs
  // só é escrito no sucesso), autor tenta de novo sem custo.
  const opcaoUnica = await gerarUmaOpcao(0);
  const opcoes: OpcaoCapa[] = opcaoUnica ? [opcaoUnica] : [];

  if (opcoes.length === 0) {
    return NextResponse.json(
      { error: "A geração falhou. Nenhuma imagem foi consumida — tente novamente." },
      { status: 502 },
    );
  }

  // Galeria append-only, cap 24
  const galeriaAnterior: GaleriaCapaItem[] = Array.isArray(dadosCapaAtual?.galeria)
    ? (dadosCapaAtual!.galeria as GaleriaCapaItem[])
    : [];

  const tipoGaleria: GaleriaCapaItem["tipo"] = alvo;
  const novosItens: GaleriaCapaItem[] = opcoes.map((o) => ({
    url: o.url,
    storage_path: o.storage_path,
    tipo: tipoGaleria,
    gerado_em: new Date().toISOString(),
  }));

  let galeria: GaleriaCapaItem[] = [...galeriaAnterior, ...novosItens];

  if (galeria.length > 24) {
    const toDelete = galeria.slice(0, galeria.length - 24);
    galeria = galeria.slice(-24);
    // Best-effort delete dos mais antigos
    for (const item of toDelete) {
      storageClient.storage
        .from("capas")
        .remove([item.storage_path])
        .then(({ error }) => {
          if (error) {
            console.error("[gerar-capa] galeria: falha ao remover", item.storage_path, error.message);
          } else {
            console.log("[gerar-capa] galeria: item removido", item.storage_path);
          }
        })
        .catch((err) => {
          console.error("[gerar-capa] galeria: exception ao remover", item.storage_path, err);
        });
    }
  }

  const agoraIso = new Date().toISOString();

  // ─── Payload por alvo ─────────────────────────────────────────────────────
  // frente/unica: reescrevem o "corpo" do dados_capa (briefing snapshot +
  //   opções + galeria). Chaves de estado confirmado (source, imagem_url,
  //   editor_data, url_escolhida, confirmed_at, analise_tecnica) são
  //   PRESERVADAS — regeneração é ato de "propor novas opções", não de
  //   apagar o que já foi confirmado. Só a ESCOLHA reseta essas chaves.
  // verso: NÃO toca no corpo da frente. Grava só o subobjeto `verso`
  //   (opções da contracapa + snapshot próprio). O url_escolhida do verso
  //   é null até a escolha.
  let dadosParaSalvar: Record<string, unknown>;
  let result: CapaGeradaResult | { verso: DadosVersoIa; galeria: GaleriaCapaItem[] };

  if (alvo === "verso") {
    // B2-05b: manter_opcoes=true (mesma descrição, nova opção) → append às
    // opções anteriores do verso. false (default) → reset das opções.
    const versoAtual = (dadosCapaAtual?.verso as DadosVersoIa | null | undefined) ?? null;
    const opcoesVerso =
      body.manter_opcoes && versoAtual?.opcoes ? [...versoAtual.opcoes, ...opcoes] : opcoes;
    const versoResult: DadosVersoIa = {
      modo: (body.briefing.verso?.modo ?? "independente") as ModoVersoIa,
      descricao: body.briefing.verso?.descricao || undefined,
      opcoes: opcoesVerso,
      url_escolhida: null,
      prompt_usado: prompt_imagem,
      frase_confirmacao,
      gerado_em: agoraIso,
    };
    dadosParaSalvar = {
      ...(dadosCapaAtual ?? {}),
      verso: versoResult,
      galeria,
    };
    result = { verso: versoResult, galeria };
  } else {
    // frente ou unica — B2-05b: manter_opcoes=true append; false reseta.
    const opcoesAnteriores = Array.isArray(dadosCapaAtual?.opcoes)
      ? (dadosCapaAtual!.opcoes as OpcaoCapa[])
      : [];
    const opcoesFinais = body.manter_opcoes ? [...opcoesAnteriores, ...opcoes] : opcoes;
    const capaResult: CapaGeradaResult = {
      project_id,
      modo: "ia",
      briefing_versao: 2,
      estilo: body.briefing.estilo as EstiloCapa,
      // B2-05s: espelha o texto do autor no result. undefined quando estilo !==
      // "personalizado" (refine do briefing garante o acoplamento).
      estilo_personalizado: body.briefing.estilo_personalizado || undefined,
      atmosfera: [...body.briefing.atmosfera],
      atmosfera_personalizada: body.briefing.atmosfera_personalizada || undefined,
      cor_predominante: body.briefing.cor_predominante.nome,
      cor_predominante_hex: body.briefing.cor_predominante.hex,
      posicao_titulo: body.briefing.posicao_titulo,
      descricao_livre: body.briefing.descricao_livre || undefined,
      referencias_texto: body.briefing.referencias_texto || undefined,
      evitar: body.briefing.evitar || undefined,
      usar_orelhas: false,
      orelha_mm: 0,
      prompt_usado: prompt_imagem,
      frase_confirmacao,
      opcoes: opcoesFinais,
      galeria,
      // Escolha é ATO EXPLÍCITO — nunca implícita. Sem esta null-idade,
      // F5 na tela de escolha fazia o sistema achar que opção 1 foi aceita.
      url_escolhida: null,
      // Verso preservado do estado atual — nova frente/unica NÃO apaga
      // um verso já gerado. (Cobertura decide se ele será usado.)
      verso: (dadosCapaAtual?.verso as DadosVersoIa | null | undefined) ?? null,
      cobertura: alvo === "unica" ? "unica" : "frente_verso",
      gerado_em: agoraIso,
      is_regeneracao: ehRegeneracao,
      paginas_estimadas: paginas,
      lombada_mm: estimarLombadaCapaMm(paginas),
    };
    dadosParaSalvar = { ...(capaResult as unknown as Record<string, unknown>) };
    if (dadosCapaAtual) {
      const chavesPreservadas = [
        "url_escolhida",
        "editor_data",
        "source",
        "imagem_url",
        "confirmed_at",
        "analise_tecnica",
      ] as const;
      for (const k of chavesPreservadas) {
        if (dadosCapaAtual[k] !== undefined) {
          dadosParaSalvar[k] = dadosCapaAtual[k];
        }
      }
    }
    result = capaResult;
  }

  const vCapa = validarProjectData("dados_capa", dadosParaSalvar, {
    modo: "estrito", contexto: "gerar-capa",
  });
  if (!vCapa.ok) {
    console.error("[zod-reject][gerar-capa][dados_capa]", vCapa.issues.join(" | "));
    return NextResponse.json(
      { error: "Dados da capa falharam na validação. Tente novamente.", issues: vCapa.issues },
      { status: 500 }
    );
  }

  const updateUserId = dev ? null : userId;
  const { ok: capaOk } = await updateProject(supabase, project_id, updateUserId, {
    dados_capa: dadosParaSalvar,
  }, "gerar-capa");
  if (!capaOk) {
    return NextResponse.json(
      { error: "Capas geradas, mas falha ao salvar no banco. Tente novamente." },
      { status: 500 }
    );
  }

  await lockFormato(project_id);

  // Ledger de consumo (B2-05b + regra canônica 05k). Só chega aqui em
  // sucesso — falhas não debitam saldo. `saldoImagensCapa` no próximo
  // request lê `origem_consumo` para contar pool vs incluso (fonte única
  // de verdade). Retrocompat: metadata.alvo ausente = "frente";
  // metadata.origem_consumo ausente = "incluso" (rodadas pré-05k).
  try {
    await storageClient.from("usage_logs").insert({
      agent_name: "gerar-capa",
      project_id,
      user_id: userId,
      metadata: {
        alvo,
        origem_consumo: origemConsumo,
        opcoes_geradas: opcoes.length,
        regeneracao: ehRegeneracao,
        manter_opcoes: body.manter_opcoes,
        estilo: body.briefing.estilo,
      },
    });
  } catch (e) {
    console.error("[gerar-capa] log de rodada falhou:", e);
  }

  // Anexa o saldo pós-consumo na resposta — o cliente atualiza contadores
  // sem uma rodada extra de fetch.
  const saldoDepois = await saldoImagensCapa(
    storageClient,
    project_id,
    (project as { plano?: unknown }).plano,
  );
  const saldoUsuario = dev ? null : await getSaldoCreditos(supabase, userId);
  const respostaFinal = {
    ...(result as Record<string, unknown>),
    saldo: {
      incluso: saldoDepois.incluso,
      restante_frente: saldoDepois.restanteFrente,
      restante_verso: saldoDepois.restanteVerso,
      restante_pool: saldoDepois.restantePool,
      // B2-05k: cliente rotula o próximo consumo pela origem — sem
      // reinventar a fórmula. Mesmo shape do GET /capa/saldo (M5a).
      origem_proximo: {
        frente: saldoDepois.origemProximoConsumo("frente"),
        verso: saldoDepois.origemProximoConsumo("verso"),
        unica: saldoDepois.origemProximoConsumo("unica"),
      },
    },
    creditos_saldo: saldoUsuario,
  };
  return NextResponse.json(respostaFinal);
  } catch (err) {
    console.error("[gerar-capa] Erro não tratado no handler POST:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao gerar a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// ─── GET /api/agentes/gerar-capa?project_id=... ───────────────────────────────

export async function GET(req: NextRequest) {
  try {
  const project_id = req.nextUrl.searchParams.get("project_id");
  if (!project_id) {
    return NextResponse.json({ error: "project_id obrigatório" }, { status: 400 });
  }

  if (isDev()) {
    return NextResponse.json(null);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("dados_capa")
    .eq("id", project_id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  }

  return NextResponse.json(data.dados_capa ?? null);
  } catch (err) {
    console.error("[gerar-capa] Erro não tratado no handler GET:", err);
    return NextResponse.json(
      {
        error: "Erro interno ao obter a capa. A equipe foi notificada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

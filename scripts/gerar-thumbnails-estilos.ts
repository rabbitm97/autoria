/**
 * One-off B2-06 EXEC-A B1: gera thumbnails 1K para os 7 estilos de capa.
 *
 * Uso:
 *   npx tsx scripts/gerar-thumbnails-estilos.ts
 *
 * Env: GOOGLE_AI_API_KEY em .env.local.
 *
 * A cena é IDÊNTICA nos 7 (uma casa junto a uma árvore ao entardecer, sem
 * texto). Só o estilo varia — assim o autor vê a diferença visual sem ser
 * distraído por conteúdo. Aspect 1:1, 1K. Salva em public/estilos-capa/<id>.jpg.
 *
 * Regra de parada: 2 falhas na mesma chamada = para e reporta. Sem iteração
 * de prompt (não é laboratório).
 */
import { GoogleGenAI, type Part } from "@google/genai";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

// Node ≥ 20.6: process.loadEnvFile. Sem dependência extra (dotenv).
try {
  process.loadEnvFile(".env.local");
} catch {
  // se falhar (ex.: Node < 20.6), o usuário roda com `node --env-file=.env.local`.
}

const CENA_NEUTRA =
  "uma pequena casa de madeira junto a uma árvore frondosa ao entardecer, campo aberto ao fundo, céu com nuvens suaves, sem texto, sem letras, sem logotipos";

const ESTILOS: { id: string; descricao: string }[] = [
  {
    id: "minimalista",
    descricao:
      "estilo minimalista: formas geométricas simples, paleta muito reduzida (2-3 cores), amplo espaço negativo, composição essencialista",
  },
  {
    id: "cartoon",
    descricao:
      "estilo cartoon animado: contornos pretos definidos, cores saturadas vibrantes, aparência divertida e amigável, sem realismo",
  },
  {
    id: "aquarela",
    descricao:
      "estilo aquarela pintada à mão: pinceladas suaves e translúcidas, cores mesclando-se organicamente, textura de papel, aparência artesanal delicada",
  },
  {
    id: "fotorrealista",
    descricao:
      "estilo fotorrealista de alta qualidade: luz natural detalhada e cinematográfica, texturas realistas, profundidade de campo, iluminação dourada do entardecer",
  },
  {
    id: "abstrato",
    descricao:
      "estilo abstrato expressionista: formas não-representacionais insinuando a cena, composição experimental de cor e textura, ausência de linhas figurativas nítidas",
  },
  {
    id: "vintage",
    descricao:
      "estilo vintage anos 70: cores dessaturadas quentes, textura granulada de filme, aparência de cartaz antigo, papel amarelado",
  },
  {
    id: "geometrico",
    descricao:
      "estilo geométrico rigoroso: formas triangulares e retangulares, linhas retas, composição arquitetônica, paleta cromática limitada com contraste alto",
  },
];

const OUTPUT_DIR = "public/estilos-capa";

async function gerarThumbnail(
  ai: GoogleGenAI,
  estilo: { id: string; descricao: string },
): Promise<Buffer | null> {
  const prompt = `Ilustração em ${estilo.descricao}. Cena: ${CENA_NEUTRA}. Formato quadrado, ocupando toda a imagem.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
    },
  });

  const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData);
  if (!imgPart?.inlineData?.data) return null;
  return Buffer.from(imgPart.inlineData.data, "base64");
}

async function main() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_AI_API_KEY ausente em .env.local");
    process.exit(1);
  }
  const ai = new GoogleGenAI({ apiKey });
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const estilo of ESTILOS) {
    console.log(`\n[${estilo.id}] gerando…`);
    let buffer: Buffer | null = null;
    let tentativa = 0;
    while (tentativa < 2 && !buffer) {
      tentativa++;
      try {
        buffer = await gerarThumbnail(ai, estilo);
        if (!buffer) console.warn(`[${estilo.id}] tentativa ${tentativa}: inlineData ausente`);
      } catch (err) {
        console.warn(
          `[${estilo.id}] tentativa ${tentativa}: erro`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    if (!buffer) {
      console.error(`[${estilo.id}] falhou 2 vezes — abortando (não itero prompt).`);
      process.exit(1);
    }

    // Converte para JPG (Gemini devolve PNG por padrão). qualidade 85 é
    // suficiente pra thumbnail decorativa e cabe bem em disco.
    const jpgBuffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
    const outPath = join(OUTPUT_DIR, `${estilo.id}.jpg`);
    await writeFile(outPath, jpgBuffer);
    console.log(`[${estilo.id}] salvo em ${outPath} (${(jpgBuffer.length / 1024).toFixed(1)} KB)`);
  }

  console.log("\nOK — 7 thumbnails gerados.");
}

main().catch((err) => {
  console.error("erro fatal:", err);
  process.exit(1);
});

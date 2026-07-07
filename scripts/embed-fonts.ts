// scripts/embed-fonts.ts
//
// Lê as fontes .woff2 dos pacotes @fontsource/* instalados no node_modules
// e gera lib/fonts-embedded.ts com constantes base64 exportadas.
//
// Rodar sempre que trocar/adicionar fontes:
//   npm run embed-fonts
//
// O arquivo gerado é comitado no git — assim runtime não faz I/O.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

interface FontVariant {
  /** Nome da constante exportada. Ex: "EB_GARAMOND_400" */
  constName: string;
  /** Caminho relativo dentro de node_modules/@fontsource/{pkg}/files/ */
  file: string;
}

interface FontSpec {
  /** Nome do pacote (sem @fontsource/). Ex: "eb-garamond" */
  pkg: string;
  variants: FontVariant[];
}

// Formato dos nomes de arquivo do fontsource:
//   {pkg}-latin-{weight}-normal.woff2  (regular)
//   {pkg}-latin-{weight}-italic.woff2  (italic)
// Subset "latin" cobre Português com acentos.
const FONTS: FontSpec[] = [
  {
    pkg: "eb-garamond",
    variants: [
      { constName: "EB_GARAMOND_400",        file: "eb-garamond-latin-400-normal.woff2" },
      { constName: "EB_GARAMOND_400_ITALIC", file: "eb-garamond-latin-400-italic.woff2" },
      { constName: "EB_GARAMOND_600",        file: "eb-garamond-latin-600-normal.woff2" },
    ],
  },
  {
    pkg: "spectral",
    variants: [
      { constName: "SPECTRAL_400",        file: "spectral-latin-400-normal.woff2" },
      { constName: "SPECTRAL_400_ITALIC", file: "spectral-latin-400-italic.woff2" },
      { constName: "SPECTRAL_500",        file: "spectral-latin-500-normal.woff2" },
      { constName: "SPECTRAL_600",        file: "spectral-latin-600-normal.woff2" },
    ],
  },
  {
    pkg: "source-serif-4",
    variants: [
      { constName: "SOURCE_SERIF_4_300",        file: "source-serif-4-latin-300-normal.woff2" },
      { constName: "SOURCE_SERIF_4_400",        file: "source-serif-4-latin-400-normal.woff2" },
      { constName: "SOURCE_SERIF_4_400_ITALIC", file: "source-serif-4-latin-400-italic.woff2" },
      { constName: "SOURCE_SERIF_4_500",        file: "source-serif-4-latin-500-normal.woff2" },
      { constName: "SOURCE_SERIF_4_600",        file: "source-serif-4-latin-600-normal.woff2" },
    ],
  },
  {
    pkg: "crimson-pro",
    variants: [
      { constName: "CRIMSON_PRO_400",        file: "crimson-pro-latin-400-normal.woff2" },
      { constName: "CRIMSON_PRO_400_ITALIC", file: "crimson-pro-latin-400-italic.woff2" },
      { constName: "CRIMSON_PRO_500",        file: "crimson-pro-latin-500-normal.woff2" },
      { constName: "CRIMSON_PRO_600",        file: "crimson-pro-latin-600-normal.woff2" },
    ],
  },
  {
    pkg: "tinos",
    variants: [
      { constName: "TINOS_400",        file: "tinos-latin-400-normal.woff2" },
      { constName: "TINOS_400_ITALIC", file: "tinos-latin-400-italic.woff2" },
      { constName: "TINOS_700",        file: "tinos-latin-700-normal.woff2" },
    ],
  },
  {
    pkg: "crimson-text",
    variants: [
      { constName: "CRIMSON_TEXT_400",        file: "crimson-text-latin-400-normal.woff2" },
      { constName: "CRIMSON_TEXT_400_ITALIC", file: "crimson-text-latin-400-italic.woff2" },
      { constName: "CRIMSON_TEXT_600",        file: "crimson-text-latin-600-normal.woff2" },
    ],
  },
  {
    pkg: "andika",
    variants: [
      { constName: "ANDIKA_400",        file: "andika-latin-400-normal.woff2" },
      { constName: "ANDIKA_400_ITALIC", file: "andika-latin-400-italic.woff2" },
      { constName: "ANDIKA_700",        file: "andika-latin-700-normal.woff2" },
    ],
  },
  {
    pkg: "lora",
    variants: [
      { constName: "LORA_400",        file: "lora-latin-400-normal.woff2" },
      { constName: "LORA_400_ITALIC", file: "lora-latin-400-italic.woff2" },
      { constName: "LORA_500",        file: "lora-latin-500-normal.woff2" },
      { constName: "LORA_600",        file: "lora-latin-600-normal.woff2" },
    ],
  },
  {
    pkg: "gentium-book-plus",
    variants: [
      { constName: "GENTIUM_BOOK_PLUS_400",        file: "gentium-book-plus-latin-400-normal.woff2" },
      { constName: "GENTIUM_BOOK_PLUS_400_ITALIC", file: "gentium-book-plus-latin-400-italic.woff2" },
      { constName: "GENTIUM_BOOK_PLUS_700",        file: "gentium-book-plus-latin-700-normal.woff2" },
    ],
  },
];

// ── Executa embedding ─────────────────────────────────────────────────────────

const outLines: string[] = [
  "// GENERATED FILE — do not edit manually.",
  "// Regenerate via `npm run embed-fonts` after adding/updating @fontsource/* packages.",
  "//",
  "// Each const is a base64 string of the .woff2 file, meant to be inlined into",
  "// CSS as `url(data:font/woff2;base64,${THE_CONST}) format(\"woff2\")`.",
  "",
];

let totalBytes = 0;
let variantCount = 0;

for (const font of FONTS) {
  outLines.push(`// ─── ${font.pkg} ───`);
  for (const v of font.variants) {
    const path = resolve(process.cwd(), "node_modules", "@fontsource", font.pkg, "files", v.file);
    if (!existsSync(path)) {
      console.error(`❌ Missing: ${path}`);
      console.error(`   Verify @fontsource/${font.pkg} is installed and file name matches.`);
      process.exit(1);
    }
    const bytes = readFileSync(path);
    const base64 = bytes.toString("base64");
    outLines.push(`export const ${v.constName} = "${base64}";`);
    totalBytes += bytes.byteLength;
    variantCount++;
  }
  outLines.push("");
}

const outPath = resolve(process.cwd(), "lib", "fonts-embedded.ts");
writeFileSync(outPath, outLines.join("\n"));

console.log(`✅ Wrote ${variantCount} variants to ${outPath}`);
console.log(`   Raw size: ${(totalBytes / 1024).toFixed(1)}KB (before base64)`);
console.log(`   Encoded size: ${((totalBytes * 4 / 3) / 1024).toFixed(1)}KB (in generated .ts)`);

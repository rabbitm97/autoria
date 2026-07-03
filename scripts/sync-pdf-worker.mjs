// scripts/sync-pdf-worker.mjs
//
// Copia o pdf.worker.min.mjs de node_modules/pdfjs-dist para public/.
// FALHA o build se a versão do pdfjs-dist top-level não bater exatamente com
// a versão que o react-pdf empacota internamente — se as versões divergirem,
// o worker no browser recusa carregar PDFs com o erro:
//   "The API version X does not match the Worker version Y".
//
// Se este script parar de funcionar após bump de react-pdf, o fix é:
//   1. Rodar `npm ls pdfjs-dist` e ver a versão exigida por react-pdf.
//   2. Atualizar "pdfjs-dist" no package.json para essa versão exata.
//   3. Rodar `npm install` — o postinstall vai voltar a passar.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function readJson(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

const reactPdfPkg = readJson("node_modules/react-pdf/package.json");
const pdfjsPkg = readJson("node_modules/pdfjs-dist/package.json");

if (!reactPdfPkg || !pdfjsPkg) {
  console.error(
    "[sync-pdf-worker] node_modules não encontrado — rode `npm install` antes."
  );
  process.exit(1);
}

const required = reactPdfPkg.dependencies?.["pdfjs-dist"];
const installed = pdfjsPkg.version;

if (required !== installed) {
  console.error("\n[sync-pdf-worker] VERSÃO DESALINHADA — bug crítico:");
  console.error(
    `  react-pdf@${reactPdfPkg.version} empacota pdfjs-dist@${required}`
  );
  console.error(
    `  package.json instala pdfjs-dist@${installed} no top level`
  );
  console.error(
    `  → Corrigir: em package.json, setar "pdfjs-dist": "${required}" (versão exata, sem caret)`
  );
  console.error(
    `  → Rodar: npm install\n`
  );
  process.exit(1);
}

const src = path.join(ROOT, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dst = path.join(ROOT, "public/pdf.worker.min.mjs");

if (!fs.existsSync(src)) {
  console.error(`[sync-pdf-worker] Arquivo fonte não encontrado: ${src}`);
  process.exit(1);
}

fs.copyFileSync(src, dst);
console.log(
  `[sync-pdf-worker] copiado pdf.worker.min.mjs (v${installed}) para public/`
);

#!/usr/bin/env node
// Recalcula os `conteudoHash` (SHA-256 dos arquivos-fonte) de cada entrada em
// `lib/legal-docs.ts`. Em modo default reescreve o arquivo. Em `--check` sai
// com código 1 caso algum hash esteja desatualizado — útil para CI local.
//
// Verdade 40: alterar o texto de um documento legal muda o hash. Se o hash
// mudou e `versao` NÃO foi bumpada, este script (em --check) grita.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS_FILE = join(ROOT, "lib", "legal-docs.ts");

const CHECK_MODE = process.argv.includes("--check");

async function main() {
  const source = await readFile(DOCS_FILE, "utf8");

  const sourcesMatch = source.match(
    /export const LEGAL_DOC_SOURCES:[\s\S]*?=\s*\{([\s\S]*?)\};/
  );
  if (!sourcesMatch) {
    fail("Não achei LEGAL_DOC_SOURCES em lib/legal-docs.ts");
  }

  const entryRe = /"([^"]+)":\s*"([^"]+)"/g;
  const sources = {};
  let m;
  while ((m = entryRe.exec(sourcesMatch[1])) !== null) {
    sources[m[1]] = m[2];
  }
  if (Object.keys(sources).length === 0) {
    fail("LEGAL_DOC_SOURCES está vazio");
  }

  const computed = {};
  for (const [slug, relPath] of Object.entries(sources)) {
    const abs = join(ROOT, relPath);
    let content;
    try {
      content = await readFile(abs, "utf8");
    } catch (err) {
      fail(`Não consegui ler ${relPath} para o slug "${slug}": ${err.message}`);
    }
    computed[slug] = createHash("sha256").update(content, "utf8").digest("hex");
  }

  let updated = source;
  const changes = [];
  for (const [slug, hash] of Object.entries(computed)) {
    const entryRe = new RegExp(
      `("${escapeRe(slug)}"\\s*:\\s*\\{[\\s\\S]*?conteudoHash:\\s*")([^"]*)(")`
    );
    const found = entryRe.exec(updated);
    if (!found) {
      fail(`Entrada "${slug}" não tem campo conteudoHash em LEGAL_DOCS`);
    }
    const before = found[2];
    if (before !== hash) {
      changes.push({ slug, before, after: hash });
    }
    updated = updated.replace(entryRe, `$1${hash}$3`);
  }

  if (CHECK_MODE) {
    if (changes.length === 0) {
      console.log("[legal-hash] OK — todos os hashes estão atualizados.");
      return;
    }
    console.error("[legal-hash] Hashes desatualizados. Rode `node scripts/legal-hash.mjs` e bumpe `versao` nos slugs alterados:");
    for (const c of changes) {
      console.error(`  - ${c.slug}: ${c.before || "<vazio>"} → ${c.after}`);
    }
    process.exit(1);
  }

  if (changes.length === 0) {
    console.log("[legal-hash] Nada a atualizar.");
    return;
  }

  await writeFile(DOCS_FILE, updated, "utf8");
  console.log("[legal-hash] lib/legal-docs.ts atualizado:");
  for (const c of changes) {
    console.log(`  - ${c.slug}: ${c.before || "<vazio>"} → ${c.after}`);
  }
  console.log("[legal-hash] Lembre-se de bumpar `versao` de qualquer slug cujo hash mudou (Verdade 40).");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(msg) {
  console.error(`[legal-hash] ${msg}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("[legal-hash] Falha inesperada:", err);
  process.exit(1);
});

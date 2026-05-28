/**
 * font-embedding.ts
 *
 * Server-side module (route-handler / Node.js only — no "use client").
 * Reads the woff2 files produced by `scripts/baixar-fontes.mjs`, base64-encodes
 * them, and returns a single CSS string of @font-face rules with data-URI src.
 *
 * The result is cached in module scope so subsequent calls within the same
 * warm Lambda / Edge invocation pay no I/O cost.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FontFaceEntry {
  family: string;
  weight: string;
  style: string;
  file: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONTS_DIR = join(process.cwd(), "public", "fonts");

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let _css: string | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a CSS string containing one @font-face rule per manifest entry,
 * with every font embedded as a base64 data URI.
 *
 * The result is cached after the first successful (or empty) build so that
 * repeated calls within the same server process pay no file-system cost.
 */
export function buildEmbeddedFontFaceCss(): string {
  if (_css !== null) return _css;

  const manifestPath = join(FONTS_DIR, "manifest.json");

  if (!existsSync(manifestPath)) {
    _css = "";
    return _css;
  }

  let entries: FontFaceEntry[];
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    entries = JSON.parse(raw) as FontFaceEntry[];
  } catch {
    _css = "";
    return _css;
  }

  const blocks: string[] = [];

  for (const entry of entries) {
    const filePath = join(FONTS_DIR, entry.file);

    if (!existsSync(filePath)) continue;

    let b64: string;
    try {
      b64 = readFileSync(filePath).toString("base64");
    } catch {
      continue;
    }

    const { family, weight, style } = entry;

    blocks.push(
      `@font-face{` +
        `font-family:'${family}';` +
        `font-style:${style};` +
        `font-weight:${weight};` +
        `font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format('woff2');` +
        `}`
    );
  }

  _css = blocks.join("\n");
  return _css;
}

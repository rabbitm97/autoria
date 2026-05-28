/**
 * baixar-fontes.mjs
 *
 * Downloads Google Fonts woff2 files for the cover editor PDF renderer.
 * Run once with: node scripts/baixar-fontes.mjs
 *
 * - No extra dependencies (uses Node built-in https and fs modules)
 * - Idempotent: skips files that already exist
 * - Writes public/fonts/manifest.json when done
 */

import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FONTS_DIR = path.join(ROOT, "public", "fonts");
const MANIFEST_PATH = path.join(FONTS_DIR, "manifest.json");

// ---------------------------------------------------------------------------
// Font request
// ---------------------------------------------------------------------------

const FAMILIES = [
  "Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;1,9..144,400;1,9..144,700",
  "Cormorant+Garamond:ital,wght@0,400;0,700;1,400;1,700",
  "Playfair+Display:ital,wght@0,400;0,700;1,400;1,700",
  "Syne:wght@400;700",
  "DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700;1,9..40,400;1,9..40,700",
  "Inter:wght@400;700",
  "Bebas+Neue",
  "Archivo+Black",
];

const CSS_URL =
  "https://fonts.googleapis.com/css2?" +
  FAMILIES.map((f) => `family=${f}`).join("&") +
  "&display=block";

// Chrome UA so Google returns woff2 format
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Follows redirects, returns the response body as a Buffer. */
function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { "User-Agent": CHROME_UA, ...headers },
    };

    function doRequest(currentUrl) {
      https
        .get(currentUrl, options, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            doRequest(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${currentUrl}`));
            return;
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        })
        .on("error", reject);
    }

    doRequest(url);
  });
}

/** Fetches a URL and returns the body as a UTF-8 string. */
async function fetchText(url, headers = {}) {
  const buf = await fetchBuffer(url, headers);
  return buf.toString("utf-8");
}

// ---------------------------------------------------------------------------
// CSS parsing
// ---------------------------------------------------------------------------

/**
 * Returns true for @font-face blocks that cover the Latin range.
 * A block is "Latin" if its unicode-range contains U+0000 OR has no unicode-range.
 */
function isLatin(block) {
  const urMatch = block.match(/unicode-range\s*:\s*([^;]+);/i);
  if (!urMatch) return true; // no unicode-range → assume latin
  return urMatch[1].includes("U+0000");
}

/**
 * Extracts a CSS property value from a @font-face block.
 * Strips surrounding quotes and trims whitespace.
 */
function extractProp(block, prop) {
  const re = new RegExp(`${prop}\\s*:\\s*([^;]+);`, "i");
  const m = block.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

/**
 * Parses a CSS string into an array of objects:
 *   { family, weight, style, url }
 *
 * Only Latin blocks are returned.
 * Takes the FIRST Latin block per (family, weight, style) combo.
 */
function parseFontFaces(css) {
  const blockRe = /@font-face\s*\{([^}]+)\}/gi;
  const seen = new Set(); // "family|weight|style"
  const results = [];

  let match;
  while ((match = blockRe.exec(css)) !== null) {
    const block = match[1];

    if (!isLatin(block)) continue;

    const family = extractProp(block, "font-family");
    const weight = extractProp(block, "font-weight") ?? "400";
    const style = extractProp(block, "font-style") ?? "normal";

    const urlMatch = block.match(/url\(([^)]+)\)/i);
    if (!family || !urlMatch) continue;

    const url = urlMatch[1].trim().replace(/^['"]|['"]$/g, "");

    const key = `${family}|${weight}|${style}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ family, weight, style, url });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Filename computation
// ---------------------------------------------------------------------------

function computeFilename(family, weight, style) {
  const slug = family.toLowerCase().replace(/\s+/g, "-");
  const weightStr = weight.replace(/\s+/g, "-");
  const styleChar = style === "italic" ? "i" : "n";
  return `${slug}-${weightStr}-${styleChar}.woff2`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(FONTS_DIR, { recursive: true });

  // 1. Fetch CSS
  console.log("Fetching font CSS from Google Fonts...");
  const css = await fetchText(CSS_URL);
  console.log(`  CSS length: ${css.length} bytes`);

  // 2. Parse @font-face blocks
  const entries = parseFontFaces(css);
  console.log(`  Found ${entries.length} Latin @font-face blocks`);

  // 3. Deduplicate by URL (same woff2 binary shared between descriptors)
  const urlToFile = new Map(); // url → filename (first assigned wins)
  const manifest = [];

  for (const entry of entries) {
    const filename = computeFilename(entry.family, entry.weight, entry.style);

    if (!urlToFile.has(entry.url)) {
      urlToFile.set(entry.url, filename);
    }

    manifest.push({
      family: entry.family,
      weight: entry.weight,
      style: entry.style,
      file: urlToFile.get(entry.url),
    });
  }

  // 4. Download unique files
  const uniqueUrls = [...urlToFile.entries()];
  console.log(`\nDownloading ${uniqueUrls.length} unique woff2 files...`);

  for (const [url, filename] of uniqueUrls) {
    const destPath = path.join(FONTS_DIR, filename);

    if (fs.existsSync(destPath)) {
      const size = fs.statSync(destPath).size;
      console.log(`  [skip]  ${filename}  (${size} bytes)`);
      continue;
    }

    try {
      const buf = await fetchBuffer(url);
      fs.writeFileSync(destPath, buf);
      console.log(`  [ok]    ${filename}  (${buf.length} bytes)`);
    } catch (err) {
      console.error(`  [fail]  ${filename}  — ${err.message}`);
    }
  }

  // 5. Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`\nManifest written to ${MANIFEST_PATH} (${manifest.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

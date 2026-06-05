export type OrigemCandidato =
  | "marcador_explicito"
  | "marcador_divisor"
  | "secao_nomeada"
  | "markdown_heading"
  | "all_caps_isolado"
  | "numero_isolado";

export interface CandidatoCapitulo {
  id: string;
  titulo: string;
  pos: number;
  origem: OrigemCandidato;
  score: number;
  sugerido: boolean;
  preview_antes: string;
  preview_depois: string;
  palavras_no_segmento: number;
  motivo_descartado?: string;
}

// ── Layer regexes ─────────────────────────────────────────────────────────────

// Layer 1: explicit markers — does NOT require blank lines around
const EXPLICIT_MARKER_RE =
  /^(cap[íi]tulo|cap\.|parte)\s+(?:\d+|[ivxlcdm]+|primeiro|segundo|terceiro|quarto|quinto|sexto|sétimo|oitavo|nono|décimo|um|dois|três|quatro|cinco|seis|sete|oito|nove|dez)\b/i;

// Layer 3: named sections — requires blank line before
const SECAO_NOMEADA_RE =
  /^(prefácio|prólogo|epílogo|preâmbulo|introdução geral|introdução|conclusão|apresentação|posfácio|dedicatória|agradecimentos|sobre o autor|nota do autor|nota de edição|nota explicativa)/i;

// ── Helper functions ──────────────────────────────────────────────────────────

function isDividerLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 5 && /^[─━═=—]+$/.test(t);
}

function isAllCapsText(s: string): boolean {
  return (
    s.length >= 2 &&
    s.length <= 100 &&
    /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ]/.test(s) &&
    s === s.toUpperCase()
  );
}

function isNumeroIsolado(s: string): boolean {
  if (!s) return false;
  // Arabic numbers 1–99
  if (/^\d{1,2}\.?$/.test(s)) return true;
  // Roman numerals I–XXXIX (common book chapter range)
  if (
    /^(?:X{0,3})(?:IX|IV|V?I{0,3})\.?$/i.test(s) &&
    s.replace(/\./g, "").trim().length >= 1
  )
    return true;
  return false;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── Main function ─────────────────────────────────────────────────────────────

export function proporCapitulos(texto: string): CandidatoCapitulo[] {
  const normalized = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // Character offset of each line's first character
  const linePositions: number[] = [];
  let offset = 0;
  for (const line of lines) {
    linePositions.push(offset);
    offset += line.length + 1; // +1 for the consumed \n
  }

  const raw: CandidatoCapitulo[] = [];
  let counter = 0;

  function addCandidate(
    lineIdx: number,
    titulo: string,
    origem: OrigemCandidato,
    score: number,
    sugerido: boolean
  ): void {
    const pos = linePositions[lineIdx];
    const preview_antes = normalized
      .slice(Math.max(0, pos - 60), pos)
      .replace(/\n/g, " ")
      .trim();
    const preview_depois = normalized
      .slice(pos, pos + 120)
      .replace(/\n/g, " ")
      .trim();
    raw.push({
      id: `cand-${counter++}`,
      titulo,
      pos,
      origem,
      score,
      sugerido,
      preview_antes,
      preview_depois,
      palavras_no_segmento: 0, // filled in after sort
    });
  }

  // ── Layer 1: Marcadores explícitos (score 0.98) ───────────────────────────
  // Matches CAPÍTULO N, Cap. N, PARTE N — no blank-line requirement.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t && EXPLICIT_MARKER_RE.test(t)) {
      addCandidate(i, t, "marcador_explicito", 0.98, true);
    }
  }

  // ── Layer 2: Marcadores com divisor (score 0.92) ──────────────────────────
  // ALL CAPS line (1–15 words, ≤100 chars) directly between two divider lines.
  for (let i = 1; i < lines.length - 1; i++) {
    const prev = lines[i - 1].trim();
    const curr = lines[i].trim();
    const next = lines[i + 1].trim();
    if (
      isDividerLine(prev) &&
      isDividerLine(next) &&
      isAllCapsText(curr) &&
      curr.split(/\s+/).filter(Boolean).length <= 15
    ) {
      addCandidate(i, curr, "marcador_divisor", 0.92, true);
    }
  }

  // ── Layer 3: Seções nomeadas (score 0.90) ─────────────────────────────────
  // Known section keywords, case-insensitive, preceded by a blank line.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const prevIsBlank = i === 0 || lines[i - 1].trim() === "";
    if (prevIsBlank && t && SECAO_NOMEADA_RE.test(t)) {
      addCandidate(i, t, "secao_nomeada", 0.90, true);
    }
  }

  // ── Layer 4: Markdown headings (score 0.88) ───────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,3})\s+(.+)$/);
    if (m) {
      addCandidate(i, m[2].trim(), "markdown_heading", 0.88, true);
    }
  }

  // ── Layer 5: Número isolado (score 0.55) ──────────────────────────────────
  // Arabic or Roman numeral, blank line before AND after.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const prevIsBlank = i === 0 || lines[i - 1].trim() === "";
    const nextIsBlank = i >= lines.length - 1 || lines[i + 1].trim() === "";
    if (prevIsBlank && nextIsBlank && isNumeroIsolado(t)) {
      addCandidate(i, t, "numero_isolado", 0.55, false);
    }
  }

  // ── Layer 6: ALL CAPS isolado (score 0.40) ────────────────────────────────
  // Fully uppercase line, 1–10 words, 2–80 chars, blank line before AND after.
  // Single-char lines (index section headers): score 0.05.
  // Lines with box-drawing chars (│ etc.): score 0.10.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;

    const prevIsBlank = i === 0 || lines[i - 1].trim() === "";
    const nextIsBlank = i >= lines.length - 1 || lines[i + 1].trim() === "";
    if (!prevIsBlank || !nextIsBlank) continue;

    if (!/[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ]/.test(t)) continue; // must contain at least one letter
    if (t !== t.toUpperCase()) continue;             // must be fully uppercase
    if (t.split(/\s+/).filter(Boolean).length > 10) continue;
    if (t.length > 80) continue;

    // Pure divider lines → already covered by Layer 2 context check
    if (/^[─━═=—\s]+$/.test(t)) continue;

    // Single-char: index section headers — detectable but very low confidence
    if (t.length === 1) {
      addCandidate(i, t, "all_caps_isolado", 0.05, false);
      continue;
    }

    // Box-drawing chars in line → decorative frame, very low confidence
    const hasBoxDrawing = /[│┃╎╏║▌▐]/.test(t);
    addCandidate(
      i,
      t,
      "all_caps_isolado",
      hasBoxDrawing ? 0.10 : 0.40,
      !hasBoxDrawing
    );
  }

  // ── Sort by character position ────────────────────────────────────────────
  raw.sort((a, b) => a.pos - b.pos);

  // ── De-duplication: same pos or within 5 chars → keep higher score ────────
  const deduped: CandidatoCapitulo[] = [];
  for (const c of raw) {
    const nearbyIdx = deduped.findIndex(d => Math.abs(d.pos - c.pos) <= 5);
    if (nearbyIdx >= 0) {
      if (c.score > deduped[nearbyIdx].score) deduped[nearbyIdx] = c;
    } else {
      deduped.push(c);
    }
  }

  // ── palavras_no_segmento ──────────────────────────────────────────────────
  for (let i = 0; i < deduped.length; i++) {
    const start = deduped[i].pos;
    const end =
      i + 1 < deduped.length ? deduped[i + 1].pos : normalized.length;
    deduped[i].palavras_no_segmento = countWords(normalized.slice(start, end));
  }

  // ── Post-processing ───────────────────────────────────────────────────────

  // 1. Dominant pattern: 3+ explicit markers → demote looser layers
  const explicitCount = deduped.filter(
    c => c.origem === "marcador_explicito"
  ).length;
  if (explicitCount >= 3) {
    for (const c of deduped) {
      if (c.origem === "all_caps_isolado" || c.origem === "numero_isolado") {
        c.sugerido = false;
        c.score = round3(c.score * 0.4);
      }
    }
  }

  // 2. Block-letter detection: 4+ single-char candidates in second half →
  //    almost certainly an alphabetical index (e.g. A, D, F, I, M, O, P, R, U)
  const halfPos = normalized.length / 2;
  const blockLetters = deduped.filter(
    c => c.titulo.trim().length === 1 && c.pos > halfPos
  );
  if (blockLetters.length >= 4) {
    for (const c of blockLetters) {
      c.sugerido = false;
      c.score = 0.05;
      c.motivo_descartado = "provavelmente índice remissivo";
    }
  }

  // 3. Content density: segment with fewer than 50 words → unlikely chapter body
  for (const c of deduped) {
    if (c.palavras_no_segmento < 50) {
      c.sugerido = false;
      c.score = round3(c.score * 0.5);
    }
  }

  // Re-assign sequential IDs after dedup + post-processing
  deduped.forEach((c, i) => {
    c.id = `cand-${i}`;
  });

  return deduped;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// lib/parse-chapters.ts
//
// Fonte única de verdade para detecção heurística de capítulos em manuscritos.
// Consolida as 3 versões divergentes que existiam em gerar-audio, gerar-epub,
// ferramentas/epub.
//
// Também exporta helpers usados pelo map-reduce do diagnóstico:
// - chunkLargeChapter: divide capítulos grandes em sub-pedaços de tamanho seguro
// - fragmentarParaDiagnostico: fragmentação completa pronta pra map-reduce
// - hashFragmento: MD5 com prefixo de versão para cache invalidation

import { createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Chapter {
  title: string;
  text: string;
}

/**
 * Um capítulo aprovado pelo autor via /api/agentes/miolo/aprovar-capitulos.
 * `titulo` é a linha exata do texto que serve como cabeçalho.
 * `pos` é a posição em caracteres onde o capítulo começa no texto.
 */
export interface CapituloAprovado {
  titulo: string;
  pos: number;
}

export interface FragmentoDiagnostico {
  idx: number;
  titulo: string;
  texto: string;
  hash: string;
  num_palavras: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PARSE_CHAPTERS_VERSION = "v1";

// Limite seguro de caracteres por fragmento (input do Haiku 4.5).
// 60k chars ≈ 15k tokens. Acima disso, latência sobe e qualidade cai.
const MAX_CHARS_POR_FRAGMENTO = 60_000;

// Tamanho do bloco quando o texto não tem capítulos detectáveis.
const TAMANHO_BLOCO_FALLBACK = 30_000;

// Regex para detectar headings (cap.X, Chapter X, 1. Título, MAIÚSCULAS).
// Versão consolidada — combina o melhor das 3 versões originais.
const CHAPTER_RE = /^(cap[íi]tulo\s+\d+[.:–—\s].*|chapter\s+\d+[.:–—\s].*|\d+\.\s+.{3,60}|[A-ZÁÀÃÂÉÊÍÓÔÕÚ\s]{4,60})$/;

// ─── isChapterHeading ────────────────────────────────────────────────────────

/**
 * Verifica se uma linha é um heading de capítulo, usando a heurística
 * consolidada (regex + MAIÚSCULAS curtas).
 *
 * Útil para callers que precisam dessa decisão mas têm parser próprio
 * (ex: gerar-epub que preserva parágrafos com estrutura específica).
 *
 * A linha deve vir já com `trim()` aplicado.
 */
export function isChapterHeading(line: string): boolean {
  if (!line) return false;
  // Guard: a linha precisa conter pelo menos uma letra alfabética.
  // Sem isso, a segunda condição (line === line.toUpperCase())
  // aceita separadores compostos apenas de símbolos como "cabeçalhos":
  //   "────────────" (U+2500 box drawing)
  //   "═══════════" (U+2550)
  //   "* * * * *"
  //   "12345"
  // Todos passariam porque uppercase de string sem letras é ela mesma.
  // Manuscritos usam separadores desses entre seções — bug clássico.
  if (!/[a-záàãâéêíóôõúçA-ZÁÀÃÂÉÊÍÓÔÕÚÇ]/.test(line)) return false;
  return CHAPTER_RE.test(line) ||
    (line.length < 60 && line === line.toUpperCase() && line.length > 3);
}

// ─── parseChapters ───────────────────────────────────────────────────────────

/**
 * Detecta capítulos em texto bruto via heurística.
 * Não depende de aprovação manual nem de capítulos detectados previamente.
 *
 * Padrões reconhecidos:
 * - "Capítulo X[...]" (PT)
 * - "Chapter X[...]" (EN)
 * - "1. Título do capítulo" (até 60 chars)
 * - Linhas em MAIÚSCULAS com 4-60 chars
 *
 * Se nenhum heading for encontrado, retorna um único capítulo com o livro inteiro.
 */
export function parseChapters(texto: string, bookTitle: string): Chapter[] {
  const lines = texto.replace(/\r\n/g, "\n").split("\n");
  const chapters: Chapter[] = [];
  let current: Chapter = { title: bookTitle, text: "" };

  for (const raw of lines) {
    const line = raw.trim();
    const isHeading = isChapterHeading(line);

    if (isHeading && line) {
      if (current.text.trim()) chapters.push(current);
      current = { title: line, text: "" };
    } else {
      current.text += (current.text ? " " : "") + line;
    }
  }
  if (current.text.trim()) chapters.push(current);
  if (chapters.length === 0) chapters.push({ title: bookTitle, text: texto });
  return chapters;
}

// ─── segmentByCapitulosAprovados ─────────────────────────────────────────────

/**
 * Segmenta o texto em capítulos usando a lista aprovada manualmente pelo
 * autor (via /api/agentes/miolo/aprovar-capitulos).
 *
 * Fonte única de verdade compartilhada com o `miolo` — garante que
 * EPUB, audiolivro e PDF impresso usem exatamente os mesmos capítulos.
 *
 * Semântica dos 3 estados:
 *   - null/undefined → chamador deve retornar 422 antes de chamar aqui
 *   - []             → livro sem capítulos: retorna 1 chapter com o texto todo
 *   - [items]        → segmenta pelas posições
 *
 * Lógica de segmentação idêntica a `lib/miolo-builder.ts` linhas 1085-1098.
 * Normaliza \r\n → \n e recalcula posições no texto normalizado (defensivo
 * contra shifts causados por conversão de line-endings).
 *
 * Remove a primeira linha de cada segmento (que contém o próprio título),
 * para não duplicar o cabeçalho quando o consumidor renderiza `chapter.title`
 * separadamente.
 */
export function segmentByCapitulosAprovados(
  texto: string,
  capitulosAprovados: CapituloAprovado[],
  bookTitle: string,
): Chapter[] {
  const textoNormalizado = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (capitulosAprovados.length === 0) {
    return [{ title: bookTitle, text: textoNormalizado }];
  }

  const capitulosNorm = capitulosAprovados.map(c => {
    const novaPos = textoNormalizado.indexOf(c.titulo);
    return { ...c, pos: novaPos >= 0 ? novaPos : c.pos };
  }).sort((a, b) => a.pos - b.pos);

  const chapters: Chapter[] = [];
  for (let i = 0; i < capitulosNorm.length; i++) {
    const start = capitulosNorm[i].pos;
    const end = i < capitulosNorm.length - 1
      ? capitulosNorm[i + 1].pos
      : textoNormalizado.length;
    let segText = textoNormalizado.slice(start, end).trim();
    const markerEnd = segText.indexOf("\n");
    segText = markerEnd > -1 ? segText.slice(markerEnd).trim() : "";
    chapters.push({ title: capitulosNorm[i].titulo, text: segText });
  }
  return chapters;
}

// ─── chunkLargeChapter ───────────────────────────────────────────────────────

/**
 * Divide um capítulo grande em sub-pedaços de tamanho seguro.
 * Preserva limites de parágrafo (não quebra no meio de uma frase).
 *
 * Se o capítulo já é menor que maxChars, retorna como está.
 */
export function chunkLargeChapter(
  chapter: Chapter,
  maxChars: number = MAX_CHARS_POR_FRAGMENTO
): Chapter[] {
  if (chapter.text.length <= maxChars) return [chapter];

  const sentences = chapter.text.match(/[^.!?]+[.!?]+\s*/g) ?? [chapter.text];
  const chunks: Chapter[] = [];
  let buffer = "";
  let partIdx = 1;

  for (const sentence of sentences) {
    if ((buffer + sentence).length > maxChars && buffer.length > 0) {
      chunks.push({
        title: `${chapter.title} (parte ${partIdx})`,
        text: buffer.trim(),
      });
      buffer = sentence;
      partIdx++;
    } else {
      buffer += sentence;
    }
  }

  if (buffer.trim().length > 0) {
    chunks.push({
      title: chunks.length > 0 ? `${chapter.title} (parte ${partIdx})` : chapter.title,
      text: buffer.trim(),
    });
  }

  return chunks;
}

// ─── fragmentarParaDiagnostico ───────────────────────────────────────────────

/**
 * Função de alto nível usada pelo agente diagnóstico.
 *
 * 1. Tenta `parseChapters` heurístico.
 * 2. Se detectou < 2 capítulos, fallback para blocos fixos.
 * 3. Aplica `chunkLargeChapter` para garantir que todos os fragmentos
 *    estejam abaixo de MAX_CHARS_POR_FRAGMENTO.
 * 4. Calcula hash MD5 (com prefixo de versão) e contagem de palavras
 *    de cada fragmento.
 *
 * Retorno: array pronto pra ser consumido pelo map-reduce.
 */
export function fragmentarParaDiagnostico(texto: string, bookTitle: string): FragmentoDiagnostico[] {
  const capitulosDetectados = parseChapters(texto, bookTitle);

  let chapters: Chapter[];

  if (capitulosDetectados.length < 2) {
    // Fallback: dividir em blocos fixos
    chapters = fragmentarPorTamanho(texto, TAMANHO_BLOCO_FALLBACK, bookTitle);
  } else {
    // Aplicar chunkLargeChapter para garantir tamanho seguro
    chapters = capitulosDetectados.flatMap(c => chunkLargeChapter(c));
  }

  return chapters.map((c, idx) => ({
    idx,
    titulo: c.title,
    texto: c.text,
    hash: hashFragmento(c.text),
    num_palavras: contarPalavras(c.text),
  }));
}

// ─── fragmentarPorTamanho (fallback) ─────────────────────────────────────────

function fragmentarPorTamanho(
  texto: string,
  tamanhoBloco: number,
  bookTitle: string
): Chapter[] {
  if (texto.length <= tamanhoBloco) {
    return [{ title: bookTitle, text: texto }];
  }

  const sentences = texto.match(/[^.!?]+[.!?]+\s*/g) ?? [texto];
  const chunks: Chapter[] = [];
  let buffer = "";
  let blocoIdx = 1;

  for (const sentence of sentences) {
    if ((buffer + sentence).length > tamanhoBloco && buffer.length > 0) {
      chunks.push({
        title: `${bookTitle} — Bloco ${blocoIdx}`,
        text: buffer.trim(),
      });
      buffer = sentence;
      blocoIdx++;
    } else {
      buffer += sentence;
    }
  }

  if (buffer.trim().length > 0) {
    chunks.push({
      title: `${bookTitle} — Bloco ${blocoIdx}`,
      text: buffer.trim(),
    });
  }

  return chunks;
}

// ─── hashFragmento ───────────────────────────────────────────────────────────

/**
 * Hash MD5 do conteúdo do fragmento, com prefixo de versão.
 * Mudar PARSE_CHAPTERS_VERSION invalida todos os caches existentes.
 */
export function hashFragmento(texto: string): string {
  return createHash("md5").update(`${PARSE_CHAPTERS_VERSION}:${texto}`).digest("hex");
}

// ─── contarPalavras ──────────────────────────────────────────────────────────

export function contarPalavras(texto: string): number {
  return texto.trim().split(/\s+/).filter(Boolean).length;
}

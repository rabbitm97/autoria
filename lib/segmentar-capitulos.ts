// lib/segmentar-capitulos.ts
//
// NÚCLEO ÚNICO de segmentação de texto por capítulos aprovados (V47).
// Módulo PURO: zero imports. Precisa continuar assim — é consumido por
// `lib/miolo-builder.ts`, que por sua vez entra em bundles client
// (app/dashboard/miolo, app/preview). Nada de `node:crypto` aqui nem em
// nada que este arquivo importe.
//
// Consumidores: lib/miolo-builder.ts (PDF impresso) e, via reexport em
// lib/parse-chapters.ts, app/api/agentes/gerar-epub.

export interface Chapter {
  title: string;
  text: string;
}

/**
 * Um capítulo aprovado pelo autor via /api/agentes/miolo/aprovar-capitulos.
 * `titulo` é o nome exibido (pode ter sido editado pelo autor).
 * `pos` é a posição em caracteres, no texto normalizado (\r\n → \n),
 * da linha onde o capítulo começa.
 */
export interface CapituloAprovado {
  titulo: string;
  pos: number;
}

/**
 * Segmenta o texto em capítulos usando a lista aprovada pelo autor.
 *
 * Semântica dos 3 estados:
 *   - null/undefined → chamador deve retornar 422 antes de chamar aqui
 *   - []             → livro sem capítulos: retorna 1 chapter com o texto todo
 *   - [items]        → segmenta pelas posições
 *
 * `pos` É A FONTE DA VERDADE. Foi calculado por `proporCapitulos` sobre o
 * texto normalizado e o hash MD5 do texto garante que nada mudou desde a
 * aprovação. NUNCA reprocurar o título no texto (`indexOf`): títulos se
 * repetem (sumário, cabeçalho de página de extração PDF/DOCX) e o autor
 * pode ter renomeado — reprocurar colapsava todos os capítulos na
 * primeira ocorrência (CAPITULOS-POS-1, 25/ago).
 *
 * Defesas baratas: `pos` é alinhado ao início da própria linha e entradas
 * fora do texto são descartadas com aviso.
 *
 * Remove a primeira linha de cada segmento (o cabeçalho original), para
 * não duplicar o título quando o consumidor renderiza `title` à parte.
 */
export function segmentByCapitulosAprovados(
  texto: string,
  capitulosAprovados: CapituloAprovado[],
  bookTitle: string,
): Chapter[] {
  const t = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (capitulosAprovados.length === 0) {
    return [{ title: bookTitle, text: t }];
  }

  const ordenados: CapituloAprovado[] = [];
  for (const c of capitulosAprovados) {
    if (!Number.isFinite(c.pos) || c.pos < 0 || c.pos >= t.length) {
      console.warn("[segmentByCapitulosAprovados] pos fora do texto — descartado", {
        titulo: c.titulo, pos: c.pos, len: t.length,
      });
      continue;
    }
    // Alinha ao início da linha que contém `pos` (no-op quando já está).
    const inicioLinha = t.lastIndexOf("\n", c.pos) + 1;
    ordenados.push({ titulo: c.titulo, pos: inicioLinha });
  }
  ordenados.sort((a, b) => a.pos - b.pos);

  if (ordenados.length === 0) {
    return [{ title: bookTitle, text: t }];
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < ordenados.length; i++) {
    const start = ordenados[i].pos;
    const end = i < ordenados.length - 1 ? ordenados[i + 1].pos : t.length;
    let segText = t.slice(start, end).trim();
    const markerEnd = segText.indexOf("\n");
    segText = markerEnd > -1 ? segText.slice(markerEnd).trim() : "";
    chapters.push({ title: ordenados[i].titulo, text: segText });
  }
  return chapters;
}

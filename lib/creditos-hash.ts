import { createHash } from "crypto";
import type { FormatoLivro } from "./formatos";

export interface CreditosHashInputs {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  paginas: number;
  formato: FormatoLivro;
  ano_copyright: number;
  ano_edicao: number | null;
  isbn: string;
  incluir_ficha: boolean;
  titular_direitos: string;
  nome_editora: string;
}

export function calcularCreditosInputHash(inputs: CreditosHashInputs): string {
  const norm = {
    titulo: inputs.titulo.trim().toLowerCase(),
    subtitulo: inputs.subtitulo.trim().toLowerCase(),
    autor: inputs.autor.trim().toLowerCase(),
    genero: inputs.genero.trim().toLowerCase(),
    paginas: inputs.paginas,
    formato: inputs.formato,
    ano_copyright: inputs.ano_copyright,
    ano_edicao: inputs.ano_edicao,
    isbn: inputs.isbn.trim(),
    incluir_ficha: inputs.incluir_ficha,
    titular_direitos: inputs.titular_direitos.trim().toLowerCase(),
    nome_editora: inputs.nome_editora.trim().toLowerCase(),
  };
  return createHash("md5").update(JSON.stringify(norm)).digest("hex");
}

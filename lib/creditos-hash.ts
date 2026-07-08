import { createHash } from "crypto";
import type { FormatoLivro } from "./formatos";
import type { PropositoPublicacao } from "@/app/api/agentes/creditos/route";

export interface CreditosHashInputs {
  titulo: string;
  subtitulo: string;
  autor: string;
  genero: string;
  paginas: number;
  formato: FormatoLivro;
  proposito: PropositoPublicacao;
  ano_copyright: number;
  ano_edicao: number | null;
  isbn: string;
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
    proposito: inputs.proposito,
    ano_copyright: inputs.ano_copyright,
    ano_edicao: inputs.ano_edicao,
    isbn: inputs.isbn.trim(),
    titular_direitos: inputs.titular_direitos.trim().toLowerCase(),
    nome_editora: inputs.nome_editora.trim().toLowerCase(),
  };
  return createHash("md5").update(JSON.stringify(norm)).digest("hex");
}

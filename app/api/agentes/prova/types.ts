export type ProvaCategoria =
  // Trilha digital
  | "capa"
  | "miolo"
  | "creditos"
  | "pdf_ebook"
  // Trilha impressa
  | "pdf_miolo_grafica"
  | "pdf_capa_grafica"
  | "lombada";

export type ProvaStatus = "ok" | "aviso" | "erro";

export interface ProvaItem {
  id?: string;
  categoria: ProvaCategoria;
  status: ProvaStatus;
  mensagem: string;
  acao?: { label: string; etapa: string };
}

export interface ProvaResult {
  project_id: string;
  digital: {
    aprovado: boolean;
    pendencias: ProvaItem[];
    avisos: ProvaItem[];
  };
  grafica: {
    aprovado: boolean;
    preparado: boolean;
    pendencias: ProvaItem[];
    avisos: ProvaItem[];
  };
  detalhes: {
    formato?: string;
    paginas?: number;
    lombada_capa_mm?: number;
    lombada_miolo_mm?: number;
  };
  analisado_em: string;
}

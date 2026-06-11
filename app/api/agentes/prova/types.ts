export type ProvaCategoria = "capa" | "miolo" | "creditos" | "pdf" | "consistencia" | "capa_grafica";
export type ProvaStatus    = "ok" | "aviso" | "erro";

export interface ProvaItem {
  id?: string;
  categoria: ProvaCategoria;
  status: ProvaStatus;
  mensagem: string;
  /** Sentinel de navegação — usado pelos itens de capa_grafica. */
  etapa?: string | null;
  /** Legado — usado pelos itens pré-Prompt 4A para mostrar botão "Resolver". */
  acao?: { label: string; etapa: string };
}

export interface ProvaResult {
  project_id: string;
  /** Legado: score 0–100 baseado em erros/avisos. */
  score: number;
  /** Legado: erros === 0 && avisos === 0. Mantido para não quebrar a UI atual. */
  aprovado: boolean;
  /** Legado: todos os itens agregados. */
  itens: ProvaItem[];
  /** Trilha digital — capa, miolo, créditos, PDF digital. */
  digital: {
    aprovado: boolean;
    pendencias: ProvaItem[];
    avisos: ProvaItem[];
  };
  /** Trilha gráfica — tudo do digital + PDF da capa para gráfica. */
  grafica: {
    aprovado: boolean;
    preparado: boolean;
    pendencias: ProvaItem[];
    avisos: ProvaItem[];
  };
  detalhes: {
    formato?: string;
    paginas?: number;
  };
  analisado_em: string;
}

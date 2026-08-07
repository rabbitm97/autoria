export const LEGAL_DOCS = {
  "termos-de-uso":        { slug: "termos-de-uso",        titulo: "Termos de Uso",                                     rota: "/termos",                versao: "1.0", vigenciaISO: "[DATA]" },
  "politica-privacidade": { slug: "politica-privacidade", titulo: "Política de Privacidade",                           rota: "/privacidade",           versao: "1.0", vigenciaISO: "[DATA]" },
  "politica-conteudo":    { slug: "politica-conteudo",    titulo: "Política de Conteúdo",                              rota: "/politica-de-conteudo",  versao: "1.0", vigenciaISO: "[DATA]" },
  "contrato-servicos":    { slug: "contrato-servicos",    titulo: "Contrato de Prestação de Serviços Editoriais",     rota: "/contrato-servicos",     versao: "1.0", vigenciaISO: "[DATA]" },
} as const;

export type LegalDocSlug = keyof typeof LEGAL_DOCS;
export const LEGAL_DOC_SLUGS = Object.keys(LEGAL_DOCS) as LegalDocSlug[];

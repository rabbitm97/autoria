/**
 * Fonte única de verdade para os documentos legais renderizados nas rotas
 * `app/(legal)/*`. Toda referência a slug, versão, rota, ou hash de conteúdo
 * DEVE partir daqui — clientes/servidores não podem inventar essas metadatas.
 *
 * Verdade 40 (regra de versionamento): alterar o texto de qualquer documento
 * legal exige bump de `versao`. Aceites antigos NUNCA são migrados/reescritos:
 * eles ficam presos à `versao` e `conteudoHash` vigentes no momento do aceite.
 * O `conteudoHash` é o SHA-256 do arquivo-fonte da página e é verificado por
 * `npm run legal:check` para garantir que qualquer edição de texto force o
 * bump correspondente.
 */

export type LegalDoc = {
  slug: string;
  titulo: string;
  rota: string;
  versao: string;
  vigenciaISO: string;
  conteudoHash: string;
};

export const LEGAL_DOCS = {
  "termos-de-uso": {
    slug: "termos-de-uso",
    titulo: "Termos de Uso",
    rota: "/termos",
    versao: "1.0",
    vigenciaISO: "[DATA]",
    conteudoHash: "d40d6dfcca46a6ce5aa0031c7d9c31c009f0e407c806f7a690f0e51e85c948ac",
  },
  "politica-privacidade": {
    slug: "politica-privacidade",
    titulo: "Política de Privacidade",
    rota: "/privacidade",
    versao: "1.1",
    vigenciaISO: "[DATA]",
    conteudoHash: "d51bf01579a239317e976c330a6e28526f2d48e1563b015791e2f02170ff6880",
  },
  "politica-conteudo": {
    slug: "politica-conteudo",
    titulo: "Política de Conteúdo",
    rota: "/politica-de-conteudo",
    versao: "1.0",
    vigenciaISO: "[DATA]",
    conteudoHash: "08e79e6982264d16003d3908ea9ef2b3c98c77c13570267e334bdee4f30dcfe4",
  },
  "contrato-servicos": {
    slug: "contrato-servicos",
    titulo: "Contrato de Prestação de Serviços Editoriais",
    rota: "/contrato-servicos",
    versao: "1.2",
    vigenciaISO: "[DATA]",
    conteudoHash: "7cf57089e599ec0abc1f091f3a1173df43cdfd3b2fba5c73a973f46a6153c148",
  },
  "declaracao-titularidade": {
    slug: "declaracao-titularidade",
    titulo: "Declaração de Titularidade e Originalidade",
    rota: "/contrato-servicos#anexo-i",
    versao: "1.0",
    vigenciaISO: "[DATA]",
    conteudoHash: "85f9efe75eda32ce90bb65f192986ba0e34173194e074b681178bcbce9be54d5",
  },
} as const satisfies Record<string, LegalDoc>;

export type LegalDocSlug = keyof typeof LEGAL_DOCS;
export const LEGAL_DOC_SLUGS = Object.keys(LEGAL_DOCS) as LegalDocSlug[];

/**
 * Mapa slug → arquivo-fonte usado por `scripts/legal-hash.mjs` para calcular
 * o SHA-256. `declaracao-titularidade` aponta para `_anexo-i.tsx`, o
 * componente que renderiza os 7 itens tanto na página pública (âncora
 * `#anexo-i`) quanto no gate de upload — assim o hash reflete só o texto
 * do Anexo, sem carona nas mudanças de outras cláusulas do contrato.
 */
export const LEGAL_DOC_SOURCES: Record<LegalDocSlug, string> = {
  "termos-de-uso": "app/(legal)/termos/page.tsx",
  "politica-privacidade": "app/(legal)/privacidade/page.tsx",
  "politica-conteudo": "app/(legal)/politica-de-conteudo/page.tsx",
  "contrato-servicos": "app/(legal)/contrato-servicos/page.tsx",
  "declaracao-titularidade": "app/(legal)/contrato-servicos/_anexo-i.tsx",
};

export const LEGAL_ACEITE_CONTEXTOS = [
  "cadastro",
  "upload",
  "checkout",
  "prova",
] as const;
export type LegalAceiteContexto = (typeof LEGAL_ACEITE_CONTEXTOS)[number];

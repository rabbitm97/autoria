// ─────────────────────────────────────────────────────────────────────────────
// lib/project-data.ts — Contrato canônico dos dados do projeto
// ─────────────────────────────────────────────────────────────────────────────
//
// Este módulo é a FONTE ÚNICA de verdade para as formas dos dados que vivem
// nas 10 colunas JSONB de `projects` (diagnostico, dados_revisao,
// dados_elementos, dados_capa, dados_creditos, dados_miolo, dados_pdf,
// dados_pdf_digital, dados_audio, dados_qa).
//
// Antes deste bloco, cada rota `app/api/agentes/*/route.ts` definia um
// `interface XxxResult` local que outros arquivos importavam via caminho de
// rota (`@/app/api/agentes/xxx/route`). Isso funcionava, mas espalhava a
// definição do "shape do banco" por 12 arquivos de handler. Este módulo
// centraliza essas definições, mantendo re-exports nas rotas de origem para
// preservar os ~24 sites de import pré-existentes (zero churn de import).
//
// Além dos tipos, este módulo publica schemas Zod LOOSE (não estritos) para
// cada coluna JSONB e um helper `validarProjectData()` com dois modos:
//   - "estrito":    retorna `{ ok: false, issues }` quando o dado tá torto
//   - "observador": loga o problema em `console.warn` e retorna `{ ok: true }`
//
// IMPORTANTE (BLOCO C4-01): este módulo é infraestrutura pura — nenhum call
// site chama `validarProjectData()` ainda. Ligar em rotas específicas é
// escopo de blocos posteriores.
//
// Regras que os schemas seguem, sem exceção:
//   1. TODOS os schemas são `z.looseObject()` — nunca `.strict()`, nunca
//      `z.strictObject`. Campos desconhecidos passam. O banco tem histórico
//      e migrations em andamento; ser rigoroso quebra dados vivos.
//   2. Campos que o TS trata como `?:` ou `| null` → `.nullish()`.
//   3. Datas ISO → `z.string()` puro. Sem `.datetime()`.
//   4. Números → `z.number()` puro. Sem `.int()`, `.min()`, `.max()`, ranges.
//   5. `null` é sempre válido, em qualquer coluna. O helper trata isso antes
//      de chamar o schema.
//
// Não "melhoramos" tipos aqui: se a rota definia `nome: string` e a coluna
// as vezes tem `null`, o schema reflete o TS (que assume `string`) — corrigir
// isso é responsabilidade da rota, não deste contrato.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import type {
  MioloConfig,
  CapituloInfo,
  FormatoLivro,
  TemplateId,
} from "@/lib/miolo-builder";
import type { AnaliseTecnica } from "@/lib/capa-analyzer";
import type { FragmentoDiagnostico } from "@/lib/parse-chapters";
import type { ProvaResult } from "@/app/api/agentes/prova/types";

// Re-exports para consumidores que já importam daqui.
export type { FormatoLivro, TemplateId, MioloConfig, CapituloInfo };
export type { AnaliseTecnica };
export type { ProvaResult };

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS — cópia exata das definições das rotas de origem.
// ─────────────────────────────────────────────────────────────────────────────

// ── gerar-pdf / gerar-pdf-digital ────────────────────────────────────────────

export interface PdfResult {
  project_id: string;
  formato: FormatoLivro;
  storage_path: string;
  url_download: string;  // signed URL (1h)
  paginas: number;
  gerado_em: string;
}

// ── miolo ────────────────────────────────────────────────────────────────────

export interface MioloResult {
  config: MioloConfig;
  html_storage_path: string;
  capitulos: CapituloInfo[];
  paginas_estimadas: number;
  /**
   * Páginas reais, contadas do PDF.
   * `null` até o `gerar-pdf` rodar. Consumidores devem usar
   * `paginas_reais ?? paginas_estimadas` como fallback honesto.
   */
  paginas_reais: number | null;
  lombada_mm: number;          // estimarLombadaMm — fórmula gráfica BR para papéis lisos (offset 75 g/m², avena 80 g/m² aprox.)
  palavras: number;
  caracteres: number;
  gerado_em: string;
}

// ── creditos ─────────────────────────────────────────────────────────────────

/**
 * Propósito da publicação — determina o que é gerado:
 *  - "digital":  plataformas digitais + distribuição gratuita. Ficha CRB
 *                não é exigida por essas plataformas. Página de créditos
 *                é opcional (controlada por incluir_creditos).
 *  - "completa": publicação em plataformas digitais + livro físico oficial
 *                (livrarias, bibliotecas, editais, prêmios). Exige ficha
 *                oficial CRB (Lei 10.753, Res. CFB 184/2017).
 *
 * Retrocompat: valores legados "pessoal" e "livrarias" são normalizados
 * no handler POST e no restoreConfig do dashboard. Nunca deveriam chegar
 * ao renderer ou ao miolo-builder.
 */
export type PropositoPublicacao = "digital" | "completa";

export interface CreditosConfig {
  formato: FormatoLivro;
  proposito: PropositoPublicacao;

  // Direitos autorais
  ano_copyright: number;
  titular_direitos: string;

  // Tradução (opcional)
  titulo_original?: string;
  idioma_original?: string;

  // Equipe técnica (todos opcionais)
  traducao?: string;
  revisao_tecnica?: string;
  revisao?: string;
  preparacao?: string;
  diagramacao?: string;
  projeto_capa?: string;
  ilustracao_capa?: string;
  producao_editorial?: string;
  outros_creditos?: string;

  // Editora
  nome_editora?: string;
  numero_edicao?: string;
  ano_edicao?: number;
  local_edicao?: string;
  endereco_editora?: string;
  cidade_estado?: string;
  cep?: string;
  site_editora?: string;
  email_editora?: string;

  // ISBN — dado factual, útil em qualquer propósito. Opcional em digital,
  // obrigatório em completa.
  isbn?: string;

  // Bloco 1h: toggle para incluir/excluir a PÁGINA DE CRÉDITOS (verso da
  // folha de rosto). Não afeta half-title, folha de rosto, dedicatória,
  // sumário — apenas o verso.
  //   - digital:  respeita o valor. Se false, verso da folha de rosto
  //               fica em branco (mantém paridade recto/verso).
  //   - completa: sempre true (ignora este campo).
  // Default: true.
  incluir_creditos?: boolean;
}

export interface FichaOficialCRB {
  // Campos elaborados pelo bibliotecário
  numero_chamada: string;
  entrada_autor: string;
  descricao_bibliografica: string;
  notas_gerais?: string;          // opcional: "Inclui bibliografia", etc. (área 7 ISBD)
  assuntos: string;               // texto, uma linha por assunto
  cdd: string;
  cdu: string;

  // Identificação e log de aceite
  bibliotecario_nome: string;
  bibliotecario_crb: string;      // formato: CRB-X/YYYY (ex: CRB-8/12345)
  declaracao_aceita_em: string;   // ISO timestamp
  declaracao_ip: string;
  declaracao_user_agent?: string;
}

export interface CreditosResult {
  config: CreditosConfig;
  ficha_oficial?: FichaOficialCRB;
  /** null quando autor optou por não incluir créditos (só em digital). */
  html_storage_path: string | null;
  input_hash: string;
  paginas_usadas: number;
  paginas_origem: "real" | "estimada";
  gerado_em: string;
}

// ── gerar-capa ───────────────────────────────────────────────────────────────

export type EstiloCapa =
  | "minimalista"
  | "cartoon"
  | "aquarela"
  | "fotorrealista"
  | "abstrato"
  | "vintage"
  | "geometrico";

export interface OpcaoCapa {
  url: string;
  storage_path: string;
}

export interface CapaGeradaResult {
  project_id: string;
  modo: "ia";
  estilo: EstiloCapa;
  cor_predominante: string;
  quarta_capa_texto: string;
  usar_orelhas: boolean;
  orelha_mm: number;
  prompt_usado: string;
  opcoes: OpcaoCapa[];
  url_escolhida: string | null;
  gerado_em: string;
  is_regeneracao: boolean;
  paginas_estimadas: number;
  lombada_mm: number;
}

// ── upload-capa ──────────────────────────────────────────────────────────────

export interface CapaUploadResult {
  project_id: string;
  modo: "upload";
  url: string;
  storage_path: string;
  largura_px: number;
  altura_px: number;
  dpi: number;
  orelha_mm: number;
  lombada_mm_na_validacao: number;
  validacao: CapaValidacao;
  gerado_em: string;
  /**
   * Origem do arquivo enviado pelo autor. Quando o autor sobe um PDF,
   * o cliente converte a primeira página em PNG (usado como `url`) mas
   * preserva o PDF cru em `pdf_original_path`. `origem_arquivo` reflete
   * o tipo original — usado nas recomendações para pular avisos que só
   * fazem sentido para imagem (ex: DPI, já que PDF é vetorial).
   */
  origem_arquivo: "pdf" | "png" | "jpg";
  /** Path no bucket `capas` do PDF original quando `origem_arquivo === "pdf"`. */
  pdf_original_path: string | null;
  /**
   * Nome do arquivo original enviado pelo autor (antes de qualquer conversão
   * PDF→PNG feita no cliente). Usado no preview para o autor reconhecer
   * seu próprio arquivo. Fallback para "capa" quando não fornecido.
   */
  filename_original: string | null;
  /**
   * Motivo pelo qual o PDF original NÃO foi preservado, quando aplicável.
   * `null` significa "sucesso" ou "não era PDF". Preenchido pelo frontend
   * quando o upload paralelo falha, permitindo rastreamento sem quebrar
   * o fluxo principal.
   */
  pdf_original_error: string | null;
  /**
   * URL assinada da imagem já com marcas de corte removidas (Config A → B).
   * Populada quando o autor sobe PDF com BleedBox declarado e o trim rodou
   * com sucesso. `null` para Config B/C, uploads não-PDF, ou falha no trim.
   * Consumidores (EPUB, Prova 3D, extractor de frente) devem preferir esta
   * URL sobre `url`. Ver `lib/capa-trim-marcas.ts`.
   */
  url_area_util: string | null;
  /** Path no bucket `capas` da imagem trimada. `null` quando `url_area_util` é null. */
  storage_path_area_util: string | null;
  /** Dimensões físicas da área útil (BleedBox equivalente) em mm. `null` quando não houve trim. */
  area_util_mm: { largura: number; altura: number } | null;
  /**
   * `true` quando o upload é uma capa em formato eBook — só a frente do
   * livro, sem lombada nem contracapa. Detectado por comparação direta
   * das dimensões contra `formato.width_mm × formato.height_mm` (com ou
   * sem sangria de 3mm), independentemente da análise técnica ter rodado.
   *
   * Propagado pelo `capa-resolver` como `is_panoramica: !is_frente_pura`.
   * Consumidores devem preferir esse campo canônico sobre o `is_frente_pura`
   * do analyzer (que é fallback pra casos legacy).
   */
  is_frente_pura: boolean;
}

export interface CapaValidacao {
  ok: boolean;
  largura_esperada_mm: number;
  altura_esperada_mm: number;
  largura_recebida_mm: number;
  altura_recebida_mm: number;
  tolerancia_mm: number;
  detalhes: string[];
}

// ── gerar-epub ───────────────────────────────────────────────────────────────

export interface EpubResult {
  project_id: string;
  storage_path: string;
  url_download: string;   // signed URL (1h)
  capitulos: number;
  gerado_em: string;
}

// ── gerar-audio ──────────────────────────────────────────────────────────────

export interface CapituloAudio {
  index: number;
  titulo: string;
  storage_path: string;
  url: string;          // signed URL, 1h
  caracteres: number;
  gerado_em: string;
}

export interface AudioResult {
  project_id: string;
  capitulos: CapituloAudio[];
}

// ── revisao ──────────────────────────────────────────────────────────────────

export interface SugestaoRevisao {
  id: string;
  tipo: "ortografia" | "gramatica" | "coesao" | "consistencia" | "ritmo";
  severidade: "critico" | "recomendado" | "opcional";
  localizacao: {
    capitulo: number;
    paragrafo: number;
    linha_aproximada: number;
  };
  trecho_original: string;
  sugestao: string;
  explicacao: string;
  referencia_norma: string;
}

export interface RevisaoResult {
  sugestoes: SugestaoRevisao[];
  revisado_em: string;
  aceitas?: string[];
  rejeitadas?: string[];
  finalizado_em?: string;
}

export interface RevisaoProcessingState {
  status: "processing";
  batch_id: string;
  total_chunks: number;
  iniciado_em: string;
}

// ── diagnostico ──────────────────────────────────────────────────────────────

export interface FormatoSugerido {
  formato: FormatoLivro | null;
  label: string;
  paginas_estimadas: number;
  lombada_mm: number;
  motivo: string;
  aviso?: string;
  cascata: Array<{ formato: FormatoLivro; paginas: number; lombada_mm: number }>;
}

export interface CanaisRecomendados {
  ebook: { recomendado: boolean; plataformas: string[]; descricao: string };
  fisico: { recomendado: boolean; descricao: string };
  audiolivro: { recomendado: boolean; duracao_estimada_horas: number; descricao: string };
}

export interface FaixaPrecoDetalhada {
  ebook: string;
  fisico: string;
  audiolivro: string;
}

export interface DiagnosticoResult {
  genero_provavel: string;
  confianca_genero: number;
  num_capitulos: number;
  num_palavras: number;
  paginas_estimadas: number;
  complexidade: "simples" | "médio" | "complexo";
  complexidade_flesch: number;
  tom_narrativo: string;
  pontos_fortes: string[];
  pontos_melhorar: string[];
  mercado_alvo: string;
  tamanho_mercado: "nicho" | "adequado" | "amplo";
  potencial_comercial: "baixo" | "médio" | "alto";
  faixa_preco_sugerida: string;
  comparaveis_mercado: string[];
  formato_sugerido: FormatoSugerido;
  tempo_leitura_horas: number;
  canais_recomendados: CanaisRecomendados;
  faixa_preco_detalhada: FaixaPrecoDetalhada;
  proximos_passos: string[];
}

/**
 * Item do `fragmentos_cache` em DiagnosticoState. A rota `diagnostico/route.ts`
 * define localmente um `FragmentoAnalisado` com este mesmo shape — o casamento
 * é estrutural (TS não exige nomes iguais). Não exporte esta interface para
 * fora daqui: a rota é o "dono" do tipo de trabalho interno; este arquivo só
 * a modela para poder tipar `DiagnosticoState.fragmentos_cache`.
 */
interface FragmentoAnalisadoInterno {
  hash: string;
  idx: number;
  titulo: string;
  num_palavras: number;
  num_caracteres: number;
  genero_local: string;
  tom_local: string;
  flesch_local: number;
  observacoes: string[];
  trecho_representativo: string;
  erro?: string;
}

export interface DiagnosticoState {
  status: "processando_capitulos" | "consolidando" | "concluido" | "erro";
  progresso: { atual: number; total: number };
  iniciado_em: string;
  concluido_em?: string;
  erro_mensagem?: string;
  fragmentos_cache: FragmentoAnalisadoInterno[];
  // Quando status === "concluido", o resultado final fica em "resultado"
  resultado?: DiagnosticoResult;
  // Efêmero: existe apenas durante o processamento, removido na consolidação
  _fragmentos_pendentes?: FragmentoDiagnostico[];
}

// ── elementos-editoriais ─────────────────────────────────────────────────────

export interface ElementosEditoriais {
  sinopse_curta: string;
  sinopse_longa: string;
  palavras_chave: string[];
  ficha_catalografica: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// União discriminada de `dados_capa` (NOVA em C4-01).
// ─────────────────────────────────────────────────────────────────────────────
//
// `dados_capa` no banco pode assumir 4 formas, escritas por rotas diferentes:
//   - "editor":  `cover-editor/confirm/route.ts` mescla um cover existente
//                (ia ou upload) com `source: "editor"`, `imagem_url`,
//                `confirmed_at`. Preserva o `modo` original — por isso a
//                discriminação por `source` vem PRIMEIRO na união.
//   - "ia":      `gerar-capa/route.ts` grava `CapaGeradaResult` (modo="ia").
//   - "upload":  `upload-capa/route.ts`  grava `CapaUploadResult`  (modo="upload").
//   - "skip":    autor optou por pular a capa. Só o campo `modo: "skip"`.
//
// Extensões (`DadosCapaExtensoes`) são adicionadas por processos posteriores
// (análise técnica, sinal de qualidade) — todas OPCIONAIS: um dado_capa recém
// gravado pela rota original é válido sem elas.

export interface DadosCapaExtensoes {
  /** Preenchido pela rota `/api/projects/[id]/capa/analisar` (14.M.1). */
  analise_tecnica?: AnaliseTecnica;
  /** URL exportada pelo editor (2D → PNG). */
  imagem_url?: string | null;
  /** Timestamp ISO do último confirm do editor. */
  confirmed_at?: string;
}

export interface DadosCapaEditor extends DadosCapaExtensoes {
  source: "editor";
  /** Editor herda a forma anterior; `modo` pode ser "ia" ou "upload". */
  modo?: "ia" | "upload";
  /** URL da capa final exportada pelo editor. */
  imagem_url: string | null;
  confirmed_at: string;
  /**
   * FONTE canônica da orelha (decisão d, chat C.4 14/jul/2026):
   * `dados_capa.orelha_mm` no ROOT, para os 3 pipelines.
   * No editor, `editor_data.orelhaMm` é o RASCUNHO durante a edição;
   * o confirm espelha o valor pro root. IA e upload já gravam no root.
   * Leitura continua EXCLUSIVA via lib/capa-resolver.ts (verdade #18) —
   * os fallbacks legados do resolver permanecem.
   */
  orelha_mm?: number | null;
}

export type DadosCapaIa     = CapaGeradaResult   & DadosCapaExtensoes;
export type DadosCapaUpload = CapaUploadResult   & DadosCapaExtensoes;
export interface DadosCapaSkip extends DadosCapaExtensoes {
  modo: "skip";
}

/**
 * Nota (decisão d, chat C.4 14/jul/2026): `dados_capa.orelha_mm` no ROOT
 * é a FONTE canônica da orelha nos 3 pipelines; no editor, o rascunho
 * (`editor_data.orelhaMm`) é espelhado no root pelo confirm.
 */
export type DadosCapa =
  | DadosCapaEditor
  | DadosCapaIa
  | DadosCapaUpload
  | DadosCapaSkip;

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS ZOD (loose, nullish para opcionais). Um por coluna JSONB.
// ─────────────────────────────────────────────────────────────────────────────

const capituloInfoSchema = z.looseObject({
  id: z.string(),
  titulo: z.string(),
  palavras: z.number(),
  caracteres: z.number(),
});

const mioloConfigSchema = z.looseObject({
  template: z.string(),
  formato: z.string(),
  corpo_pt: z.number().nullish(),
  tem_capitulos: z.boolean().nullish(),
  proposito: z.string().nullish(),
  sumario: z.boolean(),
  dedicatoria: z.string(),
  epigrafe_texto: z.string(),
  epigrafe_autor: z.string(),
  bio_autor: z.string(),
});

const creditosConfigSchema = z.looseObject({
  formato: z.string(),
  proposito: z.string(),
  ano_copyright: z.number(),
  titular_direitos: z.string(),
  titulo_original: z.string().nullish(),
  idioma_original: z.string().nullish(),
  traducao: z.string().nullish(),
  revisao_tecnica: z.string().nullish(),
  revisao: z.string().nullish(),
  preparacao: z.string().nullish(),
  diagramacao: z.string().nullish(),
  projeto_capa: z.string().nullish(),
  ilustracao_capa: z.string().nullish(),
  producao_editorial: z.string().nullish(),
  outros_creditos: z.string().nullish(),
  nome_editora: z.string().nullish(),
  numero_edicao: z.string().nullish(),
  ano_edicao: z.number().nullish(),
  local_edicao: z.string().nullish(),
  endereco_editora: z.string().nullish(),
  cidade_estado: z.string().nullish(),
  cep: z.string().nullish(),
  site_editora: z.string().nullish(),
  email_editora: z.string().nullish(),
  isbn: z.string().nullish(),
  incluir_creditos: z.boolean().nullish(),
});

const fichaOficialCrbSchema = z.looseObject({
  numero_chamada: z.string(),
  entrada_autor: z.string(),
  descricao_bibliografica: z.string(),
  notas_gerais: z.string().nullish(),
  assuntos: z.string(),
  cdd: z.string(),
  cdu: z.string(),
  bibliotecario_nome: z.string(),
  bibliotecario_crb: z.string(),
  declaracao_aceita_em: z.string(),
  declaracao_ip: z.string(),
  declaracao_user_agent: z.string().nullish(),
});

const opcaoCapaSchema = z.looseObject({
  url: z.string(),
  storage_path: z.string(),
});

const capaValidacaoSchema = z.looseObject({
  ok: z.boolean(),
  largura_esperada_mm: z.number(),
  altura_esperada_mm: z.number(),
  largura_recebida_mm: z.number(),
  altura_recebida_mm: z.number(),
  tolerancia_mm: z.number(),
  detalhes: z.array(z.string()),
});

// AnaliseTecnica é grande e evolutiva — mantemos loose sem descer nos campos.
const analiseTecnicaSchema = z.looseObject({});

const dadosCapaExtensoesFields = {
  analise_tecnica: analiseTecnicaSchema.nullish(),
  imagem_url: z.string().nullish(),
  confirmed_at: z.string().nullish(),
};

const dadosCapaEditorSchema = z.looseObject({
  source: z.literal("editor"),
  modo: z.string().nullish(),
  analise_tecnica: analiseTecnicaSchema.nullish(),
  imagem_url: z.string().nullable(),
  confirmed_at: z.string(),
  // Decisão d (C.4): root canônico da orelha. Espelhado pelo confirm.
  orelha_mm: z.number().nullish(),
});

const dadosCapaIaSchema = z.looseObject({
  project_id: z.string(),
  modo: z.literal("ia"),
  estilo: z.string(),
  cor_predominante: z.string(),
  quarta_capa_texto: z.string(),
  usar_orelhas: z.boolean(),
  orelha_mm: z.number(),
  prompt_usado: z.string(),
  opcoes: z.array(opcaoCapaSchema),
  url_escolhida: z.string().nullable(),
  gerado_em: z.string(),
  is_regeneracao: z.boolean(),
  paginas_estimadas: z.number(),
  lombada_mm: z.number(),
  ...dadosCapaExtensoesFields,
});

const dadosCapaUploadSchema = z.looseObject({
  project_id: z.string(),
  modo: z.literal("upload"),
  url: z.string(),
  storage_path: z.string(),
  largura_px: z.number(),
  altura_px: z.number(),
  dpi: z.number(),
  orelha_mm: z.number(),
  lombada_mm_na_validacao: z.number(),
  validacao: capaValidacaoSchema,
  gerado_em: z.string(),
  origem_arquivo: z.string(),
  pdf_original_path: z.string().nullable(),
  filename_original: z.string().nullable(),
  pdf_original_error: z.string().nullable(),
  url_area_util: z.string().nullable(),
  storage_path_area_util: z.string().nullable(),
  area_util_mm: z.looseObject({
    largura: z.number(),
    altura: z.number(),
  }).nullable(),
  is_frente_pura: z.boolean(),
  ...dadosCapaExtensoesFields,
});

const dadosCapaSkipSchema = z.looseObject({
  modo: z.literal("skip"),
  ...dadosCapaExtensoesFields,
});

// A ordem importa: editor tem `source: "editor"` (independente do modo);
// só depois de descartar editor discriminamos por modo.
const dadosCapaSchema = z.union([
  dadosCapaEditorSchema,
  dadosCapaIaSchema,
  dadosCapaUploadSchema,
  dadosCapaSkipSchema,
]);

// ── diagnostico (DiagnosticoState) ───────────────────────────────────────────

const formatoSugeridoSchema = z.looseObject({
  formato: z.string().nullable(),
  label: z.string(),
  paginas_estimadas: z.number(),
  lombada_mm: z.number(),
  motivo: z.string(),
  aviso: z.string().nullish(),
  cascata: z.array(z.looseObject({
    formato: z.string(),
    paginas: z.number(),
    lombada_mm: z.number(),
  })),
});

const canaisRecomendadosSchema = z.looseObject({
  ebook: z.looseObject({
    recomendado: z.boolean(),
    plataformas: z.array(z.string()),
    descricao: z.string(),
  }),
  fisico: z.looseObject({
    recomendado: z.boolean(),
    descricao: z.string(),
  }),
  audiolivro: z.looseObject({
    recomendado: z.boolean(),
    duracao_estimada_horas: z.number(),
    descricao: z.string(),
  }),
});

const faixaPrecoDetalhadaSchema = z.looseObject({
  ebook: z.string(),
  fisico: z.string(),
  audiolivro: z.string(),
});

const diagnosticoResultSchema = z.looseObject({
  genero_provavel: z.string(),
  confianca_genero: z.number(),
  num_capitulos: z.number(),
  num_palavras: z.number(),
  paginas_estimadas: z.number(),
  complexidade: z.string(),
  complexidade_flesch: z.number(),
  tom_narrativo: z.string(),
  pontos_fortes: z.array(z.string()),
  pontos_melhorar: z.array(z.string()),
  mercado_alvo: z.string(),
  tamanho_mercado: z.string(),
  potencial_comercial: z.string(),
  faixa_preco_sugerida: z.string(),
  comparaveis_mercado: z.array(z.string()),
  formato_sugerido: formatoSugeridoSchema,
  tempo_leitura_horas: z.number(),
  canais_recomendados: canaisRecomendadosSchema,
  faixa_preco_detalhada: faixaPrecoDetalhadaSchema,
  proximos_passos: z.array(z.string()),
});

const fragmentoAnalisadoSchema = z.looseObject({
  hash: z.string(),
  idx: z.number(),
  titulo: z.string(),
  num_palavras: z.number(),
  num_caracteres: z.number(),
  genero_local: z.string(),
  tom_local: z.string(),
  flesch_local: z.number(),
  observacoes: z.array(z.string()),
  trecho_representativo: z.string(),
  erro: z.string().nullish(),
});

const fragmentoDiagnosticoSchema = z.looseObject({
  idx: z.number(),
  titulo: z.string(),
  texto: z.string(),
  hash: z.string(),
  num_palavras: z.number(),
});

const diagnosticoSchema = z.looseObject({
  status: z.string(),
  progresso: z.looseObject({
    atual: z.number(),
    total: z.number(),
  }),
  iniciado_em: z.string(),
  concluido_em: z.string().nullish(),
  erro_mensagem: z.string().nullish(),
  fragmentos_cache: z.array(fragmentoAnalisadoSchema),
  resultado: diagnosticoResultSchema.nullish(),
  _fragmentos_pendentes: z.array(fragmentoDiagnosticoSchema).nullish(),
});

// ── revisao ──────────────────────────────────────────────────────────────────

const sugestaoRevisaoSchema = z.looseObject({
  id: z.string(),
  tipo: z.string(),
  severidade: z.string(),
  localizacao: z.looseObject({
    capitulo: z.number(),
    paragrafo: z.number(),
    linha_aproximada: z.number(),
  }),
  trecho_original: z.string(),
  sugestao: z.string(),
  explicacao: z.string(),
  referencia_norma: z.string(),
});

const revisaoResultSchema = z.looseObject({
  sugestoes: z.array(sugestaoRevisaoSchema),
  revisado_em: z.string(),
  aceitas: z.array(z.string()).nullish(),
  rejeitadas: z.array(z.string()).nullish(),
  finalizado_em: z.string().nullish(),
});

const revisaoProcessingStateSchema = z.looseObject({
  status: z.literal("processing"),
  batch_id: z.string(),
  total_chunks: z.number(),
  iniciado_em: z.string(),
});

// dados_revisao aceita as duas formas — o handler chaveia por presença de
// `status: "processing"`. União com `looseObject` cobre bem esse toggling.
const dadosRevisaoSchema = z.union([
  revisaoProcessingStateSchema,
  revisaoResultSchema,
]);

// ── elementos-editoriais ─────────────────────────────────────────────────────

const elementosEditoriaisSchema = z.looseObject({
  sinopse_curta: z.string(),
  sinopse_longa: z.string(),
  palavras_chave: z.array(z.string()),
  ficha_catalografica: z.string(),
});

// ── creditos ─────────────────────────────────────────────────────────────────

const creditosResultSchema = z.looseObject({
  config: creditosConfigSchema,
  ficha_oficial: fichaOficialCrbSchema.nullish(),
  html_storage_path: z.string().nullable(),
  input_hash: z.string(),
  paginas_usadas: z.number(),
  paginas_origem: z.string(),
  gerado_em: z.string(),
});

// ── miolo ────────────────────────────────────────────────────────────────────

/**
 * `dados_miolo` tem estados PARCIAIS legais além do `MioloResult` completo:
 *  - `preview/config/route.ts` faz `{ ...(dados_miolo ?? {}), config }` — quando
 *    o autor ajusta uma opção de config no preview antes de existir um miolo,
 *    persiste `{ config }` sozinho.
 *  - Blocos futuros (C4-05) vão anular derivados em trocas de formato.
 *
 * Por isso TODOS os campos são `.nullish()` no SCHEMA. O tipo TS `MioloResult`
 * NÃO muda — só o schema é permissivo em presença; ainda garante TIPO e
 * ESTRUTURA de cada campo presente (número onde é número, array onde é array,
 * shape do `config`).
 */
const mioloResultSchema = z.looseObject({
  config: mioloConfigSchema.nullish(),
  html_storage_path: z.string().nullish(),
  capitulos: z.array(capituloInfoSchema).nullish(),
  paginas_estimadas: z.number().nullish(),
  paginas_reais: z.number().nullish(),
  lombada_mm: z.number().nullish(),
  palavras: z.number().nullish(),
  caracteres: z.number().nullish(),
  gerado_em: z.string().nullish(),
});

// ── pdf / pdf-digital ────────────────────────────────────────────────────────

const pdfResultSchema = z.looseObject({
  project_id: z.string(),
  formato: z.string(),
  storage_path: z.string(),
  url_download: z.string(),
  paginas: z.number(),
  gerado_em: z.string(),
});

const epubResultSchema = z.looseObject({
  project_id: z.string(),
  storage_path: z.string(),
  url_download: z.string(),
  capitulos: z.number(),
  gerado_em: z.string(),
});

/**
 * `dados_pdf` tem DOIS estados legais:
 *  (a) `PdfResult` completo do `gerar-pdf`, opcionalmente com `epub`
 *      (o `gerar-epub` mergeia o resultado do EPUB dentro desta coluna).
 *  (b) `{ epub }` sozinho — quando o EPUB é gerado enquanto `dados_pdf`
 *      está null (o `miolo/route.ts` zera `dados_pdf` ao regerar o miolo;
 *      um EPUB gerado nessa janela cai em `{ ...null, epub }` → `{ epub }`).
 */
const dadosPdfSchema = z.union([
  pdfResultSchema.extend({ epub: epubResultSchema.nullish() }),  // (a)
  z.looseObject({ epub: epubResultSchema }),                      // (b)
]);

// ── audio ────────────────────────────────────────────────────────────────────

const capituloAudioSchema = z.looseObject({
  index: z.number(),
  titulo: z.string(),
  storage_path: z.string(),
  url: z.string(),
  caracteres: z.number(),
  gerado_em: z.string(),
});

const audioResultSchema = z.looseObject({
  project_id: z.string(),
  capitulos: z.array(capituloAudioSchema),
});

// ── qa (ProvaResult) ─────────────────────────────────────────────────────────

const provaItemSchema = z.looseObject({
  id: z.string().nullish(),
  categoria: z.string(),
  status: z.string(),
  mensagem: z.string(),
  acao: z.looseObject({
    label: z.string(),
    etapa: z.string(),
  }).nullish(),
});

const provaResultSchema = z.looseObject({
  project_id: z.string(),
  digital: z.looseObject({
    aprovado: z.boolean(),
    pendencias: z.array(provaItemSchema),
    avisos: z.array(provaItemSchema),
  }),
  grafica: z.looseObject({
    aprovado: z.boolean(),
    preparado: z.boolean(),
    pendencias: z.array(provaItemSchema),
    avisos: z.array(provaItemSchema),
  }),
  detalhes: z.looseObject({
    formato: z.string().nullish(),
    paginas: z.number().nullish(),
    lombada_capa_mm: z.number().nullish(),
    lombada_miolo_mm: z.number().nullish(),
  }),
  analisado_em: z.string(),
});

// ─────────────────────────────────────────────────────────────────────────────
// MAPA COLUNA → SCHEMA.
// ─────────────────────────────────────────────────────────────────────────────

export const PROJECT_DATA_SCHEMAS = {
  diagnostico:      diagnosticoSchema,
  dados_revisao:    dadosRevisaoSchema,
  dados_elementos:  elementosEditoriaisSchema,
  dados_capa:       dadosCapaSchema,
  dados_creditos:   creditosResultSchema,
  dados_miolo:      mioloResultSchema,
  dados_pdf:        dadosPdfSchema,
  dados_pdf_digital: pdfResultSchema,
  dados_audio:      audioResultSchema,
  dados_qa:         provaResultSchema,
} as const;

export type ProjectJsonbColumn = keyof typeof PROJECT_DATA_SCHEMAS;

// ─────────────────────────────────────────────────────────────────────────────
// validarProjectData — helper único, dois modos.
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidacaoResult {
  ok: boolean;
  issues: string[];
}

const MAX_ISSUES = 10;

/**
 * Valida o valor de uma coluna JSONB contra o schema canônico dessa coluna.
 *
 *  - `null` é sempre válido (a coluna aceita null por design).
 *  - "estrito":    retorna `{ ok: false, issues }` no primeiro shape torto.
 *  - "observador": loga `console.warn` com as issues e retorna `{ ok: true }`.
 *                  Modo padrão de rollout — permite instrumentar produção sem
 *                  quebrar nada.
 *
 * As issues são formatadas como "campo.aninhado: mensagem" (path humano
 * legível). Máx. 10 mostradas, resto colapsa em "+N issues".
 */
export function validarProjectData(
  coluna: ProjectJsonbColumn,
  valor: unknown,
  opts: { modo?: "estrito" | "observador"; contexto?: string } = {},
): ValidacaoResult {
  const modo = opts.modo ?? "estrito";
  if (valor === null || valor === undefined) {
    return { ok: true, issues: [] };
  }

  const schema = PROJECT_DATA_SCHEMAS[coluna];
  const result = schema.safeParse(valor);
  if (result.success) {
    return { ok: true, issues: [] };
  }

  const all = result.error.issues.map((iss) => {
    const path = iss.path.map(String).join(".");
    return path.length > 0 ? `${path}: ${iss.message}` : iss.message;
  });
  const shown = all.slice(0, MAX_ISSUES);
  if (all.length > MAX_ISSUES) {
    shown.push(`+${all.length - MAX_ISSUES} issues`);
  }

  if (modo === "observador") {
    const ctx = opts.contexto ? ` [${opts.contexto}]` : "";
    console.warn(`[validarProjectData observador] ${coluna}${ctx}:`, shown);
    return { ok: true, issues: shown };
  }

  return { ok: false, issues: shown };
}

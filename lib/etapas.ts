/**
 * Fonte única de verdade para a esteira de etapas do projeto no dashboard.
 *
 * Motivação (BLOCO-02-C-FIX-5): as rotas de API que geram artefatos
 * (gerar-pdf, miolo, montar-capa) sobrescrevem `projects.etapa_atual`
 * regressivamente para "diagramacao" mesmo depois do autor ter avançado
 * para prova/publicação. Em vez de mexer nessas rotas (grande superfície),
 * o dashboard passa a *derivar* a etapa exibida a partir de dois marcos
 * fixos já persistidos:
 *   - `qa_aprovado_em`  → prova aprovada, exibe Publicação
 *   - `dados_miolo.paginas_reais > 0` → passou da diagramação, exibe Prova
 *
 * Nada disso é campo novo no banco: `qa_aprovado_em` já é setado por
 * `app/dashboard/prova/[id]/page.tsx:877` e `dados_miolo.paginas_reais` já
 * é lido em 6 outros lugares da base (shape estável).
 */

// ─── Ordem canônica ──────────────────────────────────────────────────────

export const STEPS = [
  { key: "diagnostico", label: "Diagnóstico", href: (id: string) => `/dashboard/diagnostico/${id}` },
  { key: "revisao",     label: "Revisão",     href: (id: string) => `/dashboard/revisao/${id}` },
  { key: "elementos",   label: "Elementos",   href: (id: string) => `/dashboard/elementos/${id}` },
  { key: "capa",        label: "Capa",        href: (id: string) => `/dashboard/capa/${id}` },
  { key: "creditos",    label: "Créditos",    href: (id: string) => `/dashboard/creditos/${id}` },
  { key: "diagramacao", label: "Diagramação", href: (id: string) => `/dashboard/miolo/${id}` },
  { key: "qa",          label: "Prova",       href: (id: string) => `/dashboard/prova/${id}` },
  { key: "publicacao",  label: "Publicação",  href: (id: string) => `/dashboard/publicacao/${id}` },
] as const;

// ─── ETAPA_HREF (deriva de STEPS + aliases) ──────────────────────────────
// Aliases mapeiam valores possíveis de `etapa_atual` no banco que não
// aparecem em STEPS (por serem estados de transição ou finais):
//   upload    → estado inicial antes do diagnóstico
//   preview   → autor terminou miolo, próximo destino é prova
//   publicado → estado terminal, mantém autor na publicação

export const ETAPA_HREF: Record<string, (id: string) => string> = {
  upload:      (id) => `/dashboard/diagnostico/${id}`,
  diagnostico: (id) => `/dashboard/diagnostico/${id}`,
  revisao:     (id) => `/dashboard/revisao/${id}`,
  elementos:   (id) => `/dashboard/elementos/${id}`,
  capa:        (id) => `/dashboard/capa/${id}`,
  creditos:    (id) => `/dashboard/creditos/${id}`,
  diagramacao: (id) => `/dashboard/miolo/${id}`,
  preview:     (id) => `/dashboard/prova/${id}`,
  qa:          (id) => `/dashboard/prova/${id}`,
  publicacao:  (id) => `/dashboard/publicacao/${id}`,
  publicado:   (id) => `/dashboard/publicacao/${id}`,
};

// ─── Step index para exibição visual do progresso ─────────────────────────

const ETAPA_STEP_ALIAS: Record<string, string> = {
  preview: "qa",
  publicado: "publicacao",
};

export function getStepIndex(etapa: string): number {
  const key = ETAPA_STEP_ALIAS[etapa] ?? etapa;
  const idx = STEPS.findIndex((s) => s.key === key);
  return idx >= 0 ? idx : 0;
}

// ─── Derivação da etapa exibida ──────────────────────────────────────────
// Shape mínimo — o consumidor não precisa passar o projeto inteiro,
// só os campos consultados. Coeso com o resto da base (padrão de 6 outros
// arquivos que fazem `as { paginas_reais?: number } | null`).

export interface ProjetoParaDerivacao {
  etapa_atual: string;
  qa_aprovado_em: string | null;
  dados_miolo: { paginas_reais?: number } | null;
}

/**
 * Retorna a etapa que o dashboard deve exibir, respeitando o marco máximo
 * de progresso do autor:
 *   - `qa_aprovado_em` presente → autor aprovou a prova, exibe Publicação
 *   - miolo já foi gerado (paginas_reais > 0) e prova ainda não aprovada
 *     → exibe Prova (não Diagramação, mesmo que uma rota de API tenha
 *     regredido `etapa_atual`)
 *   - caso contrário → usa `etapa_atual` do banco (fluxo normal antes da
 *     diagramação; escopo intencional deste fix conforme decisão de
 *     produto de 2026-07-13)
 */
export function derivarEtapaExibida(projeto: ProjetoParaDerivacao): string {
  if (projeto.qa_aprovado_em) return "publicacao";
  const paginas = projeto.dados_miolo?.paginas_reais ?? 0;
  if (paginas > 0) return "qa";
  return projeto.etapa_atual;
}

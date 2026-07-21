// Fonte única de verdade do vocabulário e preços de planos (Bloco D.2).
// Vocabulário espelha a constraint de 20260716000000_bloco_d2_plano.sql.
// NUNCA duplicar estes valores em telas ou rotas — importar daqui.

export const PLANOS = ["freemium", "essencial", "pro"] as const;
export type Plano = (typeof PLANOS)[number];

/** Ordem de precedência para gates (D2-02): maior inclui menor. */
export const PLANO_RANK: Record<Plano, number> = {
  freemium: 0,
  essencial: 1,
  pro: 2,
};

/** Preços em CENTAVOS (padrão do projeto: nunca float de dinheiro). */
export const PLANO_PRECO_CENTAVOS: Record<Exclude<Plano, "freemium">, number> = {
  essencial: 197_00,
  pro: 397_00,
};

export const PLANO_LABEL: Record<Plano, string> = {
  freemium: "Freemium",
  essencial: "Essencial",
  pro: "Pro",
};

export function isPlano(v: unknown): v is Plano {
  return typeof v === "string" && (PLANOS as readonly string[]).includes(v);
}

/** true se `atual` atende o mínimo exigido. Tolerante a lixo: plano
 *  desconhecido é tratado como freemium (rank 0). */
export function planoAtende(atual: unknown, minimo: Plano): boolean {
  const rank = isPlano(atual) ? PLANO_RANK[atual] : 0;
  return rank >= PLANO_RANK[minimo];
}

/** Copy curta para telas de conversão (D2-05). A página /dashboard/planos
 *  ainda tem seu array próprio — unificação é escopo do D.4. */
export const PLANO_TAGLINE: Record<Exclude<Plano, "freemium">, string> = {
  essencial: "Do manuscrito ao livro digital pronto para publicar.",
  pro: "Tudo do Essencial + arquivos de impressão e livro físico.",
};

export const PLANO_DESTAQUES: Record<Exclude<Plano, "freemium">, string[]> = {
  essencial: [
    "Revisão gramatical e de estilo com IA",
    "Capa com IA e EPUB pronto para as plataformas",
    "PDF digital sem limite e sem marca d'água",
  ],
  pro: [
    "Tudo do Essencial",
    "PDF de impressão com sangria e marcas de corte",
    "Capa completa (lombada e orelhas) + impressão via Autoria",
  ],
};

export function formatarPrecoPlano(p: Exclude<Plano, "freemium">): string {
  return `R$ ${(PLANO_PRECO_CENTAVOS[p] / 100).toLocaleString("pt-BR")}`;
}

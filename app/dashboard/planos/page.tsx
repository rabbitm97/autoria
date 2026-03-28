import Link from "next/link";

// ─── Plans data ───────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "essencial",
    nome: "Essencial",
    preco: "R$ 197",
    periodo: "por obra",
    descricao: "Para autores que querem publicar seu primeiro livro com qualidade profissional.",
    features: [
      "Upload de manuscrito (.docx, .pdf, .txt)",
      "Diagnóstico editorial com IA",
      "Revisão gramatical e de estilo",
      "Sinopses, título e palavras-chave",
      "Ficha catalográfica (CBL)",
      "Suporte por e-mail",
    ],
    cta: "Começar agora",
    destaque: false,
  },
  {
    id: "completo",
    nome: "Completo",
    preco: "R$ 397",
    periodo: "por obra",
    descricao: "Para autores que querem um livro profissional com capa e diagramação incluídas.",
    features: [
      "Tudo do Essencial +",
      "Capa profissional com IA (DALL-E 3)",
      "Diagramação automática (PDF/X-1a + EPUB)",
      "Preview do livro antes de publicar",
      "Exportação em múltiplos formatos",
      "Suporte prioritário",
    ],
    cta: "Publicar com qualidade",
    destaque: true,
  },
  {
    id: "pro",
    nome: "Pro",
    preco: "R$ 697",
    periodo: "por obra",
    descricao: "Para autores sérios que querem máxima distribuição e royalties.",
    features: [
      "Tudo do Completo +",
      "Audiolivro com voz neural em PT-BR",
      "Publicação automática em 15+ plataformas",
      "Amazon KDP, Apple Books, Kobo e mais",
      "Painel de royalties em tempo real",
      "Gerente de conta dedicado",
    ],
    cta: "Publicar em todas as plataformas",
    destaque: false,
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanosPage() {
  return (
    <div className="min-h-screen bg-brand-surface">

      {/* Header */}
      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-brand-gold/60 hover:text-brand-gold transition-colors">
              Dashboard
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-brand-gold/80">Planos</span>
          </div>
          <h1 className="font-heading text-xl text-brand-gold">Autoria</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-16">

        {/* Title */}
        <div className="text-center mb-12">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-2">
            Escolha seu plano
          </p>
          <h2 className="font-heading text-4xl text-brand-primary leading-tight mb-3">
            Do manuscrito ao leitor
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto">
            Pague uma vez por obra. Sem assinatura, sem surpresas. Publique e receba 70% de royalties.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-8 flex flex-col relative ${
                plan.destaque
                  ? "border-brand-gold/40 bg-brand-primary shadow-lg shadow-brand-primary/10"
                  : "border-zinc-100 bg-white"
              }`}
            >
              {plan.destaque && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-gold text-brand-primary text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                    Mais popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p className={`font-heading text-xl mb-1 ${plan.destaque ? "text-brand-gold" : "text-brand-primary"}`}>
                  {plan.nome}
                </p>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className={`font-heading text-4xl ${plan.destaque ? "text-white" : "text-brand-primary"}`}>
                    {plan.preco}
                  </span>
                  <span className={`text-sm ${plan.destaque ? "text-white/50" : "text-zinc-400"}`}>
                    {plan.periodo}
                  </span>
                </div>
                <p className={`text-sm leading-relaxed ${plan.destaque ? "text-white/70" : "text-zinc-500"}`}>
                  {plan.descricao}
                </p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 ${plan.destaque ? "text-brand-gold" : "text-emerald-500"}`}>
                      <CheckIcon />
                    </span>
                    <span className={`text-sm ${plan.destaque ? "text-white/80" : "text-zinc-600"}`}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <CheckoutButton planId={plan.id} cta={plan.cta} destaque={plan.destaque} />
            </div>
          ))}
        </div>

        {/* Guarantee */}
        <div className="text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-2xl border border-zinc-100 px-6 py-4">
            <span className="text-2xl">🔒</span>
            <div className="text-left">
              <p className="font-medium text-zinc-700 text-sm">Garantia de 7 dias</p>
              <p className="text-zinc-400 text-xs">Não ficou satisfeito? Devolvemos 100% do valor.</p>
            </div>
          </div>
        </div>

        <p className="text-center text-zinc-300 text-xs mt-10">
          Autoria — Do manuscrito ao leitor.
        </p>
      </main>
    </div>
  );
}

// Client button for checkout
function CheckoutButton({
  planId,
  cta,
  destaque,
}: {
  planId: string;
  cta: string;
  destaque: boolean;
}) {
  return (
    <a
      href={`/api/checkout?plan=${planId}`}
      className={`w-full py-3.5 rounded-xl font-semibold text-sm text-center transition-all ${
        destaque
          ? "bg-brand-gold text-brand-primary hover:bg-brand-gold-light"
          : "bg-brand-primary text-brand-surface hover:bg-[#2a2a4e]"
      }`}
    >
      {cta} →
    </a>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

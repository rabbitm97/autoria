// ─── Plans data ───────────────────────────────────────────────────────────────

const PLANS = [
  {
    id: "freemium",
    nome: "Freemium",
    preco: "R$ 0",
    periodo: "para sempre",
    descricao: "Prepare seu livro e veja o resultado antes de pagar qualquer coisa.",
    features: [
      "Upload de manuscrito (.docx, .pdf, .txt)",
      "Diagnóstico editorial com IA",
      "Editor de capa profissional",
      "Ficha catalográfica (CIP) preenchida por você",
      "Conversão RGB→CMYK e cálculo de lombada",
      "PDF digital de prévia (2 por dia, com marca d'água)",
      "Exportação DOCX",
    ],
    cta: "Começar grátis",
    destaque: false,
  },
  {
    id: "essencial",
    nome: "Essencial",
    preco: "R$ 197",
    periodo: "por obra",
    descricao: "Do manuscrito ao livro digital pronto para publicar.",
    features: [
      "Tudo do Freemium +",
      "Revisão gramatical e de estilo com IA",
      "Sinopses, título e palavras-chave",
      "Capa de frente com IA",
      "EPUB pronto para as plataformas",
      "PDF digital sem limite e sem marca d'água",
      "Suporte por e-mail",
    ],
    cta: "Publicar meu livro",
    destaque: true,
  },
  {
    id: "pro",
    nome: "Pro",
    preco: "R$ 397",
    periodo: "por obra",
    descricao: "Livro completo: digital, papel e áudio.",
    features: [
      "Tudo do Essencial +",
      "Capa frente e verso com IA",
      "PDF de impressão com sangria e marcas de corte (CMYK)",
      "Audiolivro em PT-BR com vozes neurais (em breve)*",
      "Suporte prioritário",
    ],
    cta: "Quero o livro completo",
    destaque: false,
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanosPage() {
  return (
    <div>

      <main className="max-w-5xl mx-auto px-8 py-10">

        {/* Title */}
        <div className="text-center mb-12">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-2">
            Escolha seu plano
          </p>
          <h2 className="font-heading text-4xl text-brand-primary leading-tight mb-3">
            Do manuscrito ao leitor
          </h2>
          <p className="text-zinc-500 max-w-lg mx-auto">
            Pague uma vez por obra. Sem assinatura, sem surpresas.
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

        <p className="text-center text-xs text-zinc-400 mt-6">
          *Audiolivro incluso para obras de até 100 mil palavras; excedente via créditos.
        </p>

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

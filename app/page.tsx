import WaitlistForm from "./_components/waitlist-form";

// ─── Types ────────────────────────────────────────────────────────────────────

type FeatureValue = boolean | string;

interface ComparisonFeature {
  label: string;
  autoria: FeatureValue;
  clube: FeatureValue;
  uiclap: FeatureValue;
  spines: FeatureValue;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const benefits = [
  {
    icon: "⚡",
    title: "Horas, não semanas",
    description:
      "Revisão, capa, diagramação, EPUB e audiolivro concluídos em poucas horas pela IA. Você aprova cada etapa antes de publicar.",
  },
  {
    icon: "🤖",
    title: "IA de ponta em português",
    description:
      "Claude Sonnet revisa seu texto, DALL-E 3 cria 3 opções de capa, ElevenLabs narra seu audiolivro — tudo otimizado para o PT-BR.",
  },
  {
    icon: "💰",
    title: "10x mais barato com 85% de royalties",
    description:
      "A partir de R$197 por obra. Sem assinatura, sem comissão escondida. Você fica com 85% de cada venda digital.",
  },
];

const steps = [
  {
    num: "01",
    title: "Envie o manuscrito",
    desc: "Upload em .docx, .pdf ou .txt. Diagnóstico gratuito em segundos.",
  },
  {
    num: "02",
    title: "IA revisa e edita",
    desc: "Claude Sonnet corrige, sugere melhorias e gera sinopse e ficha catalográfica.",
  },
  {
    num: "03",
    title: "Escolha a capa",
    desc: "3 capas criadas por DALL-E 3 especificamente para o seu gênero literário.",
  },
  {
    num: "04",
    title: "Diagramação automática",
    desc: "PDF/X-1a para impressão e EPUB 3.0 para e-readers, tudo formatado.",
  },
  {
    num: "05",
    title: "Audiolivro incluído",
    desc: "ElevenLabs narra seu livro com voz natural em português.",
  },
  {
    num: "06",
    title: "Publicado em 15+ plataformas",
    desc: "Amazon, Kobo, Apple Books, Google Play, Spotify e mais — em um clique.",
  },
];

const comparison: ComparisonFeature[] = [
  { label: "IA nativa em PT-BR",    autoria: true,        clube: "Pago à parte", uiclap: false,      spines: "Só inglês"  },
  { label: "Capa com IA",           autoria: true,        clube: false,          uiclap: false,      spines: true         },
  { label: "Audiolivro incluso",    autoria: true,        clube: false,          uiclap: false,      spines: true         },
  { label: "POD Brasil",            autoria: true,        clube: true,           uiclap: true,       spines: false        },
  { label: "Royalties ao autor",    autoria: "85%",       clube: "80%",          uiclap: "100% *",   spines: "70%"        },
  { label: "Preço por obra",        autoria: "R$197–697", clube: "Variável",     uiclap: "Grátis *", spines: "~R$6.000+"  },
];

const plans = [
  {
    name: "Essencial",
    price: "R$197",
    description: "Publique seu primeiro eBook",
    highlight: false,
    items: [
      "Revisão com IA (Claude Sonnet)",
      "Sinopse e ficha catalográfica",
      "3 capas geradas por IA",
      "Diagramação automática",
      "Arquivo EPUB 3.0",
      "Publicação em 15+ plataformas digitais",
    ],
  },
  {
    name: "Completo",
    price: "R$397",
    description: "eBook + livro físico + audiolivro",
    highlight: true,
    items: [
      "Tudo do plano Essencial",
      "PDF/X-1a para impressão",
      "Audiolivro com voz IA",
      "ISBN incluso",
      "Print on demand (POD)",
      "Suporte prioritário",
    ],
  },
  {
    name: "Pro",
    price: "R$697",
    description: "Para autores com ambição global",
    highlight: false,
    items: [
      "Tudo do plano Completo",
      "Clonagem de voz do autor",
      "Tradução para 1 idioma",
      "Marketing kit com IA",
      "Posts, banners e press release",
      "Gerente de conta dedicado",
    ],
  },
];

// ─── Helper ───────────────────────────────────────────────────────────────────

function renderCell(value: FeatureValue) {
  if (value === true)  return <span className="text-emerald-500 font-bold text-base">✓</span>;
  if (value === false) return <span className="text-zinc-300 text-base">✗</span>;
  return <span>{value}</span>;
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-brand-primary/95 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <span className="font-heading text-2xl text-brand-gold">Autoria</span>
        <a
          href="#lista-de-espera"
          className="bg-brand-gold text-brand-primary px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-gold-light transition-colors"
        >
          Entrar na lista
        </a>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="bg-brand-primary min-h-screen flex items-center pt-16">
      <div className="max-w-6xl mx-auto px-4 py-20 md:py-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/20 rounded-full px-4 py-1.5 text-brand-gold text-sm mb-8">
            <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
            Lista de espera aberta — Lançamento em 2025
          </div>

          <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl text-brand-surface leading-tight mb-6">
            Do manuscrito ao leitor —{" "}
            <span className="text-brand-gold">em horas, não semanas.</span>
          </h1>

          <p className="text-brand-surface/70 text-lg md:text-xl leading-relaxed mb-10 max-w-2xl">
            A primeira plataforma brasileira com IA completa para publicação de
            livros. Você envia o manuscrito. A Autoria cuida do resto: revisão,
            capa, audiolivro e publicação em 15+ plataformas.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#lista-de-espera"
              className="inline-flex items-center justify-center bg-brand-gold text-brand-primary px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand-gold-light active:scale-95 transition-all"
            >
              Quero publicar meu livro
            </a>
            <a
              href="#como-funciona"
              className="inline-flex items-center justify-center border border-white/20 text-brand-surface px-8 py-4 rounded-xl font-medium text-lg hover:border-white/40 hover:bg-white/5 transition-colors"
            >
              Ver como funciona
            </a>
          </div>

          <div className="grid grid-cols-3 gap-6 mt-16 pt-16 border-t border-white/10">
            {[
              { value: "15+",  label: "Plataformas de distribuição" },
              { value: "85%",  label: "Royalties para o autor" },
              { value: "10x",  label: "Mais barato que editoras" },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-heading text-3xl md:text-4xl text-brand-gold">{s.value}</div>
                <div className="text-brand-surface/50 text-xs md:text-sm mt-1 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section className="bg-brand-surface py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="font-heading text-3xl md:text-4xl text-brand-primary mb-4">
            Por que autores escolhem a Autoria
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            Publicar um livro nunca foi tão simples — ou tão acessível.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="bg-white rounded-2xl p-8 border border-zinc-100 hover:border-brand-gold/30 hover:shadow-lg transition-all"
            >
              <div className="text-4xl mb-5">{b.icon}</div>
              <h3 className="font-heading text-xl text-brand-primary mb-3">{b.title}</h3>
              <p className="text-zinc-500 leading-relaxed text-sm">{b.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="bg-brand-primary py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="font-heading text-3xl md:text-4xl text-brand-surface mb-4">
            Como funciona
          </h2>
          <p className="text-brand-surface/60 text-lg max-w-xl mx-auto">
            Do upload ao livro publicado, sem você precisar entender de editoração.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {steps.map((step) => (
            <div
              key={step.num}
              className="border border-white/10 rounded-2xl p-6 hover:border-brand-gold/30 hover:bg-white/5 transition-all"
            >
              <div className="font-heading text-5xl text-brand-gold/20 mb-3 leading-none">
                {step.num}
              </div>
              <h3 className="font-heading text-lg text-brand-surface mb-2">{step.title}</h3>
              <p className="text-brand-surface/50 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  return (
    <section className="bg-brand-surface py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="font-heading text-3xl md:text-4xl text-brand-primary mb-4">
            Autoria vs. concorrentes
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            A única plataforma com IA completa, em português, no preço certo.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-brand-primary">
                <th className="text-left px-6 py-4 text-brand-surface/50 font-medium">
                  Recurso
                </th>
                <th className="px-6 py-4 text-brand-gold font-heading text-base">
                  Autoria
                </th>
                <th className="px-6 py-4 text-brand-surface/50 font-medium">
                  Clube de Autores
                </th>
                <th className="px-6 py-4 text-brand-surface/50 font-medium">UICLAP</th>
                <th className="px-6 py-4 text-brand-surface/50 font-medium">Spines</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((f, i) => (
                <tr
                  key={f.label}
                  className={i % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}
                >
                  <td className="px-6 py-4 font-medium text-zinc-700">{f.label}</td>
                  <td className="px-6 py-4 text-center text-sm font-semibold text-zinc-700 bg-brand-gold/5">
                    {renderCell(f.autoria)}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-zinc-500">{renderCell(f.clube)}</td>
                  <td className="px-6 py-4 text-center text-sm text-zinc-500">{renderCell(f.uiclap)}</td>
                  <td className="px-6 py-4 text-center text-sm text-zinc-500">{renderCell(f.spines)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-400 mt-3 text-center">
          * UICLAP gratuito opera via comissão sobre vendas. Royalties de 100% válidos com plano pago.
        </p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="precos" className="bg-zinc-50 py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="font-heading text-3xl md:text-4xl text-brand-primary mb-4">
            Investimento por obra
          </h2>
          <p className="text-zinc-500 text-lg max-w-xl mx-auto">
            Pague uma vez. Publique para sempre. Sem assinatura, sem comissão escondida.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 border-2 relative ${
                plan.highlight
                  ? "bg-brand-primary border-brand-gold"
                  : "bg-white border-zinc-100"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-gold text-brand-primary text-xs font-bold px-4 py-1.5 rounded-full tracking-wide">
                    MAIS POPULAR
                  </span>
                </div>
              )}

              <h3
                className={`font-heading text-2xl mb-1 ${
                  plan.highlight ? "text-brand-surface" : "text-brand-primary"
                }`}
              >
                {plan.name}
              </h3>
              <p
                className={`text-sm mb-6 ${
                  plan.highlight ? "text-brand-surface/60" : "text-zinc-400"
                }`}
              >
                {plan.description}
              </p>

              <div
                className={`font-heading text-5xl mb-8 ${
                  plan.highlight ? "text-brand-gold" : "text-brand-primary"
                }`}
              >
                {plan.price}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.items.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="text-brand-gold mt-0.5 shrink-0">✓</span>
                    <span
                      className={`text-sm ${
                        plan.highlight ? "text-brand-surface/80" : "text-zinc-600"
                      }`}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href="#lista-de-espera"
                className={`block text-center py-3.5 rounded-xl font-semibold transition-colors ${
                  plan.highlight
                    ? "bg-brand-gold text-brand-primary hover:bg-brand-gold-light"
                    : "bg-brand-primary text-brand-surface hover:bg-[#2a2a4e]"
                }`}
              >
                Quero este plano
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-zinc-400 text-sm mt-8">
          Diagnóstico gratuito disponível em todos os planos antes de qualquer cobrança.
        </p>
      </div>
    </section>
  );
}

function Waitlist() {
  return (
    <section id="lista-de-espera" className="bg-brand-primary py-20 md:py-28">
      <div className="max-w-xl mx-auto px-4 text-center">
        <h2 className="font-heading text-3xl md:text-4xl text-brand-surface mb-4">
          Entre na lista de espera
        </h2>
        <p className="text-brand-surface/60 mb-10 leading-relaxed">
          Seja um dos primeiros a publicar com a Autoria. Acesso antecipado +{" "}
          <strong className="text-brand-gold">20% de desconto</strong> no lançamento.
        </p>
        <WaitlistForm />
        <p className="text-brand-surface/30 text-xs mt-6">
          Sem spam. Você pode sair da lista a qualquer momento.
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0d0d1a] py-10 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <span className="font-heading text-xl text-brand-gold">Autoria</span>
        <p className="text-brand-surface/30 text-sm">
          © {new Date().getFullYear()} Autoria. Todos os direitos reservados.
        </p>
        <div className="flex gap-6 text-sm text-brand-surface/30">
          <a href="/termos" className="hover:text-brand-surface/60 transition-colors">
            Termos de Uso
          </a>
          <a href="/privacidade" className="hover:text-brand-surface/60 transition-colors">
            Privacidade
          </a>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <Benefits />
      <HowItWorks />
      <Comparison />
      <Pricing />
      <Waitlist />
      <Footer />
    </>
  );
}

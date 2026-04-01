import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import WaitlistForm from "./_components/waitlist-form";
import FAQ from "./_components/faq";
import HowItWorks from "./_components/how-it-works";

export const metadata: Metadata = {
  title: "Autoria — Publique seu livro com IA, do manuscrito ao leitor",
};

// ─── Structured Data ──────────────────────────────────────────────────────────

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Autoria",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Plataforma brasileira de autopublicação com IA. Revisão, capa, audiolivro e distribuição em 15+ plataformas.",
  offers: [
    { "@type": "Offer", name: "Essencial", price: "197", priceCurrency: "BRL" },
    { "@type": "Offer", name: "Completo",  price: "397", priceCurrency: "BRL" },
    { "@type": "Offer", name: "Pro",       price: "697", priceCurrency: "BRL" },
  ],
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Serviços",      href: "#servicos"      },
  { label: "Preços",        href: "#precos"        },
  { label: "FAQ",           href: "#faq"           },
];

const PLATFORMS = [
  "Amazon KDP", "Kobo", "Apple Books", "Google Play", "Spotify Audiobooks",
  "Barnes & Noble", "Rakuten", "Scribd", "OverDrive",
];


const PLANS = [
  {
    name: "Essencial",
    price: "R$197",
    period: "por obra",
    desc: "Publique seu primeiro eBook",
    highlight: false,
    cta: "Começar com Essencial",
    guarantee: false,
    items: [
      "Diagnóstico editorial com IA",
      "Revisão gramatical e de estilo",
      "Sinopse + ficha catalográfica",
      "3 opções de capa geradas por IA",
      "Diagramação EPUB 3.0",
      "Publicação em 15+ plataformas digitais",
      "Painel de royalties",
    ],
  },
  {
    name: "Completo",
    price: "R$397",
    period: "por obra",
    desc: "eBook + físico + audiolivro",
    highlight: true,
    badge: "Mais popular",
    cta: "Começar com Completo",
    guarantee: true,
    items: [
      "Tudo do Essencial",
      "PDF para impressão (KDP, A5, Carta)",
      "Capa completa com lombada e orelhas",
      "Audiolivro com voz neural (IA)",
      "ISBN registrado em seu nome",
      "Print on demand no Brasil",
      "Suporte prioritário",
    ],
  },
  {
    name: "Pro",
    price: "R$697",
    period: "por obra",
    desc: "Para autores com ambição global",
    highlight: false,
    cta: "Começar com Pro",
    guarantee: true,
    items: [
      "Tudo do Completo",
      "Clonagem de voz do autor",
      "Tradução para 1 idioma",
      "Marketing kit: posts, banners, press release",
      "Gerente de conta dedicado",
      "Acesso antecipado a novos recursos",
    ],
  },
];

const TESTIMONIALS = [
  {
    quote: "Enviei meu manuscrito às 9h e às 17h tinha a capa, o EPUB e a sinopse prontos. Algo que eu tentava fazer há 2 anos aconteceu em um dia. A revisão da IA foi cirúrgica.",
    name: "Fernanda Oliveira",
    role: "Autora de romance contemporâneo",
    initials: "FO",
    stars: 5,
  },
  {
    quote: "A revisão do Claude pegou inconsistências no meu texto que nenhum revisor humano tinha notado. A sinopse que a IA gerou é melhor do que a que eu estava usando há meses.",
    name: "Ricardo Almeida",
    role: "Escritor e professor de literatura",
    initials: "RA",
    stars: 5,
  },
  {
    quote: "Tentei publicar sozinho na Amazon KDP e desisti depois de duas semanas. Com a Autoria, o mesmo processo levou 6 horas. A capa ficou incrível — melhor do que o que eu tinha pedido para um designer.",
    name: "Patrícia Santos",
    role: "Autora de autoajuda e bem-estar",
    initials: "PS",
    stars: 5,
  },
  {
    quote: "Já publiquei três livros com a Autoria. O retorno sobre o investimento no plano Completo é absurdo. Só de não precisar de um revisor pago, já paguei o plano várias vezes.",
    name: "Carlos Mendes",
    role: "Autor de ficção científica",
    initials: "CM",
    stars: 5,
  },
  {
    quote: "O audiolivro gerado pela IA ficou natural. Minha editora cobrou R$8.000 para fazer o mesmo serviço. A Autoria fez por R$397. Não tem comparação.",
    name: "Ana Beatriz Costa",
    role: "Escritora de literatura infantil",
    initials: "AB",
    stars: 5,
  },
  {
    quote: "O diagnóstico editorial foi uma aula. Aprendi mais sobre o meu próprio manuscrito em 2 minutos do que em anos de escrita. Recomendo a qualquer autor que esteja travado.",
    name: "Marcos Vieira",
    role: "Autor estreante",
    initials: "MV",
    stars: 5,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Stars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} estrelas de 5`}>
      {Array.from({ length: n }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#c9a84c" aria-hidden="true">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      ))}
    </div>
  );
}

// ─── Logo component ───────────────────────────────────────────────────────────

function Logo({ variant = "gold" }: { variant?: "gold" | "navy" }) {
  const src = variant === "gold" ? "/logo-amarelo.png" : "/logo-azul.png";
  return (
    <Image
      src={src}
      alt="Autoria"
      width={480}
      height={120}
      className="h-[108px] w-auto object-contain"
      priority
    />
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-brand-primary/95 backdrop-blur-md border-b border-white/5">
      <nav className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between gap-8" aria-label="Navegação principal">
        <Link href="/" aria-label="Autoria — página inicial">
          <Logo variant="gold" />
        </Link>

        <ul className="flex items-center gap-8 text-sm text-white/55">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <a href={href} className="hover:text-white transition-colors tracking-wide">
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/55 hover:text-white transition-colors px-3 py-1.5">
            Entrar
          </Link>
          <Link
            href="/login"
            className="bg-brand-gold text-brand-primary text-sm font-bold px-6 py-2.5 rounded-lg hover:bg-brand-gold-light active:scale-95 transition-all tracking-wide"
          >
            Começar grátis
          </Link>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="bg-brand-primary pt-16 overflow-hidden">
      <div className="max-w-7xl mx-auto px-8 pt-20 pb-0">
        <div className="grid grid-cols-[1fr_1fr] gap-16 items-center">

          {/* Left */}
          <div className="pb-20">
            <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/25 rounded-full px-4 py-1.5 text-brand-gold text-xs font-semibold uppercase tracking-widest mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
              Plataforma de publicação com IA
            </div>

            <h1 className="font-heading text-[3.75rem] xl:text-[4.5rem] text-white leading-[1.02] mb-6">
              Publique seu livro.{" "}
              <span className="text-brand-gold">Em horas,</span>{" "}
              não em meses.
            </h1>

            <p className="text-white/60 text-xl leading-relaxed mb-10 max-w-lg">
              A Autoria usa inteligência artificial para transformar seu manuscrito
              em livro publicado — com revisão, capa profissional, audiolivro e
              distribuição global. Sem editora. Sem intermediários.
            </p>

            <div className="flex items-center gap-4 mb-14">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary px-8 py-4 rounded-xl font-bold text-base hover:bg-brand-gold-light active:scale-[0.98] transition-all shadow-xl shadow-brand-gold/20"
              >
                Publicar meu livro
              </Link>
              <a
                href="#como-funciona"
                className="text-white/50 text-sm hover:text-white/80 transition-colors flex items-center gap-2"
              >
                <span className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs">▶</span>
                Ver como funciona
              </a>
            </div>

            {/* Trust signals */}
            <div className="flex items-center gap-6 pt-8 border-t border-white/10">
              <div className="flex items-center gap-2">
                <Stars n={5} />
                <span className="text-white/40 text-xs">4.9 / 5</span>
              </div>
              <div className="w-px h-4 bg-white/10" />
              <p className="text-white/40 text-xs">Garantia de 7 dias em todos os planos</p>
              <div className="w-px h-4 bg-white/10" />
              <p className="text-white/40 text-xs">Diagnóstico 100% gratuito</p>
            </div>
          </div>

          {/* Right: floating dashboard */}
          <div className="relative flex items-end justify-center pb-0" aria-hidden="true">
            {/* Glow */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-64 bg-brand-gold/10 rounded-full blur-3xl" />

            {/* Main card */}
            <div className="relative w-full max-w-md">
              {/* Browser chrome */}
              <div className="bg-[#12122a] rounded-t-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/40" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/40" />
                    <div className="w-3 h-3 rounded-full bg-green-500/40" />
                  </div>
                  <div className="flex-1 mx-4 bg-white/5 rounded px-3 py-1 text-white/20 text-xs font-mono">
                    autoria.app/dashboard
                  </div>
                </div>

                {/* Sidebar + content */}
                <div className="flex h-80">
                  {/* Sidebar */}
                  <div className="w-12 bg-white/3 border-r border-white/5 flex flex-col items-center py-4 gap-3">
                    {["⌂","✦","◈","⊟","♫","⊕"].map((icon, i) => (
                      <div key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${i === 0 ? "bg-brand-gold text-brand-primary" : "text-white/20 hover:text-white/50"}`}>
                        {icon}
                      </div>
                    ))}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 p-5 overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-white/30 text-[10px] uppercase tracking-widest mb-0.5">Projeto ativo</p>
                        <p className="text-white text-sm font-semibold">O Último Horizonte</p>
                      </div>
                      <div className="bg-brand-gold/15 text-brand-gold text-[10px] font-bold px-2 py-1 rounded-full border border-brand-gold/20">
                        Plano Completo
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mb-4">
                      <div className="flex justify-between mb-2">
                        <span className="text-white/40 text-[10px]">Progresso da publicação</span>
                        <span className="text-brand-gold text-[10px] font-semibold">Etapa 4/6 — Capa</span>
                      </div>
                      <div className="flex gap-1">
                        {["Upload","Diagnóst.","Revisão","Capa","Diagr.","Publicar"].map((s, i) => (
                          <div key={i} className="flex-1">
                            <div className={`h-1 rounded-full mb-1 ${i < 3 ? "bg-emerald-400" : i === 3 ? "bg-brand-gold" : "bg-white/10"}`} />
                            <p className={`text-[8px] text-center ${i < 3 ? "text-emerald-400/70" : i === 3 ? "text-brand-gold" : "text-white/20"}`}>{s}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cover preview + action */}
                    <div className="flex gap-3">
                      <div className="w-14 h-[76px] rounded-md bg-gradient-to-br from-brand-gold via-amber-600 to-amber-800 shadow-lg flex-shrink-0 flex items-end justify-center pb-1.5">
                        <div className="w-1 h-10 bg-black/20 rounded-full" />
                      </div>
                      <div className="flex-1">
                        <p className="text-white/50 text-[10px] mb-1">3 opções geradas</p>
                        <div className="flex gap-1.5 mb-2">
                          {[1,2,3].map(n => (
                            <div key={n} className={`w-8 h-10 rounded bg-gradient-to-br flex-shrink-0 ${n===1?"from-indigo-600 to-purple-900 ring-2 ring-brand-gold":n===2?"from-teal-600 to-cyan-900":"from-rose-600 to-red-900"}`} />
                          ))}
                        </div>
                        <button className="bg-brand-gold text-brand-primary text-[10px] font-bold px-3 py-1.5 rounded-lg w-full">
                          Escolher capa →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating cards */}
              <div className="absolute -left-10 top-16 bg-white rounded-xl shadow-xl border border-zinc-100 px-4 py-3 w-44">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs">✓</div>
                  <span className="text-zinc-700 text-xs font-semibold">Revisão concluída</span>
                </div>
                <p className="text-zinc-400 text-[10px]">47 sugestões aplicadas</p>
              </div>

              <div className="absolute -right-8 top-32 bg-brand-primary rounded-xl shadow-xl border border-white/10 px-4 py-3 w-40">
                <p className="text-white/40 text-[10px] mb-1">Royalties estimados</p>
                <p className="text-brand-gold font-heading text-xl">R$ 2.847</p>
                <p className="text-white/30 text-[9px] mt-0.5">últimos 30 dias</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar at bottom of hero */}
        <div className="grid grid-cols-4 border-t border-white/5 -mx-8">
          {[
            { value: "15+",   label: "Plataformas de distribuição" },
            { value: "85%",   label: "Royalties para o autor"       },
            { value: "R$197", label: "A partir de por obra"          },
            { value: "< 24h", label: "Do upload à publicação"        },
          ].map((s) => (
            <div key={s.label} className="px-8 py-7 border-r border-white/5 last:border-0">
              <div className="font-heading text-3xl text-brand-gold mb-1">{s.value}</div>
              <div className="text-white/35 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformBar() {
  return (
    <div className="bg-white border-b border-zinc-100 py-5">
      <div className="max-w-7xl mx-auto px-8 flex items-center gap-10">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest shrink-0">
          Distribua em
        </p>
        <div className="w-px h-4 bg-zinc-200 shrink-0" />
        <div className="flex items-center gap-10 overflow-x-auto scrollbar-none">
          {PLATFORMS.map((p) => (
            <span key={p} className="text-zinc-400 text-sm font-medium whitespace-nowrap hover:text-zinc-600 transition-colors">
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


function FeatureEditorial() {
  return (
    <section id="servicos" className="bg-brand-primary py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-2 gap-20 items-center">

          {/* Visual */}
          <div className="relative" aria-hidden="true">
            <div className="absolute -inset-4 bg-brand-gold/5 rounded-3xl blur-2xl" />
            <div className="relative bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {/* Header bar */}
              <div className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-gold/20 flex items-center justify-center text-brand-gold text-sm">✦</div>
                  <span className="text-white/60 text-sm font-medium">Revisão com IA</span>
                </div>
                <div className="bg-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full border border-emerald-500/20">
                  Concluída
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-3">
                {/* Paragraph with highlight */}
                <div className="bg-white/5 rounded-lg p-4 text-sm leading-relaxed">
                  <span className="text-white/60">A noite caía sobre a cidade </span>
                  <span className="bg-emerald-500/20 text-emerald-300 rounded px-0.5">silenciosamente</span>
                  <span className="text-white/60">, enquanto Pedro observava </span>
                  <span className="bg-yellow-500/20 text-yellow-300 rounded px-0.5">as luzes distantes</span>
                  <span className="text-white/60">. O frio cortava o rosto como </span>
                  <span className="bg-red-500/15 text-red-300 rounded px-0.5 line-through text-xs">laminas afiadas</span>
                  <span className="text-white/60"> </span>
                  <span className="bg-emerald-500/20 text-emerald-300 rounded px-0.5">lâminas afiadas</span>
                  <span className="text-white/60">.</span>
                </div>

                {/* Suggestions */}
                <div className="space-y-2">
                  {[
                    { type: "Ortografia", text: '"laminas" → "lâminas"', color: "red" },
                    { type: "Estilo", text: 'Considere variar o ritmo no § 3', color: "yellow" },
                    { type: "Coesão", text: 'Ótima progressão temporal', color: "emerald" },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/3 rounded-lg px-4 py-2.5 border border-white/5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${s.color === "red" ? "bg-red-400" : s.color === "yellow" ? "bg-yellow-400" : "bg-emerald-400"}`} />
                      <span className="text-white/30 text-xs w-20 shrink-0">{s.type}</span>
                      <span className="text-white/60 text-xs">{s.text}</span>
                    </div>
                  ))}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { v: "47", l: "Sugestões" },
                    { v: "98%", l: "Precisão" },
                    { v: "PT-BR", l: "Idioma" },
                  ].map(s => (
                    <div key={s.l} className="bg-white/3 rounded-lg p-3 text-center border border-white/5">
                      <div className="font-heading text-lg text-brand-gold">{s.v}</div>
                      <div className="text-white/30 text-[10px] mt-0.5">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-4">
              Revisão Editorial
            </p>
            <h2 className="font-heading text-5xl text-white leading-tight mb-6">
              IA que entende<br />o português<br />do jeito certo
            </h2>
            <p className="text-white/60 text-lg leading-relaxed mb-8">
              Enquanto outras plataformas usam ferramentas genéricas em inglês,
              a Autoria usa Claude Sonnet — o modelo mais preciso da Anthropic —
              ajustado especificamente para o português brasileiro. Cada sugestão
              considera seu estilo, gênero e tom narrativo.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "Revisão gramatical e ortográfica em PT-BR",
                "Análise de coesão, coerência e estilo",
                "Sugestões de ritmo e fluidez narrativa",
                "Geração de sinopse em 3 formatos (curta, média, longa)",
                "Ficha catalográfica no padrão CBL",
                "Palavras-chave otimizadas para SEO editorial",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-white/70 text-base">
                  <span className="text-brand-gold mt-1 shrink-0 text-sm">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary px-7 py-3.5 rounded-xl font-bold text-sm hover:bg-brand-gold-light active:scale-[0.98] transition-all"
            >
              Experimentar revisão grátis →
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}

function FeatureCapa() {
  return (
    <section className="bg-brand-surface py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-2 gap-20 items-center">

          {/* Text */}
          <div>
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-4">
              Design de Capa
            </p>
            <h2 className="font-heading text-5xl text-brand-primary leading-tight mb-6">
              Capas que vendem.<br />Criadas por IA<br />em minutos.
            </h2>
            <p className="text-zinc-500 text-lg leading-relaxed mb-8">
              A capa é o principal fator de compra de um livro. Descreva a atmosfera
              que você imagina ou envie uma referência visual — a IA gera opções
              profissionais que competem com as melhores livrarias do mundo.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "Frente, contra-capa, lombada e orelhas completas",
                "5 formatos de livro: 16×23, 14×21, 11×18, 20×20, A4",
                "Calibragem automática da lombada pela contagem de páginas",
                "Upload de imagem de referência para guiar o estilo",
                "Alta resolução para impressão CMYK profissional",
                "Arte-final completa montada e pronta para envio",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-600 text-base">
                  <span className="text-brand-gold mt-1 shrink-0 text-sm">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-brand-primary text-white px-7 py-3.5 rounded-xl font-bold text-sm hover:bg-[#2a2a4e] active:scale-[0.98] transition-all"
            >
              Gerar minha capa →
            </Link>
          </div>

          {/* Visual */}
          <div className="relative" aria-hidden="true">
            <div className="absolute inset-0 bg-brand-primary/5 rounded-3xl blur-3xl" />
            <div className="relative">
              {/* Cover grid */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { from: "from-indigo-600 to-purple-900",  title: "Romance" },
                  { from: "from-amber-600 to-red-900",      title: "Suspense" },
                  { from: "from-teal-500 to-cyan-900",      title: "Fantasia" },
                ].map((c, i) => (
                  <div key={i} className={`aspect-[2/3] rounded-xl bg-gradient-to-br ${c.from} shadow-xl relative overflow-hidden border border-white/10`}>
                    <div className="absolute inset-0 opacity-20">
                      {[...Array(6)].map((_, j) => (
                        <div key={j} className="h-px bg-white/30 mt-8" style={{ marginTop: j * 20 + 16 }} />
                      ))}
                    </div>
                    <div className="absolute bottom-0 inset-x-0 p-3">
                      <div className="h-1 w-8 bg-white/60 rounded mb-1.5" />
                      <div className="h-0.5 w-6 bg-white/30 rounded" />
                    </div>
                    {i === 0 && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand-gold flex items-center justify-center text-brand-primary text-xs font-bold">✓</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Prompt box */}
              <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-lg">
                <p className="text-zinc-400 text-xs mb-2 uppercase tracking-wider">Seu prompt</p>
                <p className="text-zinc-700 text-sm leading-relaxed italic">
                  &ldquo;Floresta escura com névoa ao entardecer, tons de azul profundo e dourado, silhueta de uma figura solitária...&rdquo;
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
                  <span className="text-xs text-zinc-400">3 opções geradas • 28 seg</span>
                  <span className="text-brand-gold text-xs font-semibold">Gerar novamente →</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureFormatos() {
  return (
    <section className="bg-brand-primary py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Formatos
          </p>
          <h2 className="font-heading text-5xl text-white leading-tight mb-5">
            Um manuscrito.<br />Três formatos.
          </h2>
          <p className="text-white/55 text-lg leading-relaxed">
            eBook, livro físico e audiolivro — todos gerados a partir do mesmo arquivo,
            em um único fluxo de trabalho.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {[
            {
              icon: "◈",
              title: "eBook",
              sub: "EPUB 3.0 + PDF",
              desc: "EPUB 3.0 compatível com Kindle, Kobo, Apple Books e todos os e-readers. Tipografia editorial com detecção automática de capítulos, notas de rodapé e índice.",
              items: ["Kindle (mobi/epub)", "Kobo, Apple Books", "Google Play Books", "Padrão EPUB 3 global"],
              available: true,
            },
            {
              icon: "⊟",
              title: "Livro Físico",
              sub: "PDF para impressão",
              desc: "PDF/X compatível com Amazon KDP, gráficas sob demanda e impressão offset. Formatação automática com margens, sangria e páginas de rosto profissionais.",
              items: ["Amazon KDP Print", "Print on demand BR", "Formatos: 16×23, A5, A4", "Alta resolução 300 DPI"],
              available: true,
            },
            {
              icon: "♫",
              title: "Audiolivro",
              sub: "Narração com IA",
              desc: "ElevenLabs gera narração com voz neural em português — a mesma tecnologia usada por produtoras profissionais. No plano Pro, clone sua própria voz.",
              items: ["Spotify Audiobooks", "Voz neural em PT-BR", "Clonagem de voz (Pro)", "Formato MP3 / M4B"],
              available: true,
            },
          ].map((f) => (
            <div key={f.title} className="bg-white/5 border border-white/10 rounded-2xl p-8 hover:border-brand-gold/30 transition-all group">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center text-brand-gold text-2xl">
                  {f.icon}
                </div>
                <span className="text-white/30 text-xs font-semibold uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">{f.sub}</span>
              </div>

              <h3 className="font-heading text-2xl text-white mb-3 group-hover:text-brand-gold transition-colors">{f.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed mb-6">{f.desc}</p>

              <ul className="space-y-2">
                {f.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-white/60 text-sm">
                    <span className="w-1 h-1 rounded-full bg-brand-gold/60 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureRoyalties() {
  return (
    <section className="bg-zinc-50 py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-2 gap-20 items-center">

          {/* Visual */}
          <div className="relative" aria-hidden="true">
            <div className="absolute inset-0 bg-brand-gold/5 rounded-3xl blur-2xl" />
            <div className="relative bg-brand-primary rounded-2xl overflow-hidden border border-white/10 p-8">
              {/* Royalties header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Seus royalties</p>
                  <p className="font-heading text-4xl text-brand-gold">R$ 14.280</p>
                  <p className="text-emerald-400 text-sm mt-1">↑ 23% este mês</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-white/30 text-xs mb-0.5">Período</p>
                  <p className="text-white text-sm font-semibold">2025</p>
                </div>
              </div>

              {/* Platform bars */}
              <div className="space-y-3 mb-8">
                {[
                  { platform: "Amazon KDP", pct: 78, value: "R$11.138" },
                  { platform: "Apple Books", pct: 13, value: "R$1.856"  },
                  { platform: "Kobo",       pct: 6,  value: "R$857"    },
                  { platform: "Outros",     pct: 3,  value: "R$429"    },
                ].map((p) => (
                  <div key={p.platform}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/50">{p.platform}</span>
                      <span className="text-white/70 font-medium">{p.value}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gold rounded-full"
                        style={{ width: `${p.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Split */}
              <div className="flex gap-3">
                <div className="flex-1 bg-brand-gold/10 border border-brand-gold/20 rounded-xl p-4 text-center">
                  <div className="font-heading text-3xl text-brand-gold">85%</div>
                  <div className="text-white/40 text-xs mt-1">Para você</div>
                </div>
                <div className="flex-1 bg-white/5 border border-white/5 rounded-xl p-4 text-center">
                  <div className="font-heading text-3xl text-white/30">15%</div>
                  <div className="text-white/30 text-xs mt-1">Autoria</div>
                </div>
              </div>
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-4">
              Royalties
            </p>
            <h2 className="font-heading text-5xl text-brand-primary leading-tight mb-6">
              85% de cada<br />venda são seus.
            </h2>
            <p className="text-zinc-500 text-lg leading-relaxed mb-8">
              Sem assinatura, sem comissão escondida, sem surpresas. Você paga uma vez
              por obra e fica com a maior parte de tudo que vender. Para sempre.
              Os royalties de todas as plataformas chegam em um painel unificado.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "85% de royalties em todas as plataformas",
                "Painel unificado com todas as vendas",
                "Relatórios por plataforma, período e formato",
                "ISBN registrado em seu nome",
                "Sem comissão sobre vendas futuras",
                "Pague por obra, não por assinatura",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-600 text-base">
                  <span className="text-brand-gold mt-1 shrink-0 text-sm">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-brand-primary text-white px-7 py-3.5 rounded-xl font-bold text-sm hover:bg-[#2a2a4e] active:scale-[0.98] transition-all"
            >
              Ver painel de royalties →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="precos" className="bg-brand-primary py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Preços</p>
          <h2 className="font-heading text-5xl text-white leading-tight mb-5">
            Pague uma vez.<br />Publique para sempre.
          </h2>
          <p className="text-white/55 text-lg">
            Sem assinatura. Diagnóstico gratuito antes de qualquer cobrança. Garantia de 7 dias.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-2xl border-2 relative overflow-hidden ${
                plan.highlight
                  ? "border-brand-gold bg-white scale-105 shadow-2xl shadow-brand-gold/20"
                  : "bg-white/5 border-white/10 hover:border-white/20 transition-colors"
              }`}
            >
              {plan.badge && (
                <div className="bg-brand-gold text-brand-primary text-xs font-bold py-2.5 text-center tracking-widest uppercase">
                  {plan.badge}
                </div>
              )}

              <div className="p-8">
                <h3 className={`font-heading text-2xl mb-1 ${plan.highlight ? "text-brand-primary" : "text-white"}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-8 ${plan.highlight ? "text-zinc-400" : "text-white/40"}`}>
                  {plan.desc}
                </p>

                <div className="flex items-baseline gap-2 mb-8">
                  <span className={`font-heading text-5xl ${plan.highlight ? "text-brand-primary" : "text-white"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-zinc-400" : "text-white/40"}`}>
                    {plan.period}
                  </span>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.items.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="text-brand-gold mt-0.5 shrink-0 text-sm">✓</span>
                      <span className={`text-sm leading-snug ${plan.highlight ? "text-zinc-600" : "text-white/60"}`}>
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/login"
                  className={`block text-center py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                    plan.highlight
                      ? "bg-brand-primary text-white hover:bg-[#2a2a4e]"
                      : "bg-brand-gold text-brand-primary hover:bg-brand-gold-light"
                  }`}
                >
                  {plan.cta}
                </Link>

                {plan.guarantee && (
                  <p className={`text-center text-xs mt-3 ${plan.highlight ? "text-zinc-400" : "text-white/30"}`}>
                    Garantia de devolução em 7 dias
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>

        <p className="text-center text-white/30 text-sm mt-10">
          Precisa de volume? Fale com a nossa equipe para condições especiais.{" "}
          <a href="mailto:oi@autoria.app" className="text-brand-gold hover:underline">
            oi@autoria.app
          </a>
        </p>
      </div>
    </section>
  );
}

function Testimonials() {
  return (
    <section className="bg-zinc-50 py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="flex items-end justify-between mb-16">
          <div>
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Depoimentos</p>
            <h2 className="font-heading text-5xl text-brand-primary leading-tight">
              Autores que<br />já publicaram
            </h2>
          </div>
          <div className="flex items-center gap-3 pb-2">
            <div className="flex items-center gap-1.5">
              <Stars n={5} />
              <span className="text-zinc-600 text-sm font-semibold">4.9</span>
            </div>
            <span className="text-zinc-300">·</span>
            <span className="text-zinc-500 text-sm">Avaliação média dos usuários</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <blockquote
              key={t.name}
              className={`bg-white rounded-2xl p-8 border border-zinc-100 hover:border-brand-gold/30 hover:shadow-lg transition-all ${i === 1 ? "border-brand-gold/20 shadow-md" : ""}`}
            >
              <Stars n={t.stars} />
              <p className="text-zinc-700 text-base leading-relaxed mt-5 mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
              <footer className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center text-brand-gold text-sm font-bold shrink-0">
                  {t.initials}
                </div>
                <div>
                  <p className="text-zinc-900 font-semibold text-sm">{t.name}</p>
                  <p className="text-zinc-400 text-xs mt-0.5">{t.role}</p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="bg-brand-primary py-28 relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-5" aria-hidden="true">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute border border-white/20 rounded-full"
            style={{
              width:  (i + 1) * 120,
              height: (i + 1) * 120,
              top:    "50%",
              left:   "50%",
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>

      <div className="relative max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-[1fr_480px] gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/25 rounded-full px-4 py-1.5 text-brand-gold text-xs font-semibold uppercase tracking-widest mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
              Diagnóstico gratuito disponível agora
            </div>
            <h2 className="font-heading text-6xl text-white leading-[1.02] mb-6">
              Seu manuscrito<br />merece existir<br />
              <span className="text-brand-gold">como livro.</span>
            </h2>
            <p className="text-white/55 text-xl leading-relaxed max-w-lg mb-10">
              Comece com o diagnóstico gratuito e descubra o potencial do seu livro.
              Sem cartão de crédito. Sem compromisso.
            </p>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <span className="text-brand-gold">✓</span> Sem cartão de crédito
              </div>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <span className="text-brand-gold">✓</span> Diagnóstico gratuito
              </div>
              <div className="flex items-center gap-2 text-white/40 text-sm">
                <span className="text-brand-gold">✓</span> Garantia 7 dias
              </div>
            </div>
          </div>

          {/* Sign-up card */}
          <div className="bg-white rounded-2xl p-8 shadow-2xl border border-zinc-100">
            <div className="mb-1">
              <Logo variant="navy" />
            </div>
            <h3 className="font-heading text-2xl text-brand-primary mt-4 mb-1">Crie sua conta grátis</h3>
            <p className="text-zinc-500 text-sm mb-7">
              Diagnóstico gratuito. Sem cartão de crédito.
            </p>

            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-3 bg-brand-primary text-white py-3.5 rounded-xl font-bold text-sm hover:bg-[#2a2a4e] active:scale-[0.98] transition-all mb-5 shadow-sm"
            >
              <GoogleIcon />
              Continuar com Google
            </Link>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-zinc-200" />
              <span className="text-zinc-400 text-xs">ou use seu e-mail</span>
              <div className="flex-1 h-px bg-zinc-200" />
            </div>

            <WaitlistForm />

            <p className="text-zinc-400 text-xs text-center mt-5">
              Ao criar conta, você concorda com os{" "}
              <a href="/termos" className="underline hover:text-zinc-600">Termos</a>
              {" "}e{" "}
              <a href="/privacidade" className="underline hover:text-zinc-600">Privacidade</a>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-[#0d0d1a] pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-12 mb-14">
          <div>
            <Logo variant="gold" />
            <p className="text-white/35 text-sm leading-relaxed mt-5 max-w-xs">
              A plataforma brasileira de publicação com IA. Do manuscrito ao leitor em horas, não meses.
            </p>
            <div className="flex gap-5 mt-6">
              {["Instagram", "LinkedIn", "X"].map((n) => (
                <a key={n} href="#" className="text-white/25 hover:text-white/60 text-xs transition-colors">
                  {n}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-white/20 text-xs font-semibold uppercase tracking-widest mb-5">Produto</p>
            <ul className="space-y-3">
              {[
                { label: "Como funciona", href: "#como-funciona" },
                { label: "Preços",        href: "#precos"        },
                { label: "Ferramentas",   href: "#servicos"      },
                { label: "Dashboard",     href: "/dashboard"     },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-white/35 hover:text-white/65 text-sm transition-colors">{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-white/20 text-xs font-semibold uppercase tracking-widest mb-5">Serviços</p>
            <ul className="space-y-3">
              {["Diagnóstico Editorial", "Revisão com IA", "Gerador de Capa", "PDF e EPUB", "Audiolivro", "Distribuição Global"].map((l) => (
                <li key={l}>
                  <span className="text-white/35 text-sm">{l}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-white/20 text-xs font-semibold uppercase tracking-widest mb-5">Empresa</p>
            <ul className="space-y-3">
              {[
                { label: "Sobre",       href: "/sobre"       },
                { label: "Blog",        href: "/blog"        },
                { label: "Contato",     href: "/contato"     },
                { label: "Termos",      href: "/termos"      },
                { label: "Privacidade", href: "/privacidade" },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-white/35 hover:text-white/65 text-sm transition-colors">{l.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between pt-8 border-t border-white/5">
          <p className="text-white/20 text-sm">
            © {year} Autoria Tecnologia Ltda. Todos os direitos reservados.
          </p>
          <p className="text-white/20 text-xs">
            Feito no Brasil 🇧🇷
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.706 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main>
        <Hero />
        <PlatformBar />
        <HowItWorks />
        <FeatureEditorial />
        <FeatureCapa />
        <FeatureFormatos />
        <FeatureRoyalties />
        <Pricing />
        <Testimonials />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

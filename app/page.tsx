import type { Metadata } from "next";
import BrandLogo from "./_components/brand-logo";
import Link from "next/link";
import Atos from "./_components/atos";
import FAQ from "./_components/faq";
import PublicNavbar from "./_components/public-navbar";
import TypeField from "./_components/type-field";
import { PLANO_PRECO_CENTAVOS, formatarPrecoPlano } from "@/lib/planos";
import { FORMATOS_LIVRO } from "@/lib/formatos";
import { TOOLS } from "@/components/ferramentas/registry";

/** Cortes de vídeo dos atos (DESIGN-2B). Preencher com os paths em
 *  /public/media quando o Mateus entregar os cortes; null = mostra o
 *  visual estático atual do ato. */
const VIDEOS_ATOS: Record<1 | 2 | 3 | 4, string | null> = {
  1: null,
  2: null,
  3: null,
  4: null,
};

const FERRAMENTAS_HOME = [
  "simulador-impressao",
  "verificador-pdf",
  "lombada-paginas",
  "codigo-barras-isbn",
] as const;

/** CAPAS-HOME-01: vitrine de capas de demonstração geradas e
 *  finalizadas na esteira (Capa IA + editor). Ordem alterna
 *  temperatura/densidade; `aberta` = spread verso+lombada+frente. */
const CAPAS_VITRINE = [
  { src: "/capas-home/capa-fantasia-frente.webp", w: 667,  h: 1000 },
  { src: "/capas-home/capa-romance-aberta.webp",  w: 1600, h: 1193 },
  { src: "/capas-home/capa-suspense-frente.webp", w: 667,  h: 1000 },
  { src: "/capas-home/capa-infantil-aberta.webp", w: 1600, h: 1193 },
  { src: "/capas-home/capa-negocios-frente.webp", w: 667,  h: 1000 },
  { src: "/capas-home/capa-poesia-frente.webp",   w: 667,  h: 1000 },
] as const;

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
    "Plataforma brasileira de autopublicação com IA. Revisão, capa e diagramação para eBook e livro impresso.",
  offers: [
    { "@type": "Offer", name: "Essencial", price: String(PLANO_PRECO_CENTAVOS.essencial / 100), priceCurrency: "BRL" },
    { "@type": "Offer", name: "Pro",       price: String(PLANO_PRECO_CENTAVOS.pro / 100),       priceCurrency: "BRL" },
  ],
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Essencial",
    price: formatarPrecoPlano("essencial"),
    period: "por obra",
    desc: "Seu primeiro eBook, pronto pra publicar",
    highlight: false,
    cta: "Começar com Essencial",
    items: [
      "Diagnóstico editorial com IA",
      "Revisão gramatical e de estilo com IA",
      "Capa (frente) gerada por IA — até 2 imagens inclusas",
      "Página de créditos do livro preenchida por você",
      "Diagramação e EPUB pronto para as plataformas",
      "PDF digital sem marca d'água",
    ],
  },
  {
    name: "Pro",
    price: formatarPrecoPlano("pro"),
    period: "por obra",
    desc: "Tudo do Essencial + livro impresso",
    highlight: true,
    badge: "Mais popular",
    cta: "Começar com Pro",
    items: [
      "Tudo do Essencial",
      "Capa completa com IA (frente e verso ou arte única) — até 8 imagens inclusas",
      "PDF de impressão com sangria e marcas de corte",
      "Pré-visualização de impressão e simulação de tiragem",
    ],
  },
];

function Hero() {
  return (
    <section className="relative bg-white overflow-hidden min-h-[100dvh] flex flex-col items-center justify-center pt-16">
      <TypeField />
      <div className="relative z-10 w-full max-w-4xl mx-auto px-6 md:px-8 py-10 text-center">
        <h1 className="font-heading text-brand-primary text-4xl sm:text-5xl lg:text-7xl xl:text-8xl leading-[1.02] mb-8">
          Do manuscrito{" "}
          <span className="text-brand-gold">ao livro</span>{" "}
          pronto.
        </h1>

        <p className="text-brand-primary/60 text-lg md:text-xl leading-relaxed mb-12 max-w-2xl mx-auto">
          Revisão, capa e diagramação com IA — e impressão a partir de 1 exemplar.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-xl mx-auto">
          <Link
            href="/cadastro"
            className="group flex-1 bg-brand-primary text-white rounded-xl px-6 py-4 font-bold text-sm hover:bg-brand-primary/90 active:scale-[0.99] transition-all"
          >
            Tenho um manuscrito
            <span className="block text-[11px] font-medium opacity-70 mt-0.5">Revisão, capa e diagramação com IA</span>
          </Link>
          <Link
            href={"/cadastro?next=" + encodeURIComponent("/dashboard/livro-pronto")}
            className="group flex-1 border border-brand-primary/25 text-brand-primary rounded-xl px-6 py-4 font-bold text-sm hover:border-brand-gold hover:text-brand-primary active:scale-[0.99] transition-all"
          >
            Meu livro está pronto
            <span className="block text-[11px] font-medium opacity-60 mt-0.5">Verifique, veja na tela e imprima</span>
          </Link>
        </div>
      </div>
    </section>
  );
}


function FeatureEditorial() {
  return (
    <section id="servicos" className="bg-white py-20 lg:py-28 overflow-x-clip border-t border-brand-primary/8">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Visual — o mockup escuro FICA escuro (objeto de contraste sobre papel) */}
          <div className="relative order-2 lg:order-1" aria-hidden="true">
            <div className="absolute -inset-4 bg-brand-primary/10 rounded-3xl blur-2xl" />
            <div className="relative bg-brand-primary border border-brand-primary/10 rounded-2xl overflow-hidden shadow-2xl shadow-brand-primary/10">
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
              </div>
            </div>
          </div>

          {/* Text */}
          <div className="order-1 lg:order-2">
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-4">
              Revisão Editorial
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-brand-primary leading-tight mb-6">
              A IA propõe.<br />Você decide.
            </h2>
            <p className="text-brand-primary/70 text-lg leading-relaxed mb-8">
              A revisão da Autoria trabalha sugestão a sugestão: ortografia,
              estilo, ritmo e coesão — cada mudança explicada, e nada entra no
              seu texto sem a sua aprovação. O livro continua com a sua voz.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "Ortografia, gramática e estilo, sugestão a sugestão",
                "Análise de coesão, ritmo e fluidez narrativa",
                "Sinopse em 3 tamanhos (curta, média, longa)",
                "Palavras-chave pro cadastro nas lojas",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-brand-primary/70 text-base">
                  <span className="text-brand-gold mt-1 shrink-0 text-sm">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/cadastro"
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
    <section className="bg-brand-surface py-20 lg:py-28 overflow-x-clip border-t border-brand-primary/8">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">

          {/* Text */}
          <div>
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-4">
              Design de Capa
            </p>
            <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-brand-primary leading-tight mb-6">
              Gerada por IA.<br />Sua até o último detalhe.
            </h2>
            <p className="text-zinc-500 text-lg leading-relaxed mb-8">
              A capa é o principal fator de compra de um livro. A IA gera opções
              profissionais a partir do seu gênero e das suas referências — e o
              editor da Autoria deixa você ajustar tudo: fontes, cores, imagens,
              cada elemento. No fim, sai a arte-final completa, pronta pra gráfica.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "Editor completo: fontes, cores, imagens e layout",
                "Frente, contracapa, lombada e orelhas — lombada calibrada pela contagem de páginas",
                "Referência visual sua pra guiar o estilo",
                "Arte-final em alta resolução, CMYK de gráfica",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-zinc-600 text-base">
                  <span className="text-brand-gold mt-1 shrink-0 text-sm">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/cadastro"
              className="inline-flex items-center gap-2 bg-brand-primary text-white px-7 py-3.5 rounded-xl font-bold text-sm hover:bg-[#2a2a4e] active:scale-[0.98] transition-all"
            >
              Gerar minha capa →
            </Link>
          </div>

          {/* Visual */}
          <div className="relative" aria-hidden="true">
            <div className="absolute inset-0 bg-brand-primary/5 rounded-3xl blur-3xl" />
            <div className="relative">
              {/* CAPAS-HOME-01: vitrine de capas reais em marquee */}
              <div
                className="overflow-hidden rounded-2xl mb-4 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
              >
                <div className="flex w-max gap-5 animate-[capas-scroll_45s_linear_infinite] hover:[animation-play-state:paused] motion-reduce:animate-none">
                  {[...CAPAS_VITRINE, ...CAPAS_VITRINE].map((c, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={c.src}
                      alt=""
                      width={c.w}
                      height={c.h}
                      loading="lazy"
                      className="h-64 lg:h-72 w-auto rounded-lg border border-black/5 shadow-xl"
                    />
                  ))}
                </div>
              </div>
              <p className="text-zinc-400 text-[11px] text-center mb-4 -mt-1">
                Capas de demonstração — geradas e finalizadas na esteira da Autoria
              </p>

              {/* Prompt box */}
              <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-lg">
                <p className="text-zinc-400 text-xs mb-2 uppercase tracking-wider">Seu prompt</p>
                <p className="text-zinc-700 text-sm leading-relaxed italic">
                  &ldquo;Floresta densa ao entardecer, névoa baixa azulada entre troncos altos, uma jovem em silhueta caminhando em direção a uma luz dourada entre as árvores...&rdquo;
                </p>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
                  <span className="text-xs text-zinc-400">3 opções geradas</span>
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
  const destinos = [
    {
      icon: "◈",
      title: "eBook",
      sub: "EPUB 3.0 + PDF",
      desc: "EPUB 3.0 com tipografia editorial, detecção automática de capítulos, notas de rodapé e índice.",
      items: ["Padrão EPUB 3 global", "Tipografia editorial", "Detecção de capítulos, notas e índice"],
    },
    {
      icon: "⊟",
      title: "Livro Físico",
      sub: "PDF para impressão",
      desc: "PDF/X para gráficas sob demanda e impressão offset. Formatação automática com margens, sangria e páginas de rosto profissionais.",
      items: [`Formatos: ${FORMATOS_LIVRO.map(f => f.dimensoes).join(", ")}`, "Alta resolução 300 DPI", "Sangria e marcas de corte"],
    },
  ];

  return (
    <section className="bg-white py-20 lg:py-28 border-t border-brand-primary/8">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 lg:mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Formatos
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-brand-primary leading-tight mb-5">
            Um manuscrito.<br />Três destinos.
          </h2>
          <p className="text-brand-primary/60 text-lg leading-relaxed">
            eBook, livro físico e, em breve, audiolivro — todos a partir do
            mesmo arquivo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {destinos.map((f) => (
            <div key={f.title} className="bg-white border border-brand-primary/15 rounded-2xl p-8 shadow-sm shadow-brand-primary/5 hover:border-brand-gold/40 hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-6">
                <div className="w-12 h-12 rounded-xl bg-brand-gold/10 border border-brand-gold/20 flex items-center justify-center text-brand-gold text-2xl">
                  {f.icon}
                </div>
                <span className="text-brand-primary/50 text-xs font-semibold uppercase tracking-widest bg-brand-paper-deep px-3 py-1 rounded-full">{f.sub}</span>
              </div>

              <h3 className="font-heading text-2xl text-brand-primary mb-3 group-hover:text-brand-gold transition-colors">{f.title}</h3>
              <p className="text-brand-primary/60 text-sm leading-relaxed mb-6">{f.desc}</p>

              <ul className="space-y-2">
                {f.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-brand-primary/70 text-sm">
                    <span className="w-1 h-1 rounded-full bg-brand-gold/60 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Audiolivro — em breve */}
          <div className="rounded-2xl p-8 border-2 border-dashed border-brand-primary/25 bg-brand-primary/[0.02] flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div className="w-12 h-12 rounded-xl bg-brand-primary/5 border border-brand-primary/15 flex items-center justify-center text-brand-primary/60">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
                  <path d="M21 14a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2z" />
                  <path d="M3 14a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2v2z" />
                </svg>
              </div>
              <span className="text-brand-primary/60 text-[10px] font-bold uppercase tracking-widest bg-white border border-brand-primary/15 px-3 py-1 rounded-full">
                EM BREVE
              </span>
            </div>

            <h3 className="font-heading text-2xl text-brand-primary/70 mb-3">Audiolivro</h3>
            <p className="text-brand-primary/55 text-sm leading-relaxed">
              Seu livro narrado, pronto pras plataformas de áudio. Em
              desenvolvimento.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExpressSection() {
  const cards = [
    {
      titulo: "Verificação técnica aberta",
      texto:
        "Confira formato, sangria e marcas de corte do seu PDF antes mesmo de criar conta. O arquivo não sai do seu navegador.",
      link: { label: "Verificar meu PDF →", href: "/ferramentas/verificador-pdf" },
    },
    {
      titulo: "Preço na tela, em segundos",
      texto:
        "Formato, papel, capa e tiragem — o custo por exemplar aparece na hora, sem cadastro e sem surpresa no fim.",
      link: { label: "Simular preço →", href: "/simulador" },
    },
    {
      titulo: "Veja antes de pagar",
      texto:
        "Pré-visualização digital do livro montado, página a página, sem custo.",
      link: null as { label: string; href: string } | null,
    },
    {
      titulo: "A partir de 1 exemplar",
      texto:
        "Imprima 1 pra revisar ou 300 pra lançar — sem tiragem mínima, com preço de gráfica.",
      link: null as { label: string; href: string } | null,
    },
  ];

  return (
    <section id="livro-pronto" className="bg-brand-surface py-20 lg:py-28 border-t border-brand-primary/8">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12 lg:mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Já tem o livro pronto?
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-brand-primary leading-tight mb-5">
            Do PDF pronto<br />ao livro impresso.
          </h2>
          <p className="text-zinc-500 text-lg leading-relaxed">
            Se o seu PDF já está diagramado, você não precisa da esteira
            completa: suba o arquivo, confira a verificação técnica na hora,
            veja a pré-visualização do livro montado — e imprima a partir de 1
            exemplar.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {cards.map((c) => {
            const body = (
              <>
                <h3 className="font-heading text-xl text-brand-primary mb-3">
                  {c.titulo}
                </h3>
                <p className="text-zinc-600 text-sm leading-relaxed mb-4">
                  {c.texto}
                </p>
                {c.link && (
                  <span className="text-brand-gold text-sm font-semibold group-hover:underline">
                    {c.link.label}
                  </span>
                )}
              </>
            );

            if (c.link) {
              return (
                <Link
                  key={c.titulo}
                  href={c.link.href}
                  className="group block bg-white rounded-2xl border border-zinc-100 p-7 hover:border-brand-gold/40 hover:shadow-sm hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  {body}
                </Link>
              );
            }

            return (
              <div
                key={c.titulo}
                className="bg-white rounded-2xl border border-zinc-100 p-7"
              >
                {body}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link
            href="/cadastro?next=%2Fdashboard%2Flivro-pronto"
            className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary px-8 py-4 rounded-xl font-bold text-sm hover:bg-brand-gold-light active:scale-[0.98] transition-all shadow-xl shadow-brand-gold/20"
          >
            Imprimir meu livro pronto →
          </Link>
          <a
            href="#servicos"
            className="text-brand-primary/70 text-sm hover:text-brand-primary transition-colors"
          >
            Ainda vou preparar o manuscrito
          </a>
        </div>
      </div>
    </section>
  );
}

function SimuladorBand() {
  return (
    <section id="simulador" className="bg-brand-gold py-16">
      <div className="max-w-7xl mx-auto px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex-1">
            <h2 className="font-heading text-4xl lg:text-5xl text-brand-primary leading-tight mb-3">
              Quanto custa imprimir seu livro?
            </h2>
            <p className="text-brand-primary/70 text-lg leading-relaxed max-w-xl">
              Escolha formato, papel, capa e tiragem — o preço aparece na tela
              em segundos. Grátis, sem cadastro.
            </p>
          </div>
          <Link
            href="/simulador"
            className="inline-flex items-center gap-2 bg-brand-primary text-white px-8 py-4 rounded-xl font-bold text-sm hover:bg-[#2a2a4e] active:scale-[0.98] transition-all shadow-xl shadow-brand-primary/20 shrink-0"
          >
            Simular agora →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="precos" className="scroll-mt-24 bg-brand-primary py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 lg:mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Preços</p>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-5">
            Um pagamento por obra.
          </h2>
          <p className="text-white/55 text-lg">
            Sem assinatura, sem mensalidade.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {/* Tier gratuito — deliberadamente mais quieto */}
          <article className="rounded-2xl border border-white/15 relative bg-transparent hover:border-white/25 transition-colors h-full flex flex-col">
            <div className="p-8 flex-1 flex flex-col">
              <div className="mb-8 min-h-[76px]">
                <h3 className="font-heading text-2xl mb-1 text-white">Comece grátis</h3>
                <p className="text-sm text-white/40">Conheça a esteira sem cartão</p>
              </div>

              <div className="flex items-baseline gap-2 mb-8">
                <span className="font-heading text-5xl text-white">R$ 0</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {[
                  "Diagnóstico editorial completo do seu manuscrito",
                  "Ferramentas de gráfica ilimitadas",
                  "Livro pronto: verificação e pré-visualização sem custo",
                  "Sem cartão de crédito",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="text-brand-gold mt-0.5 shrink-0 text-sm">✓</span>
                    <span className="text-sm leading-snug text-white/60">{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/cadastro"
                className="mt-auto block text-center py-3.5 rounded-xl font-bold text-sm border border-white/15 text-white hover:border-brand-gold transition-all active:scale-[0.98]"
              >
                Criar conta grátis
              </Link>
            </div>
          </article>

          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-2xl border-2 relative h-full flex flex-col ${
                plan.highlight
                  ? "border-brand-gold bg-white lg:scale-105 shadow-2xl shadow-brand-gold/20"
                  : "bg-white/5 border-white/10 hover:border-white/20 transition-colors"
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-brand-gold text-brand-primary text-xs font-bold px-4 py-1.5 rounded-full tracking-widest uppercase whitespace-nowrap shadow-lg shadow-brand-gold/30">
                  {plan.badge}
                </div>
              )}

              <div className="p-8 flex-1 flex flex-col">
                <div className="mb-8 min-h-[76px]">
                  <h3 className={`font-heading text-2xl mb-1 ${plan.highlight ? "text-brand-primary" : "text-white"}`}>
                    {plan.name}
                  </h3>
                  <p className={`text-sm ${plan.highlight ? "text-zinc-400" : "text-white/40"}`}>
                    {plan.desc}
                  </p>
                </div>

                <div className="flex items-baseline gap-2 mb-8">
                  <span className={`font-heading text-5xl ${plan.highlight ? "text-brand-primary" : "text-white"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlight ? "text-zinc-400" : "text-white/40"}`}>
                    {plan.period}
                  </span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
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
                  href="/cadastro"
                  className={`mt-auto block text-center py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
                    plan.highlight
                      ? "bg-brand-primary text-white hover:bg-[#2a2a4e]"
                      : "bg-brand-gold text-brand-primary hover:bg-brand-gold-light"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <p className="text-center text-white/30 text-sm mt-10">
          Precisa de volume? Fale com a nossa equipe para condições especiais.{" "}
          <a href="mailto:contato@useautoria.com" className="text-brand-gold hover:underline">
            contato@useautoria.com
          </a>
        </p>
      </div>
    </section>
  );
}

function FerramentasHome() {
  const tools = FERRAMENTAS_HOME
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t?.href_publico));

  return (
    <section id="ferramentas-gratis" className="bg-white py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-12 lg:mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Ferramentas gratuitas
          </p>
          <h2 className="font-heading text-3xl sm:text-4xl lg:text-5xl text-brand-primary leading-tight mb-5">
            Ferramentas de gráfica,<br />abertas pra qualquer autor.
          </h2>
          <p className="text-zinc-500 text-lg leading-relaxed">
            Use direto no navegador, sem cadastro — as mesmas que a esteira da
            Autoria usa por dentro.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.href_publico!}
                className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors shrink-0">
                  <Icon />
                </div>
                <div className="flex-1">
                  <p className="font-heading text-base text-brand-primary leading-tight mb-1 group-hover:text-brand-gold transition-colors">
                    {tool.label}
                  </p>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {tool.desc}
                  </p>
                </div>
                <p className="text-xs text-brand-gold font-semibold">Abrir →</p>
              </Link>
            );
          })}
        </div>

        <div className="text-center">
          <Link
            href="/ferramentas"
            className="inline-flex items-center gap-2 border border-brand-primary/20 text-brand-primary px-7 py-3 rounded-xl font-bold text-sm hover:bg-brand-primary hover:text-white active:scale-[0.98] transition-all"
          >
            Todas as ferramentas →
          </Link>
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

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_480px] gap-12 lg:gap-20 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/25 rounded-full px-4 py-1.5 text-brand-gold text-xs font-semibold uppercase tracking-widest mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
              Diagnóstico gratuito disponível agora
            </div>
            <h2 className="font-heading text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.02] mb-6">
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
            </div>
          </div>

          {/* Sign-up card */}
          <div className="bg-white rounded-2xl p-8 shadow-2xl border border-zinc-100">
            <div className="mb-1">
              <BrandLogo variant="navy" height={108} />
            </div>
            <h3 className="font-heading text-2xl text-brand-primary mt-4 mb-1">Crie sua conta grátis</h3>
            <p className="text-zinc-500 text-sm mb-7">
              Diagnóstico gratuito. Sem cartão de crédito.
            </p>

            <Link
              href="/cadastro"
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

            <Link
              href="/cadastro"
              className="w-full flex items-center justify-center gap-2 bg-brand-gold text-brand-primary py-3.5 rounded-xl font-bold text-sm hover:bg-brand-gold-light active:scale-[0.98] transition-all"
            >
              Criar conta com e-mail →
            </Link>

            <p className="text-zinc-400 text-xs leading-relaxed mt-5">
              Ao criar conta, você concorda com os{" "}
              <Link href="/termos" className="text-brand-primary font-semibold hover:underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="text-brand-primary font-semibold hover:underline">
                Política de Privacidade
              </Link>
              .
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
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-10 lg:gap-12 mb-14">
          <div>
            <BrandLogo variant="gold" height={108} />
            <p className="text-white/35 text-sm leading-relaxed mt-5 max-w-xs">
              A plataforma brasileira de publicação com IA. Do manuscrito ao livro pronto.
            </p>
          </div>

          <div>
            <p className="text-white/20 text-xs font-semibold uppercase tracking-widest mb-5">Produto</p>
            <ul className="space-y-3">
              {[
                { label: "Como funciona",        href: "/#como-funciona" },
                { label: "Planos",               href: "/#precos"        },
                { label: "Ferramentas",          href: "/ferramentas"    },
                { label: "Perguntas frequentes", href: "/#faq"           },
                { label: "Dashboard",            href: "/dashboard"     },
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
              {["Diagnóstico Editorial", "Revisão com IA", "Gerador de Capa", "PDF e EPUB"].map((l) => (
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
                { label: "Blog",                     href: "/blog"                 },
                { label: "Termos de Uso",            href: "/termos"               },
                { label: "Política de Privacidade",  href: "/privacidade"          },
                { label: "Política de Conteúdo",     href: "/politica-de-conteudo" },
                { label: "Contrato de Serviços",     href: "/contrato-servicos"    },
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
            © {year} Autoria
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
      <PublicNavbar tone="light" />
      <main>
        <Hero />
        <div className="border-t border-brand-primary/8">
          <Atos videos={VIDEOS_ATOS} />
        </div>
        <FeatureEditorial />
        <FeatureCapa />
        <FeatureFormatos />
        <ExpressSection />
        <SimuladorBand />
        <Pricing />
        <FerramentasHome />
        <div className="border-t border-brand-primary/8">
          <FAQ />
        </div>
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

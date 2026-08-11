import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import FAQ from "./_components/faq";
import HowItWorks from "./_components/how-it-works";
import PublicNavbar from "./_components/public-navbar";
import { PLANO_PRECO_CENTAVOS, formatarPrecoPlano } from "@/lib/planos";
import { FORMATOS_LIVRO } from "@/lib/formatos";
import { TOOLS } from "@/components/ferramentas/registry";

const FERRAMENTAS_HOME = [
  "simulador-impressao",
  "verificador-pdf",
  "lombada-paginas",
  "codigo-barras-isbn",
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
    desc: "Publique seu primeiro eBook",
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
      "Prova de impressão e simulação de tiragem",
    ],
  },
];

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
              Do manuscrito{" "}
              <span className="text-brand-gold">ao livro</span>{" "}
              pronto.
            </h1>

            <p className="text-white/60 text-xl leading-relaxed mb-10 max-w-lg">
              A Autoria usa inteligência artificial para transformar seu manuscrito
              em livro pronto para publicar — com revisão, capa e diagramação.
              Sem editora.
            </p>

            <div className="flex items-center gap-4 mb-14">
              <Link
                href="/cadastro"
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

            {/* Trust signal */}
            <div className="flex items-center gap-6 pt-8 border-t border-white/10">
              <p className="text-white/40 text-xs">Diagnóstico gratuito</p>
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
                    useautoria.com/dashboard
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
                        Plano Pro
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
                <p className="text-white/40 text-[10px] mb-1">Capa</p>
                <p className="text-brand-gold font-heading text-xl">Pronta</p>
                <p className="text-white/30 text-[9px] mt-0.5">frente + lombada</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar at bottom of hero */}
        <div className="grid grid-cols-4 border-t border-white/5 -mx-8">
          {[
            { value: "R$197", label: "A partir de, por obra"      },
            { value: "100%",  label: "Direitos autorais do autor" },
            { value: "0",     label: "Tiragem mínima"             },
            { value: "PT-BR", label: "Esteira editorial em português" },
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
              a Autoria usa o modelo Claude Sonnet, da Anthropic,
              ajustado especificamente para o português brasileiro. Cada sugestão
              considera seu estilo, gênero e tom narrativo.
            </p>
            <ul className="space-y-4 mb-10">
              {[
                "Revisão gramatical e ortográfica em PT-BR",
                "Análise de coesão, coerência e estilo",
                "Sugestões de ritmo e fluidez narrativa",
                "Geração de sinopse em 3 formatos (curta, média, longa)",
                "Palavras-chave otimizadas para SEO editorial",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-white/70 text-base">
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
  const formatosDisponiveis = FORMATOS_LIVRO.map(f => f.dimensoes).join(", ");
  return (
    <section className="bg-brand-primary py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Formatos
          </p>
          <h2 className="font-heading text-5xl text-white leading-tight mb-5">
            Um manuscrito.<br />Dois formatos.
          </h2>
          <p className="text-white/55 text-lg leading-relaxed">
            eBook e livro físico gerados a partir do mesmo arquivo,
            em um único fluxo de trabalho.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {[
            {
              icon: "◈",
              title: "eBook",
              sub: "EPUB 3.0 + PDF",
              desc: "EPUB 3.0 com tipografia editorial, detecção automática de capítulos, notas de rodapé e índice.",
              items: ["Padrão EPUB 3 global", "Tipografia editorial", "Detecção de capítulos", "Notas de rodapé e índice"],
            },
            {
              icon: "⊟",
              title: "Livro Físico",
              sub: "PDF para impressão",
              desc: "PDF/X para gráficas sob demanda e impressão offset. Formatação automática com margens, sangria e páginas de rosto profissionais.",
              items: ["Impressão sob demanda, sem tiragem mínima", `Formatos: ${formatosDisponiveis}`, "Alta resolução 300 DPI", "Sangria e marcas de corte"],
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
      titulo: "Prova visual grátis",
      texto:
        "Veja o livro montado, página a página, antes de pagar qualquer coisa.",
      link: null as { label: string; href: string } | null,
    },
    {
      titulo: "Prazo por escrito",
      texto:
        "Produção em até 15 dias úteis para tiragens de até 300 exemplares — garantido em contrato, não em promessa.",
      link: { label: "Ler no contrato →", href: "/contrato-servicos" },
    },
  ];

  return (
    <section id="livro-pronto" className="bg-brand-surface py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Já tem o livro pronto?
          </p>
          <h2 className="font-heading text-5xl text-brand-primary leading-tight mb-5">
            Publique em minutos.<br />Imprima com preço de gráfica.
          </h2>
          <p className="text-zinc-500 text-lg leading-relaxed">
            Se o seu PDF já está diagramado, você não precisa da esteira
            completa: suba o arquivo, confira a verificação técnica na hora,
            veja a prova visual do livro montado — e imprima a partir de 1
            exemplar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
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

        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/30 rounded-full px-4 py-1.5 text-brand-primary text-xs font-semibold uppercase tracking-widest">
            Sem tiragem mínima — a partir de 1 exemplar
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <Link
            href="/cadastro?next=%2Fdashboard%2Flivro-pronto"
            className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary px-8 py-4 rounded-xl font-bold text-sm hover:bg-brand-gold-light active:scale-[0.98] transition-all shadow-xl shadow-brand-gold/20"
          >
            Publicar meu livro pronto →
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
    <section id="precos" className="bg-brand-primary py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Preços</p>
          <h2 className="font-heading text-5xl text-white leading-tight mb-5">
            Pague uma vez.<br />Publique para sempre.
          </h2>
          <p className="text-white/55 text-lg">
            Sem assinatura. Diagnóstico gratuito antes de qualquer cobrança.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 items-start max-w-4xl mx-auto">
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
                  href="/cadastro"
                  className={`block text-center py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] ${
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

        <p className="text-center text-white/30 text-xs mt-3">
          <Link href="/contrato-servicos#clausula-7" className="hover:text-white/60 underline underline-offset-4">
            Arrependimento em 7 dias, conforme o Contrato de Serviços
          </Link>
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
    <section id="ferramentas-gratis" className="bg-brand-surface py-28">
      <div className="max-w-7xl mx-auto px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Ferramentas gratuitas
          </p>
          <h2 className="font-heading text-5xl text-brand-primary leading-tight mb-5">
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
      <div className="max-w-7xl mx-auto px-8">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-12 mb-14">
          <div>
            <Logo variant="gold" />
            <p className="text-white/35 text-sm leading-relaxed mt-5 max-w-xs">
              A plataforma brasileira de publicação com IA. Do manuscrito ao livro pronto.
            </p>
          </div>

          <div>
            <p className="text-white/20 text-xs font-semibold uppercase tracking-widest mb-5">Produto</p>
            <ul className="space-y-3">
              {[
                { label: "Como funciona", href: "#como-funciona" },
                { label: "Preços",        href: "#precos"        },
                { label: "Ferramentas",   href: "/ferramentas"   },
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
      <PublicNavbar />
      <main>
        <Hero />
        <HowItWorks />
        <FeatureEditorial />
        <FeatureCapa />
        <FeatureFormatos />
        <ExpressSection />
        <SimuladorBand />
        <Pricing />
        <FerramentasHome />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

import Link from "next/link";

const STEPS = [
  { n: 1, label: "Upload",      desc: "Envie seu manuscrito (.docx, .pdf ou .txt)",       href: "/dashboard/novo-projeto", cta: "Fazer upload" },
  { n: 2, label: "Diagnóstico", desc: "IA analisa gênero, pontos fortes e mercado-alvo",   href: null,                      cta: null },
  { n: 3, label: "Revisão",     desc: "Correção de gramática, estilo e consistência",       href: null,                      cta: null },
  { n: 4, label: "Capa",        desc: "Geração de capa profissional com IA",                href: null,                      cta: null },
  { n: 5, label: "Diagramação", desc: "Formatação automática para Amazon KDP e EPUB",       href: null,                      cta: null },
  { n: 6, label: "Publicação",  desc: "Envio direto para Amazon, Apple Books e mais",       href: null,                      cta: null },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-brand-surface">

      {/* Header */}
      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-heading text-2xl text-brand-gold">Autoria</h1>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-gold/20 flex items-center justify-center">
              <span className="text-brand-gold text-xs font-bold">A</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">

        {/* Boas-vindas */}
        <div className="mb-10">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Bem-vindo ao
          </p>
          <h2 className="font-heading text-4xl text-brand-primary leading-tight">
            Seu painel de publicação
          </h2>
          <p className="text-zinc-500 mt-2 text-sm">
            Siga as etapas abaixo para transformar seu manuscrito em um livro publicado.
          </p>
        </div>

        {/* CTA principal */}
        <Link
          href="/dashboard/novo-projeto"
          className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] active:scale-[0.99] transition-all mb-12"
        >
          <UploadIcon />
          Iniciar novo projeto
        </Link>

        {/* Pipeline de etapas */}
        <div className="grid md:grid-cols-2 gap-4">
          {STEPS.map((step) => (
            <div
              key={step.n}
              className={`rounded-2xl border p-6 flex gap-5 items-start transition-all
                ${step.n === 1
                  ? "border-brand-gold/40 bg-brand-gold/5"
                  : "border-zinc-100 bg-white opacity-60"}`}
            >
              <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                ${step.n === 1
                  ? "bg-brand-gold text-brand-primary"
                  : "bg-zinc-100 text-zinc-400"}`}
              >
                {step.n}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-heading text-lg leading-none mb-1 ${step.n === 1 ? "text-brand-primary" : "text-zinc-400"}`}>
                  {step.label}
                </p>
                <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
                {step.href && step.cta && (
                  <Link
                    href={step.href}
                    className="inline-block mt-3 text-xs font-semibold text-brand-gold hover:text-brand-gold-light underline underline-offset-4 transition-colors"
                  >
                    {step.cta} →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap gap-3 mt-8 pt-8 border-t border-zinc-100">
          <Link
            href="/dashboard/ferramentas"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <ToolsIcon />
            Ferramentas
          </Link>
          <Link
            href="/dashboard/planos"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <PlansIcon />
            Planos e preços
          </Link>
        </div>

        {/* Rodapé do painel */}
        <p className="text-center text-zinc-300 text-xs mt-10">
          Autoria — Do manuscrito ao leitor.
        </p>
      </main>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function ToolsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

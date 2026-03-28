import Link from "next/link";

// ─── Tools registry ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: "/dashboard/ferramentas/rgb-cmyk",
    icon: <PaletteIcon />,
    label: "RGB → CMYK",
    desc: "Converta cores RGB para CMYK para impressão profissional de capas.",
    badge: null,
    available: true,
  },
  {
    href: "#",
    icon: <ImageIcon />,
    label: "Gerador de capa",
    desc: "Crie capas profissionais com IA usando DALL-E 3. Exporta em PDF/X-1a.",
    badge: "Em breve",
    available: false,
  },
  {
    href: "#",
    icon: <BookOpenIcon />,
    label: "Diagramação",
    desc: "Formate automaticamente para Amazon KDP (6×9) e EPUB 3.0.",
    badge: "Em breve",
    available: false,
  },
  {
    href: "#",
    icon: <MicIcon />,
    label: "Audiolivro",
    desc: "Converta seu texto em audiolivro com vozes neurais em português.",
    badge: "Em breve",
    available: false,
  },
  {
    href: "#",
    icon: <SendIcon />,
    label: "Publicação",
    desc: "Publique diretamente na Amazon, Apple Books e +13 plataformas.",
    badge: "Em breve",
    available: false,
  },
  {
    href: "#",
    icon: <BarChartIcon />,
    label: "Royalties",
    desc: "Acompanhe vendas e royalties em tempo real de todas as plataformas.",
    badge: "Em breve",
    available: false,
  },
];

export default function FerramentasPage() {
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
            <span className="text-brand-gold/80">Ferramentas</span>
          </div>
          <h1 className="font-heading text-xl text-brand-gold">Autoria</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="mb-10">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Caixa de ferramentas
          </p>
          <h2 className="font-heading text-4xl text-brand-primary leading-tight">
            Ferramentas editoriais
          </h2>
          <p className="text-zinc-500 mt-2 text-sm">
            Cada ferramenta pode ser usada de forma independente, sem precisar
            passar pelo fluxo completo de publicação.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => (
            <div key={tool.label} className="relative">
              {tool.available ? (
                <Link
                  href={tool.href}
                  className="flex flex-col gap-4 bg-white rounded-2xl border border-zinc-100 p-6 hover:border-brand-gold/30 hover:shadow-sm transition-all group h-full"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors">
                    {tool.icon}
                  </div>
                  <div>
                    <p className="font-heading text-lg text-brand-primary leading-none mb-1.5">
                      {tool.label}
                    </p>
                    <p className="text-sm text-zinc-500 leading-relaxed">{tool.desc}</p>
                  </div>
                  <p className="text-brand-gold text-xs font-semibold mt-auto">
                    Abrir ferramenta →
                  </p>
                </Link>
              ) : (
                <div className="flex flex-col gap-4 bg-white rounded-2xl border border-zinc-100 p-6 opacity-50 h-full">
                  <div className="w-11 h-11 rounded-xl bg-zinc-50 flex items-center justify-center">
                    {tool.icon}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="font-heading text-lg text-zinc-400 leading-none">{tool.label}</p>
                      {tool.badge && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 bg-zinc-100 text-zinc-400 rounded-full">
                          {tool.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{tool.desc}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-zinc-300 text-xs mt-14">
          Autoria — Do manuscrito ao leitor.
        </p>
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PaletteIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="#1a1a2e" />
      <circle cx="17.5" cy="10.5" r=".5" fill="#1a1a2e" />
      <circle cx="8.5" cy="7.5" r=".5" fill="#1a1a2e" />
      <circle cx="6.5" cy="12.5" r=".5" fill="#1a1a2e" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function BookOpenIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BarChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

import Link from "next/link";

// ─── Tools registry ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: "/dashboard/ferramentas/diagnostico",
    icon: ScanIcon,
    label: "Diagnóstico Editorial",
    desc: "Análise de gênero, complexidade, pontos fortes e oportunidades de melhoria.",
    categoria: "IA Editorial",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/revisor",
    icon: CheckIcon,
    label: "Revisor de Texto",
    desc: "Revisão gramatical, ortográfica e de estilo com sugestões precisas.",
    categoria: "IA Editorial",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/elementos",
    icon: SparkleIcon,
    label: "Elementos Editoriais",
    desc: "Sinopse, títulos alternativos, palavras-chave e ficha catalográfica (CBL).",
    categoria: "IA Editorial",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/capa-ia",
    icon: ImageIcon,
    label: "Gerador de Capa IA",
    desc: "Capas profissionais geradas por IA. Insira título, sinopse e gênero.",
    categoria: "IA Visual",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/pdf",
    icon: PdfIcon,
    label: "Gerar PDF",
    desc: "Diagramação automática em PDF para Amazon KDP (6×9), A5 ou Carta.",
    categoria: "Diagramação",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/epub",
    icon: EpubIcon,
    label: "Gerar EPUB 3",
    desc: "Converta seu manuscrito em EPUB compatível com Kindle, Kobo e Apple Books.",
    categoria: "Diagramação",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/audiolivro",
    icon: MicIcon,
    label: "Narração com IA",
    desc: "Converta trechos em áudio com vozes neurais. Até 4.500 caracteres por geração.",
    categoria: "Mídia",
    available: true,
  },
  {
    href: "/dashboard/ferramentas/rgb-cmyk",
    icon: PaletteIcon,
    label: "RGB → CMYK",
    desc: "Converta cores RGB para CMYK para impressão profissional de capas.",
    categoria: "Utilidades",
    available: true,
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FerramentasPage() {
  const categorias = [...new Set(TOOLS.map(t => t.categoria))];

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">

      <div className="mb-10">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Caixa de ferramentas</p>
        <h1 className="font-heading text-4xl text-brand-primary leading-tight mb-2">Ferramentas editoriais</h1>
        <p className="text-zinc-500 text-sm max-w-lg">
          Cada ferramenta funciona de forma independente — sem precisar iniciar um projeto completo. Copie, baixe e publique na hora.
        </p>
      </div>

      {categorias.map(cat => {
        const items = TOOLS.filter(t => t.categoria === cat);
        return (
          <div key={cat} className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">{cat}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(tool => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors shrink-0">
                      <Icon />
                    </div>
                    <div className="flex-1">
                      <p className="font-heading text-base text-brand-primary leading-tight mb-1 group-hover:text-brand-gold transition-colors">
                        {tool.label}
                      </p>
                      <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
                    </div>
                    <p className="text-xs text-brand-gold font-semibold">Abrir →</p>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ScanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10"/>
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    </svg>
  );
}
function ImageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
    </svg>
  );
}
function PdfIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}
function EpubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
    </svg>
  );
}
function PaletteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="#1a1a2e"/>
      <circle cx="17.5" cy="10.5" r=".5" fill="#1a1a2e"/>
      <circle cx="8.5" cy="7.5" r=".5" fill="#1a1a2e"/>
      <circle cx="6.5" cy="12.5" r=".5" fill="#1a1a2e"/>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
    </svg>
  );
}

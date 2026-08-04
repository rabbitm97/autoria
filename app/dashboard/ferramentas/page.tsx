import Link from "next/link";

// ─── Registry ─────────────────────────────────────────────────────────────────

type EstadoFerramenta = "gratis" | "pago" | "breve";

type CategoriaFerramenta =
  | "Análise e texto"
  | "Arquivos e formatos"
  | "Capa e imagem"
  | "Áudio";

interface FerramentaCard {
  id: string;
  label: string;
  desc: string;
  categoria: CategoriaFerramenta;
  estado: EstadoFerramenta;
  /** Só quando estado === "gratis" */
  href?: string;
  /** Só quando estado === "pago". 1 crédito = R$ 1 — exibir o MESMO número. */
  preco_creditos?: number;
  /** Copy estruturada de preço p/ casos não-unitários (capa). Substitui preco_creditos. */
  preco_copy?: {
    principal: string;    // ex.: "R$ 20" — mesmo estilo do preço dos outros
    sufixo: string;       // ex.: "por imagem" — text-sm zinc-500, inline
    secundario: string;   // ex.: "4 por R$ 60" — text-sm zinc-600
    creditos: string;     // ex.: "ou 20 créditos por imagem · 4 por 60"
  };
  /** Limite honesto exibido no card grátis. Ausente = sem limite. */
  limite?: string;
  icon: () => React.ReactElement;
}

// Ordem canônica das categorias na tela.
const CATEGORIAS_ORDEM: readonly CategoriaFerramenta[] = [
  "Análise e texto",
  "Arquivos e formatos",
  "Capa e imagem",
  "Áudio",
] as const;

const TOOLS: readonly FerramentaCard[] = [
  // ── Análise e texto ─────────────────────────────────────────────────────────
  {
    id: "diagnostico-expresso",
    label: "Diagnóstico Expresso",
    desc: "Análise editorial rápida de uma amostra do seu manuscrito.",
    categoria: "Análise e texto",
    estado: "pago",
    preco_creditos: 10,
    icon: ScanIcon,
  },
  {
    id: "diagnostico-completo",
    label: "Diagnóstico completo",
    desc: "Diagnóstico editorial completo do livro inteiro, capítulo a capítulo.",
    categoria: "Análise e texto",
    estado: "pago",
    preco_creditos: 40,
    icon: ScanIcon,
  },
  {
    id: "revisao",
    label: "Revisão completa",
    desc: "Manuscrito revisado por IA, entregue em DOCX com as alterações.",
    categoria: "Análise e texto",
    estado: "pago",
    preco_creditos: 150,
    icon: CheckIcon,
  },
  {
    id: "traducao",
    label: "Tradução",
    desc: "Seu livro traduzido para outro idioma, em DOCX ou EPUB.",
    categoria: "Análise e texto",
    estado: "pago",
    preco_creditos: 200,
    icon: GlobeIcon,
  },

  // ── Arquivos e formatos ─────────────────────────────────────────────────────
  {
    id: "lombada-paginas",
    label: "Lombada e páginas",
    desc: "Estime páginas e calcule a lombada do seu livro em qualquer formato.",
    categoria: "Arquivos e formatos",
    estado: "gratis",
    href: "/dashboard/ferramentas/lombada-paginas",
    icon: RulerIcon,
  },
  {
    id: "pdf-docx",
    label: "PDF para DOCX",
    desc: "Converta PDFs com texto em arquivos Word editáveis.",
    categoria: "Arquivos e formatos",
    estado: "gratis",
    href: "/dashboard/ferramentas/pdf-docx",
    limite: "2 por dia",
    icon: ConvertIcon,
  },
  {
    id: "ficha-creditos",
    label: "Ficha e página de créditos",
    desc: "Monte a página de créditos do seu livro pronta para impressão.",
    categoria: "Arquivos e formatos",
    estado: "gratis",
    href: "/dashboard/ferramentas/creditos",
    icon: DocIcon,
  },
  {
    id: "epub",
    label: "EPUB",
    desc: "Converta seu arquivo em um EPUB pronto para as lojas digitais.",
    categoria: "Arquivos e formatos",
    estado: "pago",
    preco_creditos: 50,
    icon: EpubIcon,
  },
  {
    id: "diagramacao-digital",
    label: "Diagramação digital",
    desc: "Miolo diagramado profissionalmente em PDF para plataformas digitais.",
    categoria: "Arquivos e formatos",
    estado: "pago",
    preco_creditos: 100,
    icon: PdfIcon,
  },
  {
    id: "diagramacao-completa",
    label: "Diagramação completa",
    desc: "PDF digital + PDF gráfico em CMYK, pronto para a gráfica.",
    categoria: "Arquivos e formatos",
    estado: "pago",
    preco_creditos: 150,
    icon: PdfIcon,
  },

  // ── Capa e imagem ───────────────────────────────────────────────────────────
  {
    id: "rgb-cmyk",
    label: "RGB → CMYK",
    desc: "Converta cores RGB para CMYK para impressão profissional.",
    categoria: "Capa e imagem",
    estado: "gratis",
    href: "/dashboard/ferramentas/rgb-cmyk",
    icon: PaletteIcon,
  },
  {
    id: "capa-ia",
    label: "Capa com IA",
    desc: "Capas em 4K geradas por IA a partir do seu briefing.",
    categoria: "Capa e imagem",
    estado: "pago",
    preco_copy: {
      principal: "R$ 20",
      sufixo: "por imagem",
      secundario: "4 por R$ 60",
      creditos: "ou 20 créditos por imagem · 4 por 60",
    },
    icon: SparkleIcon,
  },

  // ── Áudio ───────────────────────────────────────────────────────────────────
  {
    id: "audiolivro",
    label: "Audiolivro",
    desc: "Seu livro narrado com voz neural, capítulo a capítulo.",
    categoria: "Áudio",
    estado: "breve",
    icon: MicIcon,
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FerramentasPage() {
  const gratis = TOOLS.filter(t => t.estado === "gratis");

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">

      <div className="mb-10">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Caixa de ferramentas</p>
        <h1 className="font-heading text-4xl text-brand-primary leading-tight mb-2">Ferramentas editoriais</h1>
        <p className="text-zinc-500 text-sm max-w-lg">
          Cada ferramenta funciona de forma independente — sem precisar iniciar um projeto completo. Copie, baixe e publique na hora.
        </p>
      </div>

      {/* Seção grátis no topo — categoria vira tag dentro do card */}
      {gratis.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Use agora — grátis</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gratis.map(tool => (
              <FerramentaCardView key={tool.id} tool={tool} mostrarCategoriaTag />
            ))}
          </div>
        </div>
      )}

      {/* Catálogo por categoria — só pagos + em breve */}
      {CATEGORIAS_ORDEM.map(cat => {
        const items = TOOLS.filter(t => t.categoria === cat && t.estado !== "gratis");
        if (items.length === 0) return null;
        return (
          <div key={cat} className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">{cat}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(tool => <FerramentaCardView key={tool.id} tool={tool} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Card renderer (3 estados) ────────────────────────────────────────────────

function FerramentaCardView({
  tool,
  mostrarCategoriaTag = false,
}: {
  tool: FerramentaCard;
  mostrarCategoriaTag?: boolean;
}) {
  const Icon = tool.icon;

  if (tool.estado === "gratis") {
    return (
      <Link
        href={tool.href!}
        className="relative flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
      >
        {tool.limite && (
          <span className="absolute top-3 right-4 text-[10px] text-zinc-400">
            {tool.limite}
          </span>
        )}
        <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors shrink-0">
          <Icon />
        </div>
        <div className="flex-1">
          {mostrarCategoriaTag && (
            <p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
              {tool.categoria}
            </p>
          )}
          <p className="font-heading text-base text-brand-primary leading-tight mb-1 group-hover:text-brand-gold transition-colors">
            {tool.label}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
        </div>
        <p className="text-xs text-brand-gold font-semibold">Abrir →</p>
      </Link>
    );
  }

  if (tool.estado === "pago") {
    return (
      <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5">
        <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center shrink-0">
          <Icon />
        </div>
        <div className="flex-1">
          <p className="font-heading text-base text-brand-primary leading-tight mb-1">
            {tool.label}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
        </div>
        <div>
          {tool.preco_copy ? (
            <>
              <p className="leading-none flex items-baseline gap-2">
                <span className="font-heading text-2xl text-brand-primary">
                  {tool.preco_copy.principal}
                </span>
                <span className="text-sm text-zinc-500">
                  {tool.preco_copy.sufixo}
                </span>
              </p>
              <p className="text-sm text-zinc-600 mt-1">
                {tool.preco_copy.secundario}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {tool.preco_copy.creditos}
              </p>
            </>
          ) : (
            <>
              <p className="font-heading text-2xl text-brand-primary leading-none">
                R$ {tool.preco_creditos ?? 0}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                ou {tool.preco_creditos ?? 0} créditos
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          disabled
          className="w-full mt-1 rounded-xl bg-zinc-100 text-zinc-400 text-xs font-semibold py-2 cursor-not-allowed"
        >
          Disponível em breve
        </button>
      </div>
    );
  }

  // breve
  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5">
      <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center shrink-0">
        <Icon />
      </div>
      <div className="flex-1">
        <p className="font-heading text-base text-brand-primary leading-tight mb-1">
          {tool.label}
        </p>
        <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
      </div>
      <p className="text-xs text-zinc-400 font-semibold">Em breve</p>
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
function ConvertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/>
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
      <polyline points="9 11 12 8 15 11"/>
      <polyline points="9 13 12 16 15 13"/>
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
function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20"/>
      <path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>
    </svg>
  );
}
function RulerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.3 8.7 8.7 21.3a2.4 2.4 0 0 1-3.4 0L2.7 18.7a2.4 2.4 0 0 1 0-3.4L15.3 2.7a2.4 2.4 0 0 1 3.4 0l2.6 2.6a2.4 2.4 0 0 1 0 3.4z"/>
      <path d="m7.5 10.5 2 2"/>
      <path d="m10.5 7.5 2 2"/>
      <path d="m13.5 4.5 2 2"/>
      <path d="m4.5 13.5 2 2"/>
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
      <line x1="8" y1="9" x2="10" y2="9"/>
    </svg>
  );
}

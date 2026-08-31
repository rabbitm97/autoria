"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import BrandLogo from "@/app/_components/brand-logo";

// ─── Nav structure ────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: () => React.ReactElement;
  exact?: boolean;
}

interface NavSection {
  section: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    section: "INÍCIO",
    items: [
      { href: "/dashboard", label: "Painel", icon: HomeIcon, exact: true },
    ],
  },
  {
    section: "PROJETOS",
    items: [
      { href: "/dashboard/novo-projeto",  label: "Novo Projeto",         icon: PlusIcon },
      { href: "/dashboard/livro-pronto",  label: "Livro pronto",          icon: EpubIcon },
    ],
  },
  {
    section: "FERRAMENTAS",
    items: [
      { href: "/dashboard/ferramentas",                 label: "Todas as ferramentas", icon: ToolsIcon,       exact: true },
      { href: "/dashboard/ferramentas/lombada-paginas", label: "Lombada e páginas",    icon: ScanIcon      },
      { href: "/dashboard/ferramentas/pdf-docx",        label: "PDF → DOCX",           icon: ConvertIcon   },
      { href: "/dashboard/ferramentas/creditos",           label: "Ficha de créditos",    icon: CheckEditIcon },
      { href: "/dashboard/ferramentas/codigo-barras-isbn", label: "Código de barras",     icon: BarcodeIcon   },
      { href: "/dashboard/ferramentas/rgb-cmyk",           label: "RGB → CMYK",           icon: PaletteIcon   },
    ],
  },
  {
    section: "PUBLICAÇÃO",
    items: [
      { href: "/dashboard/planos",     label: "Planos e Preços", icon: PlansIcon     },
      { href: "/dashboard/royalties",  label: "Royalties",       icon: RoyaltiesIcon },
    ],
  },
  {
    section: "SUPORTE",
    items: [
      { href: "/dashboard/suporte", label: "Suporte IA", icon: SupportIcon },
    ],
  },
];

// ─── Dashboard shell (SHELL-1B: drawer mobile + sidebar fixa no desktop) ──────

export function DashboardShell({
  children,
  mobileLogo,
}: {
  children: React.ReactNode;
  mobileLogo: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Fecha a gaveta quando a rota muda (cobre navegação normal via Link).
  useEffect(() => { setOpen(false); }, [pathname]);

  // Esc fecha.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Foco: vai pro drawer ao abrir, volta pro botão ao fechar.
  useEffect(() => {
    if (open) drawerRef.current?.focus();
    else      buttonRef.current?.focus();
  }, [open]);

  return (
    <div className="flex h-dvh overflow-hidden bg-brand-surface">
      {/* Sidebar fixa — desktop only */}
      <Sidebar />

      {/* Coluna direita: topo mobile + miolo rolável */}
      <div className="flex-1 min-w-0 h-full flex flex-col">
        {/* Topo mobile */}
        <header className="lg:hidden shrink-0 h-14 bg-brand-primary border-b border-white/8 flex items-center justify-between px-4">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls="dashboard-drawer"
            className="p-2 -ml-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition-colors"
          >
            <MenuIcon />
          </button>
          <span aria-hidden="true">{mobileLogo}</span>
          <span aria-hidden="true" className="w-9" />
        </header>

        {/* Miolo — única região de scroll */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-brand [scrollbar-gutter:stable]">
          {children}
        </div>
      </div>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        id="dashboard-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        aria-hidden={!open}
        tabIndex={-1}
        className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-dvh outline-none transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fechar menu"
            className="absolute top-3 right-3 z-10 p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <CloseIcon />
          </button>
          <Sidebar isDrawer onNavigate={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="7"  x2="20" y2="7"  />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6"  y2="18" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Sidebar({
  isDrawer = false,
  onNavigate,
}: {
  isDrawer?: boolean;
  onNavigate?: () => void;
} = {}) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  async function handleLogout() {
    if (process.env.NODE_ENV !== "development") {
      await supabase.auth.signOut();
    }
    onNavigate?.();
    router.push("/");
  }

  // SHELL-1B: desktop = coluna fixa (hidden < lg); drawer = ocupa 100%
  // do contêiner drawer (fixed) e não tem border-r (bordas já ficam
  // sob o backdrop).
  const wrapperCls = isDrawer
    ? "flex flex-col h-full w-full bg-[#1a1a2e] overflow-y-auto scrollbar-brand"
    : "hidden lg:flex flex-col w-60 shrink-0 h-full bg-[#1a1a2e] border-r border-white/8 overflow-y-auto scrollbar-brand";

  return (
    <aside className={wrapperCls}>

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8">
        <Link href="/dashboard" aria-label="Autoria — painel" className="inline-flex group">
          <BrandLogo variant="gold" height={28} />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {NAV_SECTIONS.map(({ section, items }) => (
          <div key={section}>
            <p className="px-2 mb-1.5 text-[10px] font-semibold tracking-widest text-white/25 uppercase select-none">
              {section}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(href, exact);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                        ${active
                          ? "bg-brand-gold/12 text-brand-gold border border-brand-gold/20"
                          : "text-white/55 hover:text-white/90 hover:bg-white/5 border border-transparent"
                        }
                      `}
                    >
                      <span className={`shrink-0 ${active ? "text-brand-gold" : "text-white/35"}`}>
                        <Icon />
                      </span>
                      {label}
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-gold shrink-0" />
                      )}
                    </Link>
                  </li>
                );
              })}
              {section === "PUBLICAÇÃO" && (
                <li>
                  <CartSidebarLink isActive={isActive("/carrinho", true)} onNavigate={onNavigate} />
                </li>
              )}
            </ul>
          </div>
        ))}
      </nav>

      {/* SALDO-SIDEBAR */}
      <SaldoCreditos />

      {/* Bottom: Perfil + Sair */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-white/8 pt-3">
        <Link
          href="/dashboard/perfil"
          onClick={onNavigate}
          className={`
            flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
            ${isActive("/dashboard/perfil")
              ? "bg-brand-gold/12 text-brand-gold border border-brand-gold/20"
              : "text-white/55 hover:text-white/90 hover:bg-white/5 border border-transparent"
            }
          `}
        >
          <span className={`shrink-0 ${isActive("/dashboard/perfil") ? "text-brand-gold" : "text-white/35"}`}>
            <UserIcon />
          </span>
          Perfil
          {isActive("/dashboard/perfil") && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-gold shrink-0" />
          )}
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-red-400 hover:bg-red-500/8 border border-transparent transition-all duration-150"
        >
          <span className="shrink-0"><LogoutIcon /></span>
          Sair
        </button>
      </div>
    </aside>
  );
}

// ─── SALDO-SIDEBAR: chip de créditos (decisão 6.7) ───────────────────────────

function SaldoCreditos() {
  const pathname = usePathname();
  const [saldo, setSaldo] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("users").select("creditos").eq("id", user.id).single();
      if (vivo && data) setSaldo((data as { creditos: number }).creditos);
    })();
    return () => { vivo = false; };
  }, [pathname]);
  if (saldo === null) return null;
  return (
    <Link
      href="/dashboard/ferramentas"
      className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-brand-gold/20 bg-brand-gold/5 px-3 py-2 text-xs text-brand-gold hover:bg-brand-gold/10 transition-colors"
    >
      <span>Créditos</span>
      <span className="font-semibold">{saldo}</span>
    </Link>
  );
}

// ─── Cart link com badge (autoatualiza via CustomEvent 'cart:updated') ────────

function CartSidebarLink({ isActive, onNavigate }: { isActive: boolean; onNavigate?: () => void }) {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/carrinho");
      if (res.ok) {
        const data = await res.json();
        setCount(Array.isArray(data.items) ? data.items.length : 0);
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    if (typeof window !== "undefined") {
      window.addEventListener("cart:updated", handler);
      return () => window.removeEventListener("cart:updated", handler);
    }
  }, [load]);

  return (
    <Link
      href="/carrinho"
      onClick={onNavigate}
      className={`
        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
        ${isActive
          ? "bg-brand-gold/12 text-brand-gold border border-brand-gold/20"
          : "text-white/55 hover:text-white/90 hover:bg-white/5 border border-transparent"
        }
      `}
    >
      <span className={`shrink-0 ${isActive ? "text-brand-gold" : "text-white/35"}`}>
        <CartIcon />
      </span>
      Carrinho
      {count > 0 && (
        <span className="ml-auto bg-brand-gold text-brand-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
      {isActive && count === 0 && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-gold shrink-0" />
      )}
    </Link>
  );
}

function CartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function RoyaltiesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function ToolsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="10" height="10" />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4"  y1="5" x2="4"  y2="19" />
      <line x1="7"  y1="5" x2="7"  y2="19" />
      <line x1="10" y1="5" x2="10" y2="19" />
      <line x1="14" y1="5" x2="14" y2="19" />
      <line x1="17" y1="5" x2="17" y2="19" />
      <line x1="20" y1="5" x2="20" y2="19" />
    </svg>
  );
}

function CheckEditIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function ImageBrushIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function EpubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
  );
}

function ConvertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <polyline points="9 11 12 8 15 11" />
      <polyline points="9 13 12 16 15 13" />
    </svg>
  );
}

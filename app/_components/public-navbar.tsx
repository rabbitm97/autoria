"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import BrandLogo from "./brand-logo";

interface NavLink {
  label: string;
  href: string;
  destaque?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { label: "Como funciona", href: "#como-funciona"                },
  { label: "Ferramentas",   href: "/ferramentas"                  },
  { label: "Simulador",     href: "/simulador",   destaque: true  },
  { label: "Planos",        href: "#precos"                       },
  { label: "Blog",          href: "/blog"                         },
];

type Tone = "dark" | "light";

export default function PublicNavbar({ tone = "dark" }: { tone?: Tone } = {}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const light = tone === "light";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const shellBase = light
    ? "bg-brand-surface/90 backdrop-blur-md border-b border-brand-primary/10"
    : "bg-brand-primary/95 backdrop-blur-md border-b border-white/5";
  const shellScrolled = light
    ? "bg-brand-surface/95 backdrop-blur-md shadow-sm shadow-brand-primary/5 border-b border-brand-primary/10"
    : "bg-brand-primary/98 backdrop-blur-md shadow-lg shadow-black/20 border-b border-white/5";

  const linkBase = light
    ? "text-brand-primary/70 hover:text-brand-primary transition-colors tracking-wide"
    : "hover:text-white transition-colors tracking-wide";
  const linkDestaque = light
    ? "text-[#8F7226] hover:text-[#6E5A1E] transition-colors tracking-wide font-semibold"
    : "text-brand-gold hover:text-brand-gold-light transition-colors tracking-wide font-semibold";

  const entrarCls = light
    ? "text-sm text-brand-primary/70 hover:text-brand-primary transition-colors px-3 py-1.5"
    : "text-sm text-white/55 hover:text-white transition-colors px-3 py-1.5";

  const hamburgerBorder = light ? "border-brand-primary/15 hover:border-brand-primary/35" : "border-white/10 hover:border-white/25";
  const hamburgerBar = light ? "bg-brand-primary/70" : "bg-white/70";

  const drawerShell = light
    ? "bg-brand-surface border-t border-brand-primary/10"
    : "bg-brand-primary border-t border-white/5";
  const drawerLink = light
    ? "text-brand-primary/70 hover:text-brand-primary text-base py-1 transition-colors"
    : "text-white/60 hover:text-white text-base py-1 transition-colors";
  const drawerLinkDestaque = light
    ? "text-[#8F7226] hover:text-[#6E5A1E] text-base py-1 transition-colors font-semibold"
    : "text-brand-gold hover:text-brand-gold-light text-base py-1 transition-colors font-semibold";
  const drawerDivider = light ? "border-brand-primary/10" : "border-white/10";
  const drawerEntrar = light
    ? "text-center text-sm text-brand-primary/70 border border-brand-primary/15 rounded-lg py-2.5 hover:border-brand-primary/35 transition-colors"
    : "text-center text-sm text-white/60 border border-white/15 rounded-lg py-2.5 hover:border-white/30 transition-colors";

  const logoVariant: "navy" | "gold" = light ? "navy" : "gold";
  const listColor = light ? "text-brand-primary/70" : "text-white/55";

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? shellScrolled : shellBase
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" aria-label="Autoria — página inicial" className="shrink-0">
          <BrandLogo variant={logoVariant} height={40} priority />
        </Link>

        {/* Desktop nav */}
        <ul className={`hidden lg:flex items-center gap-7 text-sm ${listColor}`}>
          {NAV_LINKS.map(({ label, href, destaque }) => (
            <li key={href}>
              <Link href={href} className={destaque ? linkDestaque : linkBase}>
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/login" className={entrarCls}>
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="bg-brand-gold text-brand-primary text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-gold-light active:scale-95 transition-all tracking-wide"
          >
            Publicar meu livro
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className={`lg:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg border transition-colors ${hamburgerBorder}`}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          <span className={`w-4 h-0.5 rounded-full transition-all duration-200 ${hamburgerBar} ${open ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`w-4 h-0.5 rounded-full transition-all duration-200 ${hamburgerBar} ${open ? "opacity-0" : ""}`} />
          <span className={`w-4 h-0.5 rounded-full transition-all duration-200 ${hamburgerBar} ${open ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>

      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className={`lg:hidden px-6 py-5 flex flex-col gap-4 ${drawerShell}`}>
          {NAV_LINKS.map(({ label, href, destaque }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={destaque ? drawerLinkDestaque : drawerLink}
            >
              {label}
            </Link>
          ))}
          <div className={`border-t pt-4 flex flex-col gap-3 mt-1 ${drawerDivider}`}>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className={drawerEntrar}
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              onClick={() => setOpen(false)}
              className="text-center bg-brand-gold text-brand-primary text-sm font-bold py-2.5 rounded-lg hover:bg-brand-gold-light transition-all"
            >
              Publicar meu livro
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

const NAV_LINKS = [
  { label: "Como funciona", href: "/#como-funciona" },
  { label: "Serviços",      href: "/#servicos"      },
  { label: "Preços",        href: "/#precos"        },
  { label: "Blog",          href: "/blog"           },
  { label: "FAQ",           href: "/#faq"           },
];

export default function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-brand-primary/98 backdrop-blur-md shadow-lg shadow-black/20 border-b border-white/5"
          : "bg-brand-primary/95 backdrop-blur-md border-b border-white/5"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between gap-6">

        {/* Logo */}
        <Link href="/" aria-label="Autoria — página inicial" className="shrink-0">
          <Image
            src="/logo-amarelo.png"
            alt="Autoria"
            width={160}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <ul className="hidden lg:flex items-center gap-7 text-sm text-white/55">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <Link href={href} className="hover:text-white transition-colors tracking-wide">
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/login" className="text-sm text-white/55 hover:text-white transition-colors px-3 py-1.5">
            Entrar
          </Link>
          <Link
            href="/login"
            className="bg-brand-gold text-brand-primary text-sm font-bold px-5 py-2.5 rounded-lg hover:bg-brand-gold-light active:scale-95 transition-all tracking-wide"
          >
            Começar grátis
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setOpen(!open)}
          className="lg:hidden flex flex-col justify-center items-center w-9 h-9 gap-1.5 rounded-lg border border-white/10 hover:border-white/25 transition-colors"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          <span className={`w-4 h-0.5 bg-white/70 rounded-full transition-all duration-200 ${open ? "rotate-45 translate-y-2" : ""}`} />
          <span className={`w-4 h-0.5 bg-white/70 rounded-full transition-all duration-200 ${open ? "opacity-0" : ""}`} />
          <span className={`w-4 h-0.5 bg-white/70 rounded-full transition-all duration-200 ${open ? "-rotate-45 -translate-y-2" : ""}`} />
        </button>

      </nav>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden bg-brand-primary border-t border-white/5 px-6 py-5 flex flex-col gap-4">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="text-white/60 hover:text-white text-base py-1 transition-colors"
            >
              {label}
            </Link>
          ))}
          <div className="border-t border-white/10 pt-4 flex flex-col gap-3 mt-1">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-center text-sm text-white/60 border border-white/15 rounded-lg py-2.5 hover:border-white/30 transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-center bg-brand-gold text-brand-primary text-sm font-bold py-2.5 rounded-lg hover:bg-brand-gold-light transition-all"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

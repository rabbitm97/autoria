import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-zinc-100 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-lg text-brand-primary hover:opacity-70 transition-opacity">
            Autoria
          </Link>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
            ← Voltar ao início
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
    </div>
  );
}

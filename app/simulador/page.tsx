import Link from "next/link";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";
import SimuladorImpressaoTool from "@/components/ferramentas/simulador-impressao-tool";

export const metadata: Metadata = {
  title: "Simulador de preço — quanto custa imprimir um livro | Autoria",
  description:
    "Calcule na hora quanto custa imprimir seu livro: formato, papel, capa, tiragem e frete. Sem tiragem mínima, a partir de 1 exemplar. Grátis, sem cadastro.",
};

export default function SimuladorPage() {
  return (
    <div className="min-h-dvh bg-zinc-50">
      <PublicNavbar />

      <div className="pt-24">
        <SimuladorImpressaoTool />

        <div className="mt-6 mb-16 text-center">
          <Link
            href="/ferramentas"
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-4"
          >
            ← Todas as ferramentas
          </Link>
        </div>
      </div>

      {/* Footer strip */}
      <footer className="bg-brand-primary py-8 px-8 mt-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-white/30 text-sm">© {new Date().getFullYear()} Autoria. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6 text-sm text-white/35">
            <Link href="/termos" className="hover:text-white/60 transition-colors">Termos</Link>
            <Link href="/privacidade" className="hover:text-white/60 transition-colors">Privacidade</Link>
            <Link href="/#precos" className="hover:text-white/60 transition-colors">Preços</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

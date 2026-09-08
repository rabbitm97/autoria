import Link from "next/link";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";
import SimuladorImpressaoTool from "@/components/ferramentas/simulador-impressao-tool";
import { IMPRESSAO_STANDBY, CONTATO_IMPRESSAO_EMAIL } from "@/lib/impressao-standby";

export const metadata: Metadata = IMPRESSAO_STANDBY
  ? {
      title: "Impressão de livros — fale com a equipe | Autoria",
      description:
        "Orçamentos de impressão direto com a equipe da Autoria. Sem tiragem mínima, a partir de 1 exemplar.",
    }
  : {
      title: "Simulador de preço — quanto custa imprimir um livro | Autoria",
      description:
        "Calcule na hora quanto custa imprimir seu livro: formato, papel, capa, tiragem e frete. Sem tiragem mínima, a partir de 1 exemplar. Grátis, sem cadastro.",
    };

const MAILTO_ORCAMENTO = `mailto:${CONTATO_IMPRESSAO_EMAIL}?subject=${encodeURIComponent("Orçamento de impressão")}`;

export default function SimuladorPage() {
  return (
    <div className="min-h-dvh bg-zinc-50">
      <PublicNavbar />

      <div className="pt-24">
        {IMPRESSAO_STANDBY ? (
          <main className="max-w-2xl mx-auto px-6 py-10">
            <div className="bg-white rounded-2xl border border-zinc-100 p-8 md:p-10">
              <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
                Impressão
              </p>
              <h1 className="font-heading text-3xl md:text-4xl text-brand-primary leading-tight mb-4">
                Quer imprimir seu livro?
              </h1>
              <p className="text-zinc-600 text-base leading-relaxed mb-6">
                Estamos calibrando os preços de impressão para o lançamento.
                Enquanto isso, os orçamentos são feitos direto com a equipe —
                nos conte o formato, o número de páginas e a tiragem, e a
                gente responde por e-mail.
              </p>
              <a
                href={MAILTO_ORCAMENTO}
                className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-bold text-sm px-6 py-3 rounded-xl hover:bg-brand-gold-light active:scale-[0.98] transition-all"
              >
                {CONTATO_IMPRESSAO_EMAIL} →
              </a>
              <p className="text-sm text-zinc-500 mt-5">
                Sem tiragem mínima — a partir de 1 exemplar.
              </p>
            </div>
          </main>
        ) : (
          <SimuladorImpressaoTool />
        )}

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

// REC-1 · Página pública /beta — inscrição na fase beta da Autoria.
//
// Server component. Não altera navbar/home/footer globais; usa PublicNavbar
// tone="light" no topo e um rodapé mínimo próprio (© + termos + privacidade).
// A copy abaixo é literal (do brief REC-1 v2) — não parafrasear.

import Link from "next/link";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";
import BetaForm from "./_components/beta-form";

export const metadata: Metadata = {
  title: "Beta da Autoria — inscrições abertas",
  description:
    "Publique seu livro com IA da Autoria. Suporte humano de verdade, resposta em até 2 horas, seg-sáb, 10h-20h.",
};

export default function BetaPage() {
  const anoAtual = new Date().getFullYear();

  return (
    <>
      <PublicNavbar tone="light" />
      <main className="pt-16 min-h-screen bg-brand-surface text-brand-primary">
        {/* Hero */}
        <section className="max-w-3xl mx-auto px-6 lg:px-8 pt-14 pb-8">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#8F7226] mb-4">
            Beta · Inscrições abertas
          </p>
          <h1 className="font-heading text-4xl md:text-5xl leading-[1.05] tracking-tight">
            IA para publicar seu livro. Gente de verdade para te atender.
          </h1>
          <p className="mt-5 text-lg md:text-xl text-brand-primary/70 leading-relaxed">
            Suporte humano, de verdade — resposta em até 2 horas, seg-sáb, 10h-20h.
          </p>
          <p className="mt-3 text-base text-brand-primary/60">
            Durante o beta, quem responde é o fundador.
          </p>
        </section>

        {/* O que está incluído + ressalva impressão */}
        <section className="max-w-3xl mx-auto px-6 lg:px-8 pb-8">
          <div className="rounded-xl border border-brand-primary/10 bg-white/70 p-6 md:p-7">
            <h2 className="font-heading text-2xl mb-4">O que você recebe no beta</h2>
            <ul className="space-y-2.5 text-brand-primary/80 leading-relaxed">
              <li>· Ferramentas de IA para escrever, revisar e preparar o miolo do seu livro.</li>
              <li>· Acompanhamento direto do fundador durante toda a fase beta.</li>
              <li>· Suporte humano, de verdade — resposta em até 2 horas, seg-sáb, 10h-20h.</li>
              <li>· Orientação sobre publicação (registro, ISBN, capa, distribuição).</li>
            </ul>
            <p className="mt-5 text-sm text-brand-primary/60 italic">
              A impressão do livro físico é contratada à parte, a partir de 1 exemplar.
            </p>
          </div>
        </section>

        {/* Formulário */}
        <section id="inscricao" className="max-w-3xl mx-auto px-6 lg:px-8 pb-16">
          <div className="rounded-xl border border-brand-primary/10 bg-white p-6 md:p-8 shadow-sm">
            <h2 className="font-heading text-2xl mb-1">Inscreva-se</h2>
            <p className="text-sm text-brand-primary/60 mb-6">
              Formulário curto. O papo mais fundo vem por e-mail, com o fundador.
            </p>
            <BetaForm />
          </div>
        </section>

        {/* Rodapé mínimo próprio */}
        <footer className="border-t border-brand-primary/10">
          <div className="max-w-3xl mx-auto px-6 lg:px-8 py-6 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-primary/55">
            <span>© {anoAtual} Autoria</span>
            <div className="flex items-center gap-5">
              <Link href="/termos" className="hover:text-brand-primary transition-colors">
                Termos
              </Link>
              <Link href="/privacidade" className="hover:text-brand-primary transition-colors">
                Privacidade
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

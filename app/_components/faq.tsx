"use client";

import { useState, useRef } from "react";

const ITEMS = [
  {
    q: "Preciso ter conhecimento técnico para usar a Autoria?",
    a: "Não. A plataforma foi desenhada para escritores, não para profissionais de editoração. Se você consegue enviar um arquivo por e-mail, consegue publicar seu livro com a Autoria. Todo o processo é guiado passo a passo.",
  },
  {
    q: "Quais formatos de arquivo são aceitos para o manuscrito?",
    a: "Aceitamos .docx (Word), .pdf e .txt. Recomendamos o .docx para melhor fidelidade na extração do texto. O arquivo pode ter até 50 MB.",
  },
  {
    q: "Quanto tempo leva do upload à publicação?",
    a: "A etapa de processamento com IA — revisão, sinopse, capa e diagramação — é concluída em poucas horas. A publicação nas plataformas (Amazon, Kobo, etc.) segue o prazo de aprovação de cada loja, geralmente de 24 a 72 horas.",
  },
  {
    q: "A revisão da IA substitui um revisor humano?",
    a: "A IA faz uma revisão gramatical, ortográfica e de estilo muito precisa para o português brasileiro, capturando a maioria dos erros. Para obras literárias de maior exigência, recomendamos usar a revisão da IA como primeira passagem e complementar com um olhar humano se desejado.",
  },
  {
    q: "Quem fica com os direitos do meu livro?",
    a: "100% de seus direitos autorais permanecem com você. A Autoria é apenas a plataforma de produção e distribuição. O ISBN (incluído nos planos Completo e Pro) também é registrado em seu nome.",
  },
  {
    q: "Como funciona o audiolivro com IA?",
    a: "Usamos tecnologia de voz neural de última geração para narrar seu livro em português com entonação e ritmo adequados. No plano Pro, é possível clonar sua própria voz para narrar o audiolivro.",
  },
  {
    q: "Em quais plataformas meu livro será publicado?",
    a: "Amazon KDP (eBook e Print on Demand), Kobo, Apple Books, Google Play Books, Rakuten, Barnes & Noble, Scribd e Spotify Audiobooks, entre outras. O total é de 15+ plataformas dependendo do formato escolhido.",
  },
  {
    q: "Posso usar a Autoria para publicar mais de um livro?",
    a: "Sim. Cada obra é um projeto independente. Você pode publicar quantos livros quiser — cada um paga o plano correspondente ao formato desejado. Para volume alto de publicações, entre em contato para condições especiais.",
  },
];

function AccordionItem({ q, a, isOpen, onToggle }: { q: string; a: string; isOpen: boolean; onToggle: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-zinc-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full text-left py-6 flex items-start justify-between gap-6 group"
        aria-expanded={isOpen}
      >
        <span className={`font-semibold text-base leading-snug transition-colors ${isOpen ? "text-brand-primary" : "text-zinc-700 group-hover:text-brand-primary"}`}>
          {q}
        </span>
        <span
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all duration-300 ${
            isOpen
              ? "bg-brand-gold border-brand-gold text-brand-primary rotate-45"
              : "border-zinc-200 text-zinc-400 group-hover:border-brand-gold/50"
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </span>
      </button>

      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? `${contentRef.current?.scrollHeight ?? 200}px` : "0px",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="pb-6 pr-14">
          <p className="text-zinc-500 text-base leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-brand-surface py-28">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20 items-start">

          {/* Left */}
          <div className="lg:sticky lg:top-24">
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="font-heading text-4xl lg:text-5xl text-brand-primary leading-tight mb-5">
              Perguntas<br />frequentes
            </h2>
            <p className="text-zinc-500 text-base leading-relaxed mb-8">
              Ainda tem dúvidas? Fale com a nossa equipe — respondemos em menos de 24 horas.
            </p>
            <a
              href="mailto:oi@autoria.app"
              className="inline-flex items-center gap-2 text-brand-primary font-semibold text-sm border-b-2 border-brand-gold pb-0.5 hover:text-brand-gold transition-colors"
            >
              Falar com a equipe →
            </a>
          </div>

          {/* Right */}
          <div className="border-t border-zinc-100">
            {ITEMS.map((item, i) => (
              <AccordionItem
                key={i}
                q={item.q}
                a={item.a}
                isOpen={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

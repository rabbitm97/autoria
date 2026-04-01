"use client";

import { useState } from "react";

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
    a: "A IA faz uma revisão gramatical, ortográfica e de estilo muito precisa para o português brasileiro, capturando a maioria dos erros. Para obras literárias de maior exigência, recomendamos usar a revisão da IA como primeira passagem e complementar com um olhar humano se desejado. O plano Pro inclui suporte dedicado nessa etapa.",
  },
  {
    q: "Quem fica com os direitos do meu livro?",
    a: "100% de seus direitos autorais permanecem com você. A Autoria é apenas a plataforma de produção e distribuição. O ISBN (incluído nos planos Completo e Pro) também é registrado em seu nome.",
  },
  {
    q: "Como funciona o audiolivro com IA?",
    a: "Usamos a tecnologia ElevenLabs — a mesma usada por grandes produtoras de conteúdo — para narrar seu livro com voz neural em português. O resultado soa natural, com entonação e ritmo adequados. No plano Pro, é possível clonar sua própria voz para narrar o audiolivro.",
  },
  {
    q: "Em quais plataformas meu livro será publicado?",
    a: "Amazon KDP (eBook e Print on Demand), Kobo, Apple Books, Google Play Books, Rakuten, Barnes & Noble, Scribd e Spotify Audiobooks, entre outras. O total é de 15+ plataformas dependendo do formato escolhido.",
  },
  {
    q: "Posso usar a Autoria para publicar mais de um livro?",
    a: "Sim. Cada obra é um projeto independente. Você pode publicar quantos livros quiser — cada um paga o plano correspondente ao formato desejado.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="bg-brand-surface py-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-[1fr_2fr] gap-20 items-start">

          {/* Left: title */}
          <div className="sticky top-28">
            <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">FAQ</p>
            <h2 className="font-heading text-5xl text-brand-primary leading-tight mb-5">
              Perguntas<br />frequentes
            </h2>
            <p className="text-zinc-500 text-base leading-relaxed mb-8">
              Ainda tem dúvidas? Fale com a nossa equipe.
            </p>
            <a
              href="mailto:oi@autoria.app"
              className="inline-flex items-center gap-2 text-brand-primary font-semibold text-sm border-b-2 border-brand-gold pb-0.5 hover:text-brand-gold transition-colors"
            >
              Falar com a equipe →
            </a>
          </div>

          {/* Right: accordion */}
          <div className="space-y-0 divide-y divide-zinc-100 border-t border-zinc-100">
            {ITEMS.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full text-left py-6 flex items-start justify-between gap-6 group"
                  aria-expanded={open === i}
                >
                  <span className="font-semibold text-zinc-800 text-base leading-snug group-hover:text-brand-primary transition-colors">
                    {item.q}
                  </span>
                  <span
                    className={`text-brand-gold text-xl font-light shrink-0 mt-0.5 transition-transform duration-200 ${
                      open === i ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
                {open === i && (
                  <div className="pb-6 pr-12">
                    <p className="text-zinc-500 text-base leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

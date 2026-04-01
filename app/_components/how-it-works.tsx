"use client";

import { useState } from "react";

const STEPS = [
  {
    num: "01",
    label: "Envio",
    title: "Envie seu manuscrito com alguns cliques",
    bullets: [
      "Faça upload do seu .docx, .pdf ou .txt — até 50 MB",
      "Preencha título, gênero e dados do autor",
      "Nossa IA gera um diagnóstico editorial completo em segundos",
      "Receba um relatório de pontos fortes e áreas de melhoria",
    ],
    visual: <UploadMockup />,
  },
  {
    num: "02",
    label: "Revisão",
    title: "IA revisa e aprimora seu texto",
    bullets: [
      "Revisão ortográfica, gramatical e de estilo em português",
      "Sugestões contextuais preservando sua voz autoral",
      "Geração de sinopse, palavras-chave e ficha catalográfica",
      "Relatório de erros corrigidos e melhorias aplicadas",
    ],
    visual: <RevisionMockup />,
  },
  {
    num: "03",
    label: "Capa & Diagramação",
    title: "Capa profissional e diagramação automática",
    bullets: [
      "Descreva a atmosfera — receba opções de capa geradas por IA",
      "Frente, contra-capa, lombada e orelhas num único fluxo",
      "Diagramação automática em PDF e EPUB com tipografia editorial",
      "Alta resolução para impressão CMYK e distribuição digital",
    ],
    visual: <CapaMockup />,
  },
  {
    num: "04",
    label: "Publicação",
    title: "Publique globalmente e acompanhe seus royalties",
    bullets: [
      "Distribuição para 15+ plataformas com um clique",
      "Amazon KDP, Kobo, Apple Books, Spotify Audiobooks e mais",
      "85% de cada venda direto para você",
      "Painel unificado de royalties por plataforma e período",
    ],
    visual: <PublicacaoMockup />,
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <section id="como-funciona" className="bg-zinc-50 py-28">
      <div className="max-w-7xl mx-auto px-8">

        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">
            Processo
          </p>
          <h2 className="font-heading text-5xl text-brand-primary leading-tight mb-5">
            Do manuscrito ao leitor<br />em 4 etapas
          </h2>
          <p className="text-zinc-500 text-lg leading-relaxed">
            Sem precisar entender de editoração. Você escreve — nós cuidamos de tudo.
          </p>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-zinc-200 mb-10">
          {STEPS.map((s, i) => (
            <button
              key={s.num}
              onClick={() => setActive(i)}
              className={`flex items-center gap-2.5 px-6 py-4 text-sm font-semibold border-b-2 transition-all -mb-px ${
                active === i
                  ? "border-brand-gold text-brand-primary"
                  : "border-transparent text-zinc-400 hover:text-zinc-600 hover:border-zinc-300"
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold transition-colors ${
                  active === i ? "bg-brand-gold text-brand-primary" : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {i + 1}
              </span>
              <span>
                <span className="text-zinc-400 font-normal mr-1 hidden xl:inline">Etapa {i + 1} —</span>
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_1.2fr] min-h-[420px]">

            {/* Left: text */}
            <div className="p-12 flex flex-col justify-center border-r border-zinc-100">
              <div className="font-heading text-6xl text-zinc-100 leading-none mb-6 select-none">
                {step.num}
              </div>
              <h3 className="font-heading text-2xl text-brand-primary leading-snug mb-6">
                {step.title}
              </h3>
              <ul className="space-y-3">
                {step.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-brand-gold/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                        <path d="M1 4l2.5 2.5L9 1" stroke="#c9a84c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span className="text-zinc-500 text-sm leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/login"
                className="mt-8 inline-flex items-center gap-2 bg-brand-gold text-brand-primary text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-gold/90 transition-colors w-fit"
              >
                Começar agora →
              </a>
            </div>

            {/* Right: visual */}
            <div className="bg-zinc-50 flex items-center justify-center p-10">
              {step.visual}
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}

// ─── Visual mockups ───────────────────────────────────────────────────────────

function UploadMockup() {
  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-zinc-200 shadow-md overflow-hidden">
      <div className="bg-brand-primary px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
        </div>
        <span className="text-white/40 text-xs ml-2">autoria.app/novo-projeto</span>
      </div>
      <div className="p-5 space-y-3">
        <div>
          <div className="text-xs text-zinc-400 mb-1">Título do livro</div>
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700">O Último Horizonte</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-zinc-400 mb-1">Gênero</div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-600">Ficção Científica</div>
          </div>
          <div>
            <div className="text-xs text-zinc-400 mb-1">Autor</div>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-600">Carlos Silva</div>
          </div>
        </div>
        <div className="border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center bg-zinc-50">
          <div className="text-2xl mb-1">📄</div>
          <div className="text-xs text-zinc-500">manuscrito.docx</div>
          <div className="text-xs text-brand-gold font-semibold mt-1">✓ Pronto para enviar</div>
        </div>
        <div className="bg-brand-gold text-brand-primary text-xs font-semibold text-center py-2.5 rounded-lg">
          Enviar e analisar →
        </div>
      </div>
    </div>
  );
}

function RevisionMockup() {
  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-zinc-200 shadow-md overflow-hidden">
      <div className="bg-brand-primary px-4 py-3 flex items-center justify-between">
        <span className="text-white/60 text-xs">Revisão com IA</span>
        <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-semibold">237 correções</span>
      </div>
      <div className="p-5 space-y-2.5 text-sm">
        <div className="bg-zinc-50 rounded-lg p-3 leading-relaxed text-zinc-700 text-xs">
          O jovem escritor <span className="bg-red-100 text-red-500 line-through px-0.5 rounded">foi andando</span>{" "}
          <span className="bg-emerald-100 text-emerald-700 px-0.5 rounded">caminhou</span> até a janela e
          olhou para o <span className="bg-red-100 text-red-500 line-through px-0.5 rounded">horizonte infinito</span>{" "}
          <span className="bg-emerald-100 text-emerald-700 px-0.5 rounded">horizonte distante</span>.
        </div>
        <div className="space-y-1.5">
          {[
            { type: "Estilo", msg: "Locução verbal substituída por verbo simples", color: "blue" },
            { type: "Repetição", msg: "Adjetivo redundante removido", color: "amber" },
            { type: "Gramática", msg: "Concordância verbal corrigida", color: "violet" },
          ].map((item) => (
            <div key={item.type} className="flex items-center gap-2 text-xs bg-zinc-50 rounded-lg px-3 py-1.5">
              <span className={`w-1.5 h-1.5 rounded-full bg-${item.color}-400 shrink-0`} />
              <span className="font-semibold text-zinc-600">{item.type}:</span>
              <span className="text-zinc-400">{item.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CapaMockup() {
  return (
    <div className="flex gap-4 items-end">
      {[
        { bg: "from-indigo-900 to-violet-900", title: "O Último\nHorizonte" },
        { bg: "from-rose-900 to-orange-900", title: "O Último\nHorizonte", active: true },
        { bg: "from-zinc-800 to-zinc-900", title: "O Último\nHorizonte" },
      ].map((c, i) => (
        <div
          key={i}
          className={`relative rounded-lg overflow-hidden shadow-lg transition-all ${
            c.active ? "w-32 h-48 ring-2 ring-brand-gold" : "w-24 h-36 opacity-70"
          }`}
        >
          <div className={`w-full h-full bg-gradient-to-b ${c.bg} flex flex-col items-center justify-end p-3`}>
            <div className="text-white text-center leading-tight font-bold text-xs whitespace-pre-line">{c.title}</div>
            <div className="text-white/40 text-[9px] mt-1">Carlos Silva</div>
          </div>
          {c.active && (
            <div className="absolute top-2 right-2 bg-brand-gold text-brand-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              ✓ Selecionada
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PublicacaoMockup() {
  const platforms = ["Amazon KDP", "Kobo", "Apple Books", "Spotify", "Google Play", "Scribd"];
  return (
    <div className="w-full max-w-sm bg-white rounded-xl border border-zinc-200 shadow-md overflow-hidden">
      <div className="bg-brand-primary px-4 py-3 flex items-center justify-between">
        <span className="text-white/60 text-xs">Distribuição global</span>
        <span className="text-brand-gold text-xs font-semibold">15+ plataformas</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {platforms.map((p) => (
            <div key={p} className="bg-zinc-50 border border-zinc-100 rounded-lg p-2 text-center">
              <div className="text-emerald-500 text-sm mb-0.5">✓</div>
              <div className="text-zinc-500 text-[10px] leading-tight">{p}</div>
            </div>
          ))}
        </div>
        <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
          <div className="text-xs text-zinc-400 mb-2">Royalties — últimos 30 dias</div>
          <div className="flex items-end gap-1 h-10">
            {[3, 5, 4, 7, 6, 8, 10, 9, 12, 11, 14, 13].map((v, i) => (
              <div
                key={i}
                className="flex-1 bg-brand-gold/70 rounded-sm transition-all"
                style={{ height: `${(v / 14) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-zinc-400">Total</span>
            <span className="text-sm font-bold text-brand-primary">R$ 1.240,00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

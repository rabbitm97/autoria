"use client";

import { useState } from "react";

const STEPS = [
  {
    label: "Envie o manuscrito",
    title: "Envie seu manuscrito com poucos cliques",
    bullets: [
      {
        icon: "upload",
        text: "Faça upload do seu .docx, .pdf ou .txt. Preencha título, gênero e dados do autor no painel intuitivo da Autoria.",
      },
      {
        icon: "cert",
        text: "Nossa IA gera imediatamente um diagnóstico editorial completo do seu texto.",
      },
    ],
    visual: <UploadVisual />,
  },
  {
    label: "Revisão & Aprimoramento",
    title: "IA revisa e aprimora seu livro",
    bullets: [
      {
        icon: "scan",
        text: "A Autoria analisa seu manuscrito com IA para identificar erros gramaticais, de estilo e oportunidades de melhoria.",
      },
      {
        icon: "user",
        text: "Gera automaticamente sinopse, palavras-chave e ficha catalográfica no padrão CBL.",
      },
    ],
    visual: <RevisaoVisual />,
  },
  {
    label: "Capa & Diagramação",
    title: "Capa sob medida para o seu livro",
    bullets: [
      {
        icon: "brush",
        text: "Escolha entre opções de capa geradas por IA, personalizadas para o estilo do seu livro. Frente, contra-capa, lombada e orelhas.",
      },
      {
        icon: "layout",
        text: "Diagramação automática em PDF e EPUB com tipografia editorial profissional.",
      },
    ],
    visual: <CapaVisual />,
  },
  {
    label: "Publique & Distribua",
    title: "Publique e alcance leitores no mundo todo",
    bullets: [
      {
        icon: "globe",
        text: "Com um clique, seu livro é distribuído para 15+ plataformas globais — Amazon, Kobo, Apple Books, Spotify e muito mais.",
      },
      {
        icon: "chart",
        text: "Acompanhe visualizações, vendas e royalties consolidados em um painel único. 85% de cada venda são seus.",
      },
    ],
    visual: <PublicacaoVisual />,
  },
];

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <section id="como-funciona" className="bg-zinc-50 py-28">
      <div className="max-w-6xl mx-auto px-8">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Processo</p>
          <h2 className="font-heading text-4xl text-brand-primary leading-tight mb-4">
            Publique com a Autoria em 4 etapas simples
          </h2>
          <p className="text-zinc-500 text-base">
            A Autoria revisa, projeta capas, diagrama e distribui seu livro em horas.
          </p>
        </div>

        {/* Single fixed-size box */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">

          {/* Tabs — always 4 cols equally spaced */}
          <div className="grid grid-cols-4 border-b border-zinc-100">
            {STEPS.map((s, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`text-left px-7 py-5 border-b-2 transition-all ${
                  active === i
                    ? "border-brand-gold"
                    : "border-transparent hover:bg-zinc-50"
                } ${i < STEPS.length - 1 ? "border-r border-r-zinc-100" : ""}`}
              >
                <div
                  className={`text-xs font-semibold mb-0.5 ${
                    active === i ? "text-brand-gold" : "text-zinc-400"
                  }`}
                >
                  Etapa {i + 1}
                </div>
                <div
                  className={`text-sm font-bold leading-snug ${
                    active === i ? "text-brand-primary" : "text-zinc-400"
                  }`}
                >
                  {s.label}
                </div>
              </button>
            ))}
          </div>

          {/* Content — fixed height, no reflow */}
          <div className="grid grid-cols-[1fr_1.3fr] h-[420px]">

            {/* Left */}
            <div className="flex flex-col justify-between p-10 border-r border-zinc-100">
              <div>
                <h3 className="font-heading text-[1.6rem] text-brand-primary leading-snug mb-7">
                  {step.title}
                </h3>
                <ul className="space-y-5">
                  {step.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-0.5 shrink-0 text-brand-gold">
                        <BulletIcon type={b.icon} />
                      </span>
                      <span className="text-zinc-500 text-sm leading-relaxed">{b.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="/login"
                className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary text-sm font-bold px-6 py-3 rounded-lg hover:bg-brand-gold/90 transition-colors w-fit"
              >
                Começar agora →
              </a>
            </div>

            {/* Right — browser mockup, fixed height */}
            <div className="bg-zinc-50 flex items-center justify-center p-8 h-full overflow-hidden">
              <div className="w-full h-full max-w-[440px] bg-white rounded-xl border border-zinc-200 shadow-md flex flex-col overflow-hidden">
                {/* Browser chrome */}
                <div className="shrink-0 bg-zinc-100 border-b border-zinc-200 px-4 py-2.5 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                  {/* Progress stepper */}
                  <div className="flex-1 flex items-center justify-center gap-1 mx-4">
                    {STEPS.map((_, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            i <= active
                              ? "bg-brand-gold text-brand-primary"
                              : "bg-zinc-200 text-zinc-400"
                          }`}
                        >
                          {i + 1}
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`w-6 h-0.5 ${i < active ? "bg-brand-gold" : "bg-zinc-200"}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Content area */}
                <div className="flex-1 overflow-hidden">
                  {step.visual}
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}

// ─── Bullet icons ─────────────────────────────────────────────────────────────

function BulletIcon({ type }: { type: string }) {
  const cls = "w-5 h-5";
  if (type === "upload") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V7m0 0L7.5 9.5M10 7l2.5 2.5"/><rect x="3" y="14" width="14" height="3" rx="1"/>
    </svg>
  );
  if (type === "cert") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/>
    </svg>
  );
  if (type === "scan") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V4h3M14 4h3v3M3 13v3h3M14 16h3v-3"/><rect x="6" y="6" width="8" height="8" rx="1"/>
    </svg>
  );
  if (type === "user") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6"/>
    </svg>
  );
  if (type === "brush") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16s1-4 6-9l3 3c-5 5-9 6-9 6z"/><path d="M13 7l2-2 1 1-2 2"/>
    </svg>
  );
  if (type === "layout") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 8v9"/>
    </svg>
  );
  if (type === "globe") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="7"/><path d="M10 3c0 0-3 3-3 7s3 7 3 7M10 3c0 0 3 3 3 7s-3 7-3 7M3 10h14"/>
    </svg>
  );
  if (type === "chart") return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14l4-4 3 3 5-5"/><rect x="3" y="3" width="14" height="14" rx="2"/>
    </svg>
  );
  return null;
}

// ─── Visual mockup contents (fixed height, no scrollbar) ─────────────────────

function UploadVisual() {
  return (
    <div className="h-full p-4 flex gap-3">
      {/* Upload zone */}
      <div className="flex-1 border-2 border-dashed border-zinc-200 rounded-lg flex flex-col items-center justify-center gap-2 bg-zinc-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V9m0 0l-3 3m3-3l3 3"/><path d="M3 15v3a2 2 0 002 2h14a2 2 0 002-2v-3"/>
        </svg>
        <span className="text-xs text-zinc-400 font-medium">Enviar manuscrito</span>
      </div>
      {/* Form fields */}
      <div className="w-40 space-y-2">
        <div>
          <div className="text-[10px] text-zinc-400 mb-0.5">Título do livro</div>
          <div className="bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-[10px] text-zinc-600">Alice no País das Maravilhas</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400 mb-0.5">Gênero</div>
          <div className="bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-[10px] text-zinc-600">Ficção Jovem Adulto</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400 mb-0.5">Subgênero</div>
          <div className="bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-[10px] text-zinc-600">Aventura e Fantasia</div>
        </div>
        <div>
          <div className="text-[10px] text-zinc-400 mb-0.5">Nome do autor</div>
          <div className="flex gap-1">
            <div className="bg-zinc-50 border border-zinc-200 rounded px-1.5 py-1 text-[10px] text-zinc-500 w-10">Dr.</div>
            <div className="bg-zinc-50 border border-zinc-200 rounded px-1.5 py-1 text-[10px] text-zinc-600 flex-1">Lewis</div>
          </div>
          <div className="bg-zinc-50 border border-zinc-200 rounded px-2 py-1 text-[10px] text-zinc-600 mt-1">Carroll</div>
        </div>
        <div className="bg-brand-gold text-brand-primary text-[10px] font-bold text-center py-1.5 rounded">
          Próximo →
        </div>
      </div>
    </div>
  );
}

function RevisaoVisual() {
  return (
    <div className="h-full flex">
      {/* Text area */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="text-xs font-bold text-zinc-700 mb-0.5">As Aventuras de Sherlock Holmes</div>
        <div className="text-[9px] text-zinc-400 mb-2">Arthur Conan Doyle — Capítulo 1</div>
        <div className="text-[9px] text-zinc-500 leading-relaxed">
          Para{" "}
          <span className="bg-yellow-100 text-yellow-700 px-0.5 rounded">Sherlock Holmes</span>{" "}
          ela é sempre <em>a</em> mulher. Raramente o ouvi mencioná-la{" "}
          <span className="bg-red-100 text-red-500 line-through px-0.5 rounded">sob qualquer outro</span>{" "}
          <span className="bg-emerald-100 text-emerald-700 px-0.5 rounded">por qualquer outro</span>{" "}
          nome. A seus olhos ela eclipsa e predomina{" "}
          <span className="bg-yellow-100 text-yellow-700 px-0.5 rounded">toda a sua raça</span>.
          Não era que ele sentisse{" "}
          <span className="bg-red-100 text-red-500 line-through px-0.5 rounded">alguma coisa</span>{" "}
          <span className="bg-emerald-100 text-emerald-700 px-0.5 rounded">emoção</span>{" "}
          akin ao amor por Irene Adler.
        </div>
        <div className="mt-3 bg-brand-gold/10 border border-brand-gold/20 rounded text-[9px] text-brand-primary px-2 py-1.5">
          Concluir revisão →
        </div>
      </div>
      {/* Sidebar */}
      <div className="w-24 border-l border-zinc-100 p-3 bg-zinc-50">
        <div className="text-[9px] font-bold text-zinc-600 mb-2">Gramática</div>
        {[70, 50, 85, 60, 75, 45, 90].map((w, i) => (
          <div key={i} className="h-1.5 bg-zinc-200 rounded-full mb-1.5 overflow-hidden">
            <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CapaVisual() {
  return (
    <div className="h-full p-4 flex flex-col">
      <div className="text-[10px] text-zinc-400 font-semibold text-center mb-3">Escolha o estilo de capa</div>
      <div className="flex-1 grid grid-cols-4 gap-2">
        {[
          { bg: "bg-gradient-to-br from-purple-300 to-pink-300", active: false },
          { bg: "bg-gradient-to-br from-yellow-200 to-orange-300", active: true },
          { bg: "bg-gradient-to-br from-blue-300 to-cyan-300", active: false },
          { bg: "bg-gradient-to-br from-emerald-200 to-teal-300", active: false },
        ].map((c, i) => (
          <div key={i} className={`rounded-lg ${c.bg} flex flex-col items-center justify-end p-2 relative ${c.active ? "ring-2 ring-brand-gold" : ""}`}>
            <div className="w-6 h-2 bg-white/50 rounded-sm mb-1" />
            <div className="w-8 h-1.5 bg-white/40 rounded-sm" />
            {c.active && (
              <div className="absolute top-1 right-1 w-3 h-3 bg-brand-gold rounded-full flex items-center justify-center">
                <svg width="6" height="5" viewBox="0 0 6 5" fill="none"><path d="M1 2.5l1.5 1.5L5 1" stroke="#1a1a2e" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PublicacaoVisual() {
  return (
    <div className="h-full p-4 flex flex-col gap-2">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Visualizações", value: "1.847" },
          { label: "Compraram", value: "143" },
          { label: "Saldo total", value: "R$2.890" },
        ].map((s) => (
          <div key={s.label} className="bg-zinc-50 border border-zinc-100 rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-brand-primary">{s.value}</div>
            <div className="text-[9px] text-zinc-400">{s.label}</div>
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="flex-1 bg-zinc-50 rounded-lg border border-zinc-100 overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 py-1.5 border-b border-zinc-200 text-[9px] text-zinc-400 font-semibold">
          <span>Capa</span><span>Plataforma</span><span>Royalties</span><span>Status</span>
        </div>
        {[
          { color: "bg-purple-300", name: "Amazon KDP", val: "R$1.240", status: "Pausar" },
          { color: "bg-yellow-300", name: "Apple Books", val: "R$890", status: "Pausar" },
          { color: "bg-blue-300", name: "Kobo", val: "R$760", status: "Iniciar" },
        ].map((r) => (
          <div key={r.name} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 py-1.5 border-b border-zinc-100 items-center text-[9px]">
            <span className={`w-5 h-5 rounded ${r.color} shrink-0`} />
            <span className="text-zinc-600">{r.name}</span>
            <span className="text-zinc-500">{r.val}</span>
            <span className="bg-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded text-[8px]">{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

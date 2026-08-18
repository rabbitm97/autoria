"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import TutorialVideo from "./tutorial-video";

type AtoIndex = 1 | 2 | 3 | 4;

const ATOS: Array<{
  n: AtoIndex;
  label: string;
  title: string;
  bullets: string[];
  visual: () => React.ReactElement;
  chip?: string;
}> = [
  {
    n: 1,
    label: "Ato 1 — Envie e diagnostique",
    title: "Comece com o arquivo que você já tem",
    bullets: [
      "Upload de .docx, .pdf ou .txt em poucos cliques",
      "Diagnóstico editorial gratuito: forças, pontos de atenção e potencial do texto",
      "Sugestão de formato pro seu gênero",
    ],
    visual: UploadVisual,
  },
  {
    n: 2,
    label: "Ato 2 — Revise e prepare",
    title: "Revisão em português, sugestão a sugestão",
    bullets: [
      "IA treinada pra PT-BR propõe; você aprova, edita ou recusa",
      "Elementos do livro: dedicatória, agradecimentos, sobre o autor",
      "Página de créditos do livro preenchida por você",
    ],
    visual: RevisaoVisual,
  },
  {
    n: 3,
    label: "Ato 3 — Capa e diagramação",
    title: "A cara e o corpo do livro",
    bullets: [
      "Capa criada por IA a partir do seu gênero — com editor pra ajustar tudo",
      "Diagramação profissional em 5 formatos de mercado",
      "PDF pra impressão e EPUB pra lojas digitais",
    ],
    visual: CapaVisual,
  },
  {
    n: 4,
    label: "Ato 4 — Finalize e imprima",
    title: "Do seu painel pra estante",
    bullets: [
      "Pré-visualização do livro montado — 3D, capa e miolo — antes de qualquer pagamento",
      "Impressão a partir de 1 exemplar, com preço de gráfica",
      "Arquivos finais em todos os formatos: PDF de gráfica, EPUB e capa",
    ],
    visual: ConferenciaVisual,
    chip: "Audiolivro — em breve",
  },
];

export default function Atos() {
  const [active, setActive] = useState<AtoIndex>(1);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ato = ATOS.find((a) => a.n === active)!;

  function changeTab(n: AtoIndex) {
    if (n === active) return;
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActive(n);
      setVisible(true);
    }, 160);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const Visual = ato.visual;

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-brand-surface py-28">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">

        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Processo</p>
          <h2 className="font-heading text-4xl md:text-5xl text-brand-primary leading-tight mb-4">
            Do arquivo ao livro, em quatro atos
          </h2>
          <p className="text-brand-primary/55 text-base">
            A esteira completa da Autoria — você aprova cada passo.
          </p>
        </div>

        {/* Container */}
        <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-sm overflow-hidden">

          {/* Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 border-b border-brand-primary/10">
            {ATOS.map((a, i) => {
              const isActive = a.n === active;
              return (
                <button
                  key={a.n}
                  onClick={() => changeTab(a.n)}
                  className={`text-left px-5 py-4 border-b-2 transition-all ${
                    isActive ? "border-brand-gold" : "border-transparent hover:bg-brand-surface"
                  } ${i < ATOS.length - 1 ? "md:border-r md:border-r-brand-primary/10" : ""} ${i % 2 === 0 ? "border-r border-r-brand-primary/10 md:border-r-brand-primary/10" : ""}`}
                >
                  <div className={`text-[10px] font-semibold mb-0.5 uppercase tracking-widest ${isActive ? "text-brand-gold" : "text-brand-primary/40"}`}>
                    Ato {a.n}
                  </div>
                  <div className={`text-sm font-bold leading-snug ${isActive ? "text-brand-primary" : "text-brand-primary/50"}`}>
                    {a.label.split("— ")[1] ?? a.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div
            className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr] md:h-[460px] transition-opacity duration-150"
            style={{ opacity: visible ? 1 : 0 }}
          >

            {/* Left */}
            <div className="flex flex-col justify-between p-8 md:p-10 border-b md:border-b-0 md:border-r border-brand-primary/10">
              <div>
                <h3 className="font-heading text-2xl text-brand-primary leading-snug mb-6">
                  {ato.title}
                </h3>
                <ul className="space-y-4">
                  {ato.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-brand-gold" />
                      <span className="text-brand-primary/70 text-sm leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <Link
                  href="/cadastro"
                  className="inline-flex items-center gap-2 bg-brand-primary text-white text-sm font-bold px-6 py-3 rounded-lg hover:bg-[#2a2a4e] active:scale-95 transition-all"
                >
                  Começar agora →
                </Link>
                {ato.chip && (
                  <span className="inline-flex items-center gap-1.5 text-brand-primary/60 text-xs font-medium border border-dashed border-brand-primary/25 rounded-full px-3 py-1.5">
                    {ato.chip}
                  </span>
                )}
              </div>
            </div>

            {/* Right — static visual */}
            <div className="bg-brand-paper-deep flex items-center justify-center p-6 md:p-8">
              <div className="w-full h-full max-w-[440px] bg-white rounded-xl border border-brand-primary/10 shadow-md flex flex-col overflow-hidden">
                {/* Browser chrome */}
                <div className="shrink-0 bg-brand-surface border-b border-brand-primary/10 px-4 py-2.5 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary/15" />
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary/15" />
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary/15" />
                  <div className="flex-1 flex items-center justify-center gap-1 mx-4">
                    {ATOS.map((a) => (
                      <div key={a.n} className="flex items-center gap-1">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            a.n <= active
                              ? "bg-brand-gold text-brand-primary"
                              : "bg-brand-primary/10 text-brand-primary/40"
                          }`}
                        >
                          {a.n}
                        </div>
                        {a.n < 4 && (
                          <div className={`w-6 h-0.5 ${a.n < active ? "bg-brand-gold" : "bg-brand-primary/10"}`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <Visual />
                </div>
              </div>
            </div>

          </div>
        </div>

        <TutorialVideo />

      </div>
    </section>
  );
}

// ─── Visuais estáticos por ato ────────────────────────────────────────────────

function UploadVisual() {
  return (
    <div className="h-full p-4 flex gap-3">
      <div className="flex-1 border-2 border-dashed border-brand-primary/15 rounded-lg flex flex-col items-center justify-center gap-2 bg-brand-surface">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 15V9m0 0l-3 3m3-3l3 3" />
          <path d="M3 15v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
        </svg>
        <span className="text-xs text-brand-primary/50 font-medium">Enviar manuscrito</span>
      </div>
      <div className="w-40 space-y-2">
        {[
          { label: "Título do livro", value: "Cartas que Não Enviei" },
          { label: "Gênero", value: "Romance" },
          { label: "Formato sugerido", value: "Compacto · 14×21" },
          { label: "Nome do autor", value: "Helena Duarte" },
        ].map((f) => (
          <div key={f.label}>
            <div className="text-[10px] text-brand-primary/40 mb-0.5">{f.label}</div>
            <div className="bg-brand-surface border border-brand-primary/10 rounded px-2 py-1 text-[10px] text-brand-primary/70">{f.value}</div>
          </div>
        ))}
        <div className="bg-brand-gold text-brand-primary text-[10px] font-bold text-center py-1.5 rounded">
          Diagnóstico →
        </div>
      </div>
    </div>
  );
}

function RevisaoVisual() {
  return (
    <div className="h-full flex">
      <div className="flex-1 p-4 overflow-hidden">
        <div className="text-xs font-bold text-brand-primary mb-0.5">O Último Horizonte</div>
        <div className="text-[9px] text-brand-primary/40 mb-2">Capítulo 1 — revisão em andamento</div>
        <div className="text-[10px] text-brand-primary/70 leading-relaxed">
          A noite caía sobre a cidade{" "}
          <span className="bg-emerald-100 text-emerald-700 px-0.5 rounded">silenciosamente</span>,
          enquanto Pedro observava{" "}
          <span className="bg-yellow-100 text-yellow-700 px-0.5 rounded">as luzes distantes</span>.
          O frio cortava o rosto como{" "}
          <span className="bg-red-100 text-red-500 line-through px-0.5 rounded">laminas afiadas</span>{" "}
          <span className="bg-emerald-100 text-emerald-700 px-0.5 rounded">lâminas afiadas</span>.
        </div>
        <div className="mt-3 bg-brand-gold/10 border border-brand-gold/25 rounded text-[9px] text-brand-primary px-2 py-1.5">
          Aplicar sugestões →
        </div>
      </div>
      <div className="w-24 border-l border-brand-primary/10 p-3 bg-brand-surface">
        <div className="text-[9px] font-bold text-brand-primary/70 mb-2">Sugestões</div>
        {[
          { color: "bg-red-400", label: "Ortografia" },
          { color: "bg-yellow-400", label: "Estilo" },
          { color: "bg-emerald-400", label: "Coesão" },
          { color: "bg-red-400", label: "Pontuação" },
          { color: "bg-emerald-400", label: "Ritmo" },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
            <span className="text-[9px] text-brand-primary/60">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapaVisual() {
  return (
    <div className="h-full p-4 flex flex-col">
      <div className="text-[10px] text-brand-primary/50 font-semibold text-center mb-3">Capas geradas e finalizadas na Autoria</div>
      <div className="flex-1 grid grid-cols-4 gap-2">
        {[
          { src: "/capas-home/capa-fantasia-frente.webp", active: false },
          { src: "/capas-home/capa-romance-frente.webp", active: true },
          { src: "/capas-home/capa-suspense-frente.webp", active: false },
          { src: "/capas-home/capa-poesia-frente.webp", active: false },
        ].map((c, i) => (
          <div key={i} className={`relative rounded-lg overflow-hidden ${c.active ? "ring-2 ring-brand-gold" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.src} alt="" width={667} height={1000} loading="lazy" className="w-full h-full object-cover" />
            {c.active && (
              <div className="absolute top-1 right-1 w-3 h-3 bg-brand-gold rounded-full flex items-center justify-center">
                <svg width="6" height="5" viewBox="0 0 6 5" fill="none"><path d="M1 2.5l1.5 1.5L5 1" stroke="#1a1a2e" strokeWidth="1.2" strokeLinecap="round" /></svg>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-brand-surface border border-brand-primary/10 rounded text-[9px] text-brand-primary/70 px-2 py-1.5 text-center">
          EPUB pronto
        </div>
        <div className="bg-brand-gold text-brand-primary text-[9px] font-bold text-center py-1.5 rounded">
          Baixar PDF →
        </div>
      </div>
    </div>
  );
}

function ConferenciaVisual() {
  return (
    <div className="h-full p-4 flex flex-col">
      <div className="text-[10px] text-brand-primary/50 font-semibold text-center mb-3">Conferência final</div>
      <div className="flex-1 flex items-center justify-center gap-3">
        <div className="relative w-20 shrink-0 rounded-md overflow-hidden shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/capas-home/capa-negocios-frente.webp" alt="" width={667} height={1000} className="w-full h-auto block" />
          <div className="absolute inset-y-0 left-0 w-1 bg-black/25" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-brand-primary/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Publicação digital — pronta
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-brand-primary/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Publicação impressa — pronta
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-brand-primary/70">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-gold" /> Lombada calibrada pelas páginas
          </div>
          <div className="text-[9px] text-brand-primary/40 mt-2">Impressão a partir de 1 exemplar</div>
        </div>
      </div>
      <div className="mt-3 bg-brand-primary text-white text-[10px] font-bold text-center py-1.5 rounded">
        Imprimir agora →
      </div>
    </div>
  );
}

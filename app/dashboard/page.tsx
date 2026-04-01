import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Projeto {
  id: string;
  etapa_atual: string;
  criado_em: string;
  manuscript: { nome: string } | null;
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { key: "diagnostico",   label: "Diagnóstico",  href: (id: string) => `/dashboard/diagnostico/${id}` },
  { key: "revisao",       label: "Revisão",       href: (id: string) => `/dashboard/revisao/${id}` },
  { key: "sinopse_ficha", label: "Elementos",     href: (id: string) => `/dashboard/elementos/${id}` },
  { key: "capa",          label: "Capa",          href: (id: string) => `/dashboard/capa/${id}` },
  { key: "diagramacao",   label: "Diagramação",   href: (id: string) => `/dashboard/diagramacao/${id}` },
  { key: "qa",            label: "QA",            href: (id: string) => `/dashboard/qa/${id}` },
  { key: "publicacao",    label: "Publicação",    href: (id: string) => `/dashboard/publicacao/${id}` },
];

const ETAPA_HREF: Record<string, (id: string) => string> = {
  upload:        (id) => `/dashboard/diagnostico/${id}`,
  diagnostico:   (id) => `/dashboard/diagnostico/${id}`,
  revisao:       (id) => `/dashboard/revisao/${id}`,
  sinopse_ficha: (id) => `/dashboard/elementos/${id}`,
  capa:          (id) => `/dashboard/capa/${id}`,
  diagramacao:   (id) => `/dashboard/diagramacao/${id}`,
  qa:            (id) => `/dashboard/qa/${id}`,
  publicacao:    (id) => `/dashboard/publicacao/${id}`,
  concluido:     (id) => `/dashboard/publicacao/${id}`,
};

const MOCK_PROJETOS: Projeto[] = [
  { id: "mock-1", etapa_atual: "revisao",       criado_em: new Date().toISOString(), manuscript: { nome: "O Último Manuscrito" } },
  { id: "mock-2", etapa_atual: "capa",          criado_em: new Date().toISOString(), manuscript: { nome: "Cartas ao Vento" } },
  { id: "mock-3", etapa_atual: "sinopse_ficha", criado_em: new Date().toISOString(), manuscript: { nome: "Além do Horizonte" } },
];

function getStepIndex(etapa: string): number {
  const idx = STEPS.findIndex((s) => s.key === etapa);
  return idx >= 0 ? idx : 0;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Tool cards ───────────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: "/dashboard/novo-projeto",
    icon: "📄",
    label: "Upload de manuscrito",
    desc: "Envie seu manuscrito e inicie o processo",
    highlight: false,
  },
  {
    href: "/dashboard/ferramentas/diagnostico",
    icon: "🔍",
    label: "Diagnóstico IA",
    desc: "Análise literária profissional do seu texto",
    highlight: false,
  },
  {
    href: "/dashboard/ferramentas/capa-ia",
    icon: "🎨",
    label: "Gerador de capa",
    desc: "Crie capas profissionais com inteligência artificial",
    highlight: false,
  },
  {
    href: "/dashboard/ferramentas/revisor",
    icon: "✏️",
    label: "Revisor de texto",
    desc: "Revisão gramatical e estilística com IA",
    highlight: false,
  },
  {
    href: "/dashboard/ferramentas/epub",
    icon: "📱",
    label: "Gerar EPUB",
    desc: "Formate seu livro para e-readers em segundos",
    highlight: false,
  },
  {
    href: "/dashboard/ferramentas/pdf",
    icon: "📋",
    label: "Gerar PDF",
    desc: "PDF pronto para impressão e publicação",
    highlight: false,
  },
  {
    href: "/dashboard/ferramentas/audiolivro",
    icon: "🎙️",
    label: "Narração com IA",
    desc: "Transforme seu livro em audiolivro facilmente",
    highlight: false,
  },
  {
    href: "/dashboard/royalties",
    icon: "💰",
    label: "Royalties",
    desc: "Acompanhe seus ganhos em todas as plataformas",
    highlight: false,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  let projetos: Projeto[] = [];
  let userName = "Autor";

  if (process.env.NODE_ENV === "development") {
    projetos = MOCK_PROJETOS;
    userName = "Mateus";
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("nome")
        .eq("id", user.id)
        .single();
      userName = profile?.nome ?? user.email?.split("@")[0] ?? "Autor";

      const { data } = await supabase
        .from("projects")
        .select("id, etapa_atual, criado_em, manuscript:manuscript_id(nome)")
        .order("criado_em", { ascending: false });

      projetos = (data ?? []) as unknown as Projeto[];
    }
  }

  const projetoAtivo = projetos[0] ?? null;
  const outrosProjetos = projetos.slice(1);
  const stepAtivo = projetoAtivo ? getStepIndex(projetoAtivo.etapa_atual) : 0;
  const nomeAtivo = projetoAtivo?.manuscript?.nome ?? "Meu Livro";
  const continueHref = projetoAtivo
    ? (ETAPA_HREF[projetoAtivo.etapa_atual]?.(projetoAtivo.id) ?? `/dashboard/diagnostico/${projetoAtivo.id}`)
    : "/dashboard/novo-projeto";

  return (
    <div className="min-h-full bg-brand-surface">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-zinc-100 px-8 py-5">
        <div className="max-w-6xl mx-auto flex items-center gap-6">

          {/* Greeting */}
          <div className="shrink-0">
            <h1 className="font-heading text-2xl text-brand-primary leading-tight">
              Olá, {userName}!
            </h1>
            <p className="text-zinc-400 text-sm mt-0.5">Bem-vindo ao seu painel</p>
          </div>

          {/* Project thumbnails strip */}
          {projetos.length > 0 && (
            <div className="flex items-center gap-3 flex-1 overflow-x-auto px-2">
              <span className="text-xs text-zinc-400 font-medium shrink-0">Seus projetos</span>
              <div className="flex gap-2">
                {projetos.map((p) => (
                  <Link
                    key={p.id}
                    href={ETAPA_HREF[p.etapa_atual]?.(p.id) ?? "#"}
                    className="shrink-0 group"
                  >
                    <div className={`w-14 h-20 rounded-lg border-2 flex flex-col items-center justify-end pb-1.5 overflow-hidden transition-all
                      ${p.id === projetoAtivo?.id
                        ? "border-brand-gold shadow-md shadow-brand-gold/20"
                        : "border-zinc-200 group-hover:border-brand-gold/50"}`}
                      style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #2d2d5e 100%)" }}
                    >
                      <span className="text-[8px] text-brand-gold/80 font-medium text-center leading-tight px-1 truncate w-full text-center">
                        {p.manuscript?.nome?.split(" ").slice(0, 2).join(" ") ?? "Livro"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* New project CTA */}
          <Link
            href="/dashboard/novo-projeto"
            className="shrink-0 ml-auto flex flex-col items-center justify-center w-24 h-20 rounded-xl bg-brand-gold text-brand-primary font-semibold text-xs text-center leading-tight hover:bg-brand-gold-light transition-colors gap-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Novo<br />Projeto
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-8 space-y-8">

        {/* ── Active project card ────────────────────────────────────────────── */}
        {projetoAtivo ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="flex gap-0">

              {/* Book cover */}
              <div className="w-44 shrink-0 flex flex-col items-center justify-center p-6 border-r border-zinc-100 bg-zinc-50">
                <div className="w-24 h-36 rounded-lg shadow-lg flex flex-col items-end justify-end overflow-hidden relative"
                  style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #2d2d5e 100%)" }}>
                  <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
                    <div className="w-full h-px bg-brand-gold/30 mb-2" />
                    <p className="text-brand-gold text-[9px] font-heading text-center leading-tight line-clamp-3">
                      {nomeAtivo}
                    </p>
                    <div className="w-full h-px bg-brand-gold/30 mt-2" />
                  </div>
                  <div className="w-full h-1.5 bg-brand-gold/40" />
                </div>
                <p className="text-xs text-zinc-400 mt-3 text-center">
                  Criado em<br />{formatDate(projetoAtivo.criado_em)}
                </p>
              </div>

              {/* Progress + CTA */}
              <div className="flex-1 p-7">
                <p className="text-xs text-zinc-400 uppercase tracking-widest font-medium mb-1">Projeto ativo</p>
                <h2 className="font-heading text-2xl text-brand-primary mb-1">{nomeAtivo}</h2>
                <p className="text-sm text-zinc-400 mb-6">
                  Etapa atual: <span className="text-brand-primary font-medium">{STEPS[stepAtivo]?.label}</span>
                </p>

                {/* Step progress */}
                <div className="flex items-center gap-0 mb-7 overflow-x-auto">
                  {STEPS.map((step, i) => {
                    const done    = i < stepAtivo;
                    const active  = i === stepAtivo;
                    const locked  = i > stepAtivo;
                    return (
                      <div key={step.key} className="flex items-center">
                        {/* Connector line */}
                        {i > 0 && (
                          <div className={`h-0.5 w-6 shrink-0 ${done || active ? "bg-brand-gold" : "bg-zinc-200"}`} />
                        )}
                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                          {/* Circle */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                            ${done    ? "bg-brand-gold border-brand-gold text-brand-primary"   : ""}
                            ${active  ? "bg-brand-primary border-brand-primary text-brand-gold ring-4 ring-brand-gold/20" : ""}
                            ${locked  ? "bg-white border-zinc-200 text-zinc-300" : ""}`}
                          >
                            {done ? (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            ) : locked ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                              </svg>
                            ) : i + 1}
                          </div>
                          {/* Label */}
                          <span className={`text-[10px] font-medium whitespace-nowrap
                            ${active ? "text-brand-primary" : done ? "text-brand-gold" : "text-zinc-300"}`}>
                            {step.label}
                          </span>
                          <span className={`text-[9px] whitespace-nowrap
                            ${active ? "text-brand-gold" : done ? "text-zinc-400" : "text-zinc-300"}`}>
                            {done ? "Concluído" : active ? "Em andamento" : "Próximo passo"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Link
                  href={continueHref}
                  className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-7 py-3 rounded-xl font-semibold text-sm hover:bg-brand-primary/90 transition-colors"
                >
                  Continuar processo
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </Link>
              </div>

              {/* Right panel: plan upgrade + other projects */}
              <div className="w-52 shrink-0 border-l border-zinc-100 p-5 flex flex-col gap-4">

                {/* Upgrade banner */}
                <div className="rounded-xl bg-gradient-to-br from-brand-gold/10 to-brand-gold/5 border border-brand-gold/20 p-4">
                  <p className="text-xs font-semibold text-brand-primary mb-1">Desbloqueie tudo</p>
                  <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
                    Capa IA, EPUB, audiolivro e publicação em 5 plataformas.
                  </p>
                  <Link
                    href="/dashboard/planos"
                    className="block text-center text-xs font-bold text-brand-primary bg-brand-gold px-3 py-2 rounded-lg hover:bg-brand-gold-light transition-colors"
                  >
                    Ver planos
                  </Link>
                </div>

                {/* Other projects */}
                {outrosProjetos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Outros projetos</p>
                    <div className="space-y-1.5">
                      {outrosProjetos.slice(0, 3).map((p) => (
                        <Link
                          key={p.id}
                          href={ETAPA_HREF[p.etapa_atual]?.(p.id) ?? "#"}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-50 transition-colors group"
                        >
                          <div className="w-5 h-7 rounded shrink-0 flex items-center justify-center"
                            style={{ background: "linear-gradient(160deg,#1a1a2e,#2d2d5e)" }}>
                            <div className="w-3 h-px bg-brand-gold/60" />
                          </div>
                          <p className="text-xs text-zinc-600 group-hover:text-brand-primary transition-colors truncate">
                            {p.manuscript?.nome ?? "Sem nome"}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Support link */}
                <Link
                  href="/dashboard/suporte"
                  className="mt-auto flex items-center gap-2 text-xs text-zinc-400 hover:text-brand-primary transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Falar com suporte IA
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="bg-white rounded-2xl border border-dashed border-zinc-200 p-14 text-center">
            <div className="w-16 h-16 rounded-2xl bg-brand-gold/10 flex items-center justify-center mx-auto mb-5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <h3 className="font-heading text-xl text-brand-primary mb-2">Pronto para publicar?</h3>
            <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
              Faça o upload do seu manuscrito e a IA cuida do resto — diagnóstico, revisão, capa e publicação.
            </p>
            <Link
              href="/dashboard/novo-projeto"
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-7 py-3 rounded-xl font-semibold text-sm hover:bg-brand-primary/90 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Fazer upload do manuscrito
            </Link>
          </div>
        )}

        {/* ── Tools grid ────────────────────────────────────────────────────── */}
        <div>
          <h3 className="font-heading text-lg text-brand-primary mb-4">Ferramentas</h3>
          <div className="grid grid-cols-4 gap-4">
            {TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/30 hover:shadow-sm transition-all group flex flex-col gap-3"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-surface flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  {tool.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm text-brand-primary group-hover:text-brand-gold transition-colors leading-tight">
                    {tool.label}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{tool.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

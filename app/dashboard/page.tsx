import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";
import Link from "next/link";
import { ProjectsThumbnails } from "./ProjectsThumbnails";
import { STEPS, ETAPA_HREF, getStepIndex, derivarEtapaExibida } from "@/lib/etapas";
import { resolveCapaCompleta } from "@/lib/capa-resolver";
import { CapaFrenteThumb } from "@/components/capa-frente-thumb";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Projeto {
  id: string;
  etapa_atual: string;
  qa_aprovado_em: string | null;
  dados_miolo: { paginas_reais?: number } | null;
  dados_pdf: { origem?: string } | null;
  criado_em: string;
  manuscript: { nome: string; titulo: string | null } | null;
}

const MOCK_PROJETOS: Projeto[] = [
  { id: "mock-1", etapa_atual: "revisao",   qa_aprovado_em: null, dados_miolo: null, dados_pdf: null, criado_em: new Date().toISOString(), manuscript: { nome: "O Último Manuscrito", titulo: "O Último Manuscrito" } },
  { id: "mock-2", etapa_atual: "capa",      qa_aprovado_em: null, dados_miolo: null, dados_pdf: null, criado_em: new Date().toISOString(), manuscript: { nome: "Cartas ao Vento", titulo: "Cartas ao Vento" } },
  { id: "mock-3", etapa_atual: "elementos", qa_aprovado_em: null, dados_miolo: null, dados_pdf: null, criado_em: new Date().toISOString(), manuscript: { nome: "Além do Horizonte", titulo: "Além do Horizonte" } },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Tool cards ───────────────────────────────────────────────────────────────

const TOOLS = [
  {
    href: "/dashboard/ferramentas/lombada-paginas",
    icon: "📐",
    label: "Lombada e páginas",
    desc: "Calcule a lombada e estime as páginas do seu livro",
  },
  {
    href: "/dashboard/ferramentas/pdf-docx",
    icon: "🔄",
    label: "PDF → DOCX",
    desc: "Converta seu PDF em Word editável — 2 por dia, até 4 MB",
  },
  {
    href: "/dashboard/ferramentas/creditos",
    icon: "📑",
    label: "Ficha de créditos",
    desc: "Gere o verso da folha de rosto com sugestão de ficha catalográfica",
  },
  {
    href: "/dashboard/ferramentas/rgb-cmyk",
    icon: "🎨",
    label: "RGB → CMYK",
    desc: "Prepare sua imagem para impressão em cores de gráfica",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ projeto?: string }>;
}) {
  const { projeto: projetoSelecionado } = await searchParams;
  let projetos: Projeto[] = [];
  let userName = "Autor";
  let userPlano = "freemium";

  if (isDev()) {
    projetos = MOCK_PROJETOS;
    userName = "Mateus";
    userPlano = "pro";
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile, error: profileErr } = await supabase
        .from("users")
        .select("nome, plano")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) {
        console.warn("[dashboard] falha ao carregar perfil:", profileErr.message);
      }
      userName = profile?.nome ?? user.email?.split("@")[0] ?? "Autor";
      userPlano = profile?.plano ?? "freemium";

      const { data } = await supabase
        .from("projects")
        .select("id, etapa_atual, qa_aprovado_em, dados_miolo, dados_pdf, criado_em, manuscript:manuscript_id(nome, titulo)")
        .order("criado_em", { ascending: false });

      projetos = (data ?? []) as unknown as Projeto[];
    }
  }

  const projetoAtivo =
    projetos.find((p) => p.id === projetoSelecionado) ?? projetos[0] ?? null;
  const outrosProjetos = projetos.filter((p) => p.id !== projetoAtivo?.id);
  const etapaExibida = projetoAtivo ? derivarEtapaExibida(projetoAtivo) : null;
  const stepAtivo = etapaExibida ? getStepIndex(etapaExibida) : 0;
  const nomeAtivo = projetoAtivo?.manuscript?.titulo?.trim() || projetoAtivo?.manuscript?.nome || "Meu Livro";
  const continueHref = projetoAtivo && etapaExibida
    ? (ETAPA_HREF[etapaExibida]?.(projetoAtivo.id) ?? `/dashboard/diagnostico/${projetoAtivo.id}`)
    : "/dashboard/novo-projeto";

  const isExpressAtivo = projetoAtivo?.dados_pdf?.origem === "upload";

  let capaExpressPronta = false;
  if (isExpressAtivo && projetoAtivo && !isDev()) {
    const supabase = await createSupabaseServerClient();
    const { data: capaRow, error: capaErr } = await supabase
      .from("projects")
      .select("dados_capa, formato")
      .eq("id", projetoAtivo.id)
      .maybeSingle();
    if (capaErr) {
      console.warn("[dashboard] falha ao carregar capa do projeto ativo:", capaErr.message);
    } else if (capaRow) {
      const capa = resolveCapaCompleta(
        capaRow.dados_capa,
        (capaRow.formato ?? "padrao_br") as Parameters<typeof resolveCapaCompleta>[1],
      );
      capaExpressPronta = capa.pronta;
    }
  }

  const expressStep = projetoAtivo?.qa_aprovado_em ? 3 : capaExpressPronta ? 2 : 1;
  const EXPRESS_STEPS = ["Arquivo do livro", "Capa", "Conferência final"] as const;
  const expressEtapaLabel =
    expressStep >= 2 ? "Conferência final" : "Capa";

  return (
    <div className="min-h-full bg-brand-surface">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-zinc-100 px-4 lg:px-8 py-5">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-stretch lg:items-center gap-4 lg:gap-6">

          {/* Greeting */}
          <div className="shrink-0">
            <h1 className="font-heading text-2xl text-brand-primary leading-tight">
              Olá, {userName}!
            </h1>
            <p className="text-zinc-400 text-sm mt-0.5">Bem-vindo ao seu painel</p>
          </div>

          {/* Project thumbnails strip */}
          <ProjectsThumbnails projetos={projetos} activeId={projetoAtivo?.id} />

          {/* CTAs de criação */}
          <div className="w-full lg:w-auto lg:ml-auto grid grid-cols-2 gap-3 lg:flex lg:items-center lg:gap-2">
            <Link
              href="/dashboard/novo-projeto"
              className="flex flex-col items-center justify-center w-full lg:w-36 h-[5.5rem] px-2 rounded-xl bg-brand-gold text-brand-primary font-semibold text-xs text-center leading-tight hover:bg-brand-gold-light transition-colors gap-0.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Produzir meu livro
              <span className="text-[9px] font-normal opacity-80">Tenho o texto — a Autoria produz comigo</span>
            </Link>
            <Link
              href="/dashboard/livro-pronto"
              className="flex flex-col items-center justify-center w-full lg:w-36 h-[5.5rem] px-2 rounded-xl bg-brand-primary border border-brand-gold/40 text-brand-gold font-semibold text-xs text-center leading-tight hover:border-brand-gold hover:bg-brand-primary/90 transition-colors gap-0.5"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Livro pronto
              <span className="text-[9px] font-normal opacity-80">Já tenho o PDF diagramado</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-6 lg:py-8 space-y-8">

        {/* ── Active project card ────────────────────────────────────────────── */}
        {projetoAtivo ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="flex flex-col lg:flex-row gap-0">

              {/* Book cover */}
              <div className="w-full lg:w-44 shrink-0 flex flex-col items-center justify-center p-6 border-b lg:border-b-0 lg:border-r border-zinc-100 bg-zinc-50">
                <div className="w-24 h-36 rounded-lg shadow-lg overflow-hidden relative"
                  style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #2d2d5e 100%)" }}>
                  <CapaFrenteThumb projectId={projetoAtivo.id} alt={`Capa de ${nomeAtivo}`}>
                    <div className="w-full h-full flex flex-col items-end justify-end">
                      <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
                        <div className="w-full h-px bg-brand-gold/30 mb-2" />
                        <p className="text-brand-gold text-[9px] font-heading text-center leading-tight line-clamp-3">
                          {nomeAtivo}
                        </p>
                        <div className="w-full h-px bg-brand-gold/30 mt-2" />
                      </div>
                      <div className="w-full h-1.5 bg-brand-gold/40" />
                    </div>
                  </CapaFrenteThumb>
                </div>
                <p className="text-xs text-zinc-400 mt-3 text-center">
                  Criado em<br />{formatDate(projetoAtivo.criado_em)}
                </p>
              </div>

              {/* Progress + CTA */}
              <div className="flex-1 p-7">
                <p className="text-xs text-zinc-400 uppercase tracking-widest font-medium mb-1">Projeto ativo</p>
                {isExpressAtivo && (
                  <span className="inline-block text-[10px] text-brand-gold border border-brand-gold/30 rounded px-1.5 mb-1">
                    Livro pronto
                  </span>
                )}
                <h2 className="font-heading text-2xl text-brand-primary mb-1">{nomeAtivo}</h2>
                <p className="text-sm text-zinc-400 mb-6">
                  Etapa atual:{" "}
                  <span className="text-brand-primary font-medium">
                    {isExpressAtivo
                      ? expressEtapaLabel
                      : STEPS[stepAtivo]?.key === "qa"
                        ? "Conferência final"
                        : STEPS[stepAtivo]?.label}
                  </span>
                </p>

                {/* Step progress */}
                <div className="flex items-center gap-0 mb-7 overflow-x-auto">
                  {(isExpressAtivo
                    ? EXPRESS_STEPS.map((label, i) => ({ key: `express-${i}`, label, i }))
                    : STEPS.map((step, i) => ({
                        key: step.key,
                        label: step.key === "qa" ? "Conferência final" : step.label,
                        i,
                      }))
                  ).map(({ key, label, i }) => {
                    const currentStep = isExpressAtivo ? expressStep : stepAtivo;
                    const done    = i < currentStep;
                    const active  = i === currentStep;
                    const locked  = i > currentStep;
                    return (
                      <div key={key} className="flex items-center">
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
                            {label}
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
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-brand-primary text-brand-gold px-7 py-3 rounded-xl font-semibold text-sm hover:bg-brand-primary/90 transition-colors"
                >
                  Continuar processo
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </Link>
              </div>

              {/* Right panel: plan upgrade + other projects */}
              <div className="w-full lg:w-52 shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-100 p-5 flex flex-col gap-4">

                {/* Upgrade banner */}
                {userPlano !== "pro" && !isExpressAtivo && (
                  <div className="rounded-xl bg-gradient-to-br from-brand-gold/10 to-brand-gold/5 border border-brand-gold/20 p-4">
                    <p className="text-xs font-semibold text-brand-primary mb-1">Desbloqueie tudo</p>
                    <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
                      Revisão com IA, capa com IA, EPUB e PDF de impressão.
                    </p>
                    <Link
                      href="/dashboard/planos"
                      className="block text-center text-xs font-bold text-brand-primary bg-brand-gold px-3 py-2 rounded-lg hover:bg-brand-gold-light transition-colors"
                    >
                      Ver planos
                    </Link>
                  </div>
                )}

                {/* Other projects */}
                {outrosProjetos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Outros projetos</p>
                    <div className="space-y-1.5">
                      {outrosProjetos.slice(0, 3).map((p) => (
                        <Link
                          key={p.id}
                          href={`/dashboard?projeto=${p.id}`}
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-50 transition-colors group"
                        >
                          <div className="w-5 h-7 rounded shrink-0 flex items-center justify-center"
                            style={{ background: "linear-gradient(160deg,#1a1a2e,#2d2d5e)" }}>
                            <div className="w-3 h-px bg-brand-gold/60" />
                          </div>
                          <p className="text-xs text-zinc-600 group-hover:text-brand-primary transition-colors truncate">
                            {p.manuscript?.titulo?.trim() || p.manuscript?.nome || "Sem nome"}
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
            <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto leading-relaxed">
              Duas portas, um destino: seu livro publicado. Produza com a IA da Autoria ou traga o arquivo pronto para imprimir.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <div className="flex flex-col items-center">
                <Link
                  href="/dashboard/novo-projeto"
                  className="inline-flex items-center gap-2 bg-brand-primary text-brand-gold px-7 py-3 rounded-xl font-semibold text-sm hover:bg-brand-primary/90 transition-colors"
                >
                  Produzir meu livro
                </Link>
                <p className="text-[11px] text-zinc-400 mt-2">Tenho o texto — a Autoria produz comigo</p>
              </div>
              <div className="flex flex-col items-center">
                <Link
                  href="/dashboard/livro-pronto"
                  className="inline-flex items-center gap-2 bg-white border border-brand-primary/20 text-brand-primary px-7 py-3 rounded-xl font-semibold text-sm hover:border-brand-gold transition-colors"
                >
                  Livro pronto
                </Link>
                <p className="text-[11px] text-zinc-400 mt-2">Já tenho o PDF diagramado</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Tools grid ────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="font-heading text-lg text-brand-primary">Ferramentas gratuitas</h3>
            <Link href="/dashboard/ferramentas" className="text-xs text-brand-gold hover:underline underline-offset-2">
              Ver todas as ferramentas →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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

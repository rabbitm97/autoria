import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Projeto {
  id: string;
  etapa_atual: string;
  criado_em: string;
  manuscript: { nome: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ETAPA_INFO: Record<string, { label: string; color: string; href: (id: string) => string }> = {
  upload:       { label: "Upload",       color: "text-zinc-400",    href: (id) => `/dashboard/diagnostico/${id}` },
  diagnostico:  { label: "Diagnóstico",  color: "text-amber-600",   href: (id) => `/dashboard/diagnostico/${id}` },
  revisao:      { label: "Revisão",      color: "text-violet-600",  href: (id) => `/dashboard/revisao/${id}` },
  sinopse_ficha:{ label: "Elementos",    color: "text-blue-600",    href: (id) => `/dashboard/elementos/${id}` },
  capa:         { label: "Capa",         color: "text-pink-600",    href: (id) => `/dashboard/capa/${id}` },
  diagramacao:  { label: "Diagramação",  color: "text-orange-500",  href: (id) => `/dashboard/diagramacao/${id}` },
  preview:      { label: "Preview",      color: "text-teal-600",    href: (id) => `/dashboard/preview/${id}` },
  publicacao:   { label: "Publicação",   color: "text-green-600",   href: (id) => `/dashboard/publicacao/${id}` },
  concluido:    { label: "Concluído",    color: "text-emerald-600", href: (id) => `/dashboard/projeto/${id}` },
};

const MOCK_PROJETOS: Projeto[] = [
  { id: "mock-1", etapa_atual: "diagnostico",   criado_em: new Date().toISOString(), manuscript: { nome: "O Último Manuscrito" } },
  { id: "mock-2", etapa_atual: "revisao",        criado_em: new Date().toISOString(), manuscript: { nome: "Cartas ao Vento" } },
  { id: "mock-3", etapa_atual: "sinopse_ficha",  criado_em: new Date().toISOString(), manuscript: { nome: "Além do Horizonte" } },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  let projetos: Projeto[] = [];
  let userName = "Autor";

  if (process.env.NODE_ENV === "development") {
    projetos = MOCK_PROJETOS;
    userName = "Dev";
  } else {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("nome")
        .eq("id", user.id)
        .single();
      userName = profile?.nome ?? user.email?.split("@")[0] ?? "Autor";
    }

    const { data } = await supabase
      .from("projects")
      .select("id, etapa_atual, criado_em, manuscript:manuscript_id(nome)")
      .order("criado_em", { ascending: false });

    projetos = (data ?? []) as unknown as Projeto[];
  }

  const temProjetos = projetos.length > 0;

  return (
    <div className="min-h-screen bg-brand-surface">

      {/* Header */}
      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-heading text-2xl text-brand-gold">Autoria</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/perfil"
              className="flex items-center gap-2 text-sm text-brand-surface/60 hover:text-brand-gold transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-brand-gold/20 flex items-center justify-center">
                <span className="text-brand-gold text-xs font-bold">
                  {userName.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="hidden sm:block">{userName}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">

        {/* Boas-vindas + CTA */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10">
          <div>
            <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
              Olá, {userName}
            </p>
            <h2 className="font-heading text-4xl text-brand-primary leading-tight">
              Seus projetos
            </h2>
            <p className="text-zinc-500 mt-2 text-sm">
              {temProjetos
                ? `${projetos.length} projeto${projetos.length > 1 ? "s" : ""} em andamento`
                : "Nenhum projeto ainda. Comece fazendo o upload do seu manuscrito."}
            </p>
          </div>
          <Link
            href="/dashboard/novo-projeto"
            className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] active:scale-[0.99] transition-all shrink-0"
          >
            <UploadIcon />
            Novo projeto
          </Link>
        </div>

        {/* Lista de projetos */}
        {temProjetos ? (
          <div className="space-y-3 mb-10">
            {projetos.map((p) => {
              const etapa = ETAPA_INFO[p.etapa_atual] ?? ETAPA_INFO["diagnostico"];
              const nome = p.manuscript?.nome ?? "Manuscrito sem nome";
              return (
                <Link
                  key={p.id}
                  href={etapa.href(p.id)}
                  className="flex items-center gap-5 bg-white rounded-2xl border border-zinc-100 px-6 py-4 hover:border-brand-gold/30 hover:shadow-sm transition-all group"
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center shrink-0">
                    <BookIcon />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-base text-brand-primary truncate group-hover:text-brand-gold transition-colors">
                      {nome}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      Criado em {formatDate(p.criado_em)}
                    </p>
                  </div>

                  {/* Stage badge */}
                  <div className="shrink-0 text-right">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full bg-zinc-50 border border-zinc-100 ${etapa.color}`}>
                      {etapa.label}
                    </span>
                  </div>

                  {/* Arrow */}
                  <span className="text-zinc-300 group-hover:text-brand-gold transition-colors shrink-0">›</span>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Empty state */
          <div className="bg-white rounded-2xl border border-dashed border-zinc-200 p-12 text-center mb-10">
            <div className="w-14 h-14 rounded-full bg-brand-gold/10 flex items-center justify-center mx-auto mb-4">
              <BookIcon large />
            </div>
            <h3 className="font-heading text-xl text-brand-primary mb-2">
              Pronto para publicar?
            </h3>
            <p className="text-zinc-400 text-sm mb-6 max-w-sm mx-auto">
              Faça o upload do seu manuscrito e a IA cuida do resto — diagnóstico, revisão, capa e publicação.
            </p>
            <Link
              href="/dashboard/novo-projeto"
              className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] transition-all"
            >
              <UploadIcon />
              Fazer upload do manuscrito
            </Link>
          </div>
        )}

        {/* Quick links */}
        <div className="flex flex-wrap gap-3 pt-6 border-t border-zinc-100">
          <Link
            href="/dashboard/ferramentas"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <ToolsIcon />
            Ferramentas
          </Link>
          {temProjetos && (
            <Link
              href={`/dashboard/audiolivro/${projetos[0].id}`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
            >
              <AudioIcon />
              Audiolivro
            </Link>
          )}
          <Link
            href="/dashboard/planos"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <PlansIcon />
            Planos e preços
          </Link>
          <Link
            href="/dashboard/royalties"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <RoyaltiesIcon />
            Royalties
          </Link>
          <Link
            href="/dashboard/suporte"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <SupportIcon />
            Suporte
          </Link>
          <Link
            href="/dashboard/perfil"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-600 hover:border-brand-gold/30 hover:text-brand-primary transition-all"
          >
            <UserIcon />
            Perfil
          </Link>
        </div>

        <p className="text-center text-zinc-300 text-xs mt-10">
          Autoria — Do manuscrito ao leitor.
        </p>
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function BookIcon({ large }: { large?: boolean }) {
  const s = large ? 24 : 16;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={large ? "text-brand-gold" : "text-brand-primary/40"}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}

function ToolsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function RoyaltiesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/>
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/>
      <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

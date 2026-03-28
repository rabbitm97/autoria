import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { DiagnosticoResult } from "@/app/api/diagnostico/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

type Complexidade = { label: string; color: string; bg: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n: number) {
  return n.toLocaleString("pt-BR");
}

const COMPLEXIDADE_LABEL: Record<string, Complexidade> = {
  simples:  { label: "Simples",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  médio:    { label: "Médio",    color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"     },
  complexo: { label: "Complexo", color: "text-violet-700",  bg: "bg-violet-50 border-violet-200"   },
};

const STEPS = ["Upload", "Diagnóstico", "Revisão", "Capa", "Diagramação", "Publicação"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  sub,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col gap-3">
      <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
        <p className="font-heading text-2xl text-brand-primary leading-none">{value}</p>
        {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function ListCard({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "success" | "warning";
}) {
  const styles =
    variant === "success"
      ? { border: "border-emerald-100", bg: "bg-emerald-50", dot: "bg-emerald-500", title: "text-emerald-800" }
      : { border: "border-amber-100",   bg: "bg-amber-50",   dot: "bg-amber-500",   title: "text-amber-800"  };

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-6`}>
      <h3 className={`font-heading text-lg mb-4 ${styles.title}`}>{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`w-2 h-2 rounded-full ${styles.dot} mt-1.5 shrink-0`} />
            <span className="text-zinc-700 text-sm leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PendingState({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mb-6" />
      <h2 className="font-heading text-2xl text-brand-primary mb-2">
        Diagnóstico em andamento…
      </h2>
      <p className="text-zinc-500 max-w-sm leading-relaxed mb-8">
        A IA está analisando seu manuscrito. Isso leva alguns segundos.
      </p>
      <Link
        href={`/dashboard/diagnostico/${projectId}`}
        className="text-brand-gold text-sm underline underline-offset-4 hover:text-brand-gold-light transition-colors"
      >
        Atualizar página
      </Link>
    </div>
  );
}

// ─── View (shared between real data and dev mock) ─────────────────────────────

function DiagnosticoView({
  manuscritoNome,
  diagnostico,
  complexidade,
  projectId,
}: {
  manuscritoNome: string;
  diagnostico: DiagnosticoResult | null;
  complexidade: Complexidade | null;
  projectId: string;
}) {
  return (
    <div className="min-h-screen bg-brand-surface">

      {/* Header */}
      <header className="bg-brand-primary border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3 text-sm">
          <Link
            href="/dashboard"
            className="text-brand-gold/60 hover:text-brand-gold transition-colors"
          >
            Dashboard
          </Link>
          <span className="text-white/20">/</span>
          <span className="text-brand-surface/50 max-w-[180px] truncate">
            {manuscritoNome}
          </span>
          <span className="text-white/20">/</span>
          <span className="text-brand-gold/80">Diagnóstico</span>
        </div>
      </header>

      {/* Step indicator */}
      <div className="bg-brand-primary border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <ol className="flex items-center overflow-x-auto">
            {STEPS.map((step, i) => {
              const done   = i === 0;
              const active = i === 1;
              return (
                <li key={step} className="flex items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                      ${done   ? "bg-emerald-500 text-white" :
                        active ? "bg-brand-gold text-brand-primary" :
                                 "bg-white/10 text-white/30"}`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span className={`text-xs
                      ${done   ? "text-emerald-400" :
                        active ? "text-brand-gold font-medium" :
                                 "text-white/30"}`}
                    >
                      {step}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="mx-3 text-white/10 text-xs">›</span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-10">
        {!diagnostico ? (
          <PendingState projectId={projectId} />
        ) : (
          <>
            {/* Title */}
            <div className="mb-8">
              <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
                Diagnóstico completo
              </p>
              <h1 className="font-heading text-3xl md:text-4xl text-brand-primary leading-tight">
                {manuscritoNome}
              </h1>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Gênero"
                value={diagnostico.genero_provavel}
                icon={<BookIcon />}
              />
              <StatCard
                label="Palavras"
                value={formatNumber(diagnostico.num_palavras)}
                icon={<TextIcon />}
                sub="no manuscrito"
              />
              <StatCard
                label="Capítulos"
                value={String(diagnostico.num_capitulos)}
                icon={<ChaptersIcon />}
                sub="estimativa"
              />
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center">
                  <ComplexityIcon />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">
                    Complexidade
                  </p>
                  <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full border ${complexidade!.bg} ${complexidade!.color}`}>
                    {complexidade!.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Pontos fortes / melhorar */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <ListCard
                title="✦ Pontos fortes"
                items={diagnostico.pontos_fortes}
                variant="success"
              />
              <ListCard
                title="◈ Pontos a melhorar"
                items={diagnostico.pontos_melhorar}
                variant="warning"
              />
            </div>

            {/* Mercado alvo */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-10">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/5 flex items-center justify-center">
                  <TargetIcon />
                </div>
                <h3 className="font-heading text-lg text-brand-primary">
                  Mercado-alvo
                </h3>
              </div>
              <p className="text-zinc-600 leading-relaxed">{diagnostico.mercado_alvo}</p>
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-zinc-200">
              <p className="text-zinc-400 text-sm text-center sm:text-left">
                Próxima etapa: revisão e correção do texto com IA.
              </p>
              <Link
                href={`/dashboard/revisao/${projectId}`}
                className="inline-flex items-center gap-2 bg-brand-primary text-brand-surface px-8 py-4 rounded-xl font-semibold text-sm hover:bg-[#2a2a4e] active:scale-[0.99] transition-all whitespace-nowrap"
              >
                Continuar para revisão
                <span aria-hidden>→</span>
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DiagnosticoPage({ params }: PageProps) {
  const { id } = await params;

  // Auth
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isDev = process.env.NODE_ENV === "development";
  if (!user && !isDev) redirect("/login");

  // No dev sem auth → exibe dados mock para preview visual
  if (!user && isDev) {
    const mockDiagnostico: DiagnosticoResult = {
      genero_provavel: "Romance Contemporâneo",
      num_palavras: 72_400,
      num_capitulos: 24,
      complexidade: "médio",
      pontos_fortes: [
        "Voz narrativa envolvente e personalidade marcante da protagonista logo no primeiro capítulo",
        "Diálogos naturais que revelam conflito interno sem exposição excessiva",
        "Ambientação em Ouro Preto cria atmosfera única e diferencia o livro no mercado",
      ],
      pontos_melhorar: [
        "O ritmo do capítulo 3 desacelera — considere condensar as cenas de chegada à pensão",
        "A motivação de Rafael para parar de escrever pode ser introduzida com mais sutileza",
        "Alguns flashbacks interrompem o fluxo — avalie integrar essas memórias de forma orgânica",
      ],
      mercado_alvo:
        "Leitoras brasileiras entre 25 e 42 anos, consumidoras de romance literário e ficção feminista. Presentes na Amazon Kindle, Kobo e livrarias independentes. Comparável a títulos de Letícia Wierzchowski e Andrea del Fuente.",
    };
    return (
      <DiagnosticoView
        manuscritoNome="A Última Carta (demo)"
        diagnostico={mockDiagnostico}
        complexidade={COMPLEXIDADE_LABEL[mockDiagnostico.complexidade]}
        projectId={id}
      />
    );
  }

  // Fetch project + manuscript name
  const { data: project } = await supabase
    .from("projects")
    .select("id, etapa_atual, diagnostico, manuscripts(nome)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!project) notFound();

  const diagnostico = project.diagnostico as DiagnosticoResult | null;
  const manuscritoNome =
    (project.manuscripts as unknown as { nome: string } | null)?.nome ?? "Manuscrito";

  const complexidade = diagnostico
    ? (COMPLEXIDADE_LABEL[diagnostico.complexidade] ?? COMPLEXIDADE_LABEL["médio"])
    : null;

  return (
    <DiagnosticoView
      manuscritoNome={manuscritoNome}
      diagnostico={diagnostico}
      complexidade={complexidade}
      projectId={id}
    />
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="17" y1="10" x2="3" y2="10"/>
      <line x1="21" y1="6" x2="3" y2="6"/>
      <line x1="21" y1="14" x2="3" y2="14"/>
      <line x1="17" y1="18" x2="3" y2="18"/>
    </svg>
  );
}

function ChaptersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}

function ComplexityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  );
}

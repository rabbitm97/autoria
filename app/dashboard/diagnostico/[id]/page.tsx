import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import type { DiagnosticoResult } from "@/app/api/agentes/diagnostico/route";
import { DiagnosticoActions } from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

const COMPLEXIDADE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  simples:  { label: "Simples",  color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  médio:    { label: "Médio",    color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"     },
  complexo: { label: "Complexo", color: "text-violet-700",  bg: "bg-violet-50 border-violet-200"   },
};

const POTENCIAL_MAP: Record<string, { label: string; color: string; bg: string }> = {
  baixo: { label: "Baixo",  color: "text-red-700",     bg: "bg-red-50 border-red-200"       },
  médio: { label: "Médio",  color: "text-amber-700",   bg: "bg-amber-50 border-amber-200"   },
  alto:  { label: "Alto",   color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
};

const MERCADO_MAP: Record<string, { label: string; color: string; bg: string }> = {
  nicho:    { label: "Nicho",    color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
  adequado: { label: "Adequado", color: "text-teal-700",   bg: "bg-teal-50 border-teal-200"     },
  amplo:    { label: "Amplo",    color: "text-blue-700",   bg: "bg-blue-50 border-blue-200"     },
};

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

function Badge({
  label,
  color,
  bg,
}: {
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full border ${bg} ${color}`}>
      {label}
    </span>
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
  const s =
    variant === "success"
      ? { border: "border-emerald-100", bg: "bg-emerald-50", dot: "bg-emerald-500", title: "text-emerald-800" }
      : { border: "border-amber-100",   bg: "bg-amber-50",   dot: "bg-amber-500",   title: "text-amber-800"  };

  return (
    <div className={`rounded-2xl border ${s.border} ${s.bg} p-6`}>
      <h3 className={`font-heading text-lg mb-4 ${s.title}`}>{title}</h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 shrink-0`} />
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
        className="text-brand-gold text-sm underline underline-offset-4 hover:text-brand-gold/80 transition-colors"
      >
        Atualizar página
      </Link>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

function DiagnosticoView({
  manuscritoNome,
  diagnostico,
  projectId,
  usarRevisao,
}: {
  manuscritoNome: string;
  diagnostico: DiagnosticoResult | null;
  projectId: string;
  usarRevisao: boolean | null;
}) {
  const complexidade = diagnostico
    ? (COMPLEXIDADE_MAP[diagnostico.complexidade] ?? COMPLEXIDADE_MAP["médio"])
    : null;
  const potencial = diagnostico
    ? (POTENCIAL_MAP[diagnostico.potencial_comercial] ?? POTENCIAL_MAP["médio"])
    : null;
  const mercado = diagnostico
    ? (MERCADO_MAP[diagnostico.tamanho_mercado] ?? MERCADO_MAP["adequado"])
    : null;

  return (
    <div>
      <EtapasProgress currentStep={0} projectId={projectId} />

      <main className="max-w-4xl mx-auto px-4 py-10">
        {!diagnostico ? (
          <PendingState projectId={projectId} />
        ) : (
          <>
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="bg-brand-primary text-brand-gold text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  {diagnostico.genero_provavel}
                </span>
                <span className="text-zinc-400 text-xs">
                  {diagnostico.confianca_genero}% confiança
                </span>
              </div>
              <h1 className="font-heading text-3xl md:text-4xl text-brand-primary leading-tight mb-1">
                {manuscritoNome}
              </h1>
              <p className="text-zinc-500 text-sm italic">{diagnostico.tom_narrativo}</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Palavras"
                value={fmt(diagnostico.num_palavras)}
                icon={<TextIcon />}
                sub="no manuscrito"
              />
              <StatCard
                label="Capítulos"
                value={String(diagnostico.num_capitulos)}
                icon={<ChaptersIcon />}
                sub="estimativa"
              />
              <StatCard
                label="Páginas"
                value={fmt(diagnostico.paginas_estimadas)}
                icon={<PagesIcon />}
                sub="estimativa"
              />
              <div className="bg-white rounded-2xl border border-zinc-100 p-6 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center">
                  <ComplexityIcon />
                </div>
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Complexidade</p>
                  <Badge label={complexidade!.label} color={complexidade!.color} bg={complexidade!.bg} />
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-400">Flesch</span>
                      <span className="text-xs font-medium text-zinc-600">{diagnostico.complexidade_flesch}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-gold rounded-full transition-all"
                        style={{ width: `${diagnostico.complexidade_flesch}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pontos fortes / melhorar */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <ListCard title="✦ Pontos fortes" items={diagnostico.pontos_fortes} variant="success" />
              <ListCard title="◈ Pontos a melhorar" items={diagnostico.pontos_melhorar} variant="warning" />
            </div>

            {/* Market analysis */}
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/5 flex items-center justify-center">
                  <TargetIcon />
                </div>
                <h3 className="font-heading text-lg text-brand-primary">Análise de Mercado</h3>
              </div>

              {/* Market badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div className="bg-zinc-50 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Potencial Comercial</p>
                  <Badge label={potencial!.label} color={potencial!.color} bg={potencial!.bg} />
                </div>
                <div className="bg-zinc-50 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Tamanho do Mercado</p>
                  <Badge label={mercado!.label} color={mercado!.color} bg={mercado!.bg} />
                </div>
                <div className="bg-zinc-50 rounded-xl p-4">
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Faixa de Preço</p>
                  <p className="font-semibold text-brand-primary text-sm">{diagnostico.faixa_preco_sugerida}</p>
                </div>
              </div>

              {/* Target audience */}
              <p className="text-zinc-600 text-sm leading-relaxed mb-5">{diagnostico.mercado_alvo}</p>

              {/* Comparables */}
              {diagnostico.comparaveis_mercado?.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Comparáveis</p>
                  <div className="space-y-1.5">
                    {diagnostico.comparaveis_mercado.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                        <span className="text-brand-gold mt-0.5">◆</span>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Next steps */}
            {diagnostico.proximos_passos?.length > 0 && (
              <div className="bg-brand-primary/5 rounded-2xl border border-brand-primary/10 p-6 mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-brand-primary/10 flex items-center justify-center">
                    <StepsIcon />
                  </div>
                  <h3 className="font-heading text-lg text-brand-primary">Próximos Passos</h3>
                </div>
                <ol className="space-y-3">
                  {diagnostico.proximos_passos.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand-gold/20 text-brand-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-zinc-700 text-sm leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* CTAs */}
            <DiagnosticoActions projectId={projectId} usarRevisao={usarRevisao} />
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

  // Dev mock
  if (!user && isDev) {
    const mock: DiagnosticoResult = {
      genero_provavel: "Romance Contemporâneo",
      confianca_genero: 88,
      num_palavras: 72_400,
      num_capitulos: 24,
      paginas_estimadas: 290,
      complexidade: "médio",
      complexidade_flesch: 62,
      tom_narrativo: "Romântico e nostálgico com traços de mistério",
      pontos_fortes: [
        "Voz narrativa envolvente e protagonista com personalidade marcante desde o primeiro capítulo",
        "Diálogos naturais que revelam conflito interno sem exposição excessiva",
        "Ambientação em Ouro Preto cria atmosfera única e diferencia o livro no mercado",
      ],
      pontos_melhorar: [
        "O ritmo do capítulo 3 desacelera — considere condensar as cenas de chegada à pensão",
        "A motivação de Rafael para parar de escrever pode ser introduzida com mais sutileza",
        "Alguns flashbacks interrompem o fluxo — avalie integrar essas memórias de forma orgânica",
      ],
      mercado_alvo:
        "Leitoras brasileiras entre 25 e 42 anos, consumidoras de romance literário e ficção feminista. Presentes na Amazon Kindle, Skoob e livrarias independentes. Buscam narrativas com profundidade emocional, protagonistas femininas complexas e ambientações brasileiras autênticas.",
      tamanho_mercado: "adequado",
      potencial_comercial: "alto",
      faixa_preco_sugerida: "R$34,90 – R$44,90 (físico) · R$14,90 – R$19,90 (eBook)",
      comparaveis_mercado: [
        "Thalita Rebouças — mesma leveza de linguagem com apelo emocional forte",
        "Colleen Hoover (traduzida) — estrutura de romance contemporâneo com tensão dramática similar",
      ],
      proximos_passos: [
        "Revisar capítulos 3 e 7 para ajustar o ritmo narrativo identificado na análise",
        "Desenvolver melhor a backstory de Rafael antes do capítulo 5",
        "Contratar revisão ortográfica e gramatical profissional antes da formatação",
        "Pesquisar capas de romance contemporâneo brasileiro para briefing visual",
        "Definir estratégia de lançamento: Amazon KDP + Skoob + BookTok",
      ],
    };
    return (
      <DiagnosticoView
        manuscritoNome="A Última Carta (demo)"
        diagnostico={mock}
        projectId={id}
        usarRevisao={true}
      />
    );
  }

  // Production: fetch project
  const { data: project } = await supabase
    .from("projects")
    .select("id, etapa_atual, usar_revisao, diagnostico, manuscripts(nome)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!project) notFound();

  const diagnostico = project.diagnostico as DiagnosticoResult | null;
  const manuscritoNome =
    (project.manuscripts as unknown as { nome: string } | null)?.nome ?? "Manuscrito";
  const usarRevisao = project.usar_revisao as boolean | null;

  return (
    <DiagnosticoView
      manuscritoNome={manuscritoNome}
      diagnostico={diagnostico}
      projectId={id}
      usarRevisao={usarRevisao}
    />
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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

function PagesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
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

function StepsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="#1a1a2e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}

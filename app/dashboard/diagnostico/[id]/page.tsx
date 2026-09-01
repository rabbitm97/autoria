import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { EtapasProgress } from "@/components/etapas-progress";
import { isDev } from "@/lib/anthropic";
import type { DiagnosticoResult } from "@/app/api/agentes/diagnostico/route";
import { DiagnosticoActions } from "./actions";
import { ResultadoDiagnostico } from "@/components/diagnostico/resultado-diagnostico";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

interface DiagnosticoStateMinimo {
  status: "processando_capitulos" | "consolidando" | "concluido" | "erro";
  progresso?: { atual: number; total: number };
  resultado?: DiagnosticoResult;
  erro?: string;
}

type EstadoDiagnostico =
  | { tipo: "ausente" }
  | { tipo: "processando"; status: "processando_capitulos" | "consolidando"; progresso?: { atual: number; total: number } }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "concluido"; diagnostico: DiagnosticoResult };

// ─── Sub-components ───────────────────────────────────────────────────────────

function PendingState({
  projectId,
  status,
  progresso,
}: {
  projectId: string;
  status?: "processando_capitulos" | "consolidando";
  progresso?: { atual: number; total: number };
}) {
  const mensagem = (() => {
    if (status === "consolidando") return "Consolidando análise final…";
    if (status === "processando_capitulos" && progresso) {
      return `Analisando capítulo ${progresso.atual} de ${progresso.total}…`;
    }
    return "A IA está analisando seu manuscrito.";
  })();

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-full border-4 border-brand-gold border-t-transparent animate-spin mb-6" />
      <h2 className="font-heading text-2xl text-brand-primary mb-2">
        Diagnóstico em andamento…
      </h2>
      <p className="text-zinc-500 max-w-sm leading-relaxed mb-8">{mensagem}</p>
      <Link
        href={`/dashboard/diagnostico/${projectId}`}
        className="text-brand-gold text-sm underline underline-offset-4 hover:text-brand-gold/80 transition-colors"
      >
        Atualizar página
      </Link>
    </div>
  );
}

function ErrorState({ projectId, mensagem }: { projectId: string; mensagem: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center mb-6">
        <span className="text-red-500 text-2xl">!</span>
      </div>
      <h2 className="font-heading text-2xl text-brand-primary mb-2">
        Erro no diagnóstico
      </h2>
      <p className="text-zinc-600 max-w-md leading-relaxed mb-8">{mensagem}</p>
      <Link
        href={`/dashboard/diagnostico/${projectId}`}
        className="text-brand-gold text-sm underline underline-offset-4 hover:text-brand-gold/80 transition-colors"
      >
        Tentar novamente
      </Link>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

function DiagnosticoView({
  manuscritoNome,
  estado,
  projectId,
  usarRevisao,
}: {
  manuscritoNome: string;
  estado: EstadoDiagnostico;
  projectId: string;
  usarRevisao: boolean | null;
}) {
  if (estado.tipo === "ausente") {
    return (
      <div>
        <EtapasProgress currentStep={0} projectId={projectId} />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <PendingState projectId={projectId} />
        </main>
      </div>
    );
  }

  if (estado.tipo === "processando") {
    return (
      <div>
        <EtapasProgress currentStep={0} projectId={projectId} />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <PendingState
            projectId={projectId}
            status={estado.status}
            progresso={estado.progresso}
          />
        </main>
      </div>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <div>
        <EtapasProgress currentStep={0} projectId={projectId} />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <ErrorState projectId={projectId} mensagem={estado.mensagem} />
        </main>
      </div>
    );
  }

  return (
    <div>
      <EtapasProgress currentStep={0} projectId={projectId} />
      <main className="max-w-4xl mx-auto px-4 py-10">
        <ResultadoDiagnostico manuscritoNome={manuscritoNome} diagnostico={estado.diagnostico} />
        <DiagnosticoActions projectId={projectId} usarRevisao={usarRevisao} />
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
  const dev = isDev();
  if (!user && !dev) redirect("/login");

  // Dev mock
  if (!user && dev) {
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
      formato_sugerido: {
        formato: "padrao_br",
        label: "Padrão editorial · 16×23 cm",
        paginas_estimadas: 329,
        lombada_mm: 17.1,
        motivo: "Seu manuscrito tem 72.400 palavras, o que resulta em aproximadamente 329 páginas no formato 16×23 cm.",
        cascata: [
          { formato: "padrao_br", paginas: 329, lombada_mm: 17.1 },
          { formato: "compacto", paginas: 402, lombada_mm: 20.9 },
          { formato: "bolso", paginas: 584, lombada_mm: 30.4 },
        ],
      },
      tempo_leitura_horas: 6,
      canais_recomendados: {
        ebook: {
          recomendado: true,
          plataformas: ["Amazon Kindle", "Apple Books", "Kobo", "Google Play Books"],
          descricao: "Romance contemporâneo funciona muito bem em eBook — leitura sequencial e alto engajamento mobile.",
        },
        fisico: {
          recomendado: true,
          descricao: "Boa adequação para POD físico, especialmente como item de presente.",
        },
        audiolivro: {
          recomendado: true,
          duracao_estimada_horas: 8,
          descricao: "Narração natural funciona bem para romance — emoções dialogadas se destacam em áudio.",
        },
      },
      faixa_preco_detalhada: {
        ebook: "R$14,90 – R$19,90",
        fisico: "R$34,90 – R$44,90",
        audiolivro: "R$24,90 – R$34,90",
      },
    };
    return (
      <DiagnosticoView
        manuscritoNome="A Última Carta (demo)"
        estado={{ tipo: "concluido", diagnostico: mock }}
        projectId={id}
        usarRevisao={true}
      />
    );
  }

  // Production: fetch project
  const { data: project } = await supabase
    .from("projects")
    .select("id, etapa_atual, usar_revisao, diagnostico, dados_pdf, manuscripts(nome, titulo)")
    .eq("id", id)
    .eq("user_id", user!.id)
    .single();

  if (!project) notFound();

  // Express: quando o autor sobe o PDF pronto pela porta "Publicar livro
  // pronto", pula toda a esteira editorial (diagnóstico incluído). O guard
  // é server-side aqui porque a página é RSC — o hook cliente
  // `useExpressGuard` das outras etapas não se aplica.
  const dadosPdfExpress = (project.dados_pdf as { origem?: string } | null)?.origem;
  if (dadosPdfExpress === "upload") {
    redirect(`/dashboard/prova/${id}`);
  }

  const raw = project.diagnostico as DiagnosticoStateMinimo | DiagnosticoResult | null;
  const ms = project.manuscripts as unknown as { nome?: string; titulo?: string | null } | null;
  const manuscritoNome = (ms?.titulo?.trim()) || ms?.nome || "Manuscrito";
  const usarRevisao = project.usar_revisao as boolean | null;

  const estado: EstadoDiagnostico = (() => {
    if (!raw) return { tipo: "ausente" };

    if ("status" in raw && typeof raw.status === "string") {
      const s = raw as DiagnosticoStateMinimo;
      if (s.status === "concluido" && s.resultado) {
        return { tipo: "concluido", diagnostico: s.resultado };
      }
      if (s.status === "erro") {
        return { tipo: "erro", mensagem: s.erro ?? "Erro desconhecido no diagnóstico." };
      }
      if (s.status === "processando_capitulos" || s.status === "consolidando") {
        return { tipo: "processando", status: s.status, progresso: s.progresso };
      }
      return { tipo: "ausente" };
    }

    if ("num_palavras" in raw) {
      return { tipo: "concluido", diagnostico: raw as DiagnosticoResult };
    }

    return { tipo: "ausente" };
  })();

  return (
    <DiagnosticoView
      manuscritoNome={manuscritoNome}
      estado={estado}
      projectId={id}
      usarRevisao={usarRevisao}
    />
  );
}


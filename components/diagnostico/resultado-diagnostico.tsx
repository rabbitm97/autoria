// components/diagnostico/resultado-diagnostico.tsx
// Componente ÚNICO de apresentação do diagnóstico (V47). Sem hooks, sem
// server: renderiza em server component (esteira) e em client (wizard
// avulso). Recebe só dados.
import type { DiagnosticoResult } from "@/app/api/agentes/diagnostico/route";
import { getFormatoDef } from "@/lib/formatos";

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

// ─── Componente principal ─────────────────────────────────────────────────────

export function ResultadoDiagnostico({
  manuscritoNome,
  diagnostico,
}: {
  manuscritoNome: string;
  diagnostico: DiagnosticoResult;
}) {
  const complexidade = COMPLEXIDADE_MAP[diagnostico.complexidade] ?? COMPLEXIDADE_MAP["médio"];
  const potencial = POTENCIAL_MAP[diagnostico.potencial_comercial] ?? POTENCIAL_MAP["médio"];
  const mercado = MERCADO_MAP[diagnostico.tamanho_mercado] ?? MERCADO_MAP["adequado"];
  const fs = diagnostico.formato_sugerido?.formato ? diagnostico.formato_sugerido : null;

  return (
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
            <Badge label={complexidade.label} color={complexidade.color} bg={complexidade.bg} />
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

      {/* Formato sugerido */}
      {fs && (
        <div className="bg-white rounded-2xl border border-zinc-100 p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-brand-gold/10 flex items-center justify-center"><PagesIcon /></span>
              <div>
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Formato sugerido</p>
                <p className="font-heading text-xl text-brand-primary leading-tight">{fs.label}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-500">
              ≈ {fmt(fs.paginas_estimadas)} páginas · lombada ≈ {fs.lombada_mm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm
            </p>
          </div>
          {fs.motivo && <p className="text-sm text-zinc-600 leading-relaxed mb-4">{fs.motivo}</p>}
          {fs.cascata?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {fs.cascata.map((c) => (
                <div
                  key={c.formato}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    c.formato === fs.formato ? "border-brand-gold bg-brand-gold/5" : "border-zinc-100"
                  }`}
                >
                  <p className="font-medium text-brand-primary">{getFormatoDef(c.formato).label} · {getFormatoDef(c.formato).descricao_curta}</p>
                  <p className="text-xs text-zinc-500">≈ {fmt(c.paginas)} págs · {c.lombada_mm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-zinc-400">
            Estimativa a partir do texto; o formato é escolhido na etapa Elementos e as páginas finais vêm da diagramação.
          </p>
        </div>
      )}

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
            <Badge label={potencial.label} color={potencial.color} bg={potencial.bg} />
          </div>
          <div className="bg-zinc-50 rounded-xl p-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-2">Tamanho do Mercado</p>
            <Badge label={mercado.label} color={mercado.color} bg={mercado.bg} />
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
    </>
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

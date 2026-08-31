import Link from "next/link";
import {
  TOOLS,
  CATEGORIAS_ORDEM,
  type FerramentaCard,
} from "@/components/ferramentas/registry";
import type { Route } from "next";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FerramentasPage() {
  const gratis = TOOLS.filter(t => t.estado === "gratis");

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">

      <div className="mb-10">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-1">Caixa de ferramentas</p>
        <h1 className="font-heading text-4xl text-brand-primary leading-tight mb-2">Ferramentas editoriais</h1>
        <p className="text-zinc-500 text-sm max-w-lg">
          Cada ferramenta funciona de forma independente — sem precisar iniciar um projeto completo. Copie, baixe e publique na hora.
        </p>
      </div>

      {/* Seção grátis no topo — categoria vira tag dentro do card */}
      {gratis.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">Use agora — grátis</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gratis.map(tool => (
              <FerramentaCardView key={tool.id} tool={tool} mostrarCategoriaTag />
            ))}
          </div>
        </div>
      )}

      {/* Catálogo por categoria — só pagos + em breve */}
      {CATEGORIAS_ORDEM.map(cat => {
        const items = TOOLS.filter(t => t.categoria === cat && t.estado !== "gratis");
        if (items.length === 0) return null;
        return (
          <div key={cat} className="mb-10">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">{cat}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(tool => <FerramentaCardView key={tool.id} tool={tool} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Card renderer (3 estados) ────────────────────────────────────────────────

function FerramentaCardView({
  tool,
  mostrarCategoriaTag = false,
}: {
  tool: FerramentaCard;
  mostrarCategoriaTag?: boolean;
}) {
  const Icon = tool.icon;

  if (tool.estado === "gratis") {
    return (
      <Link
        href={tool.href!}
        className="relative flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
      >
        {tool.limite && (
          <span className="absolute top-3 right-4 text-[10px] text-zinc-400">
            {tool.limite}
          </span>
        )}
        <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors shrink-0">
          <Icon />
        </div>
        <div className="flex-1">
          {mostrarCategoriaTag && (
            <p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
              {tool.categoria}
            </p>
          )}
          <p className="font-heading text-base text-brand-primary leading-tight mb-1 group-hover:text-brand-gold transition-colors">
            {tool.label}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
        </div>
        <p className="text-xs text-brand-gold font-semibold">Abrir →</p>
      </Link>
    );
  }

  if (tool.estado === "pago") {
    return (
      <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5">
        <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center shrink-0">
          <Icon />
        </div>
        <div className="flex-1">
          <p className="font-heading text-base text-brand-primary leading-tight mb-1">
            {tool.label}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
        </div>
        <div>
          {tool.preco_copy ? (
            <>
              <p className="leading-none flex items-baseline gap-2">
                <span className="font-heading text-2xl text-brand-primary">
                  {tool.preco_copy.principal}
                </span>
                <span className="text-sm text-zinc-500">
                  {tool.preco_copy.sufixo}
                </span>
              </p>
              <p className="text-sm text-zinc-600 mt-1">
                {tool.preco_copy.secundario}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {tool.preco_copy.creditos}
              </p>
            </>
          ) : (
            <>
              <p className="font-heading text-2xl text-brand-primary leading-none">
                R$ {tool.preco_creditos ?? 0}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                ou {tool.preco_creditos ?? 0} créditos
              </p>
            </>
          )}
        </div>
        {tool.href ? (
          <Link
            href={tool.href as Route}
            className="w-full mt-1 rounded-xl bg-brand-primary text-white text-xs font-semibold py-2 text-center block hover:bg-brand-primary/90 transition-colors"
          >
            Usar ferramenta →
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="w-full mt-1 rounded-xl bg-zinc-100 text-zinc-400 text-xs font-semibold py-2 cursor-not-allowed"
          >
            Disponível em breve
          </button>
        )}
      </div>
    );
  }

  // breve
  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5">
      <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center shrink-0">
        <Icon />
      </div>
      <div className="flex-1">
        <p className="font-heading text-base text-brand-primary leading-tight mb-1">
          {tool.label}
        </p>
        <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
      </div>
      <p className="text-xs text-zinc-400 font-semibold">Em breve</p>
    </div>
  );
}

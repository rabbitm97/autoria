import Link from "next/link";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";
import {
  TOOLS,
  CATEGORIAS_ORDEM,
  type FerramentaCard,
} from "@/components/ferramentas/registry";

export const metadata: Metadata = {
  title: "Ferramentas gratuitas para autores — calculadora de lombada, páginas e mais",
  description:
    "Calculadora de lombada, estimador de páginas, conversor PDF para DOCX e ficha de créditos: ferramentas gratuitas para autores, direto no navegador.",
};

export default function FerramentasPublicPage() {
  // vitrine_publica === false esconde da vitrine pública sem tocar no hub logado.
  const tools = TOOLS.filter(t => t.vitrine_publica !== false);
  const gratisSemCadastro = tools.filter(
    t => t.estado === "gratis" && !!t.href_publico
  );
  const gratisComCadastro = tools.filter(
    t => t.estado === "gratis" && !t.href_publico
  );

  return (
    <div className="min-h-dvh bg-zinc-50">
      <PublicNavbar />

      {/* Hero header */}
      <div className="bg-brand-primary pt-32 pb-20 px-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Ferramentas</p>
          <h1 className="font-heading text-5xl text-white leading-tight mb-4">
            Ferramentas para publicar seu livro
          </h1>
          <p className="text-white/50 text-lg max-w-xl">
            Calculadoras e conversores gratuitos, direto no navegador. E o catálogo completo da esteira editorial da Autoria.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16 space-y-14">

        {gratisSemCadastro.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-2">
              Use agora — grátis, sem cadastro
            </h2>
            <p className="text-zinc-500 text-sm mb-6 max-w-xl">
              Roda direto no seu navegador. Nada é enviado pra gente.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gratisSemCadastro.map(tool => (
                <PublicToolCard key={tool.id} tool={tool} variant="publico" />
              ))}
            </div>
          </section>
        )}

        {gratisComCadastro.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-2">
              Grátis com conta
            </h2>
            <p className="text-zinc-500 text-sm mb-6 max-w-xl">
              Crie uma conta gratuita para usar essas ferramentas — leva menos de um minuto.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gratisComCadastro.map(tool => (
                <PublicToolCard key={tool.id} tool={tool} variant="cadastro" />
              ))}
            </div>
          </section>
        )}

        {/* Catálogo da esteira — pagas + breve, por categoria */}
        <section>
          <h2 className="font-heading text-2xl text-brand-primary mb-2">
            Catálogo da esteira
          </h2>
          <p className="text-zinc-500 text-sm mb-6 max-w-xl">
            Serviços editoriais da Autoria — cada card com preço e o que está incluso.
          </p>
          <div className="space-y-10">
            {CATEGORIAS_ORDEM.map(cat => {
              const items = tools.filter(t => t.categoria === cat && t.estado !== "gratis");
              if (items.length === 0) return null;
              return (
                <div key={cat}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">{cat}</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {items.map(tool => (
                      <PublicToolCard key={tool.id} tool={tool} variant="catalogo" />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-white rounded-2xl border border-zinc-100 p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h2 className="font-heading text-2xl text-brand-primary mb-2">
              Crie sua conta gratuita
            </h2>
            <p className="text-zinc-500 text-sm max-w-lg">
              Salve seus projetos, acompanhe as novas ferramentas e use as versões com conta.
            </p>
          </div>
          <Link
            href="/cadastro"
            className="bg-brand-gold text-brand-primary text-sm font-bold px-6 py-3 rounded-lg hover:bg-brand-gold-light active:scale-95 transition-all tracking-wide text-center shrink-0"
          >
            Criar conta grátis
          </Link>
        </section>
      </div>

      {/* Footer strip */}
      <footer className="bg-brand-primary py-8 px-8 mt-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-white/30 text-sm">© {new Date().getFullYear()} Autoria. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6 text-sm text-white/35">
            <Link href="/termos" className="hover:text-white/60 transition-colors">Termos</Link>
            <Link href="/privacidade" className="hover:text-white/60 transition-colors">Privacidade</Link>
            <Link href="/#precos" className="hover:text-white/60 transition-colors">Preços</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Card renderer (3 variantes) ──────────────────────────────────────────────

function PublicToolCard({
  tool,
  variant,
}: {
  tool: FerramentaCard;
  variant: "publico" | "cadastro" | "catalogo";
}) {
  const Icon = tool.icon;

  if (variant === "publico") {
    return (
      <Link
        href={tool.href_publico!}
        className="relative flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
      >
        <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors shrink-0">
          <Icon />
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
            {tool.categoria}
          </p>
          <p className="font-heading text-base text-brand-primary leading-tight mb-1 group-hover:text-brand-gold transition-colors">
            {tool.label}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
        </div>
        <p className="text-xs text-brand-gold font-semibold">Abrir →</p>
      </Link>
    );
  }

  if (variant === "cadastro") {
    return (
      <Link
        href="/cadastro"
        className="relative flex flex-col gap-3 bg-white rounded-2xl border border-zinc-100 p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
      >
        <span className="absolute top-3 right-4 text-[10px] text-brand-gold font-semibold uppercase tracking-wide">
          Grátis com conta
        </span>
        {tool.limite && (
          <span className="absolute top-8 right-4 text-[10px] text-zinc-400">
            {tool.limite}
          </span>
        )}
        <div className="w-10 h-10 rounded-xl bg-brand-primary/5 flex items-center justify-center group-hover:bg-brand-gold/10 transition-colors shrink-0">
          <Icon />
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wide mb-1">
            {tool.categoria}
          </p>
          <p className="font-heading text-base text-brand-primary leading-tight mb-1 group-hover:text-brand-gold transition-colors">
            {tool.label}
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">{tool.desc}</p>
        </div>
        <p className="text-xs text-brand-gold font-semibold">Criar conta →</p>
      </Link>
    );
  }

  // catalogo: pago ou breve
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
        <button
          type="button"
          disabled
          className="w-full mt-1 rounded-xl bg-zinc-100 text-zinc-400 text-xs font-semibold py-2 cursor-not-allowed"
        >
          Disponível em breve
        </button>
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

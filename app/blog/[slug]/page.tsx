import Link from "next/link";
import { notFound } from "next/navigation";
import { POSTS, type Block } from "@/lib/blog";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) notFound();

  const idx = POSTS.indexOf(post);
  const prev = POSTS[idx - 1] ?? null;
  const next = POSTS[idx + 1] ?? null;

  return (
    <div className="min-h-screen bg-zinc-50">
      <PublicNavbar />

      {/* Hero */}
      <div className={`bg-gradient-to-br ${post.coverColor} pt-32 pb-20 px-8`}>
        <div className="max-w-3xl mx-auto">
          <Link href="/blog" className="text-white/50 text-sm hover:text-white/80 transition-colors mb-6 inline-block">
            ← Blog
          </Link>
          <span className="bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm mb-5 inline-block">
            {post.category}
          </span>
          <h1 className="font-heading text-4xl text-white leading-tight mt-4 mb-5">
            {post.title}
          </h1>
          <div className="text-white/50 text-sm">
            {post.date} · {post.readTime} de leitura
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-8 py-16">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12">
          {post.content.map((block, i) => (
            <BlockRenderer key={i} block={block} />
          ))}
        </div>

        {/* Prev / Next */}
        <div className="grid grid-cols-2 gap-6 mt-10">
          {prev ? (
            <Link href={`/blog/${prev.slug}`} className="bg-white border border-zinc-100 rounded-xl p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group">
              <div className="text-xs text-zinc-400 mb-1">← Post anterior</div>
              <div className="text-sm font-semibold text-brand-primary group-hover:text-brand-gold transition-colors leading-snug">
                {prev.title}
              </div>
            </Link>
          ) : <div />}
          {next ? (
            <Link href={`/blog/${next.slug}`} className="bg-white border border-zinc-100 rounded-xl p-5 hover:border-brand-gold/40 hover:shadow-sm transition-all group text-right">
              <div className="text-xs text-zinc-400 mb-1">Próximo post →</div>
              <div className="text-sm font-semibold text-brand-primary group-hover:text-brand-gold transition-colors leading-snug">
                {next.title}
              </div>
            </Link>
          ) : <div />}
        </div>

        {/* CTA */}
        <div className="mt-10 bg-brand-primary rounded-2xl p-10 text-center">
          <h3 className="font-heading text-2xl text-white mb-3">Pronto para publicar seu livro?</h3>
          <p className="text-white/50 text-sm mb-6">
            Do manuscrito ao leitor em horas — revisão, capa, audiolivro e distribuição em 15+ plataformas.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-brand-gold text-brand-primary font-bold px-8 py-3 rounded-lg hover:bg-brand-gold/90 transition-colors"
          >
            Começar agora →
          </Link>
        </div>
      </div>

    </div>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.type) {
    case "h2":
      return (
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4 leading-snug">
          {block.text}
        </h2>
      );
    case "p":
      return (
        <p className="text-zinc-600 leading-relaxed mb-5">
          {block.text}
        </p>
      );
    case "ul":
      return (
        <ul className="space-y-2 mb-6 ml-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-zinc-600 text-sm leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-brand-gold/15 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="8" height="7" viewBox="0 0 8 7" fill="none" aria-hidden="true">
                  <path d="M1 3.5l2 2L7 1" stroke="#c9a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {item}
            </li>
          ))}
        </ul>
      );
    case "callout":
      return (
        <div className="my-6 border-l-4 border-brand-gold bg-brand-gold/5 rounded-r-xl px-6 py-4">
          <p className="text-brand-primary text-sm leading-relaxed font-medium">
            {block.text}
          </p>
        </div>
      );
  }
}

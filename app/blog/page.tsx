import Link from "next/link";
import { POSTS } from "@/lib/blog";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog — Dicas e guias sobre publicação de livros",
  description:
    "Artigos semanais sobre autopublicação, inteligência artificial, mercado editorial e dicas para autores brasileiros.",
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-zinc-50">

      {/* Header */}
      <div className="bg-brand-primary pt-32 pb-20 px-8">
        <div className="max-w-6xl mx-auto">
          <Link href="/" className="text-white/40 text-sm hover:text-white/70 transition-colors mb-6 inline-block">
            ← Voltar ao site
          </Link>
          <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Blog</p>
          <h1 className="font-heading text-5xl text-white leading-tight mb-4">
            Recursos para autores
          </h1>
          <p className="text-white/50 text-lg max-w-xl">
            Dicas, guias e tendências sobre publicação de livros, IA editorial e mercado literário brasileiro.
          </p>
        </div>
      </div>

      {/* Posts grid */}
      <div className="max-w-6xl mx-auto px-8 py-16">
        <div className="grid grid-cols-3 gap-8">
          {POSTS.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
              <article className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-1 transition-all duration-200">

                {/* Cover */}
                <div className={`h-48 bg-gradient-to-br ${post.coverColor} flex items-end p-5`}>
                  <span className="bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm">
                    {post.category}
                  </span>
                </div>

                {/* Body */}
                <div className="p-6">
                  <h2 className="font-heading text-lg text-brand-primary leading-snug mb-3 group-hover:text-brand-gold transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-5 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-zinc-400">
                      {post.date} · {post.readTime} de leitura
                    </div>
                    <span className="text-brand-gold text-xs font-semibold group-hover:gap-2 transition-all">
                      LER MAIS →
                    </span>
                  </div>
                </div>

              </article>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}

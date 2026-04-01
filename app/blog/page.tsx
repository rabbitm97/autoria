import Link from "next/link";
import { POSTS } from "@/lib/blog";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";

export const metadata: Metadata = {
  title: "Blog — Dicas e guias sobre publicação de livros",
  description:
    "Artigos semanais sobre autopublicação, inteligência artificial, mercado editorial e dicas para autores brasileiros.",
};

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <PublicNavbar />

      {/* Hero header */}
      <div className="bg-brand-primary pt-32 pb-20 px-8">
        <div className="max-w-6xl mx-auto">
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
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {POSTS.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="group">
              <article className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden hover:shadow-md hover:-translate-y-1 transition-all duration-200 h-full flex flex-col">

                {/* Cover */}
                <div className={`h-48 bg-gradient-to-br ${post.coverColor} flex items-end p-5 shrink-0`}>
                  <span className="bg-white/15 text-white text-xs font-semibold px-3 py-1 rounded-full backdrop-blur-sm">
                    {post.category}
                  </span>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col flex-1">
                  <h2 className="font-heading text-lg text-brand-primary leading-snug mb-3 group-hover:text-brand-gold transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-5 line-clamp-3 flex-1">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-zinc-50">
                    <div className="text-xs text-zinc-400">
                      {post.date} · {post.readTime} de leitura
                    </div>
                    <span className="text-brand-gold text-xs font-semibold">
                      LER MAIS →
                    </span>
                  </div>
                </div>

              </article>
            </Link>
          ))}
        </div>
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

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import Link from "next/link";

export default async function PublicacaoDiretaIndex() {
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    redirect("/dashboard/publicacao-direta/mock-1");
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projetos } = await supabase
    .from("projects")
    .select("id, etapa_atual, manuscript:manuscript_id(titulo, nome)")
    .eq("user_id", user.id)
    .order("criado_em", { ascending: false });

  const lista = (projetos ?? []) as { id: string; etapa_atual: string; manuscript: { titulo?: string; nome?: string } | null }[];

  if (lista.length === 1) {
    redirect(`/dashboard/publicacao-direta/${lista[0].id}`);
  }

  return (
    <div className="min-h-full bg-brand-surface">
      <div className="bg-white border-b border-zinc-100 px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-600 transition-colors text-sm">← Dashboard</Link>
          <div className="w-px h-4 bg-zinc-200" />
          <h1 className="font-heading text-xl text-brand-primary">Publicação Direta</h1>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-8 py-8">
        {lista.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center">
            <p className="text-zinc-500 mb-5">Você ainda não tem projetos. Crie um projeto primeiro para associar sua publicação.</p>
            <Link href="/dashboard/novo-projeto" className="bg-brand-gold text-brand-primary font-bold px-6 py-2.5 rounded-lg hover:bg-brand-gold/90 transition-colors inline-block">
              Criar projeto
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8">
            <h2 className="font-heading text-xl text-brand-primary mb-6">Selecione o projeto para publicar</h2>
            <div className="space-y-3">
              {lista.map(p => (
                <Link
                  key={p.id}
                  href={`/dashboard/publicacao-direta/${p.id}`}
                  className="flex items-center gap-4 p-4 rounded-xl border border-zinc-100 hover:border-brand-gold/40 hover:shadow-sm transition-all group"
                >
                  <div className="w-10 h-14 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #2d2d5e 100%)" }}>
                    <span className="text-brand-gold text-[8px] font-heading text-center px-1">📗</span>
                  </div>
                  <div>
                    <div className="font-semibold text-zinc-800 group-hover:text-brand-primary transition-colors">
                      {p.manuscript?.titulo ?? p.manuscript?.nome ?? "Sem título"}
                    </div>
                    <div className="text-xs text-zinc-400 capitalize">{p.etapa_atual}</div>
                  </div>
                  <svg className="ml-auto text-zinc-300 group-hover:text-brand-gold transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

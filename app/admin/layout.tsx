import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/supabase-server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-12 flex items-center gap-6">
          <span className="text-xs font-mono text-amber-400 font-semibold tracking-widest uppercase">
            Autoria Admin
          </span>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/admin/agentes"
              className="text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Agentes
            </Link>
          </nav>
          <div className="ml-auto">
            <Link
              href="/dashboard"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              ← Produto
            </Link>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}

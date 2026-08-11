import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isDev } from "@/lib/anthropic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDev()) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      redirect("/login");
    }
  }

  // SHELL-1: moldura veste a tela (h-dvh mobile-safe), miolo é a ÚNICA
  // região rolável. Filhos ganham min-w-0 pra não estourar horizontal.
  return (
    <div className="flex h-dvh overflow-hidden bg-brand-surface">
      <Sidebar />
      <div className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-brand [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}

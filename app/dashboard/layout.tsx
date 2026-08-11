import { redirect } from "next/navigation";
import BrandLogo from "@/app/_components/brand-logo";
import { DashboardShell } from "@/components/sidebar";
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

  // SHELL-1/1B: moldura h-dvh (mobile-safe), miolo é a ÚNICA região
  // rolável. Desktop: sidebar fixa à esquerda. Mobile (< lg): topo fino
  // com hambúrguer + wordmark, sidebar vira drawer sobreposto.
  return (
    <DashboardShell mobileLogo={<BrandLogo variant="gold" height={22} />}>
      {children}
    </DashboardShell>
  );
}

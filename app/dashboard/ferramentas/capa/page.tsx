import { WizardCapa } from "@/components/ferramentas/wizard-capa";

// /dashboard/ferramentas/capa[?job=<id>]
// Server component fino: extrai job do URL e delega ao wizard client.

export default async function CapaPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const params = await searchParams;
  const jobIdInicial = params.job ?? null;

  return <WizardCapa jobIdInicial={jobIdInicial} />;
}

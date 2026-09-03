import { WizardRevisao } from "@/components/ferramentas/wizard-revisao";

// /dashboard/ferramentas/revisao[?job=<id>]
// Server component fino: extrai job do URL e delega ao wizard client.

export default async function RevisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const params = await searchParams;
  const jobIdInicial = params.job ?? null;

  return <WizardRevisao jobIdInicial={jobIdInicial} />;
}

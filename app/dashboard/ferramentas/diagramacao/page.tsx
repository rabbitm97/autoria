import { WizardDiagramacao } from "@/components/ferramentas/wizard-diagramacao";

// /dashboard/ferramentas/diagramacao?modo=digital|completa[&job=<id>]
// Server component fino: extrai modo/job do URL e delega ao wizard client.

export default async function DiagramacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; job?: string }>;
}) {
  const params = await searchParams;
  const modoInicial = params.modo === "completa" ? "completa" : "digital";
  const jobIdInicial = params.job ?? null;

  return <WizardDiagramacao modoInicial={modoInicial} jobIdInicial={jobIdInicial} />;
}

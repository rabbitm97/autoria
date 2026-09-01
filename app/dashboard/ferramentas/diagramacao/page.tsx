import Link from "next/link";
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

  return (
    <div>
      <WizardDiagramacao modoInicial={modoInicial} jobIdInicial={jobIdInicial} />
      <div className="mt-6 mb-10 text-center">
        <Link
          href="/dashboard/ferramentas"
          className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-4"
        >
          ← Voltar às ferramentas
        </Link>
      </div>
    </div>
  );
}

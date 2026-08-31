import Link from "next/link";
import { WizardDiagnostico } from "@/components/ferramentas/wizard-diagnostico";

export default function DiagnosticoCompletoPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto">
        <div className="px-4 pt-6">
          <Link href="/dashboard/ferramentas" className="text-xs text-zinc-400 hover:text-brand-primary">
            ← Ferramentas
          </Link>
        </div>
        <WizardDiagnostico modo="completo" />
      </div>
    </div>
  );
}

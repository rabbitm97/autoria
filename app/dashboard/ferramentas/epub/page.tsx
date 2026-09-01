import Link from "next/link";
import { WizardEpub } from "@/components/ferramentas/wizard-epub";

export default function EpubPage() {
  return (
    <div>
      <WizardEpub />
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

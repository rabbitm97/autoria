"use client";

import { useRouter } from "next/navigation";

interface EditorConfirmSuccessModalProps {
  onClose: () => void;
  projectId: string;
  confirmedAt: string;
}

export function EditorConfirmSuccessModal({
  onClose,
  projectId,
  confirmedAt,
}: EditorConfirmSuccessModalProps) {
  const router = useRouter();

  const formattedTime = new Date(confirmedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl bg-[#fdfcf9] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-600"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>

          <h2 className="mb-2 font-heading text-xl text-[#1a1a2e]">Capa confirmada</h2>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Sua capa foi salva como versão oficial do projeto.
            <br />
            <span className="text-xs text-zinc-400">Confirmada em {formattedTime}.</span>
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => {
                // Close modal BEFORE navigating so the router cache stores open=false.
                // If we push without closing, Next.js caches open=true; on back-navigation
                // the modal restores and its fixed backdrop silently intercepts all clicks.
                onClose();
                router.push(`/dashboard/creditos/${projectId}`);
              }}
              className="w-full rounded-xl bg-[#1a1a2e] px-5 py-3 text-sm font-medium text-[#c9a84c] transition-opacity hover:opacity-90"
            >
              Próximo passo: Créditos →
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-xl border border-[#e0ddd2] px-5 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50"
            >
              Voltar a editar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

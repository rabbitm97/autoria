"use client";

import { useRouter } from "next/navigation";
import { useCoverExport } from "../lib/use-cover-export";

interface EditorConfirmSuccessModalProps {
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  confirmedAt: string;
}

export function EditorConfirmSuccessModal({
  onClose,
  projectId,
  projectTitle,
  confirmedAt,
}: EditorConfirmSuccessModalProps) {
  const router = useRouter();
  const { states, exportPng, exportPdf, clearErrors } = useCoverExport(projectId, projectTitle);

  const formattedTime = new Date(confirmedAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const downloadItems = [
    {
      key: "png" as const,
      label: "Baixar PNG",
      desc: "Imagem da capa em alta resolução",
      onClick: exportPng,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#c9a84c]">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
        </svg>
      ),
    },
    {
      key: "pdf-digital" as const,
      label: "Baixar PDF digital",
      desc: "Para eBook nas lojas (Amazon, Apple, Kobo)",
      onClick: () => exportPdf("digital"),
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#c9a84c]">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      ),
    },
    {
      key: "pdf-grafica" as const,
      label: "Baixar PDF gráfica",
      desc: "Com marcas de corte, para enviar à gráfica",
      onClick: () => exportPdf("grafica"),
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#c9a84c]">
          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
  ] as const;

  // Collect any per-item errors for inline display
  const anyError = Object.values(states).some((s) => s.status === "error");

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
          {/* Check icon */}
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

          {/* Downloads */}
          <div className="mt-5 rounded-xl border border-[#e0ddd2] bg-white/60 text-left">
            {downloadItems.map((item, i) => {
              const s = states[item.key];
              const isBusy = s.status === "busy";
              const isError = s.status === "error";
              return (
                <div key={item.key}>
                  {i > 0 && <div className="mx-3 border-t border-[#e0ddd2]" />}
                  <button
                    onClick={item.onClick}
                    disabled={isBusy}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 disabled:opacity-60"
                  >
                    {isBusy ? (
                      <svg className="animate-spin shrink-0 text-[#c9a84c]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      item.icon
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#1a1a2e]">
                        {isBusy ? "Gerando…" : item.label}
                      </p>
                      {isError ? (
                        <p className="truncate text-[10px] text-red-500">{(s as { status: "error"; message: string }).message}</p>
                      ) : (
                        <p className="text-[10px] text-zinc-400">{item.desc}</p>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
          {anyError && (
            <button onClick={clearErrors} className="mt-1.5 text-[10px] text-zinc-400 underline hover:text-zinc-600">
              Limpar erros
            </button>
          )}

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              onClick={() => {
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

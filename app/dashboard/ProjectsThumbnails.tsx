"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Projeto {
  id: string;
  etapa_atual: string;
  criado_em: string;
  manuscript: { nome: string } | null;
}

const ETAPA_HREF: Record<string, (id: string) => string> = {
  upload:        (id) => `/dashboard/diagnostico/${id}`,
  diagnostico:   (id) => `/dashboard/diagnostico/${id}`,
  revisao:       (id) => `/dashboard/revisao/${id}`,
  sinopse_ficha: (id) => `/dashboard/elementos/${id}`,
  capa:          (id) => `/dashboard/capa/${id}`,
  creditos:      (id) => `/dashboard/creditos/${id}`,
  diagramacao:   (id) => `/dashboard/miolo/${id}`,
  qa:            (id) => `/dashboard/qa/${id}`,
  publicacao:    (id) => `/dashboard/publicacao/${id}`,
};

export function ProjectsThumbnails({
  projetos: initial,
  activeId,
}: {
  projetos: Projeto[];
  activeId?: string;
}) {
  const router = useRouter();
  const [projetos, setProjetos] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita.")) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/projects?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
      setProjetos((prev) => prev.filter((p) => p.id !== id));
      if (id === activeId) router.refresh();
    } catch {
      alert("Não foi possível excluir o projeto. Tente novamente.");
    } finally {
      setDeleting(null);
    }
  }

  if (projetos.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-1 overflow-x-auto px-2 pt-2 pb-0.5">
      <span className="text-xs text-zinc-400 font-medium shrink-0">Seus projetos</span>
      <div className="flex gap-2">
        {projetos.map((p) => (
          <div key={p.id} className="relative shrink-0 group/card">
            <Link href={ETAPA_HREF[p.etapa_atual]?.(p.id) ?? "#"}>
              <div
                className={`w-14 h-20 rounded-lg border-2 flex flex-col items-center justify-end pb-1.5 overflow-hidden transition-all
                  ${p.id === activeId
                    ? "border-brand-gold shadow-md shadow-brand-gold/20"
                    : "border-zinc-200 group-hover/card:border-brand-gold/50"}`}
                style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #2d2d5e 100%)" }}
              >
                <span className="text-[8px] text-brand-gold/80 font-medium text-center leading-tight px-1 truncate w-full text-center">
                  {p.manuscript?.nome?.split(" ").slice(0, 2).join(" ") ?? "Livro"}
                </span>
              </div>
            </Link>
            <button
              onClick={(e) => handleDelete(e, p.id)}
              disabled={deleting === p.id}
              aria-label="Excluir projeto"
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-zinc-700 border border-zinc-600 text-zinc-300 hover:bg-red-600 hover:border-red-500 hover:text-white transition-all flex items-center justify-center opacity-0 group-hover/card:opacity-100 disabled:opacity-50"
            >
              {deleting === p.id ? (
                <svg className="animate-spin w-2.5 h-2.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="9" y2="9"/>
                  <line x1="9" y1="1" x2="1" y2="9"/>
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

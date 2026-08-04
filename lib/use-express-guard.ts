"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ─── useExpressGuard ──────────────────────────────────────────────────────────
// Trilha Express (livro pronto): quando `dados_pdf.origem === "upload"`, o
// autor pulou toda a esteira editorial (diagnóstico/revisão/elementos/créditos
// /diagramação). Este hook detecta esse estado ao entrar em qualquer uma dessas
// telas por URL direta e desvia imediatamente para a Prova.
//
// Uso: chamar como PRIMEIRO hook logo após obter o `id` de `useParams`. Ignora
// silenciosamente ids ausentes, erros de fetch e projetos que não são Express.

export function useExpressGuard(projectId: string | null | undefined) {
  const router = useRouter();

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("dados_pdf")
        .eq("id", projectId)
        .single();

      if (cancelled || error || !data) return;

      const dadosPdf = data.dados_pdf as { origem?: string } | null;
      if (dadosPdf?.origem === "upload") {
        router.replace(`/dashboard/prova/${projectId}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, router]);
}

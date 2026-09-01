"use client";

// Pré-visualização paginada gratuita da Diagramação avulsa (FERR-3.3d).
// Reusa /api/agentes/gerar-pdf-digital com { previa: true } — pipeline igual
// ao PDF final, mas sem débito, com marca de prévia, cortado em 20 páginas,
// salvo em livros/{u}/{p}/livro-previa.pdf e servido por signed URL de 10 min.

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { modoDiagramacao } from "@/lib/ferramenta-jobs";
import {
  CtaPrimario,
  WizardLayout,
} from "@/components/ferramentas/wizard-shell";

// react-pdf usa APIs de browser (canvas, worker). Nunca renderizar no server.
const PdfFolheador = dynamic(
  () => import("@/app/dashboard/prova/[id]/pdf-folheador"),
  { ssr: false },
);

const PASSOS_DIAGRAMACAO = [
  "Início",
  "Manuscrito",
  "Formato",
  "Créditos",
  "Diagramar",
  "PDF",
  "Pronto",
];

const FERRAMENTA_LABEL: Record<"digital" | "completa", string> = {
  digital: "Diagramação digital",
  completa: "Diagramação completa",
};

interface PreviaResp {
  previa: true;
  url: string;
  paginas_total: number;
  paginas_previa: number;
}

export default function PaginaPreviaDiagramacao() {
  const router = useRouter();
  const params = useParams<{ project_id: string }>();
  const searchParams = useSearchParams();
  const projectId = params?.project_id ?? "";
  const jobId = searchParams.get("job");

  const [modo, setModo] = useState<"digital" | "completa">("digital");
  const [previa, setPrevia] = useState<PreviaResp | null>(null);
  const [status, setStatus] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const disparouRef = useRef(false);

  async function gerarPrevia() {
    if (!projectId || !jobId) return;
    setStatus("carregando");
    setErro(null);
    try {
      const jobRes = await fetch(`/api/ferramentas/jobs/${jobId}`);
      if (!jobRes.ok) throw new Error("Não conseguimos carregar este trabalho.");
      const jobData = (await jobRes.json()) as { job: { ferramenta_id: string } };
      const m = modoDiagramacao(jobData.job.ferramenta_id);
      if (!m) throw new Error("Este job não é de diagramação.");
      setModo(m);

      const res = await fetch("/api/agentes/gerar-pdf-digital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, job_id: jobId, previa: true }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Falha ao gerar a pré-visualização.");
      }
      const data = (await res.json()) as PreviaResp;
      setPrevia(data);
      setStatus("pronto");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setStatus("erro");
    }
  }

  useEffect(() => {
    if (disparouRef.current) return;
    if (!projectId || !jobId) return;
    disparouRef.current = true;
    void gerarPrevia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, jobId]);

  if (!jobId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-zinc-500 mb-4">
          Esta pré-visualização precisa de um job de ferramenta ativo.
        </p>
        <Link
          href="/dashboard/ferramentas"
          className="text-sm text-brand-primary underline underline-offset-4"
        >
          Voltar às ferramentas
        </Link>
      </div>
    );
  }

  const ferramenta = FERRAMENTA_LABEL[modo];
  const secundario = (
    <Link
      href={`/dashboard/miolo/${projectId}?avulso=${jobId}`}
      className="text-sm text-zinc-500 hover:text-brand-primary transition-colors underline underline-offset-4"
    >
      ← Ajustar diagramação
    </Link>
  );
  const primario = (
    <CtaPrimario
      onClick={() => router.push(`/dashboard/ferramentas/diagramacao?job=${jobId}`)}
    >
      Avançar →
    </CtaPrimario>
  );

  if (status === "carregando") {
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS_DIAGRAMACAO}
        passoAtual={4}
        titulo="Pré-visualização"
        descricao="Preparando a pré-visualização — leva até um minuto."
        rodape={{ secundario }}
      >
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <span className="w-8 h-8 rounded-full border-4 border-brand-gold border-t-transparent animate-spin" />
          <p className="text-sm text-zinc-500">Gerando prévia com marca…</p>
        </div>
      </WizardLayout>
    );
  }

  if (status === "erro") {
    return (
      <WizardLayout
        ferramenta={ferramenta}
        passos={PASSOS_DIAGRAMACAO}
        passoAtual={4}
        titulo="Não conseguimos gerar a prévia"
        rodape={{
          secundario,
          primario: <CtaPrimario onClick={gerarPrevia}>Tentar novamente</CtaPrimario>,
        }}
      >
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 space-y-2">
          <p className="text-sm text-red-700">{erro}</p>
          <p className="text-[11px] text-zinc-500">
            A prévia é gratuita e não conta no seu saldo — pode tentar de novo à vontade.
          </p>
        </div>
      </WizardLayout>
    );
  }

  const p = previa!;
  return (
    <WizardLayout
      ferramenta={ferramenta}
      passos={PASSOS_DIAGRAMACAO}
      passoAtual={4}
      titulo="Pré-visualização"
      descricao={`Primeiras ${p.paginas_previa} de ${p.paginas_total} páginas. As páginas trazem a marca de prévia; o PDF final não terá.`}
      rodape={{ secundario, primario }}
    >
      <PdfFolheador projectId={projectId} pdfUrl={p.url} />
    </WizardLayout>
  );
}

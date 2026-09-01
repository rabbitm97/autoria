"use client";

// components/ferramentas/wizard-epub.tsx
//
// Wizard da ferramenta EPUB avulso (FERR-3.2). Compõe o shell + criarSombraEJob
// e adiciona duas telas específicas: detecção de capítulos e capa opcional.
//
// Fluxo: 0-início → 1-manuscrito → 2-capítulos → 3-capa (opcional) → 4-gerar
// (progresso) → 5-pronto.

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import type { CandidatoCapitulo } from "@/lib/chapter-detection";
import { AprovacaoCapitulos } from "@/components/aprovacao-capitulos";
import {
  TelaInicio,
  TelaManuscrito,
  TelaRodando,
  TelaPronto,
  useSaldo,
  labelClass,
  type DadosManuscrito,
} from "./wizard-shell";

// ─── Config ───────────────────────────────────────────────────────────────────

const HEADING = "EPUB do seu livro";
const FERRAMENTA_ID = "epub";
const ACAO = "epub_avulso" as const;

type Passo = 0 | 1 | 2 | 3 | 4 | 5;

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function WizardEpub() {
  const custo = CUSTOS_CREDITOS[ACAO];
  const saldo = useSaldo();

  const [passo, setPasso] = useState<Passo>(0);
  const [dados, setDados] = useState<DadosManuscrito>({
    titulo: "",
    autor: "",
    file: null,
    declaracaoAceita: false,
  });

  // Contexto criado no passo 1 → reusado nos demais
  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // Capítulos (passo 2)
  const [candidatos, setCandidatos] = useState<CandidatoCapitulo[]>([]);
  const [aprovando, setAprovando] = useState(false);

  // Capa opcional (passo 3)
  const [capaFile, setCapaFile] = useState<File | null>(null);
  const [capaErro, setCapaErro] = useState<string | null>(null);
  const [capaUploadPct, setCapaUploadPct] = useState<number>(0);

  // Gerar (passo 4)
  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);

  // ── Passo 1 → 2: sombra + parse + propor capítulos ──────────────────────────
  async function prepararSombraEDetectarCapitulos() {
    if (!dados.file || !dados.titulo.trim() || !dados.declaracaoAceita) return;
    setPasso(4); // usa a tela de progresso durante o upload
    setErro(null);
    setProgresso(0);

    try {
      const sombra = await criarSombraEJob({
        file: dados.file,
        titulo: dados.titulo,
        autor: dados.autor,
        ferramentaId: FERRAMENTA_ID,
        onStatus: (t, p) => {
          setStatusTexto(t);
          setProgresso(p);
        },
      });

      setProjectId(sombra.projectId);
      setJobId(sombra.jobId);

      // Detectar candidatos
      setStatusTexto("Detectando capítulos…");
      setProgresso(35);
      const res = await fetch("/api/agentes/miolo/propor-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: sombra.projectId }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao detectar capítulos.");
      }
      const data = (await res.json()) as { candidatos?: CandidatoCapitulo[] };
      const lista = data.candidatos ?? [];
      setCandidatos(lista);

      setPasso(2);
      setStatusTexto("");
      setProgresso(0);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setStatusTexto("");
    }
  }

  // ── Passo 2 → 3: aprovar capítulos ──────────────────────────────────────────
  async function aprovarCapitulosEIr(capitulos: { titulo: string; pos: number }[]) {
    if (!projectId) return;
    setErro(null);
    setAprovando(true);
    try {
      const res = await fetch("/api/agentes/miolo/aprovar-capitulos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, capitulos_aprovados: capitulos }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao aprovar capítulos.");
      }
      setPasso(3);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setAprovando(false);
    }
  }

  // ── Passo 3: upload da capa (opcional) ──────────────────────────────────────
  function onCapaFileChange(f: File) {
    const okMime = ["image/jpeg", "image/jpg", "image/png"].includes(f.type);
    if (!okMime) {
      setCapaErro("Envie uma imagem JPG ou PNG.");
      setCapaFile(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setCapaErro("Imagem grande demais (máx. 10 MB).");
      setCapaFile(null);
      return;
    }
    setCapaErro(null);
    setCapaFile(f);
  }

  async function uploadCapaEGerar() {
    if (!projectId || !jobId) return;
    setErro(null);
    setPasso(4);
    setStatusTexto("Enviando capa…");
    setProgresso(5);

    try {
      if (capaFile) {
        const mime = capaFile.type;
        const presignRes = await fetch("/api/agentes/upload-capa/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, mime_type: mime }),
        });
        if (!presignRes.ok) throw new Error("Falha ao preparar upload da capa.");
        const { signed_url, token, storage_path } = (await presignRes.json()) as {
          signed_url: string;
          token: string;
          storage_path: string;
        };

        // Upload à URL assinada (contrato do presign: bucket "capas").
        // `signed_url` já é a URL única; usamos storage_path + token via helper.
        void signed_url;
        const { error: upErr } = await supabase.storage
          .from("capas")
          .uploadToSignedUrl(storage_path, token, capaFile, { contentType: mime, upsert: true });
        if (upErr) throw new Error(`Upload da capa falhou: ${upErr.message}`);
        setCapaUploadPct(100);

        // URL assinada de leitura para gerar-epub. Persistir dados_capa com
        // is_frente_pura para o gerar-epub cair no fallback correto (sem
        // recorte panorâmico) — isso não afeta a UI.
        const { data: signed } = await supabase.storage
          .from("capas")
          .createSignedUrl(storage_path, 3600);
        const url = signed?.signedUrl ?? "";

        // Atualiza dados_capa do sombra (o próprio autor é dono do projeto sombra)
        await supabase
          .from("projects")
          .update({
            dados_capa: {
              modo: "upload",
              url,
              storage_path,
              is_frente_pura: true,
            },
          })
          .eq("id", projectId);
      }

      setStatusTexto("Montando o EPUB…");
      setProgresso(35);

      const gerRes = await fetch("/api/agentes/gerar-epub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, job_id: jobId }),
      });
      if (gerRes.status === 402) {
        const d = (await gerRes.json()) as { error?: string };
        throw new Error(d.error ?? "Créditos insuficientes.");
      }
      if (!gerRes.ok) {
        const d = (await gerRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao gerar o EPUB.");
      }

      setStatusTexto("Salvando e liberando download…");
      setProgresso(80);
      const concluirRes = await fetch("/api/ferramentas/epub-avulso/concluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!concluirRes.ok) {
        const d = (await concluirRes.json()) as { error?: string };
        throw new Error(d.error ?? "Falha ao concluir o EPUB.");
      }
      const concluirData = (await concluirRes.json()) as { expira_em?: string | null };

      setProgresso(100);
      setResultado({ jobId, expiraEm: concluirData.expira_em ?? null });
      setPasso(5);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setStatusTexto("");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (passo === 0) {
    return (
      <TelaInicio
        titulo={HEADING}
        custo={custo}
        saldo={saldo}
        onIniciar={() => setPasso(1)}
      />
    );
  }

  if (passo === 1) {
    return (
      <TelaManuscrito
        tituloHeading={HEADING}
        ctaLabel={`Continuar — ${custo} créditos`}
        dados={dados}
        onDados={(patch) => setDados((d) => ({ ...d, ...patch }))}
        onSubmit={prepararSombraEDetectarCapitulos}
      />
    );
  }

  if (passo === 2) {
    return (
      <div className="space-y-4">
        <AprovacaoCapitulos
          candidatos={candidatos}
          onConfirmar={aprovarCapitulosEIr}
          onVoltar={() => setPasso(1)}
          loading={aprovando}
          acaoLabel="continuar"
        />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>
    );
  }

  if (passo === 3) {
    return (
      <TelaCapa
        capaFile={capaFile}
        capaErro={capaErro}
        capaUploadPct={capaUploadPct}
        onFileChange={onCapaFileChange}
        onRemove={() => {
          setCapaFile(null);
          setCapaErro(null);
        }}
        onAvancar={uploadCapaEGerar}
      />
    );
  }

  if (passo === 4) {
    return (
      <TelaRodando
        tituloHeading={HEADING}
        statusTexto={statusTexto}
        progresso={progresso}
        erro={erro}
        onRetry={
          projectId && jobId
            ? () => {
                setErro(null);
                uploadCapaEGerar();
              }
            : undefined
        }
        onVoltar={projectId ? undefined : () => setPasso(1)}
      />
    );
  }

  return (
    <TelaPronto
      tituloEntregavel="Seu EPUB está pronto"
      jobId={resultado!.jobId}
      ctaDownload="Baixar EPUB"
      expiraEm={resultado?.expiraEm ?? null}
    />
  );
}

// ─── TelaCapa ─────────────────────────────────────────────────────────────────

function TelaCapa({
  capaFile,
  capaErro,
  capaUploadPct: _capaUploadPct,
  onFileChange,
  onRemove,
  onAvancar,
}: {
  capaFile: File | null;
  capaErro: string | null;
  capaUploadPct: number;
  onFileChange: (f: File) => void;
  onRemove: () => void;
  onAvancar: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-heading text-3xl text-brand-primary mb-2">Capa (opcional)</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Envie uma imagem (JPG ou PNG) para virar a capa do e-book. Se pular, o EPUB é gerado sem capa
        — dá para adicionar depois nas lojas.
      </p>

      <div className="space-y-4">
        <div>
          <label className={labelClass}>Imagem da capa</label>
          <label
            className="relative block border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-gold/50 transition-colors"
          >
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileChange(f);
              }}
            />
            {capaFile ? (
              <div className="space-y-1">
                <p className="text-sm text-brand-primary font-medium">{capaFile.name}</p>
                <p className="text-xs text-zinc-400">{(capaFile.size / 1024).toFixed(0)} KB</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onRemove();
                  }}
                  className="text-xs text-zinc-400 underline mt-1"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-zinc-500">Clique para escolher uma imagem</p>
                <p className="text-xs text-zinc-400">JPG ou PNG · máx. 10 MB</p>
              </div>
            )}
          </label>
          {capaErro && <p className="text-xs text-red-600 mt-1">{capaErro}</p>}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onAvancar}
            className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
          >
            {capaFile ? "Gerar EPUB com esta capa" : "Gerar EPUB sem capa"}
          </button>
        </div>
      </div>
    </div>
  );
}

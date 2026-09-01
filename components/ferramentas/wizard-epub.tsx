"use client";

// components/ferramentas/wizard-epub.tsx
//
// Wizard da ferramenta EPUB avulso (FERR-3.2 · V50 layout).
// Fluxo: 0-início → 1-manuscrito → 2-capítulos → 3-capa (opcional)
// → 4-gerar (progresso) → 5-pronto.

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { criarSombraEJob } from "@/lib/sombra-cliente";
import type { CandidatoCapitulo } from "@/lib/chapter-detection";
import { AprovacaoCapitulos } from "@/components/aprovacao-capitulos";
import {
  ConteudoInicio,
  ConteudoManuscrito,
  ConteudoRodando,
  CtaInicio,
  CtaPrimario,
  TelaPronto,
  WizardLayout,
  labelClass,
  manuscritoPronto,
  useSaldo,
  type DadosManuscrito,
  type EntregavelPronto,
} from "./wizard-shell";

// ─── Config ───────────────────────────────────────────────────────────────────

const FERRAMENTA_LABEL = "EPUB";
const FERRAMENTA_ID = "epub";
const ACAO = "epub_avulso" as const;
const PASSOS = ["Início", "Manuscrito", "Capítulos", "Capa", "Gerar", "Pronto"];

type Passo = 0 | 1 | 2 | 3 | 4 | 5;

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  entregaveis: EntregavelPronto[];
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

  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const [candidatos, setCandidatos] = useState<CandidatoCapitulo[]>([]);
  const [aprovando, setAprovando] = useState(false);

  const [capaFile, setCapaFile] = useState<File | null>(null);
  const [capaErro, setCapaErro] = useState<string | null>(null);

  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);

  // ── Passo 1 → 2: sombra + parse + propor capítulos ──────────────────────────
  async function prepararSombraEDetectarCapitulos() {
    if (!manuscritoPronto(dados)) return;
    setPasso(4);
    setErro(null);
    setProgresso(0);

    try {
      const sombra = await criarSombraEJob({
        file: dados.file!,
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
      setCandidatos(data.candidatos ?? []);

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
        void signed_url;
        const { error: upErr } = await supabase.storage
          .from("capas")
          .uploadToSignedUrl(storage_path, token, capaFile, { contentType: mime, upsert: true });
        if (upErr) throw new Error(`Upload da capa falhou: ${upErr.message}`);

        const { data: signed } = await supabase.storage
          .from("capas")
          .createSignedUrl(storage_path, 3600);
        const url = signed?.signedUrl ?? "";

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

      const jobRes = await fetch(`/api/ferramentas/jobs/${jobId}`);
      const jobData = (await jobRes.json()) as { job: { entregaveis?: EntregavelPronto[] } };

      setProgresso(100);
      setResultado({
        jobId,
        expiraEm: concluirData.expira_em ?? null,
        entregaveis: jobData.job.entregaveis ?? [],
      });
      setPasso(5);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setStatusTexto("");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (passo === 0) {
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={0}
        titulo="Como funciona"
        descricao="Envie seu manuscrito, aprove os capítulos e receba o EPUB do seu livro, com capa opcional."
        rodape={{ primario: <CtaInicio custo={custo} saldo={saldo} onIniciar={() => setPasso(1)} /> }}
      >
        <ConteudoInicio custo={custo} saldo={saldo} />
      </WizardLayout>
    );
  }

  if (passo === 1) {
    const pronto = manuscritoPronto(dados);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={1}
        titulo="Seu manuscrito"
        rodape={{
          primario: (
            <CtaPrimario disabled={!pronto} onClick={prepararSombraEDetectarCapitulos}>
              Continuar — {custo} créditos
            </CtaPrimario>
          ),
        }}
      >
        <ConteudoManuscrito dados={dados} onDados={(patch) => setDados((d) => ({ ...d, ...patch }))} />
      </WizardLayout>
    );
  }

  if (passo === 2) {
    // AprovacaoCapitulos traz seus próprios botões (Voltar / Confirmar);
    // por isso o rodapé do layout fica sem CTA primário — o CTA vive dentro
    // do próprio componente. É a única exceção do padrão do shell.
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={2}
        titulo="Capítulos detectados"
        descricao="Marque quais viram capítulos no EPUB. Ajuste os títulos se quiser."
      >
        <AprovacaoCapitulos
          candidatos={candidatos}
          onConfirmar={aprovarCapitulosEIr}
          onVoltar={() => setPasso(1)}
          loading={aprovando}
          acaoLabel="continuar"
        />
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      </WizardLayout>
    );
  }

  if (passo === 3) {
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={3}
        titulo="Capa (opcional)"
        descricao="Envie uma imagem para virar a capa do e-book. Dá para pular e adicionar depois nas lojas."
        rodape={{
          primario: (
            <CtaPrimario onClick={uploadCapaEGerar}>
              {capaFile ? "Gerar EPUB com esta capa" : "Gerar EPUB sem capa"}
            </CtaPrimario>
          ),
        }}
      >
        <FormCapa
          capaFile={capaFile}
          capaErro={capaErro}
          onFileChange={onCapaFileChange}
          onRemove={() => {
            setCapaFile(null);
            setCapaErro(null);
          }}
        />
      </WizardLayout>
    );
  }

  if (passo === 4) {
    const podeRetry = !!(projectId && jobId && erro);
    return (
      <WizardLayout
        ferramenta={FERRAMENTA_LABEL}
        passos={PASSOS}
        passoAtual={4}
        titulo={erro ? "Geração interrompida" : "Gerando o EPUB…"}
        rodape={{
          primario: podeRetry ? (
            <CtaPrimario
              onClick={() => {
                setErro(null);
                void uploadCapaEGerar();
              }}
            >
              Tentar novamente
            </CtaPrimario>
          ) : undefined,
        }}
      >
        <ConteudoRodando statusTexto={statusTexto} progresso={progresso} erro={erro} />
      </WizardLayout>
    );
  }

  const r = resultado!;
  return (
    <TelaPronto
      ferramenta={FERRAMENTA_LABEL}
      passos={PASSOS}
      entregaveis={r.entregaveis}
      jobId={r.jobId}
      expiraEm={r.expiraEm}
    />
  );
}

// ─── FormCapa ─────────────────────────────────────────────────────────────────

function FormCapa({
  capaFile,
  capaErro,
  onFileChange,
  onRemove,
}: {
  capaFile: File | null;
  capaErro: string | null;
  onFileChange: (f: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <label className={labelClass}>Imagem da capa</label>
      <div
        onClick={() => inputRef.current?.click()}
        className="relative border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-gold/50 transition-colors"
      >
        <input
          ref={inputRef}
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
                e.stopPropagation();
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
      </div>
      {capaErro && <p className="text-xs text-red-600">{capaErro}</p>}
    </div>
  );
}

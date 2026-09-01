"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DeclaracaoTitularidade } from "@/components/declaracao-titularidade";
import {
  ACCEPTED_EXTS,
  formatBytes,
  validateFile,
  uploadWithProgress,
} from "@/lib/upload-manuscrito-cliente";
import { ACAO_DIAGNOSTICO, FERRAMENTA_ID_DIAGNOSTICO } from "@/lib/diagnostico-avulso";
import { CUSTOS_CREDITOS } from "@/lib/creditos-custos";
import { getFormatoDef, isFormatoValido } from "@/lib/formatos";
import type { DiagnosticoResult } from "@/lib/project-data";

// ─── Estilos ──────────────────────────────────────────────────────────────────

const fieldClass =
  "w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 bg-white focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 transition";
const labelClass =
  "block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

// ─── Wizard ───────────────────────────────────────────────────────────────────

type Passo = 0 | 1 | 2 | 3;

interface ResultadoPronto {
  jobId: string;
  expiraEm: string | null;
  resultado: DiagnosticoResult | null;
}

export function WizardDiagnostico() {
  const custo = CUSTOS_CREDITOS[ACAO_DIAGNOSTICO];
  const ferramentaId = FERRAMENTA_ID_DIAGNOSTICO;

  const [passo, setPasso] = useState<Passo>(0);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [declaracaoAceita, setDeclaracaoAceita] = useState(false);
  const [declaracaoAberta, setDeclaracaoAberta] = useState(false);
  const [statusTexto, setStatusTexto] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPronto | null>(null);
  const [projectIdAtivo, setProjectIdAtivo] = useState<string | null>(null);
  const [jobIdAtivo, setJobIdAtivo] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Buscar saldo ao montar
  useState(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (!uid) return;
      supabase
        .from("users")
        .select("creditos")
        .eq("id", uid)
        .single()
        .then(({ data: u }) => {
          if (u) setSaldo((u as { creditos: number }).creditos);
        });
    });
  });

  function onFileChange(f: File) {
    const err = validateFile(f);
    setFileErr(err);
    setFile(err ? null : f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFileChange(f);
  }

  async function pollarEConcluir(projectIdAtual: string, jobIdAtual: string) {
    // 8. Poll até concluído
    setStatusTexto("Processando capítulos…");
    let concluido = false;
    let tentativas = 0;
    let errosSeguidos = 0;

    while (!concluido && tentativas < 200) {
      await new Promise((r) => setTimeout(r, 3000));
      tentativas++;

      const pollRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectIdAtual }),
      });

      if (!pollRes.ok) continue;
      const pollData = (await pollRes.json()) as {
        status?: string;
        progresso?: { atual: number; total: number };
        erro?: string;
      };

      if (pollData.progresso) {
        const { atual, total } = pollData.progresso;
        if (total > 0) setProgresso(40 + Math.round((atual / total) * 45));
      }

      if (pollData.status === "concluido") {
        concluido = true;
      } else if (pollData.status === "erro") {
        errosSeguidos++;
        if (errosSeguidos >= 3) throw new Error(pollData.erro ?? "Erro no diagnóstico.");
        setStatusTexto("Retomando análise…");
      } else {
        errosSeguidos = 0;
        setStatusTexto(
          pollData.status === "consolidando" ? "Consolidando análise…" : "Processando capítulos…"
        );
      }
    }

    if (!concluido) {
      throw new Error(
        "A análise está demorando mais que o normal. Clique em Tentar novamente para continuar de onde parou."
      );
    }

    // 9. Concluir (gerar PDF)
    setStatusTexto("Gerando relatório PDF…");
    setProgresso(90);
    const concluirRes = await fetch("/api/ferramentas/diagnostico-avulso/concluir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobIdAtual }),
    });
    if (!concluirRes.ok) {
      const d = (await concluirRes.json()) as { error?: string };
      throw new Error(d.error ?? "Falha ao gerar o relatório.");
    }
    const concluirData = (await concluirRes.json()) as {
      expira_em?: string | null;
      resultado?: DiagnosticoResult | null;
    };

    setProgresso(100);
    setResultado({
      jobId: jobIdAtual,
      expiraEm: concluirData.expira_em ?? null,
      resultado: concluirData.resultado ?? null,
    });
    setPasso(3);
  }

  async function rodar() {
    if (!file || !titulo.trim() || !declaracaoAceita) return;
    setPasso(2);
    setErro(null);
    setProgresso(0);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const userId = session?.user?.id;
      if (!token || !userId) throw new Error("Sessão expirada. Faça login novamente.");

      // 1. Upload do arquivo
      setStatusTexto("Enviando manuscrito…");
      const storagePath = `${userId}/${crypto.randomUUID()}/${file.name}`;
      await uploadWithProgress(storagePath, file, token, (pct) =>
        setProgresso(Math.round(pct * 0.25))
      );

      // 2. Inserir manuscripts
      setStatusTexto("Registrando manuscrito…");
      const { data: ms, error: msErr } = await supabase
        .from("manuscripts")
        .insert({
          user_id: userId,
          nome: file.name.replace(/\.[^/.]+$/, ""),
          titulo: titulo.trim(),
          autor_primeiro_nome: autor.trim() || null,
          status: "em_diagnostico",
          storage_path: storagePath,
        })
        .select("id")
        .single();
      if (msErr || !ms) throw new Error("Falha ao registrar manuscrito.");

      const manuscriptId = (ms as { id: string }).id;

      // 3. Inserir projeto sombra
      setStatusTexto("Criando projeto…");
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: userId,
          manuscript_id: manuscriptId,
          plano: "freemium",
          etapa_atual: "upload",
          origem: "ferramenta",
        })
        .select("id")
        .single();
      if (projErr || !proj) throw new Error("Falha ao criar projeto.");

      const projectId = (proj as { id: string }).id;
      setProjectIdAtivo(projectId);

      // 4. Aceite legal (best-effort)
      fetch("/api/legal/aceite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "declaracao-titularidade",
          contexto: "upload",
          projectId,
          artefatoRef: storagePath,
        }),
      }).catch(() => {});

      // 5. Criar job
      setStatusTexto("Iniciando diagnóstico…");
      const jobRes = await fetch("/api/ferramentas/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ferramenta_id: ferramentaId,
          projeto_sombra_id: projectId,
          entrada: { arquivo: file.name, titulo: titulo.trim(), autor: autor.trim() },
        }),
      });
      if (!jobRes.ok) throw new Error("Falha ao criar job.");
      const jobData = (await jobRes.json()) as { job_id: string };
      const jobId = jobData.job_id;
      setJobIdAtivo(jobId);

      // 6. Parse do manuscrito
      setStatusTexto("Extraindo texto…");
      setProgresso(30);
      const parseRes = await fetch("/api/parse-manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, manuscript_id: manuscriptId, storage_path: storagePath }),
      });
      if (!parseRes.ok) throw new Error("Falha ao processar o arquivo.");
      const parseData = (await parseRes.json()) as { texto?: string };
      const texto = parseData.texto ?? "";

      // 7. Iniciar diagnóstico (DEBIT AQUI)
      setStatusTexto("Analisando manuscrito…");
      setProgresso(40);
      const diagRes = await fetch("/api/agentes/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, project_id: projectId, job_id: jobId }),
      });
      if (diagRes.status === 402) {
        const d = (await diagRes.json()) as { error?: string };
        throw new Error(d.error ?? "Créditos insuficientes.");
      }
      if (!diagRes.ok) throw new Error("Falha ao iniciar diagnóstico.");

      await pollarEConcluir(projectId, jobId);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado.");
      setStatusTexto("");
    }
  }

  // ── Passo 0: Início ─────────────────────────────────────────────────────────
  if (passo === 0) {
    const saldoInsuficiente = saldo !== null && saldo < custo;
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="font-heading text-3xl text-brand-primary mb-2">Diagnóstico editorial</h1>
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 mb-6">
          <p className="text-sm text-zinc-700 mb-4">
            Cobramos <span className="font-semibold text-brand-primary">{custo} créditos</span> ao
            iniciar. Se a ferramenta não entregar, devolvemos automaticamente.
          </p>
          {saldo !== null && (
            <p className="text-xs text-zinc-400">
              Seu saldo atual: <span className="font-semibold">{saldo} créditos</span>
            </p>
          )}
        </div>
        {saldoInsuficiente ? (
          <>
            <p className="text-sm text-red-600 mb-3">
              Você tem {saldo} créditos — esta ferramenta custa {custo}.{" "}
              <Link href="/dashboard/planos" className="underline">
                Adquirir créditos
              </Link>
            </p>
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-zinc-100 text-zinc-400 font-semibold py-3 cursor-not-allowed"
            >
              Créditos insuficientes
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPasso(1)}
            className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
          >
            Começar
          </button>
        )}
      </div>
    );
  }

  // ── Passo 1: Manuscrito ──────────────────────────────────────────────────────
  if (passo === 1) {
    const pronto = titulo.trim() && file && declaracaoAceita;
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="font-heading text-3xl text-brand-primary mb-6">Diagnóstico editorial</h1>

        <div className="space-y-5">
          <div>
            <label className={labelClass}>Título do livro *</label>
            <input
              className={fieldClass}
              placeholder="O título do seu manuscrito"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Autor (opcional)</label>
            <input
              className={fieldClass}
              placeholder="Nome do autor"
              value={autor}
              onChange={(e) => setAutor(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass}>Manuscrito *</label>
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="relative border-2 border-dashed border-zinc-200 rounded-xl p-6 text-center cursor-pointer hover:border-brand-gold/50 transition-colors"
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXTS.join(",")}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFileChange(f);
                }}
              />
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm text-brand-primary font-medium">{file.name}</p>
                  <p className="text-xs text-zinc-400">{formatBytes(file.size)}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="text-xs text-zinc-400 underline mt-1"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-zinc-500">
                    Arraste ou clique para selecionar
                  </p>
                  <p className="text-xs text-zinc-400">.docx, .pdf ou .txt · máx. 50 MB</p>
                </div>
              )}
            </div>
            {fileErr && <p className="text-xs text-red-600 mt-1">{fileErr}</p>}
          </div>

          <DeclaracaoTitularidade
            aceita={declaracaoAceita}
            aberta={declaracaoAberta}
            onAceita={setDeclaracaoAceita}
            onToggle={() => setDeclaracaoAberta((v) => !v)}
          />

          <button
            type="button"
            onClick={rodar}
            disabled={!pronto}
            className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
          >
            Rodar diagnóstico — {custo} créditos
          </button>
        </div>
      </div>
    );
  }

  // ── Passo 2: Rodando ─────────────────────────────────────────────────────────
  if (passo === 2) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <h1 className="font-heading text-3xl text-brand-primary mb-6">Diagnóstico editorial</h1>

        {erro ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-5 space-y-3">
            <p className="text-sm text-red-700">{erro}</p>
            {projectIdAtivo && jobIdAtivo ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setErro(null);
                    setPasso(2);
                    pollarEConcluir(projectIdAtivo, jobIdAtivo).catch((e) =>
                      setErro(e instanceof Error ? e.message : "Erro inesperado.")
                    );
                  }}
                  className="mt-3 rounded-xl bg-brand-primary px-5 py-2 text-sm font-semibold text-brand-gold"
                >
                  Tentar novamente
                </button>
                <p className="mt-1 text-[11px] text-zinc-400">Continua de onde parou — sem nova cobrança.</p>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPasso(1)}
                className="text-sm text-brand-primary underline"
              >
                Voltar e tentar novamente
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-zinc-600">{statusTexto}</span>
                <span className="text-sm text-zinc-400">{progresso}%</span>
              </div>
              <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-gold transition-all duration-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-zinc-400 text-center">
              Isso pode levar alguns minutos. Não feche esta janela.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Passo 3: Pronto ──────────────────────────────────────────────────────────
  const r = resultado?.resultado ?? null;
  const formatoSugeridoTela = (() => {
    const fs = r?.formato_sugerido;
    if (!fs?.formato || !isFormatoValido(fs.formato)) return null;
    const def = getFormatoDef(fs.formato);
    return { label: `${def.label} · ${def.descricao_curta}`, motivo: fs.motivo ?? "" };
  })();

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-heading text-3xl text-brand-primary mb-6">
        Seu diagnóstico está pronto.
      </h1>

      {r && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 mb-4 space-y-5">
          <section>
            <h2 className="text-sm font-semibold text-brand-primary mb-3">Visão geral</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {r.genero_provavel && (
                <div>
                  <div className={labelClass}>Gênero provável</div>
                  <div className="text-zinc-800">{r.genero_provavel}</div>
                </div>
              )}
              {r.tom_narrativo && (
                <div>
                  <div className={labelClass}>Tom</div>
                  <div className="text-zinc-800">{r.tom_narrativo}</div>
                </div>
              )}
              {r.complexidade && (
                <div>
                  <div className={labelClass}>Complexidade</div>
                  <div className="text-zinc-800">{r.complexidade}</div>
                </div>
              )}
              {r.potencial_comercial && (
                <div>
                  <div className={labelClass}>Potencial comercial</div>
                  <div className="text-zinc-800">{r.potencial_comercial}</div>
                </div>
              )}
              {formatoSugeridoTela && (
                <div className="sm:col-span-2">
                  <div className={labelClass}>Formato sugerido</div>
                  <div className="text-zinc-800">{formatoSugeridoTela.label}</div>
                </div>
              )}
            </div>
            {formatoSugeridoTela?.motivo && (
              <p className="mt-3 text-xs text-zinc-500 leading-relaxed">{formatoSugeridoTela.motivo}</p>
            )}
          </section>

          {r.pontos_fortes?.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-brand-primary mb-2">Pontos fortes</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                {r.pontos_fortes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          )}

          {r.pontos_melhorar?.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-brand-primary mb-2">Pontos a melhorar</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                {r.pontos_melhorar.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          )}

          {r.proximos_passos?.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-brand-primary mb-2">Próximos passos</h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                {r.proximos_passos.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {resultado && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 space-y-4">
          <a
            href={`/api/ferramentas/jobs/${resultado.jobId}/download?i=0`}
            download
            className="block w-full text-center rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
          >
            Baixar PDF
          </a>
          {resultado.expiraEm && (
            <p className="text-xs text-zinc-400 text-center">
              Disponível até{" "}
              {new Date(resultado.expiraEm).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
          <div className="text-center">
            <Link
              href="/dashboard/ferramentas"
              className="text-sm text-zinc-400 underline underline-offset-4 hover:text-zinc-600 transition-colors"
            >
              Ver no painel
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

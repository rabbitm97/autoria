"use client";

// components/ferramentas/wizard-shell.tsx
//
// Shell reutilizável dos wizards de ferramenta avulsa (V47 + V50 layout).
// Estrutura padronizada por WizardLayout: eyebrow + título da ferramenta +
// stepper + card branco com título/descrição/conteúdo + rodapé com CTA
// primário à direita e link secundário à esquerda. As telas de conteúdo
// (ConteudoInicio, ConteudoManuscrito, ConteudoRodando) só renderizam o
// miolo do card — o wizard chamador monta o WizardLayout. TelaPronto é
// auto-contida (já usa WizardLayout internamente).

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DeclaracaoTitularidade } from "@/components/declaracao-titularidade";
import {
  ACCEPTED_EXTS,
  DICA_FORMATO_MANUSCRITO,
  formatBytes,
  validateFile,
} from "@/lib/upload-manuscrito-cliente";

// ─── Estilos partilhados ─────────────────────────────────────────────────────

export const fieldClass =
  "w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 bg-white focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 transition";
export const labelClass =
  "block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

const CTA_PRIMARIO_CLASS =
  "block w-full text-center rounded-xl bg-brand-primary text-brand-gold font-semibold px-6 py-3 hover:bg-brand-primary/90 transition-colors disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed";

// ─── useSaldo ────────────────────────────────────────────────────────────────

export function useSaldo(): number | null {
  const [saldo, setSaldo] = useState<number | null>(null);
  useEffect(() => {
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
  }, []);
  return saldo;
}

// ─── CtaPrimario ─────────────────────────────────────────────────────────────

export function CtaPrimario({
  onClick,
  disabled,
  type = "button",
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={CTA_PRIMARIO_CLASS}>
      {children}
    </button>
  );
}

// ─── WizardLayout ────────────────────────────────────────────────────────────

export function WizardLayout({
  ferramenta,
  passos,
  passoAtual,
  titulo,
  descricao,
  children,
  rodape,
}: {
  ferramenta: string;
  passos: string[];
  passoAtual: number;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: { primario?: ReactNode; secundario?: ReactNode };
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-zinc-400">
        Ferramenta avulsa
      </p>
      <h1 className="font-heading text-3xl text-brand-primary mt-1">{ferramenta}</h1>

      <ol className="mt-6 flex items-center gap-2 flex-wrap">
        {passos.map((p, i) => {
          const done = i < passoAtual;
          const active = i === passoAtual;
          return (
            <li key={p} className="flex items-center gap-2 shrink-0">
              <span
                className={[
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                  done
                    ? "bg-brand-primary text-white"
                    : active
                      ? "bg-brand-gold text-brand-primary"
                      : "border border-zinc-200 bg-white text-zinc-400",
                ].join(" ")}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "text-xs hidden md:inline",
                  done
                    ? "text-zinc-500"
                    : active
                      ? "text-brand-primary font-semibold"
                      : "text-zinc-400",
                ].join(" ")}
              >
                {p}
              </span>
              {i < passos.length - 1 && (
                <span className="hidden md:inline-block h-px w-6 bg-zinc-200" />
              )}
            </li>
          );
        })}
      </ol>

      <section className="mt-8 rounded-2xl border border-zinc-100 bg-white p-6 sm:p-8">
        <h2 className="font-heading text-xl text-brand-primary">{titulo}</h2>
        {descricao && <p className="mt-1 text-sm text-zinc-500">{descricao}</p>}
        <div className="mt-6">{children}</div>
      </section>

      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          {rodape?.secundario ?? (
            <Link
              href="/dashboard/ferramentas"
              className="text-sm text-zinc-500 hover:text-brand-primary transition-colors underline underline-offset-4"
            >
              ← Voltar às ferramentas
            </Link>
          )}
        </div>
        <div className="sm:min-w-[260px]">{rodape?.primario}</div>
      </div>
    </div>
  );
}

// ─── ConteudoInicio ──────────────────────────────────────────────────────────

export function ConteudoInicio({ custo, saldo }: { custo: number; saldo: number | null }) {
  const saldoInsuficiente = saldo !== null && saldo < custo;
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700">
        Cobramos <span className="font-semibold text-brand-primary">{custo} créditos</span> ao
        iniciar. Se a ferramenta não entregar, devolvemos automaticamente.
      </p>
      {saldo !== null && (
        <p className="text-xs text-zinc-400">
          Seu saldo atual: <span className="font-semibold">{saldo} créditos</span>
        </p>
      )}
      {saldoInsuficiente && (
        <p className="text-sm text-red-600">
          Você tem {saldo} créditos — esta ferramenta custa {custo}. A compra de créditos chega em
          breve; no beta,{" "}
          <Link href="/dashboard/suporte" className="underline">
            fale com a gente pelo suporte
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** CTA de "Começar" que já respeita saldo insuficiente. Passe direto em rodape.primario. */
export function CtaInicio({
  custo,
  saldo,
  onIniciar,
  label = "Começar",
}: {
  custo: number;
  saldo: number | null;
  onIniciar: () => void;
  label?: string;
}) {
  const saldoInsuficiente = saldo !== null && saldo < custo;
  return (
    <CtaPrimario disabled={saldoInsuficiente} onClick={saldoInsuficiente ? undefined : onIniciar}>
      {saldoInsuficiente ? "Créditos insuficientes" : label}
    </CtaPrimario>
  );
}

// ─── ConteudoManuscrito ──────────────────────────────────────────────────────

export interface DadosManuscrito {
  titulo: string;
  autor: string;
  file: File | null;
  declaracaoAceita: boolean;
}

/** Formulário pronto para submeter? Wizard usa isso pra habilitar o CTA. */
export function manuscritoPronto(d: DadosManuscrito): boolean {
  return !!(d.titulo.trim() && d.file && d.declaracaoAceita);
}

export function ConteudoManuscrito({
  dados,
  onDados,
}: {
  dados: DadosManuscrito;
  onDados: (patch: Partial<DadosManuscrito>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [declaracaoAberta, setDeclaracaoAberta] = useState(false);

  function onFileChange(f: File) {
    const err = validateFile(f);
    setFileErr(err);
    onDados({ file: err ? null : f });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) onFileChange(f);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Título do livro *</label>
        <input
          className={fieldClass}
          placeholder="O título do seu manuscrito"
          value={dados.titulo}
          onChange={(e) => onDados({ titulo: e.target.value })}
        />
      </div>

      <div>
        <label className={labelClass}>Autor (opcional)</label>
        <input
          className={fieldClass}
          placeholder="Nome do autor"
          value={dados.autor}
          onChange={(e) => onDados({ autor: e.target.value })}
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
          {dados.file ? (
            <div className="space-y-1">
              <p className="text-sm text-brand-primary font-medium">{dados.file.name}</p>
              <p className="text-xs text-zinc-400">{formatBytes(dados.file.size)}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDados({ file: null });
                }}
                className="text-xs text-zinc-400 underline mt-1"
              >
                Remover
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-zinc-500">Arraste ou clique para selecionar</p>
              <p className="text-xs text-zinc-400">.docx, .pdf ou .txt · máx. 50 MB</p>
            </div>
          )}
        </div>
        {fileErr && <p className="text-xs text-red-600 mt-1">{fileErr}</p>}
        <p className="text-[11px] text-amber-700 mt-2">{DICA_FORMATO_MANUSCRITO}</p>
      </div>

      <DeclaracaoTitularidade
        aceita={dados.declaracaoAceita}
        aberta={declaracaoAberta}
        onAceita={(v) => onDados({ declaracaoAceita: v })}
        onToggle={() => setDeclaracaoAberta((v) => !v)}
      />
    </div>
  );
}

// ─── ConteudoRodando ─────────────────────────────────────────────────────────

export function ConteudoRodando({
  statusTexto,
  progresso,
  erro,
}: {
  statusTexto: string;
  progresso: number;
  erro: string | null;
}) {
  if (erro) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-5 space-y-2">
        <p className="text-sm text-red-700">{erro}</p>
        <p className="text-[11px] text-zinc-500">
          Continua de onde parou — sem nova cobrança.
        </p>
      </div>
    );
  }
  return (
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
  );
}

// ─── TelaPronto — auto-contida, um único bloco ───────────────────────────────

export interface EntregavelPronto {
  nome_exibicao: string;
  bytes: number;
}

export function TelaPronto({
  ferramenta,
  passos,
  entregaveis,
  jobId,
  expiraEm,
  children,
}: {
  ferramenta: string;
  passos: string[];
  entregaveis: EntregavelPronto[];
  jobId: string;
  expiraEm: string | null;
  children?: ReactNode;
}) {
  return (
    <WizardLayout
      ferramenta={ferramenta}
      passos={passos}
      passoAtual={passos.length - 1}
      titulo="Seus arquivos estão prontos"
    >
      <div className="space-y-3">
        {entregaveis.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-brand-surface p-4"
          >
            <div className="w-10 h-10 rounded-lg bg-brand-primary/5 flex items-center justify-center shrink-0">
              <PdfIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-brand-primary font-medium truncate">{e.nome_exibicao}</p>
              <p className="text-xs text-zinc-500">{formatBytes(e.bytes)}</p>
            </div>
            <a
              href={`/api/ferramentas/jobs/${jobId}/download?i=${i}`}
              download
              className="rounded-xl bg-brand-primary text-brand-gold px-5 py-2 text-sm font-semibold shrink-0 hover:bg-brand-primary/90 transition-colors"
            >
              Baixar
            </a>
          </div>
        ))}

        <div className="pt-3 flex items-center justify-between gap-3">
          {expiraEm ? (
            <p className="text-xs text-zinc-500">
              Disponível até{" "}
              {new Date(expiraEm).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : (
            <span />
          )}
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700 transition-colors"
          >
            Ver no painel
          </Link>
        </div>
      </div>

      {children && <div className="mt-8">{children}</div>}
    </WizardLayout>
  );
}

// ─── PdfIcon (interno) ───────────────────────────────────────────────────────

function PdfIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1a1a2e"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

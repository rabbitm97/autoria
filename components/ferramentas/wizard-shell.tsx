"use client";

// components/ferramentas/wizard-shell.tsx
//
// Shell reutilizável dos wizards de ferramenta avulsa (V47). Preserva
// exatamente a estética atual do wizard-diagnostico — cada tela foi
// extraída sem mudança visual. Novos wizards (epub, revisão, …) compõem
// essas telas + telas específicas suas.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DeclaracaoTitularidade } from "@/components/declaracao-titularidade";
import {
  ACCEPTED_EXTS,
  formatBytes,
  validateFile,
} from "@/lib/upload-manuscrito-cliente";

// ─── Estilos partilhados ─────────────────────────────────────────────────────

export const fieldClass =
  "w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 bg-white focus:outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 transition";
export const labelClass =
  "block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5";

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

// ─── TelaInicio ──────────────────────────────────────────────────────────────

export function TelaInicio({
  titulo,
  custo,
  saldo,
  onIniciar,
}: {
  titulo: string;
  custo: number;
  saldo: number | null;
  onIniciar: () => void;
}) {
  const saldoInsuficiente = saldo !== null && saldo < custo;
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-heading text-3xl text-brand-primary mb-2">{titulo}</h1>
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
            Você tem {saldo} créditos — esta ferramenta custa {custo}. A compra de créditos chega em breve; no beta,{" "}
            <Link href="/dashboard/suporte" className="underline">
              fale com a gente pelo suporte
            </Link>
            .
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
          onClick={onIniciar}
          className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
        >
          Começar
        </button>
      )}
    </div>
  );
}

// ─── TelaManuscrito ──────────────────────────────────────────────────────────

export interface DadosManuscrito {
  titulo: string;
  autor: string;
  file: File | null;
  declaracaoAceita: boolean;
}

export function TelaManuscrito({
  tituloHeading,
  ctaLabel,
  dados,
  onDados,
  onSubmit,
}: {
  tituloHeading: string;
  ctaLabel: string;
  dados: DadosManuscrito;
  onDados: (patch: Partial<DadosManuscrito>) => void;
  onSubmit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [declaracaoAberta, setDeclaracaoAberta] = useState(false);

  const pronto = dados.titulo.trim() && dados.file && dados.declaracaoAceita;

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
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-heading text-3xl text-brand-primary mb-6">{tituloHeading}</h1>

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
        </div>

        <DeclaracaoTitularidade
          aceita={dados.declaracaoAceita}
          aberta={declaracaoAberta}
          onAceita={(v) => onDados({ declaracaoAceita: v })}
          onToggle={() => setDeclaracaoAberta((v) => !v)}
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!pronto}
          className="w-full rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}

// ─── TelaRodando ─────────────────────────────────────────────────────────────

export function TelaRodando({
  tituloHeading,
  statusTexto,
  progresso,
  erro,
  onRetry,
  onVoltar,
  retryLabel = "Tentar novamente",
}: {
  tituloHeading: string;
  statusTexto: string;
  progresso: number;
  erro: string | null;
  onRetry?: () => void;
  onVoltar?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <h1 className="font-heading text-3xl text-brand-primary mb-6">{tituloHeading}</h1>

      {erro ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-5 space-y-3">
          <p className="text-sm text-red-700">{erro}</p>
          {onRetry ? (
            <>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 rounded-xl bg-brand-primary px-5 py-2 text-sm font-semibold text-brand-gold"
              >
                {retryLabel}
              </button>
              <p className="mt-1 text-[11px] text-zinc-400">Continua de onde parou — sem nova cobrança.</p>
            </>
          ) : onVoltar ? (
            <button
              type="button"
              onClick={onVoltar}
              className="text-sm text-brand-primary underline"
            >
              Voltar e tentar novamente
            </button>
          ) : null}
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

// ─── TelaPronto ──────────────────────────────────────────────────────────────

export function TelaPronto({
  tituloEntregavel,
  jobId,
  entregavelIndex = 0,
  ctaDownload,
  expiraEm,
  children,
}: {
  tituloEntregavel: string;
  jobId: string;
  entregavelIndex?: number;
  ctaDownload: string;
  expiraEm: string | null;
  children?: React.ReactNode;
}) {
  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <div className="rounded-2xl border-2 border-brand-gold bg-[#FAF6EF] p-6 mb-8 space-y-4">
        <p className="text-xs font-semibold text-brand-primary uppercase tracking-wide">
          {tituloEntregavel}
        </p>
        <a
          href={`/api/ferramentas/jobs/${jobId}/download?i=${entregavelIndex}`}
          download
          className="block w-full text-center rounded-xl bg-brand-primary text-brand-gold font-semibold py-3 hover:bg-brand-primary/90 transition-colors"
        >
          {ctaDownload}
        </a>
        {expiraEm && (
          <p className="text-xs text-zinc-500 text-center">
            Disponível até{" "}
            {new Date(expiraEm).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
        <div className="text-center">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700 transition-colors"
          >
            Ver no painel
          </Link>
        </div>
      </div>

      {children}
    </main>
  );
}

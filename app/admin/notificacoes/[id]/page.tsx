"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Report = {
  id: string;
  protocolo: string;
  nome: string;
  email: string;
  vinculo: string;
  obra_ref: string;
  project_id: string | null;
  fundamento: string;
  trecho: string;
  descricao: string;
  prova_url: string | null;
  declaracao_boa_fe: boolean;
  status: string;
  ip: string | null;
  user_agent: string | null;
  criado_em: string;
};

type Action = {
  id: string;
  acao: string;
  status_novo: string | null;
  fundamento: string | null;
  ator_email: string | null;
  criado_em: string;
};

const STATUS_LABELS: Record<string, string> = {
  recebida: "Recebida",
  em_analise: "Em análise",
  info_pendente: "Info pendente",
  mantida: "Mantida",
  suspensa: "Suspensa",
  removida: "Removida",
  improcedente: "Improcedente",
};

const FUNDAMENTO_LABELS: Record<string, string> = {
  direito_autoral: "Direito autoral",
  imagem_honra: "Imagem, honra ou nome",
  dados_pessoais: "Dados pessoais",
  ilicito: "Conteúdo ilícito",
  outro: "Outro",
};

const VINCULO_LABELS: Record<string, string> = {
  titular: "Titular",
  representante: "Representante",
  terceiro: "Terceiro interessado",
  autoridade: "Autoridade pública",
};

const ACOES = [
  { value: "recebimento_confirmado", label: "Recebimento confirmado" },
  { value: "analise_iniciada", label: "Análise iniciada" },
  { value: "info_solicitada", label: "Info solicitada ao notificante" },
  { value: "autor_notificado", label: "Autor notificado" },
  { value: "decidida", label: "Decidida (exige fundamento)" },
  { value: "autor_contestou", label: "Autor contestou" },
  { value: "reaberta", label: "Reaberta" },
] as const;

const STATUSES = [
  "recebida", "em_analise", "info_pendente", "mantida", "suspensa", "removida", "improcedente",
] as const;

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminNotificacaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  const [acao, setAcao] = useState<string>("");
  const [statusNovo, setStatusNovo] = useState<string>("");
  const [fundamento, setFundamento] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/notificacoes/${id}`);
    if (!res.ok) {
      setReport(null);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setReport(data.report);
    setActions(data.actions ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function submitAcao(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!acao) {
      setErro("Escolha uma ação.");
      return;
    }
    if (acao === "decidida" && !fundamento.trim()) {
      setErro("Ação `decidida` exige fundamento.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/notificacoes/${id}/acao`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao,
        statusNovo: statusNovo || null,
        fundamento: fundamento.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErro(data?.error ?? `Erro ${res.status}`);
      return;
    }
    setAcao("");
    setStatusNovo("");
    setFundamento("");
    await load();
  }

  if (loading) return <div className="text-zinc-500 text-sm">Carregando…</div>;
  if (!report) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-400">
        Notificação não encontrada.
        <div className="mt-3">
          <Link href="/admin/notificacoes" className="text-amber-400 hover:text-amber-300">
            ← Voltar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/notificacoes" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Voltar
        </Link>
        <div className="mt-2 flex items-baseline gap-4">
          <h1 className="font-mono text-2xl text-amber-400">{report.protocolo}</h1>
          <span className="text-xs text-zinc-500">
            Recebida em {fmt(report.criado_em)} · status atual{" "}
            <strong className="text-zinc-300">{STATUS_LABELS[report.status] ?? report.status}</strong>
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500">Notificação</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Campo label="Notificante" valor={`${report.nome} <${report.email}>`} />
          <Campo label="Vínculo" valor={VINCULO_LABELS[report.vinculo] ?? report.vinculo} />
          <Campo label="Fundamento" valor={FUNDAMENTO_LABELS[report.fundamento] ?? report.fundamento} />
          <Campo label="Obra" valor={report.obra_ref} />
          {report.project_id && <Campo label="project_id" valor={report.project_id} mono />}
          {report.prova_url && <Campo label="Prova" valor={report.prova_url} link />}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Onde está</p>
          <div className="rounded bg-zinc-950/50 border border-zinc-800 p-3 text-sm text-zinc-200 whitespace-pre-wrap">
            {report.trecho}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Descrição</p>
          <div className="rounded bg-zinc-950/50 border border-zinc-800 p-3 text-sm text-zinc-200 whitespace-pre-wrap">
            {report.descricao}
          </div>
        </div>

        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">Metadados técnicos</summary>
          <div className="mt-2 space-y-1 font-mono">
            <div>IP: {report.ip ?? "—"}</div>
            <div className="break-all">User-Agent: {report.user_agent ?? "—"}</div>
            <div>Declaração de boa-fé: {report.declaracao_boa_fe ? "sim" : "não"}</div>
          </div>
        </details>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">
          Histórico ({actions.length})
        </h2>
        {actions.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma providência registrada.</p>
        ) : (
          <ol className="space-y-3">
            {actions.map((a) => (
              <li key={a.id} className="border-l-2 border-zinc-800 pl-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-xs font-mono text-amber-400">{a.acao}</span>
                  <span className="text-[10px] text-zinc-500">{fmt(a.criado_em)}</span>
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  por {a.ator_email ?? "—"}
                  {a.status_novo && (
                    <> · status → <strong className="text-zinc-200">{STATUS_LABELS[a.status_novo] ?? a.status_novo}</strong></>
                  )}
                </div>
                {a.fundamento && (
                  <div className="mt-1 text-sm text-zinc-300 whitespace-pre-wrap">
                    {a.fundamento}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-4">
          Registrar providência
        </h2>
        <form onSubmit={submitAcao} className="space-y-4">
          <label className="block">
            <span className="text-xs text-zinc-400">Ação *</span>
            <select
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              required
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="">Selecione…</option>
              {ACOES.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-zinc-400">Novo status (opcional)</span>
            <select
              value={statusNovo}
              onChange={(e) => setStatusNovo(e.target.value)}
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
            >
              <option value="">— manter atual —</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-zinc-400">
              Fundamento{acao === "decidida" ? " *" : " (opcional)"}
            </span>
            <textarea
              value={fundamento}
              onChange={(e) => setFundamento(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
            />
          </label>

          {erro && (
            <div className="rounded-md bg-red-950/50 border border-red-800 px-3 py-2 text-sm text-red-300">
              {erro}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-amber-500 text-zinc-950 text-sm font-semibold px-4 py-2 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function Campo({ label, valor, mono, link }: { label: string; valor: string; mono?: boolean; link?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</p>
      {link ? (
        <a href={valor} target="_blank" rel="noreferrer" className="text-sm text-amber-400 hover:text-amber-300 break-all underline">
          {valor}
        </a>
      ) : (
        <p className={`text-sm text-zinc-200 break-words ${mono ? "font-mono text-xs" : ""}`}>{valor}</p>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  id: string;
  protocolo: string;
  criado_em: string;
  status: string;
  fundamento: string;
  obra_ref: string;
  vinculo: string;
  nome: string;
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
  imagem_honra: "Imagem/honra",
  dados_pessoais: "Dados pessoais",
  ilicito: "Ilícito",
  outro: "Outro",
};

const STATUS_COLORS: Record<string, string> = {
  recebida: "bg-amber-900/50 text-amber-300",
  em_analise: "bg-sky-900/50 text-sky-300",
  info_pendente: "bg-violet-900/50 text-violet-300",
  mantida: "bg-emerald-900/50 text-emerald-300",
  suspensa: "bg-orange-900/50 text-orange-300",
  removida: "bg-red-900/50 text-red-300",
  improcedente: "bg-zinc-800 text-zinc-400",
};

// SLA da Política de Conteúdo: 2 dias úteis p/ confirmar recebimento,
// 5 dias úteis p/ decidir. Aqui aproximamos por dias corridos — mais
// severo, mas seguro (não deixa vencer).
const MS_DIA = 24 * 60 * 60 * 1000;
const SLA_CONFIRMACAO_DIAS = 2;
const SLA_DECISAO_DIAS = 5;
const STATUS_DECIDIDO = new Set(["mantida", "suspensa", "removida", "improcedente"]);

function slaBadge(row: Row): { texto: string; classe: string } | null {
  const idade = (Date.now() - new Date(row.criado_em).getTime()) / MS_DIA;
  if (STATUS_DECIDIDO.has(row.status)) return null;

  if (idade > SLA_DECISAO_DIAS) {
    return {
      texto: `Decisão em atraso (${Math.floor(idade)}d)`,
      classe: "bg-red-950/60 text-red-300 border border-red-800",
    };
  }
  if (row.status === "recebida" && idade > SLA_CONFIRMACAO_DIAS) {
    return {
      texto: `Confirmação em atraso (${Math.floor(idade)}d)`,
      classe: "bg-amber-950/60 text-amber-300 border border-amber-800",
    };
  }
  return null;
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminNotificacoesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const url = filtro ? `/api/admin/notificacoes?status=${filtro}` : "/api/admin/notificacoes";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setRows(data.items ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filtro]);

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-1">
            Compliance
          </p>
          <h1 className="text-2xl font-semibold text-zinc-100">Notificações</h1>
          <p className="text-sm text-zinc-500 mt-1">
            SLA: 2 dias úteis p/ confirmar, 5 dias úteis p/ decidir. Mais antigo primeiro.
          </p>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Filtrar por status</label>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="rounded-md bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm px-3 py-1.5 focus:outline-none focus:border-amber-500"
          >
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
          Nenhuma notificação encontrada.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/70 text-zinc-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Protocolo</th>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Fundamento</th>
                <th className="text-left px-4 py-2">Obra</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Prazo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((row) => {
                const sla = slaBadge(row);
                return (
                  <tr key={row.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-2">
                      <Link
                        href={`/admin/notificacoes/${row.id}`}
                        className="font-mono text-xs text-amber-400 hover:text-amber-300"
                      >
                        {row.protocolo}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400 whitespace-nowrap">
                      {fmtData(row.criado_em)}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-300 whitespace-nowrap">
                      {FUNDAMENTO_LABELS[row.fundamento] ?? row.fundamento}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-300 max-w-xs truncate">
                      {row.obra_ref}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${STATUS_COLORS[row.status] ?? "bg-zinc-800 text-zinc-400"}`}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {sla ? (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${sla.classe}`}>
                          {sla.texto}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

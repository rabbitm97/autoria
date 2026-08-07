"use client";

import { useState } from "react";

type Aceite = {
  id: string;
  user_email: string;
  project_id: string | null;
  doc_slug: string;
  doc_versao: string;
  doc_hash: string;
  contexto: string;
  artefato_ref: string | null;
  aceito_em: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminAceitesPage() {
  const [email, setEmail] = useState("");
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<Aceite[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscou, setBuscou] = useState(false);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !projectId.trim()) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (email.trim()) qs.set("email", email.trim());
    if (projectId.trim()) qs.set("projectId", projectId.trim());
    const res = await fetch(`/api/admin/aceites?${qs}`);
    const data = await res.json().catch(() => ({ items: [] }));
    setItems(data.items ?? []);
    setBuscou(true);
    setLoading(false);
  }

  return (
    <div>
      <div className="mb-8">
        <p className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-1">
          Compliance
        </p>
        <h1 className="text-2xl font-semibold text-zinc-100">Aceites legais</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Consulta somente-leitura de <code className="text-xs">legal_acceptances</code>.
          Registros são append-only.
        </p>
      </div>

      <form onSubmit={buscar} className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs text-zinc-400">E-mail (busca parcial)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex.: autor@exemplo.com"
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm px-3 py-2 focus:outline-none focus:border-amber-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-400">project_id (uuid exato)</span>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="uuid"
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-800 text-zinc-100 text-sm font-mono px-3 py-2 focus:outline-none focus:border-amber-500"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading || (!email.trim() && !projectId.trim())}
            className="rounded-md bg-amber-500 text-zinc-950 text-sm font-semibold px-4 py-2 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </form>

      {buscou && (
        items.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
            Nenhum aceite encontrado para os critérios informados.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/70 text-zinc-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">E-mail</th>
                  <th className="text-left px-4 py-2">Slug</th>
                  <th className="text-left px-4 py-2">Versão</th>
                  <th className="text-left px-4 py-2">Hash</th>
                  <th className="text-left px-4 py-2">Contexto</th>
                  <th className="text-left px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-zinc-900/40">
                    <td className="px-4 py-2 text-xs text-zinc-300">{it.user_email}</td>
                    <td className="px-4 py-2 text-xs text-zinc-300 font-mono">{it.doc_slug}</td>
                    <td className="px-4 py-2 text-xs text-zinc-300 font-mono">{it.doc_versao}</td>
                    <td className="px-4 py-2 text-[10px] text-zinc-500 font-mono">
                      {it.doc_hash.slice(0, 12)}…
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-400">{it.contexto}</td>
                    <td className="px-4 py-2 text-xs text-zinc-400 whitespace-nowrap">
                      {fmt(it.aceito_em)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

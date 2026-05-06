"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Tabs } from "@base-ui/react/tabs";
import dynamic from "next/dynamic";
import { AGENTS_REGISTRY } from "@/lib/admin-agents";

const ReactDiffViewer = dynamic(() => import("react-diff-viewer-continued"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromptVersion {
  id: string;
  agent_name: string;
  version: number;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  prompt_content: string;
}

interface UsageLog {
  id: string;
  agent_name: string;
  project_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

interface AgentMetrics {
  logs: UsageLog[];
  avg_cost: number | null;
  error_rate: number | null;
  last_call: string | null;
}

interface TestResult {
  output: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function fmtCost(n: number | null): string {
  if (n == null) return "—";
  return `US$ ${n.toFixed(4)}`;
}

function StatusDot({ error }: { error: string | null }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${error ? "bg-red-500" : "bg-emerald-500"}`} />
  );
}

// ─── Tab: Prompt ──────────────────────────────────────────────────────────────

function PromptTab({
  agentName,
  hasPrompt,
  versions,
  onSaved,
}: {
  agentName: string;
  hasPrompt: boolean;
  versions: PromptVersion[];
  onSaved: () => void;
}) {
  const active = versions.find(v => v.is_active);
  const [draft, setDraft] = useState(active?.prompt_content ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(active?.prompt_content ?? "");
  }, [active?.prompt_content]);

  if (!hasPrompt) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        Este agente não usa um system prompt editável (sem LLM ou prompt inline).
      </div>
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/prompts/${agentName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt_content: draft }),
      });
      if (!res.ok) {
        const e = await res.json();
        setMsg(`Erro: ${e.error}`);
      } else {
        setMsg("Versão salva e ativada.");
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400">
          {active
            ? <>Versão ativa: <span className="text-zinc-200 font-mono">v{active.version}</span> · salva por <span className="text-zinc-200">{active.created_by ?? "?"}</span> em {fmtDate(active.created_at)}</>
            : <span className="text-amber-400">Nenhuma versão ativa — usando fallback hardcoded.</span>
          }
        </div>
        <button
          onClick={save}
          disabled={saving || !draft.trim()}
          className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-zinc-950 font-semibold disabled:opacity-40 hover:bg-amber-400 transition-colors"
        >
          {saving ? "Salvando…" : "Salvar versão"}
        </button>
      </div>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.startsWith("Erro") ? "bg-red-900/40 text-red-300" : "bg-emerald-900/40 text-emerald-300"}`}>
          {msg}
        </p>
      )}

      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        className="w-full h-[60vh] bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm font-mono text-zinc-100 leading-relaxed resize-none focus:outline-none focus:border-amber-500/60"
        spellCheck={false}
        placeholder="Cole ou edite o system prompt aqui…"
      />
    </div>
  );
}

// ─── Tab: Testar ──────────────────────────────────────────────────────────────

function TestarTab({
  agentName,
  hasPrompt,
  versions,
}: {
  agentName: string;
  hasPrompt: boolean;
  versions: PromptVersion[];
}) {
  const meta = AGENTS_REGISTRY.find(a => a.name === agentName);
  const activePrompt = versions.find(v => v.is_active)?.prompt_content ?? "";
  const [systemPrompt, setSystemPrompt] = useState(activePrompt);
  const [userInput, setUserInput] = useState("");
  const [model, setModel] = useState(
    meta?.model.startsWith("claude") ? meta.model : "claude-sonnet-4-6"
  );
  const [result, setResult] = useState<TestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSystemPrompt(activePrompt);
  }, [activePrompt]);

  if (!hasPrompt) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        Teste manual não disponível para agentes sem LLM.
      </div>
    );
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_name: agentName, model, system_prompt: systemPrompt, user_input: userInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro desconhecido");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 h-[calc(100vh-220px)]">
      {/* Left: inputs */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/60"
          >
            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
            <option value="claude-opus-4-7">claude-opus-4-7</option>
          </select>
          <button
            onClick={run}
            disabled={running || !systemPrompt.trim() || !userInput.trim()}
            className="px-4 py-1.5 text-sm rounded-lg bg-amber-500 text-zinc-950 font-semibold disabled:opacity-40 hover:bg-amber-400 transition-colors ml-auto"
          >
            {running ? "Executando…" : "▶ Executar"}
          </button>
        </div>

        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-xs font-mono text-zinc-100 leading-relaxed resize-none focus:outline-none focus:border-amber-500/60"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-col gap-1" style={{ height: "30%" }}>
          <label className="text-xs text-zinc-500 uppercase tracking-wider">Input do usuário</label>
          <textarea
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder="Cole um trecho de manuscrito ou qualquer input de teste…"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-100 leading-relaxed resize-none focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      {/* Right: output */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4 h-8">
          {result && (
            <>
              <span className="text-xs text-zinc-400 font-mono">
                {result.input_tokens} in · {result.output_tokens} out · {fmtCost(result.cost_usd)} · {result.duration_ms}ms
              </span>
            </>
          )}
        </div>

        <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl p-4 overflow-y-auto">
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          {running && (
            <p className="text-zinc-500 text-sm animate-pulse">Chamando Claude…</p>
          )}
          {result && !running && (
            <pre className="text-sm text-zinc-100 whitespace-pre-wrap font-sans leading-relaxed">{result.output}</pre>
          )}
          {!result && !running && !error && (
            <p className="text-zinc-600 text-sm">O output aparece aqui.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Métricas ────────────────────────────────────────────────────────────

function MetricasTab({ metrics, loading }: { metrics: AgentMetrics | null; loading: boolean }) {
  const [filter, setFilter] = useState<"todos" | "sucesso" | "erro">("todos");

  if (loading) return <div className="py-12 text-center text-zinc-500 animate-pulse text-sm">Carregando…</div>;
  if (!metrics) return <div className="py-12 text-center text-zinc-500 text-sm">Sem dados.</div>;

  const filtered = metrics.logs.filter(l => {
    if (filter === "sucesso") return !l.error;
    if (filter === "erro")    return !!l.error;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span>Custo médio: <strong className="text-zinc-200">{fmtCost(metrics.avg_cost)}</strong></span>
          <span>·</span>
          <span>Taxa de erro: <strong className={metrics.error_rate && metrics.error_rate > 0 ? "text-red-400" : "text-emerald-400"}>{metrics.error_rate?.toFixed(1) ?? "0"}%</strong></span>
          <span>·</span>
          <span>Última chamada: <strong className="text-zinc-200">{fmtDate(metrics.last_call)}</strong></span>
        </div>
        <div className="ml-auto flex gap-1">
          {(["todos", "sucesso", "erro"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-lg capitalize transition-colors ${
                filter === f
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-xs text-zinc-300">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="px-3 py-2 text-left text-zinc-500 font-normal">Data</th>
              <th className="px-3 py-2 text-left text-zinc-500 font-normal">Project</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-normal">In tok</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-normal">Out tok</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-normal">Custo</th>
              <th className="px-3 py-2 text-right text-zinc-500 font-normal">ms</th>
              <th className="px-3 py-2 text-center text-zinc-500 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-zinc-600">Sem registros.</td>
              </tr>
            )}
            {filtered.map(log => (
              <tr key={log.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-3 py-2 font-mono whitespace-nowrap">{fmtDate(log.created_at)}</td>
                <td className="px-3 py-2 font-mono text-zinc-500 max-w-[120px] truncate">{log.project_id ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{log.input_tokens ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{log.output_tokens ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtCost(log.cost_usd)}</td>
                <td className="px-3 py-2 text-right font-mono">{log.duration_ms ?? "—"}</td>
                <td className="px-3 py-2 text-center">
                  <StatusDot error={log.error} />
                  {log.error && (
                    <span className="ml-1 text-red-400 text-[10px] max-w-[120px] inline-block truncate align-middle" title={log.error}>
                      {log.error}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Histórico de prompts ────────────────────────────────────────────────

function HistoricoTab({
  agentName,
  versions,
  onReverted,
}: {
  agentName: string;
  versions: PromptVersion[];
  onReverted: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);
  const [diffBase, setDiffBase] = useState<PromptVersion | null>(null);
  const [diffTarget, setDiffTarget] = useState<PromptVersion | null>(null);

  if (versions.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500 text-sm">
        Nenhuma versão salva ainda. Use a aba "Prompt" para criar a primeira versão.
      </div>
    );
  }

  async function revert(id: string) {
    setReverting(id);
    await fetch(`/api/admin/prompts/${agentName}?revert=${id}`, { method: "PATCH" });
    setReverting(null);
    onReverted();
  }

  const selected = versions.find(v => v.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-[280px_1fr] gap-4 h-[calc(100vh-220px)]">
      {/* Version list */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        {versions.map(v => (
          <button
            key={v.id}
            onClick={() => {
              setSelectedId(v.id);
              if (diffBase && diffBase.id !== v.id) setDiffTarget(v);
            }}
            className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
              selectedId === v.id
                ? "border-amber-500/50 bg-amber-900/20"
                : "border-zinc-800 bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-sm font-mono text-zinc-200">v{v.version}</span>
              {v.is_active && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-900/60 text-emerald-400 uppercase tracking-wider">
                  Ativo
                </span>
              )}
            </div>
            <div className="text-xs text-zinc-500">{fmtDate(v.created_at)}</div>
            <div className="text-xs text-zinc-600 truncate">{v.created_by ?? "?"}</div>
          </button>
        ))}
      </div>

      {/* Right panel */}
      <div className="flex flex-col gap-3 overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300">
                v{selected.version} · {fmtDate(selected.created_at)}
              </span>
              {!selected.is_active && (
                <button
                  onClick={() => revert(selected.id)}
                  disabled={!!reverting}
                  className="ml-auto px-3 py-1 text-xs rounded-lg bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-40 transition-colors"
                >
                  {reverting === selected.id ? "Revertendo…" : "Reverter para esta versão"}
                </button>
              )}
              {versions.length >= 2 && (
                <button
                  onClick={() => {
                    const other = versions.find(v => v.id !== selected.id);
                    setDiffBase(other ?? null);
                    setDiffTarget(selected);
                  }}
                  className="px-3 py-1 text-xs rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  Comparar
                </button>
              )}
            </div>

            {diffBase && diffTarget ? (
              <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 text-xs [&_.rdv-code-fold]:hidden">
                <div className="flex items-center gap-3 px-3 py-2 border-b border-zinc-800 bg-zinc-900 text-zinc-500">
                  <span>v{diffBase.version} → v{diffTarget.version}</span>
                  <button
                    onClick={() => { setDiffBase(null); setDiffTarget(null); }}
                    className="ml-auto text-zinc-600 hover:text-zinc-400"
                  >
                    Fechar diff
                  </button>
                </div>
                <ReactDiffViewer
                  oldValue={diffBase.prompt_content}
                  newValue={diffTarget.prompt_content}
                  splitView={false}
                  useDarkTheme
                  styles={{
                    variables: {
                      dark: {
                        diffViewerBackground: "#18181b",
                        diffViewerColor: "#e4e4e7",
                        addedBackground: "#14532d",
                        addedColor: "#86efac",
                        removedBackground: "#450a0a",
                        removedColor: "#fca5a5",
                        wordAddedBackground: "#166534",
                        wordRemovedBackground: "#7f1d1d",
                        codeFoldGutterBackground: "#27272a",
                        codeFoldBackground: "#27272a",
                        gutterBackground: "#1c1c1f",
                        gutterColor: "#52525b",
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <pre className="flex-1 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-100 whitespace-pre-wrap leading-relaxed">
                {selected.prompt_content}
              </pre>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
            Selecione uma versão para visualizar.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Langfuse ────────────────────────────────────────────────────────────

function LangfuseTab({ agentName }: { agentName: string }) {
  const host = process.env.NEXT_PUBLIC_LANGFUSE_HOST ?? "https://us.cloud.langfuse.com";
  const tracesUrl = `${host}/traces`;

  return (
    <div className="space-y-6 py-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200 mb-1">Dashboard de Traces</h3>
          <p className="text-xs text-zinc-500">
            Cada chamada ao agente <span className="font-mono text-zinc-300">{agentName}</span> gera
            uma trace no Langfuse com nome <span className="font-mono text-zinc-300">{agentName}</span>.
          </p>
        </div>

        <a
          href={tracesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-amber-500 text-zinc-950 font-semibold hover:bg-amber-400 transition-colors"
        >
          Abrir Langfuse Traces ↗
        </a>

        <div className="text-xs text-zinc-500 space-y-1">
          <p>No dashboard, filtre por <strong className="text-zinc-400">Name = {agentName}</strong> para ver apenas este agente.</p>
          <p>As traces incluem: duração, userId, project_id e erros (se houver).</p>
          {!process.env.NEXT_PUBLIC_LANGFUSE_HOST && (
            <p className="text-amber-500/80">
              Variável <span className="font-mono">NEXT_PUBLIC_LANGFUSE_HOST</span> não configurada — usando us.cloud.langfuse.com como padrão.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentDetailPage() {
  const params = useParams();
  const nome = params.nome as string;

  const meta = AGENTS_REGISTRY.find(a => a.name === nome);

  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsLoaded, setMetricsLoaded] = useState(false);

  const loadVersions = useCallback(() => {
    fetch(`/api/admin/prompts/${nome}`)
      .then(r => r.json())
      .then(setVersions)
      .catch(() => {});
  }, [nome]);

  const loadMetrics = useCallback(() => {
    if (metricsLoaded) return;
    setMetricsLoading(true);
    fetch(`/api/admin/agentes/${nome}`)
      .then(r => r.json())
      .then(d => { setMetrics(d); setMetricsLoaded(true); })
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, [nome, metricsLoaded]);

  useEffect(() => { loadVersions(); }, [loadVersions]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <a href="/admin/agentes" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          ← Todos os agentes
        </a>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-xl font-semibold text-zinc-100">{meta?.label ?? nome}</h1>
          {meta && (
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {meta.model}
            </span>
          )}
        </div>
      </div>

      <Tabs.Root defaultValue="prompt" className="w-full">
        <Tabs.List className="flex gap-1 border-b border-zinc-800 mb-6">
          {[
            { value: "prompt",    label: "Prompt" },
            { value: "testar",    label: "Testar",   onActivate: () => {} },
            { value: "metricas",  label: "Métricas",  onActivate: loadMetrics },
            { value: "historico", label: "Histórico" },
            { value: "langfuse",  label: "Langfuse" },
          ].map(tab => (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              onClick={tab.onActivate}
              className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors border-b-2 border-transparent data-[selected]:border-amber-400 data-[selected]:text-zinc-100 -mb-px"
            >
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="prompt" className="outline-none">
          <PromptTab
            agentName={nome}
            hasPrompt={meta?.hasPrompt ?? false}
            versions={versions}
            onSaved={loadVersions}
          />
        </Tabs.Panel>

        <Tabs.Panel value="testar" className="outline-none">
          <TestarTab
            agentName={nome}
            hasPrompt={meta?.hasPrompt ?? false}
            versions={versions}
          />
        </Tabs.Panel>

        <Tabs.Panel value="metricas" className="outline-none">
          <MetricasTab metrics={metrics} loading={metricsLoading} />
        </Tabs.Panel>

        <Tabs.Panel value="historico" className="outline-none">
          <HistoricoTab
            agentName={nome}
            versions={versions}
            onReverted={loadVersions}
          />
        </Tabs.Panel>

        <Tabs.Panel value="langfuse" className="outline-none">
          <LangfuseTab agentName={nome} />
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}

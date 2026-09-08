"use client";

// SUP-2 · Inbox admin mobile-first + flywheel de artigos.
//
// O layout admin (app/admin/layout.tsx) já roda requireAdmin() e redireciona
// não-admin para /dashboard — a página cliente confia nesse guard.
// Deep-link: /admin/suporte?c=<id> abre a thread direto (link do e-mail).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface Mensagem {
  id: string;
  conversa_id: string;
  autor: "usuario" | "equipe";
  texto: string;
  criado_em: string;
}

interface Perfil {
  nome: string | null;
  email: string;
}

interface InboxItem {
  id: string;
  status: "aberta" | "fechada";
  criado_em: string;
  atualizado_em: string;
  usuario: Perfil;
  ultima_mensagem: Mensagem | null;
  nao_respondida: boolean;
}

interface Thread {
  id: string;
  status: "aberta" | "fechada";
  criado_em: string;
  atualizado_em: string;
  usuario: Perfil;
  mensagens: Mensagem[];
}

interface Artigo {
  id: string;
  pergunta: string;
  resposta: string;
  tags: string[];
  origem_conversa_id: string | null;
  status: "rascunho" | "publicado";
  criado_em: string;
  atualizado_em: string;
}

const POLL_MS = 30_000;

// ─── Página ──────────────────────────────────────────────────────────────────

export default function AdminSuportePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversaParam = searchParams.get("c");

  const [tab, setTab] = useState<"inbox" | "artigos">("inbox");
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [artigos, setArtigos] = useState<Artigo[]>([]);
  const [threadId, setThreadId] = useState<string | null>(conversaParam);
  const [thread, setThread] = useState<Thread | null>(null);
  const [carregandoInbox, setCarregandoInbox] = useState(true);
  const [carregandoThread, setCarregandoThread] = useState(false);

  const carregarInbox = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/suporte");
      if (!res.ok) return;
      const data = await res.json();
      setInbox(Array.isArray(data?.items) ? data.items : []);
    } finally {
      setCarregandoInbox(false);
    }
  }, []);

  const carregarThread = useCallback(async (id: string) => {
    setCarregandoThread(true);
    try {
      const res = await fetch(`/api/admin/suporte?c=${id}`);
      if (!res.ok) {
        setThread(null);
        return;
      }
      setThread((await res.json()) as Thread);
    } finally {
      setCarregandoThread(false);
    }
  }, []);

  const carregarArtigos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/suporte/artigo");
      if (!res.ok) return;
      const data = await res.json();
      setArtigos(Array.isArray(data?.items) ? data.items : []);
    } catch {}
  }, []);

  useEffect(() => { carregarInbox(); }, [carregarInbox]);
  useEffect(() => { if (tab === "artigos") carregarArtigos(); }, [tab, carregarArtigos]);
  useEffect(() => { if (threadId) carregarThread(threadId); else setThread(null); }, [threadId, carregarThread]);

  // Poll + visibilitychange (V-FERR-13). Refaz inbox e, se aberta, a thread.
  useEffect(() => {
    const tick = () => {
      carregarInbox();
      if (threadId) carregarThread(threadId);
    };
    const iv = window.setInterval(tick, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [threadId, carregarInbox, carregarThread]);

  function abrirThread(id: string) {
    setThreadId(id);
    router.replace(`/admin/suporte?c=${id}`, { scroll: false });
  }

  function voltarInbox() {
    setThreadId(null);
    setThread(null);
    router.replace("/admin/suporte", { scroll: false });
  }

  return (
    <div className="rounded-2xl bg-[#faf7f2] text-brand-primary min-h-[70vh] p-3 sm:p-6">
      {/* Header interno claro (o layout admin é dark) */}
      <div className="mb-4 flex items-center gap-2">
        {threadId ? (
          <button
            onClick={voltarInbox}
            className="text-sm text-brand-primary/70 hover:text-brand-primary font-medium"
          >
            ← Inbox
          </button>
        ) : (
          <>
            <TabBtn active={tab === "inbox"} onClick={() => setTab("inbox")}>Inbox</TabBtn>
            <TabBtn active={tab === "artigos"} onClick={() => setTab("artigos")}>Artigos</TabBtn>
          </>
        )}
      </div>

      {threadId ? (
        <ThreadView
          thread={thread}
          carregando={carregandoThread}
          onEnviado={() => {
            if (threadId) carregarThread(threadId);
            carregarInbox();
          }}
          onFechado={() => {
            voltarInbox();
            carregarInbox();
          }}
          onArtigoSalvo={() => carregarArtigos()}
        />
      ) : tab === "inbox" ? (
        <InboxList
          items={inbox}
          carregando={carregandoInbox}
          onAbrir={abrirThread}
        />
      ) : (
        <ArtigosList
          items={artigos}
          onAtualizado={carregarArtigos}
        />
      )}
    </div>
  );
}

// ─── Componentes ─────────────────────────────────────────────────────────────

function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
        active
          ? "bg-brand-primary text-brand-gold"
          : "bg-white text-brand-primary/60 hover:text-brand-primary border border-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Inbox ───────────────────────────────────────────────────────────────────

function InboxList({
  items, carregando, onAbrir,
}: {
  items: InboxItem[];
  carregando: boolean;
  onAbrir: (id: string) => void;
}) {
  if (carregando) {
    return (
      <div className="py-12 flex justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-center text-sm text-brand-primary/50 py-16">Nenhuma conversa ainda.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.id}>
          <button
            onClick={() => onAbrir(it.id)}
            className="w-full text-left bg-white rounded-xl border border-zinc-200 hover:border-brand-gold/40 transition-colors px-4 py-3 flex items-start gap-3"
          >
            {it.nao_respondida ? (
              <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-label="Não respondida" />
            ) : (
              <span className="mt-1.5 w-2 h-2 rounded-full bg-transparent shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-primary truncate">
                  {it.usuario.nome || it.usuario.email || "usuário"}
                </p>
                <span className="text-[10px] text-brand-primary/50 whitespace-nowrap">
                  {tempoRelativo(it.atualizado_em)}
                </span>
              </div>
              <p className="text-xs text-brand-primary/60 mt-0.5 truncate">
                {it.ultima_mensagem
                  ? `${it.ultima_mensagem.autor === "equipe" ? "Você: " : ""}${it.ultima_mensagem.texto}`
                  : "(sem mensagens)"}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <StatusPill status={it.status} />
                {it.nao_respondida && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    Aguardando resposta
                  </span>
                )}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ status }: { status: "aberta" | "fechada" }) {
  const cls =
    status === "aberta"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-zinc-100 text-zinc-500 border-zinc-200";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>
      {status === "aberta" ? "Aberta" : "Fechada"}
    </span>
  );
}

// ─── Thread ──────────────────────────────────────────────────────────────────

function ThreadView({
  thread, carregando, onEnviado, onFechado, onArtigoSalvo,
}: {
  thread: Thread | null;
  carregando: boolean;
  onEnviado: () => void;
  onFechado: () => void;
  onArtigoSalvo: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [alterandoStatus, setAlterandoStatus] = useState(false);
  const [modalArtigo, setModalArtigo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.mensagens.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!thread) return;
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa_id: thread.id, texto: t }),
      });
      if (res.ok) {
        setTexto("");
        onEnviado();
      }
    } finally {
      setEnviando(false);
    }
  }

  async function alterarStatus(status: "aberta" | "fechada") {
    if (!thread || alterandoStatus) return;
    setAlterandoStatus(true);
    try {
      const res = await fetch("/api/admin/suporte", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa_id: thread.id, status }),
      });
      if (res.ok) {
        if (status === "fechada") onFechado();
        else onEnviado();
      }
    } finally {
      setAlterandoStatus(false);
    }
  }

  if (carregando && !thread) {
    return (
      <div className="py-12 flex justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!thread) return <p className="text-sm text-brand-primary/60">Conversa não encontrada.</p>;

  return (
    <div className="flex flex-col h-[calc(100vh-13rem)] sm:h-[70vh] bg-white rounded-2xl border border-zinc-200 overflow-hidden">
      {/* Cabeçalho da thread */}
      <div className="p-3 sm:p-4 border-b border-zinc-100 flex items-center gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-brand-primary truncate">
            {thread.usuario.nome || thread.usuario.email || "usuário"}
          </p>
          <p className="text-[11px] text-brand-primary/50 truncate">{thread.usuario.email}</p>
        </div>
        <StatusPill status={thread.status} />
        {thread.status === "aberta" ? (
          <button
            onClick={() => alterarStatus("fechada")}
            disabled={alterandoStatus}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-brand-primary/70 hover:bg-zinc-50 disabled:opacity-50"
          >
            Fechar
          </button>
        ) : (
          <button
            onClick={() => alterarStatus("aberta")}
            disabled={alterandoStatus}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-brand-primary/70 hover:bg-zinc-50 disabled:opacity-50"
          >
            Reabrir
          </button>
        )}
        <button
          onClick={() => setModalArtigo(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-brand-gold/15 text-brand-primary border border-brand-gold/30 hover:bg-brand-gold/25"
        >
          Salvar como artigo
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {thread.mensagens.map((m) => (
          <MensagemBolha key={m.id} msg={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <form onSubmit={enviar} className="border-t border-zinc-100 p-3 flex flex-col gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Responder como equipe…"
          rows={3}
          maxLength={5000}
          disabled={enviando}
          className="w-full resize-none px-4 py-2.5 rounded-xl border border-zinc-200 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-gold/40 disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-brand-primary/40">{texto.length}/5000</span>
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="px-5 py-2.5 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-40"
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>

      {modalArtigo && (
        <ModalArtigo
          thread={thread}
          onFechar={() => setModalArtigo(false)}
          onSalvo={() => {
            setModalArtigo(false);
            onArtigoSalvo();
          }}
        />
      )}
    </div>
  );
}

function MensagemBolha({ msg }: { msg: Mensagem }) {
  const isEquipe = msg.autor === "equipe";
  const hora = new Date(msg.criado_em).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className={`flex ${isEquipe ? "flex-row-reverse" : ""}`}>
      <div className="max-w-[85%]">
        {!isEquipe && (
          <p className="text-[11px] font-medium text-brand-primary/60 mb-1 px-1">Autor</p>
        )}
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isEquipe
              ? "bg-brand-primary text-white rounded-tr-sm"
              : "bg-zinc-50 border border-zinc-100 text-brand-primary rounded-tl-sm"
          }`}
        >
          {msg.texto}
        </div>
        <p className={`text-[10px] text-brand-primary/40 mt-1 px-1 ${isEquipe ? "text-right" : ""}`}>{hora}</p>
      </div>
    </div>
  );
}

// ─── Modal "Salvar como artigo" ──────────────────────────────────────────────

function ModalArtigo({
  thread, onFechar, onSalvo,
}: {
  thread: Thread;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const primeiraUsuario = useMemo(
    () => thread.mensagens.find((m) => m.autor === "usuario")?.texto ?? "",
    [thread],
  );
  const ultimaEquipe = useMemo(
    () => [...thread.mensagens].reverse().find((m) => m.autor === "equipe")?.texto ?? "",
    [thread],
  );

  const [pergunta, setPergunta] = useState(primeiraUsuario);
  const [resposta, setResposta] = useState(ultimaEquipe);
  const [tagsStr, setTagsStr] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function salvar() {
    const p = pergunta.trim();
    const r = resposta.trim();
    if (!p || !r || salvando) return;
    const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
    setSalvando(true);
    try {
      const res = await fetch("/api/admin/suporte/artigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa_id: thread.id,
          pergunta: p,
          resposta: r,
          tags,
        }),
      });
      if (res.ok) {
        setToast("Artigo salvo como rascunho");
        setTimeout(() => onSalvo(), 700);
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-3"
      onClick={onFechar}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-heading text-brand-primary">Salvar como artigo</h2>
          <button onClick={onFechar} className="text-brand-primary/50 hover:text-brand-primary">✕</button>
        </div>

        <label className="block text-xs font-medium text-brand-primary/70 mb-1">Pergunta</label>
        <textarea
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          rows={2}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-zinc-200 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
        />

        <label className="block text-xs font-medium text-brand-primary/70 mb-1">Resposta</label>
        <textarea
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          rows={6}
          className="w-full mb-3 px-3 py-2 rounded-xl border border-zinc-200 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
        />

        <label className="block text-xs font-medium text-brand-primary/70 mb-1">
          Tags <span className="text-brand-primary/40 font-normal">(separadas por vírgula)</span>
        </label>
        <input
          type="text"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="ex.: publicação, isbn, royalties"
          className="w-full mb-4 px-3 py-2 rounded-xl border border-zinc-200 text-sm text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
        />

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onFechar}
            className="px-4 py-2 rounded-xl text-sm text-brand-primary/70 hover:bg-zinc-50 border border-zinc-200"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando || !pergunta.trim() || !resposta.trim()}
            className="px-5 py-2 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar rascunho"}
          </button>
        </div>

        {toast && (
          <p className="mt-3 text-sm text-emerald-700 text-center">{toast}</p>
        )}
      </div>
    </div>
  );
}

// ─── Artigos ─────────────────────────────────────────────────────────────────

function ArtigosList({
  items, onAtualizado,
}: {
  items: Artigo[];
  onAtualizado: () => void;
}) {
  if (items.length === 0) {
    return <p className="text-center text-sm text-brand-primary/50 py-16">Nenhum artigo ainda.</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((a) => (
        <ArtigoCard key={a.id} artigo={a} onAtualizado={onAtualizado} />
      ))}
    </ul>
  );
}

function ArtigoCard({
  artigo, onAtualizado,
}: {
  artigo: Artigo;
  onAtualizado: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [pergunta, setPergunta] = useState(artigo.pergunta);
  const [resposta, setResposta] = useState(artigo.resposta);
  const [tagsStr, setTagsStr] = useState(artigo.tags.join(", "));
  const [salvando, setSalvando] = useState(false);

  async function salvarEdicao() {
    setSalvando(true);
    try {
      const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch("/api/admin/suporte/artigo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: artigo.id, pergunta, resposta, tags }),
      });
      if (res.ok) {
        setEditando(false);
        onAtualizado();
      }
    } finally {
      setSalvando(false);
    }
  }

  async function alternarStatus() {
    const proximo = artigo.status === "rascunho" ? "publicado" : "rascunho";
    await fetch("/api/admin/suporte/artigo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: artigo.id, status: proximo }),
    });
    onAtualizado();
  }

  return (
    <li className="bg-white rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            artigo.status === "publicado"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-amber-50 text-amber-700 border-amber-200"
          }`}
        >
          {artigo.status === "publicado" ? "Publicado" : "Rascunho"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={alternarStatus}
            className="text-xs px-3 py-1 rounded-lg border border-zinc-200 text-brand-primary/70 hover:bg-zinc-50"
          >
            {artigo.status === "publicado" ? "Voltar a rascunho" : "Publicar"}
          </button>
          <button
            onClick={() => setEditando((v) => !v)}
            className="text-xs px-3 py-1 rounded-lg border border-zinc-200 text-brand-primary/70 hover:bg-zinc-50"
          >
            {editando ? "Cancelar" : "Editar"}
          </button>
        </div>
      </div>

      {editando ? (
        <div className="space-y-2">
          <textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-brand-primary"
          />
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-brand-primary"
          />
          <input
            type="text"
            value={tagsStr}
            onChange={(e) => setTagsStr(e.target.value)}
            placeholder="Tags separadas por vírgula"
            className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm text-brand-primary"
          />
          <button
            onClick={salvarEdicao}
            disabled={salvando || !pergunta.trim() || !resposta.trim()}
            className="px-4 py-2 rounded-xl bg-brand-primary text-brand-gold text-sm font-medium disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-brand-primary">{artigo.pergunta}</p>
          <p className="text-xs text-brand-primary/60 mt-1 line-clamp-3 whitespace-pre-wrap">{artigo.resposta}</p>
          {artigo.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {artigo.tags.map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-brand-primary/70">
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </li>
  );
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  });
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ─── SUP-1 · Suporte humano (beta) ────────────────────────────────────────────
// Modelo novo: threads persistentes em suporte_conversas/suporte_mensagens.
// Posicionamento: quem responde é uma pessoa da equipe Autoria (não uma IA).
// SLA declarado: 2h em janela seg-sáb 10-20 (America/Sao_Paulo).

interface Mensagem {
  id: string;
  conversa_id: string;
  autor: "usuario" | "equipe";
  texto: string;
  criado_em: string;
  lida_em: string | null;
}

interface Conversa {
  id: string;
  status: "aberta" | "fechada";
  criado_em: string;
  atualizado_em: string;
  mensagens: Mensagem[];
}

const MAX_TEXTO = 5000;
const POLL_MS = 30_000;

// ─── Janela de atendimento (America/Sao_Paulo) ────────────────────────────────
// Regra: seg-sáb, 10h-20h. Domingo fechado. Cálculo em BRT via Intl para não
// depender de bibliotecas (Autoria evita libs extras a menos que estritamente
// necessário).

interface HorarioBR {
  weekday: number; // 0 = domingo … 6 = sábado
  hour: number;    // 0-23
  minute: number;  // 0-59
}

function agoraSaoPaulo(): HorarioBR {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    weekday: weekdayMap[wd] ?? 1,
    hour: Number(hh) % 24,
    minute: Number(mm),
  };
}

function dentroDoHorario(t: HorarioBR): boolean {
  // seg (1) a sáb (6), 10 ≤ hora < 20.
  return t.weekday >= 1 && t.weekday <= 6 && t.hour >= 10 && t.hour < 20;
}

function proximaJanela(t: HorarioBR): string {
  // Nomes dos dias para exibição.
  const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  // Se é seg-sáb antes das 10 → hoje às 10h.
  if (t.weekday >= 1 && t.weekday <= 6 && t.hour < 10) {
    return "hoje às 10h";
  }
  // Se é seg-sex (1-5) depois das 20 → amanhã às 10h.
  if (t.weekday >= 1 && t.weekday <= 5 && t.hour >= 20) {
    const prox = (t.weekday + 1) % 7;
    return `${nomes[prox]} às 10h`;
  }
  // Sáb depois das 20 → segunda 10h.
  if (t.weekday === 6 && t.hour >= 20) {
    return "segunda às 10h";
  }
  // Domingo (0) → segunda 10h.
  if (t.weekday === 0) {
    return "segunda às 10h";
  }
  return "próximo horário útil";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuportePage() {
  const [conversas, setConversas] = useState<Conversa[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState<HorarioBR>(() => agoraSaoPaulo());
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversaAberta = useMemo<Conversa | null>(() => {
    if (!conversas) return null;
    return conversas.find((c) => c.status === "aberta") ?? null;
  }, [conversas]);

  const conversasFechadas = useMemo<Conversa[]>(() => {
    if (!conversas) return [];
    return conversas.filter((c) => c.status === "fechada");
  }, [conversas]);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/suporte");
      if (!res.ok) return;
      const data = (await res.json()) as Conversa[];
      setConversas(Array.isArray(data) ? data : []);
    } catch {
      /* silencioso — o próximo poll tenta de novo */
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Poll a cada 30s + re-poll ao voltar à aba (V-FERR-13: timers congelam em
  // background em muitos navegadores, então o visibilitychange resolve o gap).
  useEffect(() => {
    const iv = window.setInterval(carregar, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") carregar(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [carregar]);

  // Relógio BR — recalcula minuto a minuto para o banner de fora-do-horário
  // continuar coerente sem reload.
  useEffect(() => {
    const iv = window.setInterval(() => setAgora(agoraSaoPaulo()), 60_000);
    return () => window.clearInterval(iv);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversaAberta?.mensagens.length]);

  const noHorario = dentroDoHorario(agora);
  const janela = proximaJanela(agora);

  async function handleEnviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversa_id: conversaAberta?.id,
          texto: t,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(typeof data?.error === "string" ? data.error : "Não foi possível enviar. Tente novamente.");
        return;
      }
      setTexto("");
      await carregar();
    } catch {
      setErro("Não foi possível enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const carregando = conversas === null;

  return (
    <main className="max-w-3xl mx-auto px-6 sm:px-8 py-10">

      {/* Cabeçalho + posicionamento + SLA */}
      <header className="mb-6">
        <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">Ajuda</p>
        <h1 className="font-heading text-3xl text-brand-primary">Suporte</h1>
        <p className="text-zinc-600 mt-2 text-sm leading-relaxed">
          Quem responde é uma pessoa da equipe Autoria — não um robô.
        </p>
        <p className="text-zinc-500 mt-1 text-sm leading-relaxed">
          Respondemos em até 2 horas, de segunda a sábado, das 10h às 20h.
        </p>
      </header>

      {/* Banner fora-do-horário */}
      {!noHorario && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Estamos fora do horário de atendimento. Sua mensagem fica registrada e respondemos a partir de {janela}.
        </div>
      )}

      {/* Thread */}
      <section className="bg-white rounded-2xl border border-zinc-100 flex flex-col min-h-[420px] max-h-[620px] overflow-hidden">

        {carregando ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
          </div>
        ) : !conversaAberta ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <p className="text-zinc-500 text-sm leading-relaxed max-w-sm">
              Escreva sua dúvida abaixo para iniciar uma nova conversa com a equipe Autoria.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-brand p-5 space-y-4">
            {conversaAberta.mensagens.map((m) => (
              <MensagemBolha key={m.id} msg={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {/* Composer */}
        <form onSubmit={handleEnviar} className="border-t border-zinc-100 p-4 flex flex-col gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva sua mensagem…"
            maxLength={MAX_TEXTO}
            rows={3}
            disabled={enviando}
            className="w-full resize-none px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 disabled:opacity-50"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-400">{texto.length}/{MAX_TEXTO}</span>
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="px-4 py-2 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-40"
            >
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </form>
      </section>

      {/* Conversas anteriores (fechadas) */}
      {conversasFechadas.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
            Conversas anteriores
          </h2>
          <ul className="space-y-2">
            {conversasFechadas.map((c) => (
              <ConversaFechada key={c.id} conversa={c} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// ─── Bolha de mensagem ────────────────────────────────────────────────────────

function MensagemBolha({ msg }: { msg: Mensagem }) {
  const isUser = msg.autor === "usuario";
  const hora = new Date(msg.criado_em).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="max-w-[78%]">
        {!isUser && (
          <p className="text-[11px] font-medium text-zinc-500 mb-1 px-1">Equipe Autoria</p>
        )}
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
            ${isUser
              ? "bg-brand-primary text-white rounded-tr-sm"
              : "bg-zinc-50 border border-zinc-100 text-zinc-700 rounded-tl-sm"}`}
        >
          {msg.texto}
        </div>
        <p className={`text-[10px] text-zinc-400 mt-1 px-1 ${isUser ? "text-right" : ""}`}>{hora}</p>
      </div>
    </div>
  );
}

// ─── Conversa fechada (somente-leitura, expansível) ───────────────────────────

function ConversaFechada({ conversa }: { conversa: Conversa }) {
  const [aberta, setAberta] = useState(false);
  const primeira = conversa.mensagens[0];
  const data = new Date(conversa.criado_em).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="bg-white rounded-xl border border-zinc-100">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          <p className="text-xs text-zinc-400">{data}</p>
          <p className="text-sm text-zinc-700 truncate">
            {primeira?.texto ?? "(conversa sem mensagens)"}
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 shrink-0">
          {aberta ? "Ocultar" : "Ver"}
        </span>
      </button>
      {aberta && (
        <div className="border-t border-zinc-100 p-4 space-y-3">
          {conversa.mensagens.map((m) => (
            <MensagemBolha key={m.id} msg={m} />
          ))}
        </div>
      )}
    </li>
  );
}

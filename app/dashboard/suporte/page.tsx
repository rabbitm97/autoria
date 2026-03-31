"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Ticket } from "@/app/api/agentes/suporte/route";

// ─── FAQ rápido ───────────────────────────────────────────────────────────────

const FAQ = [
  "Como gerar o EPUB do meu livro?",
  "Quanto tempo leva a publicação na Amazon?",
  "Como obter um ISBN gratuito?",
  "Meu PDF ficou com formatação incorreta, o que faço?",
  "Qual plataforma paga mais royalties?",
  "Como funciona o audiolivro?",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SuportePage() {
  const [pergunta, setPergunta] = useState("");
  const [loading, setLoading] = useState(false);
  const [historico, setHistorico] = useState<Ticket[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(true);
  const [conversa, setConversa] = useState<{ role: "user" | "ia"; text: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadHistorico = useCallback(async () => {
    setLoadingHistorico(true);
    try {
      const res = await fetch("/api/agentes/suporte");
      if (res.ok) setHistorico(await res.json());
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  useEffect(() => { loadHistorico(); }, [loadHistorico]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversa]);

  async function handleEnviar(texto?: string) {
    const q = (texto ?? pergunta).trim();
    if (!q || loading) return;

    setConversa(prev => [...prev, { role: "user", text: q }]);
    setPergunta("");
    setLoading(true);

    try {
      const res = await fetch("/api/agentes/suporte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro no suporte");
      setConversa(prev => [...prev, { role: "ia", text: data.resposta }]);
      await loadHistorico();
    } catch (e) {
      setConversa(prev => [...prev, { role: "ia", text: "Desculpe, ocorreu um erro. Tente novamente ou entre em contato pelo suporte@autoria.com.br." }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolver(id: string) {
    await fetch(`/api/agentes/suporte?id=${id}`, { method: "PATCH" });
    setHistorico(prev => prev.map(t => t.id === id ? { ...t, resolvido: true } : t));
  }

  return (
    <div>

      <main className="max-w-4xl mx-auto px-8 py-10">

        <div className="mb-8">
          <p className="text-brand-gold text-sm font-medium tracking-wide uppercase mb-1">
            Ajuda
          </p>
          <h1 className="font-heading text-3xl text-brand-primary">Suporte com IA</h1>
          <p className="text-zinc-500 mt-1 text-sm leading-relaxed">
            Tire dúvidas sobre a plataforma. O assistente responde instantaneamente com base na documentação da Autoria.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">

          {/* Chat panel */}
          <div className="sm:col-span-2 flex flex-col">

            {/* Conversation */}
            <div className="bg-white rounded-2xl border border-zinc-100 flex flex-col min-h-[400px] max-h-[560px] overflow-hidden">

              {conversa.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-brand-gold/10 flex items-center justify-center mb-4">
                    <BotIcon />
                  </div>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-xs">
                    Olá! Sou o assistente da Autoria. Pergunte sobre o fluxo editorial, formatos, publicação ou royalties.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {conversa.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
                        ${msg.role === "user"
                          ? "bg-brand-primary text-brand-gold"
                          : "bg-brand-gold/10 text-brand-gold"}`}>
                        {msg.role === "user" ? "V" : "A"}
                      </div>
                      <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed
                        ${msg.role === "user"
                          ? "bg-brand-primary text-white rounded-tr-sm"
                          : "bg-zinc-50 border border-zinc-100 text-zinc-700 rounded-tl-sm"}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-brand-gold/10 flex items-center justify-center">
                        <span className="text-brand-gold text-xs font-bold">A</span>
                      </div>
                      <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-zinc-50 border border-zinc-100">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}

              {/* Input */}
              <div className="border-t border-zinc-100 p-4">
                <form onSubmit={e => { e.preventDefault(); handleEnviar(); }} className="flex gap-2">
                  <input
                    type="text"
                    value={pergunta}
                    onChange={e => setPergunta(e.target.value)}
                    placeholder="Escreva sua dúvida…"
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold/30 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={loading || !pergunta.trim()}
                    className="px-4 py-2.5 rounded-xl bg-brand-primary text-brand-gold font-medium text-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-40"
                  >
                    <SendIcon />
                  </button>
                </form>
              </div>
            </div>

            {/* FAQ chips */}
            <div className="mt-4">
              <p className="text-xs text-zinc-400 mb-2">Perguntas frequentes:</p>
              <div className="flex flex-wrap gap-2">
                {FAQ.map(q => (
                  <button
                    key={q}
                    onClick={() => handleEnviar(q)}
                    disabled={loading}
                    className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 bg-white text-zinc-600 hover:border-brand-gold/40 hover:text-brand-primary transition-colors disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* History sidebar */}
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Histórico</p>
            {loadingHistorico ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 rounded-full border-2 border-brand-gold border-t-transparent animate-spin" />
              </div>
            ) : historico.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">Nenhuma conversa ainda.</p>
            ) : (
              <div className="space-y-2">
                {historico.map(t => (
                  <div key={t.id} className={`bg-white rounded-xl border p-4 text-xs
                    ${t.resolvido ? "border-zinc-100 opacity-60" : "border-zinc-200"}`}>
                    <p className="font-medium text-zinc-700 leading-snug mb-1 line-clamp-2">{t.pergunta}</p>
                    {t.resposta_ia && (
                      <p className="text-zinc-400 line-clamp-2 mb-2">{t.resposta_ia}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium
                        ${t.resolvido
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-amber-50 text-amber-600"}`}>
                        {t.resolvido ? "Resolvido" : "Aberto"}
                      </span>
                      {!t.resolvido && (
                        <button
                          onClick={() => handleResolver(t.id)}
                          className="text-zinc-400 hover:text-emerald-600 transition-colors text-[10px] underline underline-offset-2"
                        >
                          Marcar resolvido
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 bg-zinc-50 rounded-xl border border-zinc-100 p-4">
              <p className="text-xs font-medium text-zinc-500 mb-1">Suporte humano</p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Questões não resolvidas:{" "}
                <a href="mailto:suporte@autoria.com.br" className="text-brand-gold hover:underline">
                  suporte@autoria.com.br
                </a>
                <br />SLA: 24h (Pro: 4h úteis)
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BotIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="text-brand-gold">
      <rect x="3" y="11" width="18" height="10" rx="2"/>
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v4"/>
      <line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

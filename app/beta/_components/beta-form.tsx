"use client";

// REC-1 · Formulário curto de inscrição no beta.
//
// 5 campos: nome, e-mail, manuscrito_status (select), sobre_livro (opcional),
// como_soube (opcional). Campo `website` é honeypot — escondido a olho e a
// leitor de tela; bot preenche e a rota devolve 200 silencioso.

import Link from "next/link";
import { useState, type FormEvent } from "react";

type ManuscritoStatus = "" | "concluido" | "em_revisao" | "escrevendo";

export default function BetaForm() {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [manuscritoStatus, setManuscritoStatus] = useState<ManuscritoStatus>("");
  const [sobreLivro, setSobreLivro] = useState("");
  const [comoSoube, setComoSoube] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [jaInscrito, setJaInscrito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);

    try {
      const res = await fetch("/api/beta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email,
          manuscrito_status: manuscritoStatus,
          sobre_livro: sobreLivro || undefined,
          como_soube: comoSoube || undefined,
          website,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        ja_inscrito?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setErro(data.error || "Não foi possível enviar sua inscrição. Tente novamente.");
        return;
      }

      setSucesso(true);
      setJaInscrito(!!data.ja_inscrito);
    } catch {
      setErro("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm">
        <p className="font-semibold text-emerald-900">
          {jaInscrito ? "Você já está inscrito." : "Inscrição recebida!"}
        </p>
        <p className="mt-2 text-emerald-800/85 leading-relaxed">
          {jaInscrito
            ? "Sua inscrição já está com a gente — a resposta vem por e-mail."
            : "Vamos te responder pessoalmente por e-mail — fica de olho na caixa de entrada (e no spam). Quem escreve é o fundador."}
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-brand-primary/15 bg-white px-3.5 py-2.5 text-brand-primary placeholder:text-brand-primary/40 focus:outline-none focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/10 transition-colors";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Honeypot: escondido a olho e a leitor de tela */}
      <div className="hidden" aria-hidden="true">
        <label>
          Não preencha este campo
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-brand-primary/80">Nome completo</span>
        <input
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-brand-primary/80">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className={inputCls}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-brand-primary/80">
          Como está o seu manuscrito?
        </span>
        <select
          value={manuscritoStatus}
          onChange={(e) => setManuscritoStatus(e.target.value as ManuscritoStatus)}
          required
          className={inputCls}
        >
          <option value="" disabled>
            Selecione uma opção
          </option>
          <option value="concluido">Concluído (pronto para revisão/publicação)</option>
          <option value="em_revisao">Em revisão</option>
          <option value="escrevendo">Ainda escrevendo</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-brand-primary/80">
          Conte um pouco sobre o livro <span className="text-brand-primary/40">(opcional)</span>
        </span>
        <textarea
          value={sobreLivro}
          onChange={(e) => setSobreLivro(e.target.value)}
          maxLength={2000}
          rows={4}
          className={inputCls}
          placeholder="Gênero, tema, tamanho aproximado… o que você quiser contar."
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-brand-primary/80">
          Como você soube da Autoria? <span className="text-brand-primary/40">(opcional)</span>
        </span>
        <input
          type="text"
          value={comoSoube}
          onChange={(e) => setComoSoube(e.target.value)}
          maxLength={500}
          className={inputCls}
        />
      </label>

      {erro && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </div>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 bg-brand-gold text-brand-primary text-sm font-bold px-6 py-3 rounded-lg hover:bg-brand-gold-light active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all tracking-wide"
      >
        {enviando ? "Enviando…" : "Quero entrar no beta"}
      </button>

      <p className="text-xs text-brand-primary/50 leading-relaxed">
        Ao se inscrever, você concorda com nossos{" "}
        <Link href="/termos" className="underline underline-offset-2 hover:text-brand-primary transition-colors">
          Termos
        </Link>{" "}
        e{" "}
        <Link href="/privacidade" className="underline underline-offset-2 hover:text-brand-primary transition-colors">
          Política de Privacidade
        </Link>
        . Sem spam — a gente só te responde pessoalmente.
      </p>
    </form>
  );
}

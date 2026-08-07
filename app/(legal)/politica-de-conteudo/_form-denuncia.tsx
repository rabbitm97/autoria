"use client";

// LEGAL-1D — Formulário público de notificação. Cliente do POST /api/denuncia.
// Honeypot no campo `website` (aria-hidden, off-tab). Após sucesso, exibe o
// protocolo em destaque; via alternativa por e-mail continua visível no topo
// da seção (já renderizada pela page.tsx).

import { useState } from "react";

const VINCULOS = [
  { value: "titular", label: "Sou titular do direito" },
  { value: "representante", label: "Represento o titular" },
  { value: "terceiro", label: "Sou terceiro interessado" },
  { value: "autoridade", label: "Sou autoridade pública" },
] as const;

const FUNDAMENTOS = [
  { value: "direito_autoral", label: "Direito autoral" },
  { value: "imagem_honra", label: "Imagem, honra ou nome" },
  { value: "dados_pessoais", label: "Dados pessoais" },
  { value: "ilicito", label: "Conteúdo ilícito" },
  { value: "outro", label: "Outro" },
] as const;

type Estado =
  | { fase: "editando"; erro: string | null }
  | { fase: "enviando" }
  | { fase: "ok"; protocolo: string };

export default function FormDenuncia() {
  const [estado, setEstado] = useState<Estado>({ fase: "editando", erro: null });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado({ fase: "enviando" });
    const fd = new FormData(e.currentTarget);
    const body = {
      nome: String(fd.get("nome") ?? ""),
      email: String(fd.get("email") ?? ""),
      vinculo: String(fd.get("vinculo") ?? ""),
      obraRef: String(fd.get("obraRef") ?? ""),
      fundamento: String(fd.get("fundamento") ?? ""),
      trecho: String(fd.get("trecho") ?? ""),
      descricao: String(fd.get("descricao") ?? ""),
      provaUrl: String(fd.get("provaUrl") ?? "").trim() || null,
      declaracaoBoaFe: fd.get("declaracaoBoaFe") === "on",
      website: String(fd.get("website") ?? ""),
    };

    try {
      const res = await fetch("/api/denuncia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { protocolo?: string; error?: string } | null;
      if (!res.ok) {
        setEstado({ fase: "editando", erro: data?.error ?? `Erro ${res.status}` });
        return;
      }
      if (!data?.protocolo) {
        setEstado({ fase: "editando", erro: "Resposta inválida do servidor." });
        return;
      }
      setEstado({ fase: "ok", protocolo: data.protocolo });
    } catch {
      setEstado({ fase: "editando", erro: "Falha de rede. Tente novamente." });
    }
  }

  if (estado.fase === "ok") {
    return (
      <div id="notificar" className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800 mb-2">
          Notificação recebida
        </p>
        <p className="text-sm text-emerald-900 mb-3">
          Guarde este protocolo. Confirmaremos o recebimento em até 2 dias úteis e a
          decisão em até 5 dias úteis.
        </p>
        <div className="mt-2 inline-block rounded-lg bg-white border border-emerald-300 px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-emerald-700 mb-1">Protocolo</p>
          <p className="font-mono text-lg text-brand-primary">{estado.protocolo}</p>
        </div>
      </div>
    );
  }

  const enviando = estado.fase === "enviando";
  const erro = estado.fase === "editando" ? estado.erro : null;

  return (
    <form
      id="notificar"
      onSubmit={handleSubmit}
      className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 space-y-4"
      noValidate
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-primary mb-1">
          Notificar pelo formulário
        </p>
        <p className="text-sm text-zinc-600">
          Todos os campos com <span className="text-brand-primary">*</span> são obrigatórios.
        </p>
      </div>

      {/* Honeypot: campo oculto para bots preencherem. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Deixe em branco
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">Nome completo *</span>
          <input
            name="nome"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">E-mail *</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-zinc-700">Sua relação com o caso *</span>
        <select
          name="vinculo"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary bg-white"
        >
          <option value="" disabled>Selecione…</option>
          {VINCULOS.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-700">Obra notificada *</span>
        <input
          name="obraRef"
          required
          placeholder="Título, link ou identificador"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-700">Fundamento *</span>
        <select
          name="fundamento"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary bg-white"
        >
          <option value="" disabled>Selecione…</option>
          {FUNDAMENTOS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-700">
          Onde está, especificamente *
        </span>
        <textarea
          name="trecho"
          required
          minLength={20}
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          Indique página, capítulo ou trecho. Notificação genérica não permite análise.
        </span>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-700">
          Descrição do que é ilícito e por quê *
        </span>
        <textarea
          name="descricao"
          required
          rows={4}
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-zinc-700">
          Link para prova (opcional)
        </span>
        <input
          name="provaUrl"
          type="url"
          placeholder="Ex.: registro de titularidade"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:border-brand-primary"
        />
      </label>

      <label className="flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 cursor-pointer select-none">
        <input
          name="declaracaoBoaFe"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-brand-gold accent-brand-gold focus:ring-2 focus:ring-brand-gold/40"
        />
        <span className="text-sm text-zinc-700 leading-relaxed">
          Declaro, de boa-fé, que as informações são verdadeiras e estou ciente de que
          notificação falsa gera responsabilização.
        </span>
      </label>

      {erro && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
          {erro}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs text-zinc-500">
          Envio anônimo não é possível — precisamos poder responder.
        </p>
        <button
          type="submit"
          disabled={enviando}
          className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enviando ? "Enviando…" : "Enviar notificação"}
        </button>
      </div>
    </form>
  );
}

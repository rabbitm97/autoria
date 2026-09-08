// Helper minimalista de envio de e-mail via Resend HTTP API.
//
// Não importa o SDK `resend` (não instalado); usa fetch direto contra
// https://api.resend.com/emails. Se `RESEND_API_KEY` não estiver
// configurada, apenas loga e retorna — falha de e-mail NUNCA pode
// impedir a operação principal (ex.: gravação de content_reports).

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Autoria <notificacoes@useautoria.com>";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
};

// ─── SUP-1 · Template: resposta da equipe ao autor ───────────────────────────
// Corpo curto + link para a tela de suporte. O disparo em si é do SUP-2 (rota
// de resposta do admin). Definido aqui para manter o template versionado junto
// com a lib de envio e evitar strings soltas na rota do inbox.

export function buildRespostaSuporteEmail(input: {
  nomeAutor?: string | null;
}): { subject: string; text: string } {
  const nome = input.nomeAutor?.trim() || "";
  const saudacao = nome ? `Olá, ${nome}!` : "Olá!";
  return {
    subject: "Você recebeu uma resposta da equipe Autoria",
    text:
      `${saudacao}\n\n` +
      `A equipe da Autoria respondeu à sua mensagem no suporte.\n\n` +
      `Abra sua conversa: https://useautoria.com/dashboard/suporte\n\n` +
      `— Equipe Autoria`,
  };
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY ausente — envio ignorado.", {
      to: input.to,
      subject: input.subject,
    });
    return { ok: false, error: "RESEND_API_KEY ausente" };
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        from: input.from ?? DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] envio falhou", res.status, body.slice(0, 200));
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error("[email] exceção:", err instanceof Error ? err.message : err);
    return { ok: false, error: "exceção" };
  }
}

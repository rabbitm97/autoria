-- =============================================================================
-- FERR-3.0b — idempotência do aviso de expiração (decisão 6.5, 31/ago).
-- aviso_expiracao_em: carimbo de quando o e-mail "expira em 7 dias" foi
-- enviado. NULL = nunca enviado. O cron só envia quando NULL.
-- Idempotente. SQL manual no Studio — nunca supabase db push.
-- =============================================================================
BEGIN;

ALTER TABLE public.ferramenta_jobs
  ADD COLUMN IF NOT EXISTS aviso_expiracao_em timestamptz;

COMMENT ON COLUMN public.ferramenta_jobs.aviso_expiracao_em IS
  'FERR-3.0b — enviado o e-mail de "expira em 7 dias" (Resend). NULL = pendente.';

COMMIT;

NOTIFY pgrst, 'reload schema';

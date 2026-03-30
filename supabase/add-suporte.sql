-- Migration: tabela de tickets de suporte
-- Rodar no Supabase: Dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS public.tickets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id      uuid        REFERENCES public.projects(id) ON DELETE SET NULL,
  pergunta        text        NOT NULL,
  resposta_ia     text,
  resolvido       boolean     NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets: acesso próprio" ON public.tickets;
CREATE POLICY "tickets: acesso próprio"
  ON public.tickets FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tickets_user      ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_resolvido ON public.tickets(resolvido);

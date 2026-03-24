-- =============================================================
-- Autoria — Tabela: waitlist
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Recria a tabela (idempotente)
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- Limpa políticas antigas para evitar conflito
DROP POLICY IF EXISTS "waitlist: insert público"    ON public.waitlist;
DROP POLICY IF EXISTS "waitlist: leitura restrita"  ON public.waitlist;

-- RLS desativado: tabela pública de landing page (sem dados sensíveis)
-- Leitura da lista pelo admin via Supabase Dashboard ou service_role key
ALTER TABLE public.waitlist DISABLE ROW LEVEL SECURITY;

GRANT USAGE  ON SCHEMA public   TO anon;
GRANT INSERT ON public.waitlist TO anon;

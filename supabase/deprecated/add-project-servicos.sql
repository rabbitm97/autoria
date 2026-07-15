-- =============================================================
-- Autoria — Seleção de serviços por projeto
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS usar_revisao boolean NOT NULL DEFAULT true;

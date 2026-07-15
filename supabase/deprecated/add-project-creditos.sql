-- =============================================================
-- Autoria — Migration: saldo de créditos por projeto
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Créditos disponíveis no projeto (consumidos por operações como
-- regenerar capa com IA). Projetos Pro iniciam com 100 créditos.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS creditos integer NOT NULL DEFAULT 100;

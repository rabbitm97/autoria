-- =============================================================
-- Autoria — Migration: coluna diagnostico em projects
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS diagnostico jsonb;

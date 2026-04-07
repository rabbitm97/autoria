-- =============================================================
-- Autoria — Migration: coluna dados_miolo
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Resultado do agente de diagramação do miolo (interior do livro)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_miolo jsonb;

-- =============================================================
-- Autoria — Migration: coluna dados_creditos
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Resultado do agente de página de créditos (verso da folha de rosto)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_creditos jsonb;

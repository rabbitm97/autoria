-- =============================================================
-- Autoria — Migration: colunas adicionais
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Caminho do arquivo no Supabase Storage
ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS storage_path text;

-- Resultado do agente de revisão
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_revisao jsonb;

-- Resultado do agente de elementos editoriais
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_elementos jsonb;

-- Migration: adiciona colunas de capa ao projeto
-- Rodar no Supabase: Dashboard → SQL Editor → New query

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_capa jsonb;
-- dados_capa = { prompt_usado, url_preview, url_cmyk, opcoes: [{url, seed}] }

-- =============================================================
-- Autoria — Metadados editoriais no manuscrito
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS titulo               text,
  ADD COLUMN IF NOT EXISTS subtitulo            text,
  ADD COLUMN IF NOT EXISTS genero_principal     text,
  ADD COLUMN IF NOT EXISTS genero_sub           text,
  ADD COLUMN IF NOT EXISTS genero_detalhe       text,
  ADD COLUMN IF NOT EXISTS autor_titulo         text,
  ADD COLUMN IF NOT EXISTS autor_primeiro_nome  text,
  ADD COLUMN IF NOT EXISTS autor_nome_meio      text,
  ADD COLUMN IF NOT EXISTS autor_sobrenome      text,
  ADD COLUMN IF NOT EXISTS coautores            jsonb NOT NULL DEFAULT '[]';

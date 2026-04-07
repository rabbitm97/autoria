-- =============================================================
-- Autoria — Migration: texto_revisado no manuscripts
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Texto com revisões aceitas pelo autor (gerado em prova-revisao).
-- Usado pela Diagramação em vez do texto original quando presente.
-- Limpo automaticamente se o autor fizer novo upload de manuscrito.
ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS texto_revisado text;

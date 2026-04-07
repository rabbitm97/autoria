-- =============================================================
-- Autoria — Migration: permite HTML no bucket manuscripts
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- Os agentes prova-revisao e creditos fazem upload de arquivos .html
-- para o bucket manuscripts. É necessário adicionar o MIME type.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'text/html')
WHERE id = 'manuscripts'
  AND NOT ('text/html' = ANY(allowed_mime_types));

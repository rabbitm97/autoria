-- Migration: bucket para PDFs/EPUBs gerados + coluna dados_pdf
-- Rodar no Supabase: Dashboard → SQL Editor → New query

-- Bucket privado (download via URL assinada)
INSERT INTO storage.buckets (id, name, public)
VALUES ('livros', 'livros', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "livros: upload autenticado" ON storage.objects;
CREATE POLICY "livros: upload autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'livros' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "livros: leitura própria" ON storage.objects;
CREATE POLICY "livros: leitura própria"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'livros' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Coluna para metadados do PDF/EPUB gerado
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_pdf jsonb;
-- dados_pdf = { formato, storage_path, url_download, paginas, gerado_em }

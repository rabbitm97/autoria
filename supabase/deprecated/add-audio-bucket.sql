-- Migration: bucket privado para audiolivros + coluna dados_audio
-- Rodar no Supabase: Dashboard → SQL Editor → New query

INSERT INTO storage.buckets (id, name, public)
VALUES ('audiolivros', 'audiolivros', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "audiolivros: upload autenticado" ON storage.objects;
CREATE POLICY "audiolivros: upload autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audiolivros' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "audiolivros: leitura própria" ON storage.objects;
CREATE POLICY "audiolivros: leitura própria"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audiolivros' AND auth.uid()::text = (storage.foldername(name))[1]);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_audio jsonb;
-- dados_audio = { capitulos: [{titulo, storage_path, url, caracteres, gerado_em}] }

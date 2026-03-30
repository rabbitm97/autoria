-- Migration: cria bucket público para capas geradas por IA
-- Rodar no Supabase: Dashboard → SQL Editor → New query

INSERT INTO storage.buckets (id, name, public)
VALUES ('capas', 'capas', true)
ON CONFLICT (id) DO NOTHING;

-- Permite upload autenticado
DROP POLICY IF EXISTS "capas: upload autenticado" ON storage.objects;
CREATE POLICY "capas: upload autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'capas' AND auth.role() = 'authenticated');

-- Permite leitura pública
DROP POLICY IF EXISTS "capas: leitura pública" ON storage.objects;
CREATE POLICY "capas: leitura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'capas');

-- Permite deleção pelo próprio usuário
DROP POLICY IF EXISTS "capas: deleção própria" ON storage.objects;
CREATE POLICY "capas: deleção própria"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'capas' AND auth.uid()::text = (storage.foldername(name))[1]);

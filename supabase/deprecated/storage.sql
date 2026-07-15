-- =============================================================
-- Autoria — Storage: bucket 'manuscripts'
-- Rodar no Supabase: Dashboard → SQL Editor → New query
--
-- Convenção de path: manuscripts/{user_id}/{filename}
-- Exemplo: manuscripts/abc-123/meu-livro.docx
-- =============================================================

-- -------------------------------------------------------------
-- 1. Criar o bucket (idempotente)
-- -------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manuscripts',
  'manuscripts',
  false,                          -- privado: sem URL pública
  52428800,                       -- limite: 50 MB por arquivo
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
    'application/msword',         -- .doc
    'text/plain'                  -- .txt
  ]
)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------
-- 2. Limpa políticas antigas (evita conflito em re-execução)
-- -------------------------------------------------------------
DROP POLICY IF EXISTS "manuscripts: leitura própria"   ON storage.objects;
DROP POLICY IF EXISTS "manuscripts: upload próprio"    ON storage.objects;
DROP POLICY IF EXISTS "manuscripts: atualização própria" ON storage.objects;
DROP POLICY IF EXISTS "manuscripts: exclusão própria"  ON storage.objects;

-- -------------------------------------------------------------
-- 3. Políticas RLS — cada usuário acessa apenas sua pasta
--
-- storage.foldername(name) retorna os segmentos do path:
--   'manuscripts/abc-123/livro.docx' → ARRAY['manuscripts','abc-123','livro.docx']
--   [1] = bucket, [2] = user_id, [3] = arquivo
-- -------------------------------------------------------------

-- SELECT: lê arquivos da própria pasta
CREATE POLICY "manuscripts: leitura própria"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'manuscripts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: faz upload apenas para a própria pasta
CREATE POLICY "manuscripts: upload próprio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'manuscripts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: atualiza metadata de arquivos próprios
CREATE POLICY "manuscripts: atualização própria"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'manuscripts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: remove apenas arquivos próprios
CREATE POLICY "manuscripts: exclusão própria"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'manuscripts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

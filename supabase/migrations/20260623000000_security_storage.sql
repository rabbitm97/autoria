-- ─────────────────────────────────────────────────────────────────────────────
-- Bloco 3 — Segurança Storage
--
-- 1. Path check no INSERT dos buckets capas, audiolivros, livros (já existe em
--    manuscripts e editor-assets). Sem isso, autenticado pode escrever em pasta
--    de outro user.
-- 2. Policy DELETE em audiolivros e livros (já existe em capas e manuscripts).
-- 3. file_size_limit + allowed_mime_types nos 4 buckets que estão null/null.
-- 4. Versionamento do bucket editor-assets (criado no Studio em maio/2026).
--
-- IMPORTANTE: rodar idempotente. Todas as policies usam DROP IF EXISTS +
-- CREATE, e os buckets usam INSERT ... ON CONFLICT DO NOTHING.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. capas: INSERT com path check (substitui policy permissiva)
DROP POLICY IF EXISTS "capas: upload autenticado" ON storage.objects;
DROP POLICY IF EXISTS "capas: upload próprio"     ON storage.objects;
CREATE POLICY "capas: upload próprio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'capas'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 2. audiolivros: INSERT com path check (substitui policy permissiva)
DROP POLICY IF EXISTS "audiolivros: upload autenticado" ON storage.objects;
DROP POLICY IF EXISTS "audiolivros: upload próprio"     ON storage.objects;
CREATE POLICY "audiolivros: upload próprio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'audiolivros'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 3. livros: INSERT com path check (substitui policy permissiva)
DROP POLICY IF EXISTS "livros: upload autenticado" ON storage.objects;
DROP POLICY IF EXISTS "livros: upload próprio"     ON storage.objects;
CREATE POLICY "livros: upload próprio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'livros'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 4. audiolivros: DELETE policy (não existia)
DROP POLICY IF EXISTS "audiolivros: deleção própria" ON storage.objects;
CREATE POLICY "audiolivros: deleção própria"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'audiolivros'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 5. livros: DELETE policy (não existia)
DROP POLICY IF EXISTS "livros: deleção própria" ON storage.objects;
CREATE POLICY "livros: deleção própria"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'livros'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- 6. Limites de tamanho e mime nos 4 buckets sem proteção
-- manuscripts: textos longos podem chegar a ~30MB em PDF escaneado; 50MB acomoda.
-- Aceita .docx, .pdf, .txt e .epub (último para autor reimportar livro existente).
UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50 MB
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/epub+zip'
    ]
WHERE id = 'manuscripts';

-- capas: PNG de capa panorâmica em 300 DPI fica em torno de 5-15MB. 20MB de margem.
UPDATE storage.buckets
SET file_size_limit = 20971520,  -- 20 MB
    allowed_mime_types = ARRAY[
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
WHERE id = 'capas';

-- audiolivros: capítulo longo de 60min em MP3 192kbps ~85MB. 100MB acomoda.
UPDATE storage.buckets
SET file_size_limit = 104857600,  -- 100 MB
    allowed_mime_types = ARRAY[
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a'
    ]
WHERE id = 'audiolivros';

-- livros: PDF ou EPUB final, raramente passa de 30MB.
UPDATE storage.buckets
SET file_size_limit = 52428800,  -- 50 MB
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/epub+zip'
    ]
WHERE id = 'livros';

-- 7. Versionar bucket editor-assets (já existe em produção desde 27/maio/2026,
-- criado manualmente no Studio — sem SQL versionado até agora). As 4 policies
-- já existem no banco com nomes "users delete own assets rdczj7_*"; aqui só
-- garantimos que o bucket é provisionado com a configuração correta caso seja
-- recriado em ambiente novo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'editor-assets',
  'editor-assets',
  false,
  52428800,  -- 50 MB
  ARRAY['image/png','image/jpeg','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

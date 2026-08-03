-- ─────────────────────────────────────────────────────────────────────────────
-- Hotfix pós-Bloco 3: bucket `manuscripts` precisa aceitar `text/html` para
-- armazenar HTMLs intermediários gerados por:
--   - app/api/agentes/miolo/route.ts (HTML do miolo final)
--   - app/api/agentes/creditos/route.ts (HTML dos créditos)
--   - app/api/agentes/prova-revisao/route.ts (HTML da prova revisão)
--
-- Sem isso, todas essas rotas retornam 500 ("Erro ao salvar o miolo gerado.").
-- Service role bypassa RLS, mas NÃO bypassa restrições de mime type do bucket.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/epub+zip',
  'text/html'
]
WHERE id = 'manuscripts';

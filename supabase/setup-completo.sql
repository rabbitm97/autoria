-- =============================================================
-- Autoria — Setup completo (idempotente)
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- Seguro para rodar múltiplas vezes — usa IF NOT EXISTS em tudo
-- =============================================================

-- ── manuscripts ───────────────────────────────────────────────
ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS storage_path       text,
  ADD COLUMN IF NOT EXISTS titulo             text,
  ADD COLUMN IF NOT EXISTS subtitulo          text,
  ADD COLUMN IF NOT EXISTS genero_principal   text,
  ADD COLUMN IF NOT EXISTS genero_sub         text,
  ADD COLUMN IF NOT EXISTS genero_detalhe     text,
  ADD COLUMN IF NOT EXISTS autor_titulo       text,
  ADD COLUMN IF NOT EXISTS autor_primeiro_nome text,
  ADD COLUMN IF NOT EXISTS autor_nome_meio    text,
  ADD COLUMN IF NOT EXISTS autor_sobrenome    text,
  ADD COLUMN IF NOT EXISTS coautores          jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS texto_revisado     text;

-- ── projects ──────────────────────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS diagnostico        jsonb,
  ADD COLUMN IF NOT EXISTS dados_revisao      jsonb,
  ADD COLUMN IF NOT EXISTS dados_elementos    jsonb,
  ADD COLUMN IF NOT EXISTS dados_capa         jsonb,
  ADD COLUMN IF NOT EXISTS dados_miolo        jsonb,
  ADD COLUMN IF NOT EXISTS dados_creditos     jsonb,
  ADD COLUMN IF NOT EXISTS dados_qa           jsonb,
  ADD COLUMN IF NOT EXISTS usar_revisao       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS creditos           integer NOT NULL DEFAULT 100;

-- ── etapa_atual: garantir que todos os valores existem no CHECK ──
-- Remove e recria a constraint com todos os valores necessários
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_etapa_atual_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_etapa_atual_check
  CHECK (etapa_atual IN (
    'upload', 'diagnostico', 'revisao', 'elementos',
    'capa', 'creditos', 'diagramacao', 'qa', 'publicado'
  ));

-- ── Storage: buckets ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('capas', 'capas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'manuscripts', 'manuscripts', false, 52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'text/html'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Adiciona text/html ao bucket manuscripts se já existir sem ele
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'text/html')
WHERE id = 'manuscripts'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('text/html' = ANY(allowed_mime_types));

INSERT INTO storage.buckets (id, name, public)
VALUES ('audiolivros', 'audiolivros', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('livros', 'livros', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage: políticas manuscripts ────────────────────────────
DROP POLICY IF EXISTS "manuscripts: leitura própria"     ON storage.objects;
DROP POLICY IF EXISTS "manuscripts: upload próprio"      ON storage.objects;
DROP POLICY IF EXISTS "manuscripts: atualização própria" ON storage.objects;
DROP POLICY IF EXISTS "manuscripts: exclusão própria"    ON storage.objects;

CREATE POLICY "manuscripts: leitura própria"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "manuscripts: upload próprio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "manuscripts: atualização própria"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "manuscripts: exclusão própria"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Storage: políticas capas ───────────────────────────────────
DROP POLICY IF EXISTS "capas: upload autenticado" ON storage.objects;
DROP POLICY IF EXISTS "capas: leitura pública"    ON storage.objects;
DROP POLICY IF EXISTS "capas: deleção própria"    ON storage.objects;

CREATE POLICY "capas: upload autenticado"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'capas' AND auth.role() = 'authenticated');

CREATE POLICY "capas: leitura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'capas');

CREATE POLICY "capas: deleção própria"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'capas' AND auth.uid()::text = (storage.foldername(name))[1]);

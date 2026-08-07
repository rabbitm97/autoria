-- =============================================================================
-- BLOCO LEGAL-1C — Aceites legais versionados (probatório)
-- 4ª migration incremental pós-baseline (20260714000000).
-- Idempotente. NÃO usar supabase db push — rodar via SQL Editor do Studio.
-- Após aplicar, NOTIFY pgrst 'reload schema' já vai no fim.
--
-- Verdade 40 (regra de versionamento):
--   Alterar o texto de qualquer documento legal exige bump de `versao` em
--   `lib/legal-docs.ts`. Aceites antigos NUNCA são migrados/reescritos —
--   eles ficam presos à `versao` e `conteudoHash` vigentes no momento em
--   que o usuário clicou. Por isso esta tabela é APPEND-ONLY: triggers
--   BEFORE UPDATE e BEFORE DELETE levantam exceção para qualquer papel,
--   inclusive service_role. Correções de dados exigem intervenção no
--   Studio explicitamente desabilitando o trigger.
--
-- Colunas nullable (user_id, project_id):
--   user_id ON DELETE SET NULL para preservar registros probatórios se a
--   conta for apagada; o snapshot em `user_email` mantém a rastreabilidade
--   humana. project_id fica NULL quando o aceite não é ligado a projeto
--   (ex.: contexto = 'cadastro').
--
-- Escritas legítimas: exclusivamente via POST /api/legal/aceite (Node
-- runtime, service_role). RLS bloqueia inserts de authenticated/anon.
-- =============================================================================

BEGIN;

-- ── 1. Tabela append-only de aceites ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email   text        NOT NULL,
  project_id   uuid        REFERENCES public.projects(id) ON DELETE SET NULL,
  doc_slug     text        NOT NULL,
  doc_versao   text        NOT NULL,
  doc_hash     text        NOT NULL,
  contexto     text        NOT NULL,
  artefato_ref text,
  ip           text,
  user_agent   text,
  aceito_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_acceptances_contexto_ck
    CHECK (contexto IN ('cadastro', 'upload', 'checkout', 'prova'))
);

COMMENT ON TABLE public.legal_acceptances IS
  'LEGAL-1C — Aceites legais versionados. APPEND-ONLY (ver triggers). '
  'Escritas só via service_role (POST /api/legal/aceite). '
  'user_id fica NULL se a conta for deletada; user_email preserva o snapshot.';

-- ── 2. Índices para consulta ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS legal_acceptances_user_slug_at_idx
  ON public.legal_acceptances (user_id, doc_slug, aceito_em DESC);
CREATE INDEX IF NOT EXISTS legal_acceptances_project_slug_idx
  ON public.legal_acceptances (project_id, doc_slug);
CREATE INDEX IF NOT EXISTS legal_acceptances_email_idx
  ON public.legal_acceptances (user_email);

-- ── 3. RLS: leitura só do próprio usuário; escrita 100% via service_role ────
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_acceptances: leitura própria"
  ON public.legal_acceptances;
CREATE POLICY "legal_acceptances: leitura própria"
  ON public.legal_acceptances
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE: sem policy → só service_role passa (bypass de RLS).
-- Não criar policies aqui de propósito.

-- ── 4. Append-only: bloquear UPDATE e DELETE para TODOS ─────────────────────
-- Diferente de outros triggers no repo, este NÃO consulta
-- autoria_chamada_privilegiada — o requisito é que nem service_role
-- reescreva aceites. Correção de dados exige DISABLE TRIGGER explícito no
-- Studio, sinalizando intenção.
CREATE OR REPLACE FUNCTION public.block_legal_acceptance_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'legal_acceptances é append-only (UPDATE bloqueado)'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal_acceptances é append-only (DELETE bloqueado)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_legal_acceptance_update
  ON public.legal_acceptances;
CREATE TRIGGER trg_block_legal_acceptance_update
  BEFORE UPDATE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.block_legal_acceptance_mutation();

DROP TRIGGER IF EXISTS trg_block_legal_acceptance_delete
  ON public.legal_acceptances;
CREATE TRIGGER trg_block_legal_acceptance_delete
  BEFORE DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.block_legal_acceptance_mutation();

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- FERR-3.0a — Fundação das ferramentas avulsas (ESTRUTURA-v2, 31/ago/2026)
--
--   projects.origem   → 'esteira' | 'ferramenta'. O projeto-sombra da
--                       ferramenta é invisível no dashboard e apagado ao
--                       concluir o job.
--   ferramenta_jobs   → registro que o autor vê: 1 linha por uso de
--                       ferramenta, entregáveis no bucket `ferramentas`,
--                       expira em 90 dias após o débito/conclusão.
--   bucket ferramentas→ cofre privado dos entregáveis (cópia; nunca
--                       aponta para buckets do sombra).
--
-- Sem FK em projeto_sombra_id (Verdade 42): o sombra é APAGADO na
-- conclusão; uma FK travaria o DELETE. Integridade nas rotas.
-- RLS: SELECT próprio para o autor; escrita só service_role (via
-- lib/ferramenta-jobs.ts).
--
-- Idempotente. SQL manual no Studio — nunca supabase db push.
-- =============================================================================

BEGIN;

-- 1. projects.origem ----------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'esteira';

DO $$ BEGIN
  ALTER TABLE public.projects
    ADD CONSTRAINT projects_origem_ck CHECK (origem IN ('esteira','ferramenta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.projects.origem IS
  'FERR-3.0a — esteira (default) ou ferramenta (projeto-sombra de job '
  'avulso; oculto no dashboard, apagado ao concluir o job).';

-- 2. ferramenta_jobs ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ferramenta_jobs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ferramenta_id     text        NOT NULL,
  estado            text        NOT NULL DEFAULT 'iniciado',
  projeto_sombra_id uuid,
  entrada           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  custo_creditos    integer     NOT NULL DEFAULT 0,
  debitado_em       timestamptz,
  estornado_em      timestamptz,
  entregaveis       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  concluido_em      timestamptz,
  expira_em         timestamptz,
  CONSTRAINT ferramenta_jobs_estado_ck CHECK (
    estado IN ('iniciado','aguardando_autor','processando','concluido',
               'falhou','expirado','cancelado')
  )
);

CREATE INDEX IF NOT EXISTS ferramenta_jobs_user_estado_idx
  ON public.ferramenta_jobs (user_id, estado, criado_em DESC);
CREATE INDEX IF NOT EXISTS ferramenta_jobs_expira_idx
  ON public.ferramenta_jobs (expira_em)
  WHERE expira_em IS NOT NULL;

COMMENT ON TABLE public.ferramenta_jobs IS
  'FERR-3.0a — 1 linha por uso de ferramenta avulsa. Entregáveis no '
  'bucket ferramentas/{user_id}/{job_id}/. expira_em = debitado_em + 90d '
  '(relógio único, martelada 31/ago). Escrita EXCLUSIVA via '
  'lib/ferramenta-jobs.ts (service_role); autor só lê (RLS).';

-- 3. RLS ----------------------------------------------------------------------
ALTER TABLE public.ferramenta_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ferramenta_jobs: leitura própria" ON public.ferramenta_jobs;
CREATE POLICY "ferramenta_jobs: leitura própria"
  ON public.ferramenta_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
-- Sem policies de escrita: INSERT/UPDATE/DELETE só via service_role.

-- 4. Bucket do cofre ----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('ferramentas', 'ferramentas', false)
ON CONFLICT (id) DO NOTHING;
-- Sem policies em storage.objects para este bucket: acesso só via
-- service_role (signed URLs geradas server-side).

COMMIT;

NOTIFY pgrst, 'reload schema';

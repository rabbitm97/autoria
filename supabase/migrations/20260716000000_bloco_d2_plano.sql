-- =============================================================================
-- BLOCO D.2 — Alinhamento de plano ao modelo de negócio (item #19)
-- Vocabulário novo: freemium / essencial / pro (CONTEXTO §2).
-- 1ª migration incremental pós-baseline canônico (20260714000000).
-- Idempotente. NÃO usar supabase db push — rodar via SQL Editor do Studio.
-- =============================================================================

BEGIN;

-- 1. Derrubar constraints antigas para permitir o remapeamento
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_plano_check;
ALTER TABLE public.users    DROP CONSTRAINT IF EXISTS users_plano_check;

-- 2. Remapear valores existentes (WHERE só alcança vocabulário antigo)
UPDATE public.projects SET plano = 'freemium'  WHERE plano IN ('basico', 'gratuito');
UPDATE public.projects SET plano = 'essencial' WHERE plano = 'profissional';
UPDATE public.projects SET plano = 'pro'       WHERE plano = 'premium';

UPDATE public.users SET plano = 'freemium'  WHERE plano IN ('gratuito', 'basico');
UPDATE public.users SET plano = 'essencial' WHERE plano = 'profissional';
UPDATE public.users SET plano = 'pro'       WHERE plano = 'premium';

-- 3. Novos defaults
ALTER TABLE public.projects ALTER COLUMN plano SET DEFAULT 'freemium';
ALTER TABLE public.users    ALTER COLUMN plano SET DEFAULT 'freemium';

-- 4. Novas constraints
ALTER TABLE public.projects ADD CONSTRAINT projects_plano_check
  CHECK (plano IN ('freemium', 'essencial', 'pro'));
ALTER TABLE public.users ADD CONSTRAINT users_plano_check
  CHECK (plano IN ('freemium', 'essencial', 'pro'));

COMMIT;

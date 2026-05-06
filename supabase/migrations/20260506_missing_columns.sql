-- =============================================================
-- Autoria — Migration: colunas faltantes detectadas em 2026-05-06
-- =============================================================

-- 1. Cache de detecção de capítulos em manuscripts
ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS capitulos_detectados JSONB,
  ADD COLUMN IF NOT EXISTS texto_hash           TEXT;

-- 2. Tabela de tickets de suporte (agente /api/agentes/suporte)
CREATE TABLE IF NOT EXISTS public.tickets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  pergunta    TEXT        NOT NULL,
  resposta_ia TEXT,
  resolvido   BOOLEAN     NOT NULL DEFAULT FALSE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_user_id   ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_criado_em ON public.tickets(criado_em DESC);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Usuário lê e atualiza apenas seus próprios tickets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'tickets: user read own'
  ) THEN
    CREATE POLICY "tickets: user read own"
      ON public.tickets FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tickets' AND policyname = 'tickets: user update own'
  ) THEN
    CREATE POLICY "tickets: user update own"
      ON public.tickets FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Inserção via service role (API route usa SUPABASE_SERVICE_ROLE_KEY)

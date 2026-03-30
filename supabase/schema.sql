-- =============================================================
-- Autoria — Schema inicial (idempotente — pode re-executar)
-- Rodar no Supabase: Dashboard → SQL Editor → New query
-- =============================================================

-- -------------------------------------------------------------
-- 1. USERS (perfil público ligado ao auth.users)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL UNIQUE,
  nome        text,
  plano       text        NOT NULL DEFAULT 'gratuito'
                          CHECK (plano IN ('gratuito', 'basico', 'profissional', 'premium')),
  criado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users: leitura própria"    ON public.users;
DROP POLICY IF EXISTS "users: atualização própria" ON public.users;

CREATE POLICY "users: leitura própria"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users: atualização própria"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Trigger: cria perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------------
-- 2. MANUSCRIPTS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.manuscripts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  texto       text,
  status      text        NOT NULL DEFAULT 'rascunho'
                          CHECK (status IN (
                            'rascunho',
                            'em_diagnostico',
                            'em_revisao',
                            'revisado',
                            'em_diagramacao',
                            'publicado'
                          )),
  criado_em   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manuscripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manuscripts: acesso próprio" ON public.manuscripts;

CREATE POLICY "manuscripts: acesso próprio"
  ON public.manuscripts FOR ALL
  USING (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 3. PROJECTS
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manuscript_id   uuid        REFERENCES public.manuscripts(id) ON DELETE SET NULL,
  plano           text        NOT NULL DEFAULT 'basico'
                              CHECK (plano IN ('basico', 'profissional', 'premium')),
  etapa_atual     text        NOT NULL DEFAULT 'upload'
                              CHECK (etapa_atual IN (
                                'upload',
                                'diagnostico',
                                'revisao',
                                'sinopse_ficha',
                                'capa',
                                'diagramacao',
                                'preview',
                                'publicacao',
                                'concluido'
                              )),
  criado_em       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects: acesso próprio" ON public.projects;

CREATE POLICY "projects: acesso próprio"
  ON public.projects FOR ALL
  USING (auth.uid() = user_id);

-- -------------------------------------------------------------
-- 4. WAITLIST (landing page — sem auth)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waitlist: insert público"    ON public.waitlist;
DROP POLICY IF EXISTS "waitlist: leitura restrita"  ON public.waitlist;

CREATE POLICY "waitlist: insert público"
  ON public.waitlist FOR INSERT
  WITH CHECK (true);

CREATE POLICY "waitlist: leitura restrita"
  ON public.waitlist FOR SELECT
  USING (false);

-- -------------------------------------------------------------
-- 5. Índices para performance
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_manuscripts_user_id ON public.manuscripts(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id    ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_manuscript ON public.projects(manuscript_id);

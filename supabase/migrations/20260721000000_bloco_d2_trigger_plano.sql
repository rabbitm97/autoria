-- =============================================================================
-- BLOCO D2-06 — Segurança server-side do plano (+ proteção de users.role)
-- 2ª migration incremental pós-baseline (20260714000000).
-- Idempotente. NÃO usar supabase db push — rodar via SQL Editor do Studio.
--
-- Invariante de negócio (D.1): projeto SEMPRE nasce freemium no banco;
-- promoção de plano só por processo autorizado (Studio/beta manual hoje,
-- webhook service_role no D.3/D.4). Exceção: dono admin nasce 'pro' (teste).
-- =============================================================================

BEGIN;

-- ── 0. Helper de privilégio ──────────────────────────────────────────────────
-- Privilegiado = sem claims JWT (SQL Editor/Studio, conexão direta) OU
-- claim role = 'service_role' (admin client / webhook). Requisições do
-- navegador via PostgREST chegam com role 'authenticated'/'anon' → não.
CREATE OR REPLACE FUNCTION public.autoria_chamada_privilegiada()
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  claims text := coalesce(current_setting('request.jwt.claims', true), '');
  claim_role text;
BEGIN
  IF claims = '' THEN
    RETURN true;
  END IF;
  BEGIN
    claim_role := (claims::json ->> 'role');
  EXCEPTION WHEN others THEN
    claim_role := NULL;
  END;
  RETURN claim_role = 'service_role';
END;
$$;

-- ── 1. Trigger de plano em projects ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_projects_plano()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  dono_admin boolean;
BEGIN
  IF public.autoria_chamada_privilegiada() THEN
    RETURN NEW;  -- Studio/beta manual e service_role passam intactos
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Ignora o que o navegador mandou: força freemium; dono admin → pro
    SELECT (u.role = 'admin') INTO dono_admin
    FROM public.users u WHERE u.id = NEW.user_id;
    NEW.plano := CASE WHEN coalesce(dono_admin, false)
                      THEN 'pro' ELSE 'freemium' END;
    RETURN NEW;
  END IF;

  -- UPDATE não-privilegiado: plano é imutável
  IF NEW.plano IS DISTINCT FROM OLD.plano THEN
    RAISE EXCEPTION 'plano só pode ser alterado por processo autorizado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_projects_plano ON public.projects;
CREATE TRIGGER trg_enforce_projects_plano
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_projects_plano();

-- ── 2. Admin no banco alinhado ao app-level (idempotente) ───────────────────
-- ADMIN_EMAILS (lib/admin-agents.ts) só existe no app; o trigger lê
-- users.role. Alinhar para "conta admin cria projeto → nasce pro" valer.
UPDATE public.users SET role = 'admin'
WHERE email IN ('mateusccoelho@gmail.com', 'mateusccoelho@hotmail.com')
  AND role IS DISTINCT FROM 'admin';

-- ── 3. ACHADO: proteger users.role e users.plano de auto-edição ─────────────
-- Sem isto, qualquer usuário se dá role='admin' via console (a policy
-- "users: atualização própria" não restringe coluna) — escalada a admin
-- (requireAdmin lê users.role) e bypass do trigger da seção 1.
CREATE OR REPLACE FUNCTION public.enforce_users_protected_cols()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.autoria_chamada_privilegiada() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.plano IS DISTINCT FROM OLD.plano THEN
    RAISE EXCEPTION 'role/plano só podem ser alterados por processo autorizado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_users_protected_cols ON public.users;
CREATE TRIGGER trg_enforce_users_protected_cols
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_users_protected_cols();

COMMIT;

-- =============================================================================
-- BLOCO B2-00 — Créditos por usuário
-- 3ª migration incremental pós-baseline (20260714000000).
-- Idempotente. NÃO usar supabase db push — rodar via SQL Editor do Studio.
--
-- Decisão (spec Bloco B §9-B, 23/jul): saldo de créditos pertence ao
-- USUÁRIO. `projects.creditos` vira fossil (deprecated, não dropar).
-- Proteção: a policy "users: atualização própria" permite UPDATE na
-- própria linha, então `creditos` entra na lista de colunas protegidas do
-- trigger enforce_users_protected_cols (D2-06). Escrita legítima só por
-- chamada privilegiada (Studio / service_role) — helpers de
-- lib/creditos.ts usam admin client.
-- =============================================================================

BEGIN;

-- ── 1. Coluna de saldo (backfill automático via DEFAULT) ─────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS creditos integer NOT NULL DEFAULT 100;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_creditos_nao_negativo;
ALTER TABLE public.users ADD CONSTRAINT users_creditos_nao_negativo
  CHECK (creditos >= 0);

-- ── 2. Proteção contra auto-edição (estende o trigger do D2-06) ─────────────
-- Mesmo corpo da 20260721000000, com `creditos` adicionado à lista.
CREATE OR REPLACE FUNCTION public.enforce_users_protected_cols()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.autoria_chamada_privilegiada() THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.plano IS DISTINCT FROM OLD.plano
     OR NEW.creditos IS DISTINCT FROM OLD.creditos THEN
    RAISE EXCEPTION 'role/plano/creditos só podem ser alterados por processo autorizado'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger já existe (20260721000000); recriar é idempotente e garante bind.
DROP TRIGGER IF EXISTS trg_enforce_users_protected_cols ON public.users;
CREATE TRIGGER trg_enforce_users_protected_cols
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_users_protected_cols();

-- ── 3. Fossilizar o saldo por projeto ────────────────────────────────────────
COMMENT ON COLUMN public.projects.creditos IS
  'DEPRECATED (B2-00, 23/jul/2026): saldo migrou para users.creditos. '
  'Não ler, não escrever, não dropar sem limpeza dedicada.';

COMMIT;

NOTIFY pgrst, 'reload schema';

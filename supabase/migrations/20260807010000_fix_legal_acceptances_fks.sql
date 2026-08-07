-- =============================================================================
-- FIX-LEGAL-1C-02 — Remover FKs de legal_acceptances
--
-- Motivo: ON DELETE SET NULL executa UPDATE na tabela filha e dispara o trigger
-- append-only, abortando a transação. Efeito: com pelo menos um aceite gravado,
-- DELETE de projeto e exclusão de conta em auth.users passam a falhar — sendo
-- que a exclusão de conta é obrigação de LGPD prometida na Política de
-- Privacidade publicada em /privacidade.
--
-- Decisão: legal_acceptances é livro-razão probatório, não tabela de domínio.
-- Integridade referencial e imutabilidade são incompatíveis aqui, e a segunda
-- vence: o aceite deve sobreviver ao projeto e à conta que o originaram.
-- user_id e project_id passam a ser referências HISTÓRICAS, sem FK.
-- A integridade é garantida na escrita: POST /api/legal/aceite valida sessão e
-- ownership do projeto antes de inserir.
--
-- Idempotente. SQL manual no Studio — nunca supabase db push.
-- =============================================================================

BEGIN;

-- 2.1 Remover as duas FKs
ALTER TABLE public.legal_acceptances
  DROP CONSTRAINT IF EXISTS legal_acceptances_user_id_fkey;

ALTER TABLE public.legal_acceptances
  DROP CONSTRAINT IF EXISTS legal_acceptances_project_id_fkey;

-- 2.2 user_id passa a NOT NULL (sem RI, nunca mais é anulado)
--     Falha de propósito se houver linha com user_id nulo — ver seção 3 do FIX.
ALTER TABLE public.legal_acceptances
  ALTER COLUMN user_id SET NOT NULL;

-- 2.3 Policy de leitura com papel explícito
DROP POLICY IF EXISTS "legal_acceptances: leitura própria"
  ON public.legal_acceptances;
CREATE POLICY "legal_acceptances: leitura própria"
  ON public.legal_acceptances
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 2.4 Comentário reflete o desenho real
COMMENT ON TABLE public.legal_acceptances IS
  'LEGAL-1C — Aceites legais versionados. APPEND-ONLY (ver triggers). '
  'Escritas só via service_role (POST /api/legal/aceite). '
  'user_id e project_id são referências HISTÓRICAS sem FK: o registro '
  'sobrevive à exclusão da conta e do projeto, por exigência probatória. '
  'user_email preserva o snapshot legível. Corrigido por FIX-LEGAL-1C-02.';

COMMIT;

NOTIFY pgrst, 'reload schema';

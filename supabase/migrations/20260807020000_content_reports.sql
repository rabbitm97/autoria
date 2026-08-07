-- =============================================================================
-- LEGAL-1D — Canal de notificação e log de providências (VERDADE 41)
--
-- Duas tabelas:
--   content_reports         → registro de entrada da notificação; SÓ `status`
--                             é mutável (o resto é congelado no recebimento).
--   content_report_actions  → log de providências, append-only integral.
--
-- Sem FK (Verdade 42): `project_id` e `report_id` são referências históricas;
-- integridade garantida nas rotas de escrita.
--
-- RLS habilitada, ZERO policies: leitura e escrita só via service_role
-- (nas rotas admin e na rota pública /api/denuncia).
--
-- Idempotente. SQL manual no Studio — nunca supabase db push.
-- =============================================================================

BEGIN;

-- 1. Notificações recebidas ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo         text        NOT NULL UNIQUE,
  nome              text        NOT NULL,
  email             text        NOT NULL,
  vinculo           text        NOT NULL,
  obra_ref          text        NOT NULL,
  project_id        uuid,
  fundamento        text        NOT NULL,
  trecho            text        NOT NULL,
  descricao         text        NOT NULL,
  prova_url         text,
  declaracao_boa_fe boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'recebida',
  ip                text,
  user_agent        text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_reports_status_ck CHECK (
    status IN ('recebida','em_analise','info_pendente','mantida','suspensa','removida','improcedente')
  ),
  CONSTRAINT content_reports_vinculo_ck CHECK (
    vinculo IN ('titular','representante','terceiro','autoridade')
  ),
  CONSTRAINT content_reports_fundamento_ck CHECK (
    fundamento IN ('direito_autoral','imagem_honra','dados_pessoais','ilicito','outro')
  )
);

CREATE INDEX IF NOT EXISTS content_reports_status_idx
  ON public.content_reports (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS content_reports_criado_idx
  ON public.content_reports (criado_em DESC);
CREATE INDEX IF NOT EXISTS content_reports_project_idx
  ON public.content_reports (project_id);
CREATE INDEX IF NOT EXISTS content_reports_ip_criado_idx
  ON public.content_reports (ip, criado_em DESC);

COMMENT ON TABLE public.content_reports IS
  'LEGAL-1D — Notificações recebidas pelo canal público. Só a coluna '
  '`status` é mutável (guard_content_report_mutation). DELETE bloqueado. '
  'project_id é referência histórica sem FK (Verdade 42).';

-- 2. Log de providências (append-only integral) -------------------------------
CREATE TABLE IF NOT EXISTS public.content_report_actions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid        NOT NULL,
  acao          text        NOT NULL,
  status_novo   text,
  fundamento    text,
  ator_id       uuid,
  ator_email    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_report_actions_acao_ck CHECK (
    acao IN (
      'recebimento_confirmado',
      'analise_iniciada',
      'info_solicitada',
      'autor_notificado',
      'decidida',
      'autor_contestou',
      'reaberta'
    )
  )
);

CREATE INDEX IF NOT EXISTS content_report_actions_report_idx
  ON public.content_report_actions (report_id, criado_em ASC);

COMMENT ON TABLE public.content_report_actions IS
  'LEGAL-1D — Log de providências de uma notificação. APPEND-ONLY '
  '(guard_content_report_action_mutation): UPDATE e DELETE bloqueados '
  'para todos os papéis, inclusive service_role.';

-- 3. Imutabilidade seletiva de content_reports --------------------------------
CREATE OR REPLACE FUNCTION public.guard_content_report_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'content_reports: DELETE bloqueado (registro probatório)'
      USING ERRCODE = '42501';
  END IF;
  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    IF NEW.protocolo   IS DISTINCT FROM OLD.protocolo
    OR NEW.nome        IS DISTINCT FROM OLD.nome
    OR NEW.email       IS DISTINCT FROM OLD.email
    OR NEW.vinculo     IS DISTINCT FROM OLD.vinculo
    OR NEW.obra_ref    IS DISTINCT FROM OLD.obra_ref
    OR NEW.project_id  IS DISTINCT FROM OLD.project_id
    OR NEW.fundamento  IS DISTINCT FROM OLD.fundamento
    OR NEW.trecho      IS DISTINCT FROM OLD.trecho
    OR NEW.descricao   IS DISTINCT FROM OLD.descricao
    OR NEW.prova_url   IS DISTINCT FROM OLD.prova_url
    OR NEW.declaracao_boa_fe IS DISTINCT FROM OLD.declaracao_boa_fe
    OR NEW.ip          IS DISTINCT FROM OLD.ip
    OR NEW.user_agent  IS DISTINCT FROM OLD.user_agent
    OR NEW.criado_em   IS DISTINCT FROM OLD.criado_em THEN
      RAISE EXCEPTION 'content_reports: só `status` pode ser alterado'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_content_report_mutation ON public.content_reports;
CREATE TRIGGER trg_guard_content_report_mutation
  BEFORE UPDATE OR DELETE ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_report_mutation();

-- 4. Append-only integral de content_report_actions ---------------------------
CREATE OR REPLACE FUNCTION public.guard_content_report_action_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content_report_actions é append-only (TG_OP=%)', TG_OP
    USING ERRCODE = '42501';
END; $$;

DROP TRIGGER IF EXISTS trg_guard_content_report_action_update ON public.content_report_actions;
CREATE TRIGGER trg_guard_content_report_action_update
  BEFORE UPDATE ON public.content_report_actions
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_report_action_mutation();

DROP TRIGGER IF EXISTS trg_guard_content_report_action_delete ON public.content_report_actions;
CREATE TRIGGER trg_guard_content_report_action_delete
  BEFORE DELETE ON public.content_report_actions
  FOR EACH ROW EXECUTE FUNCTION public.guard_content_report_action_mutation();

-- 5. RLS: habilitada, sem policies -------------------------------------------
--    Nada é acessível para authenticated/anon. Escrita e leitura só via
--    service_role nas rotas /api/denuncia e /api/admin/notificacoes/*.
ALTER TABLE public.content_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_report_actions ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';

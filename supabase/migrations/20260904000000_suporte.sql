-- =============================================================================
-- SUP-1/2 — Suporte humano (threads + KCS), rodada no Studio em 04-08/set/2026.
-- Arquivo RECONSTITUÍDO por introspecção em 08/set/2026 para espelhar o banco
-- (a era SUP não versionou o SQL no repo). NÃO re-rodar em produção — já está
-- aplicado; em ambiente novo, roda na ordem da cadeia.
--
--   suporte_conversas  → 1 thread por conversa do autor (aberta|fechada)
--   suporte_mensagens  → mensagens da thread (usuario|equipe), 1..5000 chars
--   kb_artigos         → flywheel KCS ("Salvar como artigo" no inbox admin)
--
-- RLS: own nas duas primeiras (authenticated); kb_artigos habilitada SEM
-- policies — leitura/escrita só via service_role.
-- Idempotente. SQL manual no Studio — nunca supabase db push.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.suporte_conversas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'aberta'
                            CHECK (status IN ('aberta','fechada')),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.suporte_mensagens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id uuid        NOT NULL REFERENCES public.suporte_conversas(id) ON DELETE CASCADE,
  autor       text        NOT NULL CHECK (autor IN ('usuario','equipe')),
  texto       text        NOT NULL CHECK (char_length(texto) >= 1 AND char_length(texto) <= 5000),
  criado_em   timestamptz NOT NULL DEFAULT now(),
  lida_em     timestamptz
);

CREATE TABLE IF NOT EXISTS public.kb_artigos (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pergunta           text        NOT NULL,
  resposta           text        NOT NULL,
  tags               text[]      NOT NULL DEFAULT '{}',
  origem_conversa_id uuid        REFERENCES public.suporte_conversas(id) ON DELETE SET NULL,
  status             text        NOT NULL DEFAULT 'rascunho'
                                 CHECK (status IN ('rascunho','publicado')),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suporte_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_artigos        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversas_own" ON public.suporte_conversas;
CREATE POLICY "conversas_own" ON public.suporte_conversas
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "msgs_own" ON public.suporte_mensagens;
CREATE POLICY "msgs_own" ON public.suporte_mensagens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.suporte_conversas c
                 WHERE c.id = suporte_mensagens.conversa_id
                   AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.suporte_conversas c
                      WHERE c.id = suporte_mensagens.conversa_id
                        AND c.user_id = auth.uid()));

-- kb_artigos: sem policies — service_role apenas.

COMMIT;

NOTIFY pgrst, 'reload schema';

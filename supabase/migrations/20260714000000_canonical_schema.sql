-- =============================================================================
-- Autoria — SCHEMA CANÔNICO (baseline)
-- Gerado em 14/jul/2026 a partir do banco de PRODUÇÃO verificado via
-- information_schema, pg_constraint, pg_policies, pg_indexes, storage.buckets.
--
-- PROPRIEDADES:
--   - IDEMPOTENTE: pode rodar N vezes. Em prod é no-op exceto 3 mudanças
--     intencionais (constraint 12 valores, DROP texto_hash, limpeza de 4
--     policies de Storage).
--   - COMPLETO: rodado em ambiente vazio (Supabase novo), cria o schema
--     inteiro fiel à produção. Substitui schema.sql, setup-completo.sql,
--     storage.sql, waitlist.sql e os 18 .sql soltos (ver supabase/deprecated/).
--
-- COMO RODAR: Supabase Studio → SQL Editor → New query → colar → Run.
-- NUNCA via supabase db push.
--
-- Mudanças futuras: migrations incrementais pequenas por cima deste baseline
-- (ex.: Bloco A ativa etapa audiolivro no código; Bloco D alinha `plano`).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. FUNÇÕES
-- =============================================================================

-- Cria perfil público automaticamente no signup (SECURITY DEFINER: roda como
-- owner, bypassa RLS de public.users no INSERT).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

-- Mantém cart_items.updated_at (usado pelo GET do carrinho como ordenação).
CREATE OR REPLACE FUNCTION public.trg_cart_items_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. TABELAS (ordem de dependência)
-- =============================================================================

-- ── users ── perfil público 1:1 com auth.users ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text        NOT NULL UNIQUE,
  nome       text,
  plano      text        NOT NULL DEFAULT 'gratuito',
  criado_em  timestamptz NOT NULL DEFAULT now(),
  role       text        NOT NULL DEFAULT 'user'
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Vocabulário ANTIGO (gratuito/basico/profissional/premium). O modelo real é
-- Freemium/Essencial/Pro — alinhamento é escopo do Bloco D. NÃO mexer aqui.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plano_check;
ALTER TABLE public.users ADD CONSTRAINT users_plano_check
  CHECK (plano IN ('gratuito', 'basico', 'profissional', 'premium'));

-- ── manuscripts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manuscripts (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nome                            text        NOT NULL,
  texto                           text,
  status                          text        NOT NULL DEFAULT 'rascunho',
  criado_em                       timestamptz NOT NULL DEFAULT now(),
  storage_path                    text,
  titulo                          text,
  subtitulo                       text,
  genero_principal                text,
  genero_sub                      text,
  genero_detalhe                  text,
  autor_titulo                    text,
  autor_primeiro_nome             text,
  autor_nome_meio                 text,
  autor_sobrenome                 text,
  coautores                       jsonb       NOT NULL DEFAULT '[]',
  texto_revisado                  text,
  capitulos_detectados            jsonb,
  capitulos_aprovados             jsonb,
  capitulos_aprovados_texto_hash  text
);

-- Colunas pós-baseline (no-op em prod; garante envs que nasceram do schema.sql)
ALTER TABLE public.manuscripts
  ADD COLUMN IF NOT EXISTS storage_path                   text,
  ADD COLUMN IF NOT EXISTS titulo                         text,
  ADD COLUMN IF NOT EXISTS subtitulo                      text,
  ADD COLUMN IF NOT EXISTS genero_principal               text,
  ADD COLUMN IF NOT EXISTS genero_sub                     text,
  ADD COLUMN IF NOT EXISTS genero_detalhe                 text,
  ADD COLUMN IF NOT EXISTS autor_titulo                   text,
  ADD COLUMN IF NOT EXISTS autor_primeiro_nome            text,
  ADD COLUMN IF NOT EXISTS autor_nome_meio                text,
  ADD COLUMN IF NOT EXISTS autor_sobrenome                text,
  ADD COLUMN IF NOT EXISTS coautores                      jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS texto_revisado                 text,
  ADD COLUMN IF NOT EXISTS capitulos_detectados           jsonb,
  ADD COLUMN IF NOT EXISTS capitulos_aprovados            jsonb,
  ADD COLUMN IF NOT EXISTS capitulos_aprovados_texto_hash text;

-- FÓSSIL (0 refs no código, confirmado C.1). A migration antiga
-- 20260506_missing_columns.sql criava esta coluna — este baseline a remove.
ALTER TABLE public.manuscripts DROP COLUMN IF EXISTS texto_hash;

ALTER TABLE public.manuscripts DROP CONSTRAINT IF EXISTS manuscripts_status_check;
ALTER TABLE public.manuscripts ADD CONSTRAINT manuscripts_status_check
  CHECK (status IN (
    'rascunho', 'em_diagnostico', 'em_revisao',
    'revisado', 'em_diagramacao', 'publicado'
  ));

COMMENT ON COLUMN public.manuscripts.capitulos_aprovados IS
  'Lista de capítulos confirmada pelo autor via UI de aprovação. Formato: [{ titulo: string, pos: number }]. NULL = autor ainda não confirmou (sistema usa capitulos_detectados como fallback temporário).';
COMMENT ON COLUMN public.manuscripts.capitulos_aprovados_texto_hash IS
  'MD5 do texto (texto_revisado ?? texto) no momento da aprovação dos capítulos. Comparado a cada geração de miolo para invalidar aprovação se o texto mudou.';

-- ── projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manuscript_id      uuid        REFERENCES public.manuscripts(id) ON DELETE SET NULL,
  plano              text        NOT NULL DEFAULT 'basico',
  etapa_atual        text        NOT NULL DEFAULT 'upload',
  criado_em          timestamptz NOT NULL DEFAULT now(),
  diagnostico        jsonb,
  dados_revisao      jsonb,
  dados_elementos    jsonb,
  dados_capa         jsonb,
  dados_pdf          jsonb,
  dados_qa           jsonb,
  dados_audio        jsonb,
  usar_revisao       boolean     NOT NULL DEFAULT true,
  dados_creditos     jsonb,
  dados_miolo        jsonb,
  creditos           integer     NOT NULL DEFAULT 100,
  formato            text,
  formato_locked_at  timestamptz,
  dados_pdf_digital  jsonb,
  qa_aprovado_em     timestamptz
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS diagnostico       jsonb,
  ADD COLUMN IF NOT EXISTS dados_revisao     jsonb,
  ADD COLUMN IF NOT EXISTS dados_elementos   jsonb,
  ADD COLUMN IF NOT EXISTS dados_capa        jsonb,
  ADD COLUMN IF NOT EXISTS dados_pdf         jsonb,
  ADD COLUMN IF NOT EXISTS dados_qa          jsonb,
  ADD COLUMN IF NOT EXISTS dados_audio       jsonb,
  ADD COLUMN IF NOT EXISTS usar_revisao      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dados_creditos    jsonb,
  ADD COLUMN IF NOT EXISTS dados_miolo       jsonb,
  ADD COLUMN IF NOT EXISTS creditos          integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS formato           text,
  ADD COLUMN IF NOT EXISTS formato_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS dados_pdf_digital jsonb,   -- era ALTER manual sem SQL
  ADD COLUMN IF NOT EXISTS qa_aprovado_em    timestamptz;  -- era ALTER manual sem SQL

-- Vocabulário ANTIGO (código grava "basico" hardcoded). Alinhar no Bloco D.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_plano_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_plano_check
  CHECK (plano IN ('basico', 'profissional', 'premium'));

-- 12 VALORES. Os 11 de prod (verificados 14/jul) + "audiolivro" (decisão de
-- produto 14/jul: etapa entra no fluxo no Bloco A, entre diagramacao e
-- preview; ORDEM_ETAPAS em lib/etapas.ts já tem o slot comentado).
-- NENHUM código escreve "audiolivro" até o Bloco A.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_etapa_atual_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_etapa_atual_check
  CHECK (etapa_atual IN (
    'upload', 'diagnostico', 'revisao', 'elementos', 'capa', 'creditos',
    'diagramacao', 'audiolivro', 'preview', 'qa', 'publicacao', 'publicado'
  ));

-- 5 slugs canônicos de lib/formatos.ts (verdade absoluta #2).
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_formato_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_formato_check
  CHECK (formato IS NULL OR formato IN ('padrao_br', 'compacto', 'bolso', 'quadrado', 'a4'));

COMMENT ON COLUMN public.projects.formato IS
  'Formato físico do livro (slug canônico). Definido em Elementos. Bloqueado após geração de capa.';
COMMENT ON COLUMN public.projects.formato_locked_at IS
  'Timestamp de quando o formato foi bloqueado (após capa gerada). NULL = ainda pode ser alterado.';
COMMENT ON COLUMN public.projects.etapa_atual IS
  'Escrita EXCLUSIVA via avancarEtapa() de lib/supabase-helpers.ts (forward-only). Exceções canônicas: gate qa-publicacao e capa/reset. Valor "audiolivro" reservado para o Bloco A.';
COMMENT ON COLUMN public.projects.qa_aprovado_em IS
  'Marker: prova aprovada pelo autor (dashboard prova). lib/etapas.ts deriva etapa exibida dele.';

-- ── cart_items ── (BLOCO-02-C; tabela criada manualmente em prod, sem SQL
--                   versionado até este baseline) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.cart_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo            text        NOT NULL,
  project_id      uuid        REFERENCES public.projects(id) ON DELETE CASCADE,
  config          jsonb       NOT NULL DEFAULT '{}',
  preco_centavos  integer     NOT NULL,
  adicionado_em   timestamptz NOT NULL DEFAULT now(),  -- era ALTER manual sem SQL
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS adicionado_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS tipo_conhecido;
ALTER TABLE public.cart_items ADD CONSTRAINT tipo_conhecido
  CHECK (tipo = 'impressao_livro');

ALTER TABLE public.cart_items DROP CONSTRAINT IF EXISTS check_project_id_impressao;
ALTER TABLE public.cart_items ADD CONSTRAINT check_project_id_impressao
  CHECK (tipo <> 'impressao_livro' OR project_id IS NOT NULL);

-- ── tickets ── (versão de prod = 20260506_missing_columns: FK em auth.users) ─
CREATE TABLE IF NOT EXISTS public.tickets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid        REFERENCES public.projects(id) ON DELETE SET NULL,
  pergunta    text        NOT NULL,
  resposta_ia text,
  resolvido   boolean     NOT NULL DEFAULT false,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ── royalties ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.royalties (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plataforma      text        NOT NULL,
  periodo         text        NOT NULL, -- 'YYYY-MM'
  unidades        integer     NOT NULL DEFAULT 0,
  preco_venda     numeric(10,2),
  royalty_pct     numeric(5,2) NOT NULL DEFAULT 70.00,
  valor_recebido  numeric(10,2) GENERATED ALWAYS AS (
                    ROUND((unidades * COALESCE(preco_venda, 0) * royalty_pct / 100), 2)
                  ) STORED,
  moeda           text        NOT NULL DEFAULT 'BRL',
  criado_em       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.royalties DROP CONSTRAINT IF EXISTS royalties_plataforma_check;
ALTER TABLE public.royalties ADD CONSTRAINT royalties_plataforma_check
  CHECK (plataforma IN (
    'amazon_kdp', 'draft2digital', 'kobo', 'apple_books', 'google_play', 'outros'
  ));

ALTER TABLE public.royalties DROP CONSTRAINT IF EXISTS royalties_unidades_check;
ALTER TABLE public.royalties ADD CONSTRAINT royalties_unidades_check
  CHECK (unidades >= 0);

-- ── waitlist ── (RLS ATIVO com insert público — a versão do antigo
--                waitlist.sql que DESATIVAVA RLS diverge de prod) ─────────────
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL UNIQUE,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- ── agent_prompts / usage_logs ── (admin; RLS sem policies = só service role.
--    Ambiente novo: tabela vazia é OK — lib/agent-prompts.ts tem fallback
--    hardcoded por agente) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_prompts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name     text        NOT NULL,
  prompt_content text        NOT NULL,
  version        integer     NOT NULL DEFAULT 1,
  is_active      boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text
);

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    text        NOT NULL,
  project_id    text,
  user_id       uuid,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(10,6),
  duration_ms   integer,
  error         text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. TRIGGERS
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS cart_items_updated_at ON public.cart_items;
CREATE TRIGGER cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_cart_items_updated_at();

-- =============================================================================
-- 4. ÍNDICES (todos os não-PK de prod; nomes exatos de prod)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_manuscripts_user_id ON public.manuscripts(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id    ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_manuscript ON public.projects(manuscript_id);

-- Índice único parcial: 1 item de impressão por (user, projeto) no carrinho.
-- Nunca teve SQL versionado até este baseline.
CREATE UNIQUE INDEX IF NOT EXISTS cart_impressao_unique
  ON public.cart_items(user_id, project_id, tipo)
  WHERE (tipo = 'impressao_livro');

CREATE INDEX IF NOT EXISTS idx_tickets_user_id   ON public.tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_criado_em ON public.tickets(criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_royalties_user    ON public.royalties(user_id);
CREATE INDEX IF NOT EXISTS idx_royalties_project ON public.royalties(project_id);
CREATE INDEX IF NOT EXISTS idx_royalties_periodo ON public.royalties(periodo);

CREATE INDEX IF NOT EXISTS idx_agent_prompts_name_active
  ON public.agent_prompts(agent_name, is_active);
CREATE INDEX IF NOT EXISTS idx_agent_prompts_name_version
  ON public.agent_prompts(agent_name, version DESC);

CREATE INDEX IF NOT EXISTS idx_usage_logs_agent_created
  ON public.usage_logs(agent_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created
  ON public.usage_logs(created_at DESC);

-- =============================================================================
-- 5. RLS — TABELAS PUBLIC (espelho exato de prod)
-- =============================================================================

ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manuscripts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.royalties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs    ENABLE ROW LEVEL SECURITY;

-- users (INSERT vem do trigger SECURITY DEFINER — sem policy de INSERT)
DROP POLICY IF EXISTS "users: leitura própria"     ON public.users;
CREATE POLICY "users: leitura própria"
  ON public.users FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "users: atualização própria" ON public.users;
CREATE POLICY "users: atualização própria"
  ON public.users FOR UPDATE USING (auth.uid() = id);

-- manuscripts
DROP POLICY IF EXISTS "manuscripts: acesso próprio" ON public.manuscripts;
CREATE POLICY "manuscripts: acesso próprio"
  ON public.manuscripts FOR ALL USING (auth.uid() = user_id);

-- projects
DROP POLICY IF EXISTS "projects: acesso próprio" ON public.projects;
CREATE POLICY "projects: acesso próprio"
  ON public.projects FOR ALL USING (auth.uid() = user_id);

-- cart_items
DROP POLICY IF EXISTS cart_select_own ON public.cart_items;
CREATE POLICY cart_select_own
  ON public.cart_items FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cart_insert_own ON public.cart_items;
CREATE POLICY cart_insert_own
  ON public.cart_items FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cart_update_own ON public.cart_items;
CREATE POLICY cart_update_own
  ON public.cart_items FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cart_delete_own ON public.cart_items;
CREATE POLICY cart_delete_own
  ON public.cart_items FOR DELETE USING (auth.uid() = user_id);

-- tickets (INSERT via service role — sem policy de INSERT, igual a prod)
DROP POLICY IF EXISTS "tickets: user read own"   ON public.tickets;
CREATE POLICY "tickets: user read own"
  ON public.tickets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tickets: user update own" ON public.tickets;
CREATE POLICY "tickets: user update own"
  ON public.tickets FOR UPDATE USING (auth.uid() = user_id);

-- royalties
DROP POLICY IF EXISTS "royalties: acesso próprio" ON public.royalties;
CREATE POLICY "royalties: acesso próprio"
  ON public.royalties FOR ALL USING (auth.uid() = user_id);

-- waitlist
DROP POLICY IF EXISTS "waitlist: insert público"   ON public.waitlist;
CREATE POLICY "waitlist: insert público"
  ON public.waitlist FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "waitlist: leitura restrita" ON public.waitlist;
CREATE POLICY "waitlist: leitura restrita"
  ON public.waitlist FOR SELECT USING (false);

-- agent_prompts / usage_logs: RLS ativo, ZERO policies (acesso só via
-- service role nas rotas admin) — intencional, igual a prod.

-- =============================================================================
-- 6. STORAGE — BUCKETS (config canônica = prod; ON CONFLICT DO UPDATE garante
--    que ambientes nascidos de setups antigos convergem — ex.: capas era
--    criado PÚBLICO pelo setup-completo.sql)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('manuscripts', 'manuscripts', false, 52428800, ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/epub+zip',
  'text/html'
])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- application/pdf é OBRIGATÓRIO: upload de capa em PDF (upload-capa/presign)
-- grava o original no bucket. Hotfix manual pós-20260623 incorporado aqui.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('capas', 'capas', false, 20971520, ARRAY[
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('livros', 'livros', false, 52428800, ARRAY[
  'application/pdf', 'application/epub+zip'
])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audiolivros', 'audiolivros', false, 104857600, ARRAY[
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a'
])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('editor-assets', 'editor-assets', false, 52428800, ARRAY[
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf'
])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- 7. STORAGE — POLICIES
-- Limpeza aprovada 14/jul: remove 1 policy permissiva + 3 duplicatas.
-- Análise de risco: nenhum fluxo depende delas (leituras via service role,
-- signed URL, ou policy *_read_own; verificado em todo call site do código).
-- =============================================================================

-- LIMPEZA (mudança intencional nº 3)
DROP POLICY IF EXISTS "capas: leitura pública"          ON storage.objects;
DROP POLICY IF EXISTS "capas: upload próprio"           ON storage.objects;
DROP POLICY IF EXISTS "capas: upload autenticado"       ON storage.objects;
DROP POLICY IF EXISTS "capas: deleção própria"          ON storage.objects;
DROP POLICY IF EXISTS "users delete own assets rdczj7_1" ON storage.objects;

-- manuscripts (4 — espelho de prod)
DROP POLICY IF EXISTS "manuscripts: leitura própria"     ON storage.objects;
CREATE POLICY "manuscripts: leitura própria"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "manuscripts: upload próprio"      ON storage.objects;
CREATE POLICY "manuscripts: upload próprio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "manuscripts: atualização própria" ON storage.objects;
CREATE POLICY "manuscripts: atualização própria"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "manuscripts: exclusão própria"    ON storage.objects;
CREATE POLICY "manuscripts: exclusão própria"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manuscripts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- capas (4 — conjunto canônico pós-limpeza)
DROP POLICY IF EXISTS capas_authenticated_read_own   ON storage.objects;
CREATE POLICY capas_authenticated_read_own
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'capas' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS capas_authenticated_insert_own ON storage.objects;
CREATE POLICY capas_authenticated_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'capas' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS capas_authenticated_update_own ON storage.objects;
CREATE POLICY capas_authenticated_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'capas' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS capas_authenticated_delete_own ON storage.objects;
CREATE POLICY capas_authenticated_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'capas' AND (storage.foldername(name))[1] = auth.uid()::text);

-- livros (3 — espelho de prod; SELECT sem TO = role public, condição de
-- ownership torna anon inócuo)
DROP POLICY IF EXISTS "livros: upload próprio"  ON storage.objects;
CREATE POLICY "livros: upload próprio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'livros' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "livros: leitura própria" ON storage.objects;
CREATE POLICY "livros: leitura própria"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'livros' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "livros: deleção própria" ON storage.objects;
CREATE POLICY "livros: deleção própria"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'livros' AND (storage.foldername(name))[1] = auth.uid()::text);

-- audiolivros (3 — espelho de prod)
DROP POLICY IF EXISTS "audiolivros: upload próprio"  ON storage.objects;
CREATE POLICY "audiolivros: upload próprio"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'audiolivros' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "audiolivros: leitura própria" ON storage.objects;
CREATE POLICY "audiolivros: leitura própria"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audiolivros' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "audiolivros: deleção própria" ON storage.objects;
CREATE POLICY "audiolivros: deleção própria"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'audiolivros' AND (storage.foldername(name))[1] = auth.uid()::text);

-- editor-assets (3 — nomes limpos substituem os "rdczj7" gerados pelo Studio)
DROP POLICY IF EXISTS "users insert own assets rdczj7_0" ON storage.objects;
DROP POLICY IF EXISTS editor_assets_insert_own           ON storage.objects;
CREATE POLICY editor_assets_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'editor-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users read own assets rdczj7_0"   ON storage.objects;
DROP POLICY IF EXISTS editor_assets_read_own             ON storage.objects;
CREATE POLICY editor_assets_read_own
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'editor-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "users delete own assets rdczj7_0" ON storage.objects;
DROP POLICY IF EXISTS editor_assets_delete_own           ON storage.objects;
CREATE POLICY editor_assets_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'editor-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMIT;

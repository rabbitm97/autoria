-- Migration: tabela de royalties (lançamentos manuais por plataforma)
-- Rodar no Supabase: Dashboard → SQL Editor → New query

CREATE TABLE IF NOT EXISTS public.royalties (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id      uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plataforma      text        NOT NULL
                              CHECK (plataforma IN (
                                'amazon_kdp','draft2digital','kobo',
                                'apple_books','google_play','outros'
                              )),
  periodo         text        NOT NULL, -- formato 'YYYY-MM'
  unidades        int         NOT NULL DEFAULT 0 CHECK (unidades >= 0),
  preco_venda     numeric(10,2),
  royalty_pct     numeric(5,2) NOT NULL DEFAULT 70.00,
  valor_recebido  numeric(10,2) GENERATED ALWAYS AS (
                    ROUND((unidades * COALESCE(preco_venda, 0) * royalty_pct / 100), 2)
                  ) STORED,
  moeda           text        NOT NULL DEFAULT 'BRL',
  criado_em       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.royalties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "royalties: acesso próprio" ON public.royalties;
CREATE POLICY "royalties: acesso próprio"
  ON public.royalties FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_royalties_user    ON public.royalties(user_id);
CREATE INDEX IF NOT EXISTS idx_royalties_project ON public.royalties(project_id);
CREATE INDEX IF NOT EXISTS idx_royalties_periodo ON public.royalties(periodo);

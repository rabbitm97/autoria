-- REC-1 · Inscrições da fase beta (público).
--
-- Tabela usada pelo formulário curto em /beta. Sem RLS liberada — inserts
-- passam pelo service_role em app/api/beta/route.ts (rota pública, guardada
-- por honeypot + rate limit). O admin consome a tabela direto no Studio nesta
-- fase; painel de triagem virá em bloco posterior.
--
-- Regras:
--  · manuscrito_status ∈ {'concluido','em_revisao','escrevendo'}
--  · status inicial 'nova'; admin move para 'selecionada' | 'lista_espera' | 'descartada'
--  · onda ∈ {1,2} (preenchido no momento da seleção; NULL até lá)
--  · email único (case-insensitive) — segundo POST com o mesmo e-mail vira no-op.

BEGIN;

CREATE TABLE IF NOT EXISTS public.beta_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  manuscrito_status text NOT NULL,
  sobre_livro text,
  como_soube text,
  status text NOT NULL DEFAULT 'nova',
  onda smallint,
  ip text,
  user_agent text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beta_inscricoes_manuscrito_ck CHECK (
    manuscrito_status IN ('concluido','em_revisao','escrevendo')),
  CONSTRAINT beta_inscricoes_status_ck CHECK (
    status IN ('nova','selecionada','lista_espera','descartada')),
  CONSTRAINT beta_inscricoes_onda_ck CHECK (onda IN (1,2))
);

CREATE UNIQUE INDEX IF NOT EXISTS beta_inscricoes_email_uq
  ON public.beta_inscricoes (lower(email));

COMMENT ON TABLE public.beta_inscricoes IS
  'REC-1 · Inscrições recebidas pela página pública /beta. Admin triaga no Studio; onda preenchida na seleção.';

ALTER TABLE public.beta_inscricoes ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- FERR-2-ANT (10/ago/2026): contas novas nascem com ZERO créditos.
--
-- Contexto: lançamento fechado com recrutamento em grupos públicos e
-- cadastro aberto — o DEFAULT 100 da 20260723000000 permitiria capa IA
-- de graça a qualquer conta nova (vigia da TABELA v15). Bônus de
-- boas-vindas foi explicitamente REMOVIDO do escopo (martelada 10/ago);
-- se voltar, será via FERR-2 pleno com ledger próprio.
--
-- Linhas existentes NÃO são alteradas: saldos atuais (100 do backfill
-- da 20260723000000 ou valores movimentados) permanecem intactos —
-- ALTER ... SET DEFAULT só afeta INSERTs futuros.
--
-- Cadeia canônica (verdade 24): entra APÓS 20260807020000_content_reports.
-- Aplicação: manual no Supabase Studio (NUNCA db push).

ALTER TABLE public.users ALTER COLUMN creditos SET DEFAULT 0;

COMMENT ON COLUMN public.users.creditos IS
  'Saldo de créditos do usuário (1 crédito = R$1). DEFAULT 0 desde '
  '10/ago/2026 (FERR-2-ANT); era 100 na 20260723000000. Escrita só por '
  'processo autorizado (trigger enforce_users_protected_cols).';

NOTIFY pgrst, 'reload schema';

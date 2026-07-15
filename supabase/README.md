# Autoria — Banco de dados (Supabase)

## Fonte de verdade do schema

`migrations/20260714000000_canonical_schema.sql` — baseline canônico,
idempotente, gerado do banco de produção em 14/jul/2026.

## Como criar um ambiente novo (staging, dev)

1. Criar projeto no Supabase.
2. Supabase Studio → SQL Editor → colar e rodar a migration canônica inteira.
3. Rodar `NOTIFY pgrst, 'reload schema';`
4. Pronto. NÃO é necessário rodar as migrations antigas de `migrations/`
   (são histórico anterior ao baseline) nem NADA de `deprecated/`.

## Como fazer mudanças de schema daqui pra frente

- Criar NOVA migration incremental em `migrations/` com timestamp no nome
  (ex.: `20260801000000_descricao.sql`), idempotente.
- Rodar manualmente no Supabase Studio (NUNCA `supabase db push`).
- Sempre com backup antes (Dashboard → Database → Backups).
- Terminar com `NOTIFY pgrst, 'reload schema';`

## Regras permanentes (CONTEXTO, verdades 19-20)

- `etapa_atual` só é escrita via `avancarEtapa()` de `lib/supabase-helpers.ts`.
- Nenhum UPDATE cego: sempre checar `{ error }`.

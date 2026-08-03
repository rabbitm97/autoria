# Autoria — Banco de dados (Supabase)

## Fonte de verdade do schema

Em `migrations/` há 4 arquivos que juntos definem o estado atual do banco.
NENHUM deles é dispensável em ambiente novo — a ordem importa:

1. `20260714000000_canonical_schema.sql` — baseline (schema fiel a 14/jul/2026).
2. `20260716000000_bloco_d2_plano.sql` — remapeia vocabulário de plano
   (basico/profissional/premium → freemium/essencial/pro) e reescreve a
   constraint. Depois desta, o baseline acima NÃO PODE mais ser re-rodado
   em produção (transação aborta na constraint antiga).
3. `20260721000000_bloco_d2_trigger_plano.sql` — trigger `projects_plano_guard`
   + helper `autoria_chamada_privilegiada()`. Ver "REGRA DE OURO" no topo
   do arquivo antes de mexer.
4. `20260723000000_creditos_usuario.sql` — coluna `users.creditos` e
   RE-DECLARAÇÃO da trigger da 21 com o novo comportamento. Depende da 21
   já ter rodado.

## Como criar um ambiente novo (staging, dev)

1. Criar projeto no Supabase.
2. Supabase Studio → SQL Editor → colar e rodar as 4 migrations acima,
   NA ORDEM, uma por vez, cada uma até "Success. No rows returned".
3. Rodar `NOTIFY pgrst, 'reload schema';`
4. Pronto. `deprecated/` é histórico — NÃO rodar nada de lá.

## Como fazer mudanças de schema daqui pra frente

- Criar NOVA migration incremental em `migrations/` com timestamp no nome
  (ex.: `20260801000000_descricao.sql`), idempotente.
- Rodar manualmente no Supabase Studio (NUNCA `supabase db push`).
- Sempre com backup antes (Dashboard → Database → Backups).
- Terminar com `NOTIFY pgrst, 'reload schema';`
- Se estiver AJUSTANDO uma trigger/função criada por uma migration já
  existente, EDITAR AQUELA MIGRATION e re-rodá-la — não criar um novo
  arquivo só com o CREATE OR REPLACE (ver REGRA DE OURO na 20260721).

## Regras permanentes (CONTEXTO, verdades 19-24)

- `etapa_atual` só é escrita via `avancarEtapa()` de `lib/supabase-helpers.ts`.
- Nenhum UPDATE cego: sempre checar `{ error }`.
- Baseline `20260714` NÃO é re-runable em produção pós-16/jul/2026 — usar
  só em ambiente vazio, seguido obrigatoriamente das 3 incrementais.
- Ordem das 4 migrations em ambiente novo: 14 → 16 → 21 → 23. Pular
  qualquer uma quebra o ambiente.
- Alterações em trigger/função de uma migration existente vão NAQUELA
  migration, não em arquivo novo.
- `deprecated/` é somente histórico — nunca rodar, nunca importar.

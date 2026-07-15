# ⚠ NÃO RODAR NENHUM ARQUIVO DESTA PASTA

Estes .sql são HISTÓRICO. Foram substituídos em 14/jul/2026 pela migration
canônica `supabase/migrations/20260714000000_canonical_schema.sql`, gerada a
partir do banco de produção real.

Rodar qualquer arquivo daqui pode QUEBRAR produção. Exemplos reais:

- `setup-completo.sql` / `add-capas-bucket.sql` → tornam o bucket `capas`
  PÚBLICO (em prod ele é privado, com signed URLs)
- `add-qa.sql` / `setup-completo.sql` / `schema.sql` → regridem a constraint
  de `etapa_atual` pra versões antigas e erradas (ressuscita o bug
  "sempre volta pra diagramação")
- `waitlist.sql` → desativa o RLS da waitlist (em prod ele é ativo)
- `storage.sql` → remove `text/html` e `application/epub+zip` dos mime types
  do bucket manuscripts (quebra miolo/créditos/prova-revisão)
- `update-creditos-prompt.sql` / `deactivate-creditos-prompt.sql` → fósseis
  do agente IA de créditos, removido do produto

Eles ficam aqui apenas como registro das decisões e comentários da época.

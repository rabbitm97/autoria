-- Add canonical format column + lock timestamp to projects table.
-- formato uses slug system from lib/formatos.ts (no legacy capa-style IDs).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS formato TEXT
  CHECK (formato IS NULL OR formato IN ('padrao_br', 'compacto', 'bolso', 'quadrado', 'a4'));

ALTER TABLE projects ADD COLUMN IF NOT EXISTS formato_locked_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN projects.formato IS 'Formato físico do livro (slug canônico). Definido em Elementos. Bloqueado após geração de capa.';
COMMENT ON COLUMN projects.formato_locked_at IS 'Timestamp de quando o formato foi bloqueado (após capa gerada). NULL = ainda pode ser alterado.';

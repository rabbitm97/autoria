-- Adiciona coluna para guardar a lista de capítulos aprovada pelo autor.
-- Diferente de `capitulos_detectados` (que é cache da detecção automática),
-- esta coluna representa a decisão final do autor após revisar as propostas.

ALTER TABLE manuscripts
ADD COLUMN IF NOT EXISTS capitulos_aprovados JSONB DEFAULT NULL;

COMMENT ON COLUMN manuscripts.capitulos_aprovados IS
'Lista de capítulos confirmada pelo autor via UI de aprovação. Formato: [{ titulo: string, pos: number }]. NULL = autor ainda não confirmou (sistema usa capitulos_detectados como fallback temporário).';

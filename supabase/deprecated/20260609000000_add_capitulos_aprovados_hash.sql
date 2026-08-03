-- Hash MD5 do texto sobre o qual a aprovação de capítulos foi feita.
-- Quando o autor edita o manuscrito (texto_revisado), o hash deixa de bater
-- e o sistema força nova aprovação — caso contrário as posições dos capítulos
-- aprovados ficariam erradas no miolo.

ALTER TABLE manuscripts
  ADD COLUMN IF NOT EXISTS capitulos_aprovados_texto_hash TEXT DEFAULT NULL;

COMMENT ON COLUMN manuscripts.capitulos_aprovados_texto_hash IS
  'MD5 do texto (texto_revisado ?? texto) no momento da aprovação dos capítulos. Comparado a cada geração de miolo para invalidar aprovação se o texto mudou.';

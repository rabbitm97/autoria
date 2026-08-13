-- PAPEL-PEDIDO-1 (13/ago/2026): papel escolhido no pedido passa a mandar
-- na lombada da capa.
--
-- Contexto: hoje a lombada da capa é calculada com PAPEL_GRAMATURA_PADRAO_GSM
-- (75g/m² fixo) na etapa de diagramação e o papel escolhido no carrinho vive
-- só em cart_items.config — transiente e ignorado pelo gate de
-- preparar-capa-grafica. Consequência: livro de 200 páginas em Pólen Bold 90
-- (caderno empírico 2.4667mm/32p) tem lombada real ≈15.4mm mas a capa foi
-- montada para ~10.4mm, saindo torta na gráfica.
--
-- Esta coluna persiste o papel escolhido no momento de "Adicionar ao
-- carrinho" para que o gate de divergência (lombada capa vs lombada real
-- do papel escolhido) e o ajustar-lombada leiam a mesma verdade. Cliente
-- burro: rota lê da coluna, não precisa passar no body.
--
-- Fallback retrocompatível: coluna null → gate continua usando
-- miolo.lombada_mm (comportamento atual, 75g fixo).
--
-- Cadeia canônica (verdade 24): entra APÓS 20260810000000_creditos_default_zero.
-- Aplicação: manual no Supabase Studio (NUNCA db push).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS papel_miolo_pedido text NULL;

COMMENT ON COLUMN public.projects.papel_miolo_pedido IS
  'Papel do miolo escolhido pelo autor no pedido de impressão. Valores '
  'aceitos: offset_75g, avena_80g, polen_bold_90g, couche_fosco_90g (ver '
  'PapelMiolo em lib/impressao-pricing.ts). Gravado no POST /api/carrinho. '
  'Fonte única lida por preparar-capa-grafica e ajustar-lombada. NULL = '
  'sem pedido ativo ou pedido anterior à PAPEL-PEDIDO-1 (fallback: '
  'miolo.lombada_mm com 75g fixo).';

NOTIFY pgrst, 'reload schema';

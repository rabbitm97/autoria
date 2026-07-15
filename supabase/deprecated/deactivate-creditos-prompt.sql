-- Bloco 1f — desativa o prompt do agente "creditos" na tabela agent_prompts.
--
-- Motivação: a rota /api/agentes/creditos deixou de chamar Claude. A ficha
-- catalográfica agora é entrada humana (bibliotecário CRB) ou é omitida por
-- completo. Manter o prompt ativo confunde inspeção do painel de agentes.
--
-- Execute manualmente no Supabase Studio > SQL Editor. Reversível: basta
-- flipar is_active de volta para true se algum dia voltarmos a usar IA aqui.

UPDATE agent_prompts
SET is_active = false
WHERE agent_name = 'creditos';

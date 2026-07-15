-- Migration: coluna QA + permite etapa 'qa' no projeto
-- Rodar no Supabase: Dashboard → SQL Editor → New query

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS dados_qa jsonb;
-- dados_qa = { score, aprovado, itens:[{categoria,status,mensagem}], recomendacao, analisado_em }

-- Adiciona etapa 'qa' ao CHECK (recria a constraint)
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_etapa_atual_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_etapa_atual_check
  CHECK (etapa_atual IN (
    'upload','diagnostico','revisao','sinopse_ficha',
    'capa','diagramacao','qa','preview','publicacao','concluido'
  ));

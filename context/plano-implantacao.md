# Autoria — Plano de Implantação

## Arquitetura: 4 camadas

### Camada 1 — Interface do Autor (Frontend)
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Deploy:** Vercel (automático)
- **Páginas:** Landing page (SEO), Dashboard do autor, Esteira de produção, Painel de royalties
- **Princípios:** Mobile-first obrigatório, 100% em PT-BR

### Camada 2 — Orquestração de IA (Motor Editorial)
- **IA:** Claude Sonnet (principal), Claude Opus (tarefas pesadas), DALL-E 3 (capas), ElevenLabs (áudio)
- **Custo por obra:** Revisão ~R$3, Capa ~R$2, Áudio ~R$6 → **Total ~R$8–15**
- **Orquestração:** Claude como orquestrador, estado por obra no Supabase, structured outputs JSON, streaming para UX

### Camada 3 — Processamento e Geração de Arquivos
- **PDF/X-1a (gráfica):** Puppeteer (HTML→PDF), Sharp.js (RGB→CMYK), ICC Profiles, sangria automática
- **EPUB 3.0 (eBook):** Calibre CLI, epub.js (preview), epubcheck (validação), metadados OPF
- **Audiolivro (MP3/M4B):** ElevenLabs API, FFmpeg (merge capítulos), marcadores de capítulo, clonagem de voz (Pro)
- **Parse de entrada:** mammoth.js (.docx), pdf-parse (.pdf), detecção de capítulos, normalização

### Camada 4 — Distribuição, Pagamentos e Dados
- **Distribuição digital:** Draft2Digital (15+ plataformas), KDP API (Amazon), Spotify for Authors
- **Pagamentos:** Stripe (cartão), Pagar.me (PIX/boleto), Lemon Squeezy (assinaturas), royalties via PIX
- **Banco:** Supabase + PostgreSQL, RLS ativo desde dia 1, Supabase Storage, Realtime dashboard
- **Comunicação:** Resend (transacional), WhatsApp API (status), PostHog (produto), Mixpanel (leitura)

## Os 9 agentes de IA

> Os agentes são roles distintos da mesma API Claude com system prompts dedicados. Os prompts especializados são o principal IP da Autoria.

### 1. Agente Orquestrador (Maestro)
- Recebe o manuscrito, avalia estado e decide qual agente acionar
- Mantém contexto completo da obra
- Detecta erros e aciona retry automático
- **Ferramentas:** Claude Sonnet, Supabase State, JSON Schema
- **Aciona:** todos os outros em sequência ou sob demanda

### 2. Agente Editorial (Revisão)
- Revisão ortográfica, gramatical e estilística PT-BR
- Gera sinopse (curta e longa), título, SEO keywords, bio, ficha catalogrática CBL
- Interface diff — autor aceita/rejeita
- **Output:** texto revisado + metadados JSON

### 3. Agente Capa IA (Design)
- Analisa gênero, tom e público do livro
- Gera 3 prompts DALL-E 3 especializados → 3 imagens CMYK 300dpi
- Converte para CMYK via Sharp.js
- **Diferencial:** nenhum concorrente BR tem isso

### 4. Agente Diagramação (Layout)
- Seleciona template (literário, técnico, ABNT, infantil, religioso) por gênero
- Configura margens, fontes, espaçamento
- Gera HTML intermediário → Puppeteer converte em PDF/X-1a
- **Output:** PDF/X-1a + EPUB 3.0

### 5. Agente Áudio (Audiolivro)
- Pré-processa texto para TTS (remove formatações, normaliza diálogos, adiciona pausas)
- Envia para ElevenLabs por capítulo
- Monta M4B com FFmpeg + marcadores de capítulo
- Clonagem de voz no plano Pro
- **Output:** MP3/M4B com marcadores de capítulo

### 6. Agente Distribuição (Publicação)
- Formata metadados para cada plataforma (Amazon ≠ Kobo)
- Publica via D2D API (15+ canais), KDP direto e Spotify for Authors
- Monitora status e notifica o autor
- **Output:** links de publicação ativos

### 7. Agente QA (Validação Técnica)
- Valida PDF/X-1a (sangria, resolução, CMYK, fontes embarcadas)
- Valida EPUB 3.0 (W3C epubcheck)
- Verifica metadados
- **Bloqueia** publicação se há erro crítico

### 8. Agente Analytics (Dados)
- Consolida royalties de todas as plataformas
- Gera relatório mensal por obra
- Detecta candidatas a licensing (alto engajamento)
- Alimenta dashboard em tempo real
- Roda diário automático + sob demanda

### 9. Agente Marketing & Suporte
- Gera marketing kit: 3 posts Instagram, thread X, e-mail para lista
- Responde suporte N1 via chat
- Escala para fundador apenas em casos complexos
- Aciona pós-publicação + chat de suporte

## Fluxo completo de uma obra (11 etapas)

```
1. Upload do manuscrito
   └─ Sistema → Orquestrador inicia fluxo

2. Diagnóstico gratuito automático
   └─ Ag. Editorial → mammoth.js → Claude

3. Autor escolhe plano e paga
   └─ Stripe/Pagar.me → webhook → Supabase → Orquestrador

4. Revisão e elementos editoriais
   └─ Ag. Editorial → diff view → autor aprova

5. 3 opções de capa geradas
   └─ Ag. Capa → Claude (prompt) → DALL-E 3 → Sharp

6. Diagramação + arquivos
   └─ Ag. Diagramação → Puppeteer (PDF) + Calibre (EPUB)

7. QA automático dos arquivos
   └─ Ag. QA → epubcheck + preflight → libera ou bloqueia

8. Audiolivro gerado (plano Completo+)
   └─ Ag. Áudio → ElevenLabs por capítulo → FFmpeg

9. Preview final + aprovação do autor
   └─ Sistema → epub.js + PDF viewer → checklist

10. Publicação em 15+ plataformas
    └─ Ag. Distribuição → D2D API + KDP + Spotify

11. Marketing kit gerado automaticamente
    └─ Ag. Marketing → Claude (copy) → dashboard
```

## Tratamento de exceções

| Situação | Fluxo |
|----------|-------|
| QA falha (PDF inválido) | Ag. QA → Ag. Diagramação (retry) → 3 falhas → fundador |
| Pagamento não processado | Stripe webhook → Ag. Marketing (e-mail) → retry 3x |
| D2D API indisponível | Ag. Distribuição → queue + retry → autor notificado |
| Suporte escalado (N2) | Ag. Suporte → ticket Notion → fundador em 2h |

## Princípios de orquestração
- Cada etapa é **idempotente** (reexecutável sem duplicar)
- Estado salvo no Supabase após cada etapa
- Falha em qualquer etapa não perde trabalho anterior
- Autor pode retomar de qualquer etapa a qualquer momento
- **Nunca** publicar sem aprovação explícita no preview
- **Nunca** cobrar segunda vez por falha técnica
- Timeout: 30min por etapa → retry → alerta fundador

## Roadmap detalhado por semanas

### Fase 1 — Semanas 1–4
| Tarefa | Executor | Prioridade |
|--------|----------|-----------|
| Next.js 14 + Tailwind + shadcn | Ag. Código | Crítico |
| Schema Supabase + RLS (users, manuscripts, works) | Ag. Código | Crítico |
| Landing page + lista de espera | Ag. Código | Crítico |
| Entrevistar 10 autores potenciais | Fundador | Crítico |
| Protótipo revisão Claude API | Ag. Editorial | Alto |
| Contatar 3 gráficas para parceria POD | Fundador | Alto |
| Integração Stripe + Pagar.me PIX | Ag. Código | Crítico |
| Módulo upload + diagnóstico gratuito | Ag. Editorial | Crítico |
| Gerador sinopse + ficha catalogrática | Ag. Editorial | Crítico |
| Capa DALL-E 3 (3 opções) | Ag. Capa | Crítico |
| **🎯 1ª obra processada e cobrada (R$197–697)** | **Fundador** | **Crítico** |
| PDF básico via Puppeteer | Ag. Diagramação | Alto |

### Fase 1 — Semanas 5–12
| Tarefa | Executor | Semana |
|--------|----------|--------|
| EPUB 3.0 via Calibre CLI | Ag. Diagramação | S5–6 |
| Conversão RGB→CMYK (Sharp.js + ICC) | Ag. Capa | S5–6 |
| Dashboard do autor | Ag. Código | S7 |
| Agente QA: checklist automático | Ag. QA | S7–8 |
| Onboarding e-mail (5 steps) | Ag. Marketing | S8 |
| 10 autores beta (cobrar) | Fundador | S8–10 |
| Parceria definitiva gráfica POD | Fundador | S8 |
| Audiolivro MVP (ElevenLabs) | Ag. Áudio | S9 |
| Integração Draft2Digital | Ag. Distribuição | S9 |
| 3 cases de sucesso no site | Fundador | S11 |
| Retrospectiva + Go/No-Go Fase 2 | Fundador | S12 |

### Critérios Go/No-Go para Fase 2
- ✅ Mínimo R$15k em receita acumulada
- ✅ Pelo menos 10 obras processadas end-to-end
- ✅ Fluxo básico automatizado (revisão + capa + PDF/EPUB)
- ✅ NPS ≥ 7/10 com autores beta
- ✅ Parceria com gráfica POD ativa e testada
- ⚠️ Se R$15k não atingido: **NÃO passar para Fase 2** — investigar churn primeiro

### Fase 2 — Meses 4–6
| Tarefa | Executor | Prioridade |
|--------|----------|-----------|
| Diagramação automática 5 templates | Ag. Diagramação | Crítico |
| Preview interativo (epub.js + PDF.js) | Ag. Código | Alto |
| ISBN via CBL — integração automática | Externo + Fundador | Alto |
| POD integrado com gráfica parceira | Ag. Distribuição | Alto |
| Clonagem de voz ElevenLabs (Pro) | Ag. Áudio | Médio |
| Painel royalties em tempo real | Ag. Analytics | Alto |
| Suite B2B Starter (R$97/mês) | Fundador | Crítico |
| API de revisão em lote (B2B) | Ag. Código | Alto |
| Verificação ABNT automática | Ag. Editorial | Alto |
| Programa de referral (5% comissão) | Ag. Código | Médio |
| Analytics por capítulo (modelo Inkitt) | Ag. Analytics | Médio |
| B2B Pro (R$297/mês) | Fundador | Alto |

### Fase 3 — Meses 7–12
| Tarefa | Executor | Prioridade |
|--------|----------|-----------|
| B2B Enterprise (R$997/mês) + white label | Fundador | Crítico |
| SEO editorial: 50 artigos | Ag. Marketing | Alto |
| Parcerias Kiwify + Eduzz + Monetizze | Fundador | Crítico |
| Tradução EN + ES (plano Pro) | Ag. Editorial | Alto |
| Marketing kit IA (posts + thread por obra) | Ag. Marketing | Médio |
| Comunidade Discord/WhatsApp | Fundador | Médio |
| Webinar mensal gratuito | Fundador | Médio |
| Infraestrutura de filas (Upstash/BullMQ) | Ag. Código | Alto |
| 1.000+ títulos publicados (marco catálogo) | Sistema | Crítico |
| Arquitetura produto de leitura (Ano 2) | Fundador | Alto |
| Decisão: levantar capital ou bootstrapped | Fundador | Alto |

## Orçamento operacional por fase

### Fase 1 (meses 1–3): R$700–1.300/mês
| Item | Custo |
|------|-------|
| Claude Sonnet API | R$200–500 |
| DALL-E 3 (capas) | R$50–150 |
| ElevenLabs (áudio) | R$100–300 |
| Supabase Pro | R$130 |
| Vercel Pro | R$110 |
| Resend + misc | R$100 |
| **Break-even** | **~4 vendas do plano R$397/mês** |

### Fase 2 (meses 4–6): R$2.500–4.000/mês
- APIs IA (escala ~5x): R$1.500–3.000
- WhatsApp API: R$200
- Mixpanel: R$150
- Infra completa: R$400
- Com R$50k MRR: custo <8% da receita

### Fase 3 (meses 7–12): R$18–30k/mês
- APIs IA (escala ~20x): R$5.000–10.000
- Equipe (se contratar): R$8.000–15.000
- Marketing pago (teste): R$2.000
- Infra + ferramentas: R$2.500
- Com R$150k MRR: custo <20% da receita

## KPIs

### Financeiros
- MRR (meta mensal recorrente)
- Ticket médio por obra
- CAC orgânico estimado
- LTV por autor
- Churn mensal B2B (meta <3%)
- Break-even operacional

### Produto
- Obras processadas/semana
- Tempo médio de produção
- Taxa de erro QA (meta <5%)
- NPS autores (meta >8)
- Taxa de aprovação do preview
- Taxa de publicação concluída

### Crescimento
- Novos autores/semana
- Conversão free → pago
- Obras no catálogo (1k meta Ano 1)
- Leads B2B qualificados/mês
- Tráfego orgânico (SEO)
- Referrals por autores

### KPIs críticos por fase
| Marco | Quando |
|-------|--------|
| 1º pagamento real | Semana 4 |
| R$50k MRR | Fim Fase 2 (mês 6) |
| 1.000 obras no catálogo | Fim Fase 3 (mês 12) |

## Adições estratégicas ao modelo original
1. **Agente QA dedicado** — valida PDF/X-1a e EPUB antes de publicar (zero obra problemática)
2. **Matriz RACI explícita** — fundador não vira gargalo em decisões técnicas
3. **Critérios Go/No-Go entre fases** — sem escalar produto não validado
4. **Tratamento de exceções** — retry, timeout 30min, filas persistentes no Supabase
5. **Cronograma semanal** — clareza executiva diária sobre o que fazer
6. **Orçamento detalhado por fase** — previsibilidade financeira real
7. **Agente Marketing & Suporte unificado** — fundador só atende N2
8. **Idempotência na orquestração** — sem cobranças duplicadas ou publicações duplicadas

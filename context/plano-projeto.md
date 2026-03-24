# Autoria — Plano de Projeto

## Princípio central
**Claude constrói, fundador decide.** 90% do código, textos e integrações são construídos por agentes Claude. O fundador especifica, valida mercado e fecha vendas.

## Os 7 agentes Claude

Cada agente é uma instância Claude com system prompt especializado, escopo delimitado e contexto fixo do projeto.

| Agente | Domínio | Ferramentas |
|--------|---------|-------------|
| **Engenheiro** | Todo o código da plataforma | Next.js, Supabase, TypeScript, APIs |
| **Editorial** | Prompts de revisão, sinopse, ficha, SEO | Claude Sonnet, structured outputs |
| **Designer** | Capas IA, diagramação, CSS editorial | DALL-E 3, Sharp.js |
| **Produto** | UX, flows, copy de interface, backlog | PostHog, Mixpanel |
| **Growth** | Aquisição, conteúdo, outreach, SEO | Resend, WhatsApp API |
| **Dados** | Analytics, royalties, queries SQL | PostgreSQL, PostHog |
| **Suporte** | FAQ, diagnóstico, triagem de tickets | Resend, WhatsApp |

**Agente Orquestrador** (meta-nível): mantém coerência do projeto, rastreia decisões, impede feature creep. Acionado toda segunda-feira.

## Papéis

**Fundador (CEO/CPO):**
- Define prioridades da semana
- Valida entregáveis dos agentes
- Toma decisões de negócio
- Relacionamento com parceiros
- Entrevistas com autores
- Fechamento de vendas B2B

**Agentes Claude (CTO/Equipe):**
- Escreve 100% do código
- Integra APIs externas
- Cria prompts editoriais
- Gera SQL e migrations
- Escreve copy e UX texts
- Revisão e QA de conteúdo

**Ferramentas automáticas (Infra):**
- Vercel — deploy automático
- Supabase — banco sem ops
- Draft2Digital — distribuição
- Stripe + Pagar.me — pagamentos
- Resend — e-mails transacionais
- Cloudflare — CDN + proteção

## Matriz RACI (resumida)

| Atividade | Fundador | Ag. Engenheiro | Outros Agentes | Auto |
|-----------|----------|----------------|----------------|------|
| Prioridades da semana | A/R | C | I | — |
| Código da plataforma | A | R | C/I | — |
| Prompts editoriais | A | C | R (Editorial) | — |
| Geração de capas | A | C | R (Designer) | — |
| Entrevistar autores | A/R | — | C | — |
| Pagamentos (config) | A | R | — | R |
| Deploy/infra | A | R | — | R |
| Distribuição digital | A | R | — | R |
| Análise de métricas | A | — | — | R |

**Regra de ouro:** Decisões de negócio (preço, parceiro, feature no roadmap) = Fundador. Decisões de implementação (como construir, qual lib usar) = delegar ao agente.

## O que o fundador NUNCA delega
- Conversa inicial com potenciais clientes
- Decisão de avançar entre fases
- Contratos com parceiros (gráficas, D2D)
- Pricing e mudanças de modelo
- Validação de NPS e feedback

## Roadmap em 3 fases

### Fase 1 — Meses 1–3: Fundação e Validação
**Meta:** 1º cliente pagante na semana 4 + R$20k ao final do trimestre

**Semanas 1–2:** Setup (repo, Supabase, Vercel, auth)
**Semanas 3–4:** Produto mínimo (revisão IA, sinopse, capa DALL-E 3, Stripe/PIX) + 1ª obra processada e cobrada
**Semanas 5–8:** PDF/EPUB, dashboard do autor, 10 entrevistas com autores, parceria gráfica
**Semanas 9–12:** Audiolivro ElevenLabs, Draft2Digital, 5 obras processadas, R$20k acumulados

**Critério de avanço:**
- R$15k+ em receita acumulada
- 10 obras processadas end-to-end
- Fluxo básico automatizado (revisão + capa + PDF/EPUB)
- NPS ≥ 7/10 com autores beta
- Parceria com gráfica POD ativa

### Fase 2 — Meses 4–6: Produto Completo
**Meta:** Fluxo 100% automatizado + R$50k MRR

- Dashboard completo do autor
- 5 templates de diagramação
- Preview interativo (epub.js + PDF viewer)
- Draft2Digital integrado (15+ plataformas)
- Audiolivro com ElevenLabs
- ISBN via CBL
- POD integrado com gráfica parceira
- Painel de royalties em tempo real
- Onboarding automatizado
- Suite B2B Starter lançada
- Programa de referral (5% comissão)
- Analytics por capítulo (modelo Inkitt)

### Fase 3 — Meses 7–12: Escala e Growth
**Meta:** 200 obras/mês + 30 assinantes B2B + R$150k MRR

- Clonagem de voz (ElevenLabs)
- Tradução EN + ES
- Marketing kit IA (posts, banners)
- B2B Pro + Enterprise + white label
- API pública documentada
- SEO: 50 artigos "como publicar X"
- Parcerias: Kiwify, Eduzz, Monetizze
- Comunidade Discord/WhatsApp de autores
- Webinar mensal gratuito
- Infraestrutura de filas (Upstash/BullMQ) para escala

## Cronograma semanal (52 semanas)

| Semanas | Foco |
|---------|------|
| S1–S2 | Setup total (repo, Supabase, Vercel, auth) |
| S3 | Landing page + lista de espera + upload de manuscrito |
| S4 | Revisão Claude + capa DALL-E 3 → **1ª obra processada** |
| S5–S6 | PDF/X-1a + EPUB + Stripe/PIX → **1ª cobrança real** |
| S7–S8 | 10 entrevistas + parceria gráfica + POD manual |
| S9–S12 | 5 obras processadas + R$20k acumulados |
| S13–S16 | Dashboard completo + templates de diagramação + preview |
| S17–S18 | D2D integrado + audiolivro → **publicação automática** |
| S19–S20 | B2B Starter + 20 autores beta + referral |
| S21–S24 | Royalties + analytics + ISBN → **R$50k MRR** |
| S25–S28 | Clonagem de voz + tradução + marketing kit |
| S29–S36 | Parcerias + API pública + ABNT automático |
| S37–S44 | B2B Enterprise + 200 obras/mês + 30 B2B |
| S45–S52 | Produto de leitura (planejamento Ano 2) → **R$150k MRR** |

## Estrutura de custos

### Fixos mensais
| Item | Custo |
|------|-------|
| Vercel Pro | R$110/mês |
| Supabase Pro | R$130/mês |
| Cloudflare Pro | R$110/mês |
| Resend | R$50/mês |
| PostHog | R$0 (gratuito até 1M eventos) |
| **Total fixo** | **~R$400/mês** |

### Variáveis por obra
| Item | Custo |
|------|-------|
| Claude Sonnet API | R$4–6/obra |
| DALL-E 3 (3 capas) | R$1–2/obra |
| ElevenLabs (audiolivro) | R$6/obra |
| Supabase Storage | R$0,10/obra |
| **Total por obra** | **~R$13–14/obra** |

### Por fase
| Fase | Custo mensal | Contexto |
|------|-------------|---------|
| Fase 1 (meses 1–3) | R$700–1.300 | Break-even: ~4 vendas do plano R$397 |
| Fase 2 (meses 4–6) | R$2.500–4.000 | Com R$50k MRR: custo <8% da receita |
| Fase 3 (meses 7–12) | R$18–30k | Com R$150k MRR: custo <20% da receita |

## KPIs por fase

### Fase 1 (semana 12)
- 1 cliente pagante ativo (semana 4)
- R$20k em receita acumulada
- 10 entrevistas com autores
- 1 gráfica parceira com acordo
- NPS ≥ 8

### Fase 2 (semana 24)
- R$50k MRR
- 30 obras publicadas via D2D
- 20 autores beta com NPS ≥ 9
- 3 assinantes B2B Starter
- Fluxo 100% automatizado
- Churn mensal ≤ 10%

### Fase 3 (semana 52)
- R$150k MRR
- 200 obras/mês processadas
- 30 assinantes B2B ativos
- 500+ títulos no catálogo
- CAC payback ≤ 30 dias

## Métricas de produto (semanais)
- Obras iniciadas vs. concluídas (taxa de conclusão)
- Tempo médio do upload ao arquivo final
- Taxa de aprovação das sugestões de revisão
- Taxa de aprovação das capas geradas
- NPS por obra (pergunta automática pós-entrega)
- Abandono por etapa do fluxo

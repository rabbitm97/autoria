# Autoria — Modelo de Negócio

## Missão
Democratizar a publicação de livros no Brasil. Qualquer autor entra com um manuscrito e sai com livro físico, eBook e audiolivro publicados em todas as plataformas — sem editora, sem intermediário caro.

## Tagline
"Do manuscrito ao leitor."

## Oportunidade de mercado
- Mercado editorial BR 2024: **R$6,6 bilhões**
- Crescimento digital em 2024: **+32,6%**
- SAM (autopublicação + ferramentas): **R$800M**
- Janela: Spines (líder mundial com IA editorial, +1.000% YoY) ainda não opera em português — **12–18 meses** de vantagem

## Os 3 produtos

### Produto 1 — B2C: Esteira completa do autor
Do upload ao livro publicado. IA faz tudo; autor aprova cada etapa.

**Fluxo:** Upload → Diagnóstico gratuito → Revisão IA → Sinopse/Ficha → Capa IA → Diagramação → Preview → PDF/EPUB/Audiolivro → Publicação 15+ plataformas → POD → Royalties

**Público:** autores de 1ª obra, coaches, consultores, ficção, Wattpad, religiosos, criadores Hotmart/Kiwify

### Produto 2 — B2B: Suite de produtividade editorial
Para editoras, gráficas e diagramadores. Mercado virgem no Brasil.
- Revisão em lote, conversão RGB→CMYK, diagramação, ABNT, API de revisão, white label

### Produto 3 — Leitores (Ano 2+)
Catálogo de leitura com assinatura (modelo Pratilipi).
- Assinatura R$19,90/mês, SuperFan R$9,90+/mês por autor, Coins/gifting, Licensing de IP

## 7 Fontes de receita

| # | Fonte | Quando ativa |
|---|-------|-------------|
| 1 | Esteira B2C por obra (R$197/397/697) | Dia 1 |
| 2 | Comissão 15% sobre vendas digitais | Dia 1 |
| 3 | Print on demand — margem 10–15% | Dia 1 |
| 4 | Assinatura B2B (R$97/297/997/mês) | Mês 3 |
| 5 | Assinatura leitores (R$19,90/mês) | Ano 2 |
| 6 | Coins e gifting (plataforma 30%) | Ano 2 |
| 7 | Licensing de IP | Ano 3–5 |

## Tabela de preços

### B2C — Por obra
| Plano | Preço | O que inclui |
|-------|-------|-------------|
| Publicação | R$0 | Arquivo pronto — validação + publicação (receita via comissão 15%) |
| Essencial | R$197 | Revisão IA + sinopse + ficha + 3 capas IA + diagramação + EPUB + publicação digital |
| Completo | R$397 | Essencial + PDF/X-1a + audiolivro (voz IA) + ISBN + POD |
| Pro | R$697 | Completo + clonagem de voz do autor + tradução 1 idioma + marketing kit IA |

### B2B — Assinatura mensal
| Plano | Preço | Perfil |
|-------|-------|--------|
| Starter | R$97/mês | Até 10 projetos — diagramadores/pequenas editoras |
| Pro | R$297/mês | Ilimitado — editoras médias |
| Enterprise | R$997/mês | White label — gráficas/editoras grandes |

### Leitores (Ano 2+)
- Mensal: R$19,90/mês
- Anual: R$149/ano (38% off)
- SuperFan: R$9,90+/mês por autor (autor recebe 70%)

## Diferenciais vs concorrentes

| | Autoria | Spines | UICLAP | Clube de Autores |
|---|---------|--------|--------|-----------------|
| IA nativa | Claude Sonnet | Sim (líder, mas só inglês) | StoryZap (fora do produto) | AILA (cobrado à parte) |
| Capa IA | DALL-E 3 | 70+ opções | Não | Não |
| Audiolivro | ElevenLabs | Sim | Não | Não |
| POD Brasil | Sim | Não | Sim | Sim |
| B2B Suite | Produto dedicado | Não | Não | Não |
| Em PT-BR | Sim | Não (inglês) | Sim | Sim |
| Royalties autor | 85% | 70% | 100% | 80% |
| Preço por obra | R$197–697 | ~R$6.000+ | — | — |

## Custos de produção por obra (APIs)
- Claude Sonnet (revisão + editorial): ~R$4–6
- DALL-E 3 (3 capas): ~R$1–2
- ElevenLabs (audiolivro 80k palavras): ~R$6
- **Total: ~R$8–14/obra**
- **Margem bruta: 95–97%**

## Projeção financeira
| Ano | Receita |
|-----|---------|
| 1 | R$165k |
| 2 | R$876k |
| 3 | R$3,2M |
| 4 | R$12M |
| 5 | R$40M+ |

## Stack técnica
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **IA:** Claude Sonnet API, DALL-E 3 API, ElevenLabs API
- **Geração de arquivos:** Puppeteer (PDF/X-1a), Calibre CLI (EPUB 3.0), FFmpeg (áudio), Sharp.js (CMYK), mammoth.js (parse .docx)
- **Banco/Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime), RLS ativo
- **Distribuição:** Draft2Digital API (15+ plataformas), KDP API (Amazon), Spotify for Authors
- **Pagamentos:** Stripe (cartão), Pagar.me (PIX/boleto), Lemon Squeezy (assinaturas)
- **Comunicação:** Resend (e-mail), WhatsApp API (notificações)
- **Analytics:** PostHog, Mixpanel
- **Infra:** Vercel (deploy), Cloudflare (CDN)

## Defensabilidade (6 moats)
1. Catálogo de IP em português (cresce com o tempo)
2. Dados editoriais do mercado BR (proprietários)
3. Rede de parceiros BR (gráficas, CBL, distribuidoras)
4. Comunidade de autores publicados
5. Claude como diferencial de IA (qualidade superior)
6. First mover B2B editorial BR (suite sem concorrente)

## Riscos principais
- **Alto:** Spines chegar ao português antes da escala (mitigação: velocidade + POD BR + preço 10x menor)
- **Alto:** Clube de Autores acelerar investimento em IA
- **Médio:** Crescer usuários sem receita (mitigação: modelo de caixa desde semana 4)
- **Médio:** Qualidade IA abaixo da expectativa (mitigação: posicionar como "assistente", não substituto)

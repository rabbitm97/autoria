# Autoria — Modelo de Negócio v2.0

> Atualizado a partir do código real · github.com/rabbitm97/autoria · 57 commits · deploy ao vivo em autoria.app · Autoria Tecnologia Ltda

**Do manuscrito ao leitor. Em horas, não em meses.**

A plataforma brasileira de publicação com IA. Revisão, capa, diagramação, audiolivro e distribuição global — em português, com Claude e Nano Banana Pro como motor. **90% para o autor.**

| Indicador | Valor |
|---|---|
| Mercado editorial BR 2024 | R$6,6 bi |
| Crescimento digital em 2024 | +32,6% |
| Retenção de royalties pelo autor | 90% |
| Janela antes da Spines chegar ao PT | ~12 meses |

---

## 01 — Estado real do produto

### Onde a Autoria está hoje

Este documento é construído a partir do código no repositório, não do plano original. O que está implementado é marcado como tal. O que está pendente também — sem maquiagem.

| Área | Status | Detalhes |
|---|---|---|
| Marca e domínio | ✅ Implementado | Autoria · autoria.app · PJ formalizada (Autoria Tecnologia Ltda). Landing pública, blog, páginas legais, login Google + e-mail. |
| Plataforma | 🔄 Em construção | Frontend completo. Dashboard com fluxo de 6 etapas. Núcleo de IA (Claude Sonnet + Nano Banana Pro) plugado. Geração de PDF e EPUB nativa. Pagamentos, audiolivro e distribuição automatizada ainda pendentes. |
| Critério de lançamento | 🎯 Objetivo | 1 livro real, fim a fim |

**Critério único de prontidão:** Autoria lança quando o fundador, usando a própria plataforma, conseguir transformar *um manuscrito real em um livro publicado na Amazon* — e ficar satisfeito com cada artefato produzido (capa, miolo, EPUB, PDF). Não antes. Não por uma data arbitrária. Esse é o único marco que importa.

---

## 02 — Mudanças vs. plano original

### O que amadureceu no caminho

Decisões técnicas e de negócio que evoluíram entre o doc v1 (planejamento) e este v2 (realidade). Quase todas vieram do contato com o problema real, não de mudanças de opinião.

| Aspecto | Plano original (v1) | Realidade (v2) |
|---|---|---|
| **Comissão** | 15% (autor retinha 85%) | **10% · "90% para o autor"** — melhor split do Brasil. Receita passiva crescente sem virar pedágio. |
| **Geração de capas** | DALL-E 3 (SDK OpenAI) | **Nano Banana Pro (Gemini)** — mais barato, melhor em texto integrado e composição. |
| **Geração de arquivos** | Puppeteer + Calibre CLI (container pesado) | **@react-pdf/renderer + JSZip** — roda em Vercel Edge, cold start em milissegundos, custo desprezível. |
| **Esteira editorial** | 9 etapas | **6 etapas consolidadas** — Upload → Diagnóstico → Revisão → Capa → Diagramação → Publicação. |
| **Stack** | Next.js 14 + Tailwind 3 | **Next.js 16 + React 19 + Tailwind v4** — bleeding edge, App Router maduro, Server Actions nativos. |
| **Capa e sinopse** | Sinopse curta + longa · capa simples | **3 formatos de sinopse · capa completa** (frente + contracapa + lombada + orelhas, 5 formatos físicos, calibragem automática de lombada). |

---

## 03 — Tese central

### Por que essa empresa, agora

O mercado lusófono de autopublicação é grande, está crescendo no digital, e nenhum player oferece IA editorial integrada de qualidade em português. A janela existe — e tem prazo.

| Pilar | Título | Descrição |
|---|---|---|
| **Missão** | Democratizar a publicação de livros no Brasil | Qualquer autor, com qualquer manuscrito, publica um livro de qualidade profissional — sem editora, sem intermediário caro, sem precisar saber diagramação ou design. |
| **Diferencial** | IA como DNA, não como add-on | Concorrentes adicionaram IA como funcionalidade extra cobrada à parte. A Autoria nasceu com Claude Sonnet e Nano Banana Pro como motor de cada etapa do fluxo. |
| **Janela** | A Spines ainda não fala português | A plataforma mais avançada do mundo em IA editorial cresce 1.000% ao ano, mas só opera em inglês. O mercado lusófono está aberto — por mais ~12 meses. |

---

## 04 — Mercado

### O tamanho da oportunidade

Dados CBL/SNEL 2024 verificados. O impresso encolhe. O digital explode. O timing é agora.

| Métrica | Valor |
|---|---|
| Faturamento total mercado editorial BR 2024 | R$6,6 bi |
| Crescimento digital em 2024 | +32,6% |
| Queda real do impresso | −1,1% |
| Títulos produzidos em 2024 | 44 mil |
| Digital sobre faturamento | 9% (espaço enorme) |

### TAM / SAM / SOM

| Mercado | Valor | Definição |
|---|---|---|
| TAM | R$4,2 bi | Mercado editorial BR (excl. governo) |
| SAM | R$800 M | Autopublicação + ferramentas independentes |
| SOM (ano 3) | R$80 M | 10% do SAM com produto superior |

### Segmentos prioritários

- Não-ficção adulto: R$1,2 bi · 28,5% do mercado · coaches, consultores, professores
- Ficção adulto: 15,7% do faturamento · romance, fantasia, thriller
- Religiosos: 29,5% dos exemplares · maior em volume
- Audiobook: +4 pontos percentuais em 2024 · aceleração visível
- Assinaturas digitais: 44% do faturamento digital · modelo recorrente

### Referências que validam a tese

- Spines: +1.000% YoY com IA editorial em inglês
- Pratilipi (Índia): R$50M/ano em literatura vernácula
- Pocket FM: US$150M/ano com áudio narrativo
- UICLAP: R$8M/ano só com físico, sem IA · com IA pode escalar
- Mercado global de autopublicação: US$1,85 bi → US$6,16 bi até 2033 (+16,7%/ano)

---

## 05 — Produtos

### Os 3 produtos da plataforma

Mesma infraestrutura de IA. Três receitas. Três públicos. Lançam em ondas — B2C primeiro, B2B junto, Leitores depois do catálogo crescer.

#### Produto 1 · B2C · Esteira completa do autor (lançamento simultâneo)

Do manuscrito ao livro publicado. IA faz tudo. Autor aprova cada etapa.

- Upload e diagnóstico editorial gratuito
- Revisão e edição com Claude Sonnet em modo editorial
- Geração de sinopse (3 formatos), título, ficha CBL, bio, palavras-chave SEO
- Capa completa com Nano Banana Pro · frente, contracapa, lombada, orelhas
- 5 formatos físicos · 16×23, 14×21, 11×18, 20×20, A4 · com calibragem automática de lombada
- Diagramação automática · literário, técnico, ABNT, infantil, religioso
- Preview interativo do livro completo
- PDF para impressão (gráfica) + EPUB 3.0 (eReader)
- Audiolivro com voz neural ElevenLabs (em integração)
- ISBN via CBL (processo manual no piloto, automatizar depois)
- Publicação em 15+ plataformas via Draft2Digital (manual no piloto)
- POD em gráfica brasileira parceira
- Painel de royalties em tempo real

**Público:** Autores de 1ª obra · Coaches e consultores · Autores de ficção · Criadores Hotmart/Kiwify · Autores religiosos · Professores e pesquisadores

#### Produto 2 · B2B · Suite de produtividade editorial (lançamento simultâneo)

Ferramentas com IA para editoras, gráficas e diagramadores. Mercado virgem no Brasil. Roadmap aprovado, código ainda não escrito — entra junto do B2C no lançamento.

- Revisão ortográfica em lote
- Conversão RGB → CMYK automática
- Diagramação assistida em templates
- Ajuste de sangria para gráficas
- Verificação ABNT automática
- Ficha catalográfica em lote
- API de revisão para integrações
- Gestão de múltiplos projetos
- White label (Enterprise)

**Público:** Editoras independentes · Gráficas digitais · Diagramadores freelance · Revisores profissionais · Agências de conteúdo

#### Produto 3 · Leitores · Catálogo de leitura (Ano 2+)

O catálogo publicado vira produto para leitores. Receita recorrente que cresce com o número de obras na plataforma. Lança quando atingir 1.000+ títulos.

- **Assinatura de leitura:** R$19,90/mês acesso ilimitado · R$149/ano (38% off) · Autor recebe por páginas/minutos
- **SuperFan + Coins:** Leitor assina autor R$9,90+/mês · Coins desbloqueiam capítulos · Gifting virtual
- **Licensing de IP:** Histórias populares → série/filme · Autor recebe 70–80% do deal

---

## 06 — Esteira de IA

### As 6 etapas do fluxo

Consolidação das 9 etapas originais em 6, na ordem que o autor experimenta.

| # | Etapa | Status | Tecnologia | Detalhes |
|---|---|---|---|---|
| 1 | **Upload e diagnóstico** | ✅ Implementado | Claude Sonnet · mammoth · pdf-parse | .docx · .pdf · .txt · até 50 MB. Extração e normalização, detecção de capítulos, análise de qualidade (coesão, consistência, gênero), diagnóstico de tamanho e mercado. **Gratuito — isca de aquisição.** |
| 2 | **Revisão e edição com IA** | ✅ Implementado | Claude Sonnet · diff view | Revisão ortográfica/gramatical PT-BR, coesão textual, consistência de personagens/tempo verbal/espaço, sugestões de ritmo. Geração editorial integrada: sinopse (3 formatos), título, ficha CBL, bio, palavras-chave SEO. |
| 3 | **Capa com IA** | ✅ Implementado | Claude Sonnet · Nano Banana Pro · Sharp | Claude analisa o livro → gera prompt → Nano Banana Pro renderiza 3 opções. Capa completa: frente + contracapa + lombada + orelhas. 5 formatos físicos, calibragem automática de lombada, conversão CMYK. **Diferencial absoluto — nenhum concorrente BR oferece capa por IA.** |
| 4 | **Diagramação automática** | 🔄 Em evolução | @react-pdf/renderer · JSZip (EPUB) | Templates: literário, técnico, acadêmico (ABNT), infantil, religioso. Margens, fontes, espaçamento configuráveis. Preview em tempo real. Verificação ABNT automática. Ponto técnico mais difícil — prioridade ativa. |
| 5 | **Audiolivro** | ⏳ A implementar | ElevenLabs | Narração com voz neural em português. Clonagem de voz do autor no plano Pro. Saída MP3 + M4B com marcadores de capítulo. **Custo estimado: ~R$6 por audiolivro de 80k palavras.** Chave já provisionada no .env. |
| 6 | **Publicação e POD** | 🔄 Parcial | Gráfica BR · D2D · Supabase | Gráfica brasileira parceira fechada para POD. Distribuição digital ainda manual no piloto (KDP, Apple, Kobo, Google Play, Spotify). Integração Draft2Digital automatizada após validar fluxo. Painel unificado de royalties em construção. |

---

## 07 — Modelo de receita

### 7 fontes em camadas

As 3 primeiras geram caixa desde o lançamento. As demais se somam à medida que catálogo, base B2B e leitores crescem.

> **Anti-padrão Pratilipi:** Eles demoraram 6 anos para encontrar monetização e quase quebraram com 20M de usuários sem receita. As fontes 1, 2 e 3 da Autoria geram caixa desde o lançamento — sem precisar de capital externo para sobreviver à curva de aprendizado.

| # | Fonte | Quando | Margem | Descrição |
|---|---|---|---|---|
| 1 | **Esteira de produção B2C por obra (upfront)** | Dia 1 | 95–97% | Planos R$197 / R$397 / R$697 por obra. Custo real: ~R$8–15 (Claude + Nano Banana Pro + ElevenLabs combinados). Validado por Spines (+1.000% YoY) e BookBaby (US$1.090+). |
| 2 | **Comissão 10% sobre vendas digitais** | Dia 1 | Passiva crescente | 10% de cada venda de eBook e audiolivro. Autor retém 90% — melhor que Spines (70%), KDP (70%) e Clube (80%). Comunicação central da marca. |
| 3 | **Print on demand** | Dia 1 | 10–15% na impressão | Leitor pede → gráfica parceira imprime → entrega. Zero estoque, zero risco. Validado por UICLAP (R$8M/ano) e Lulu. |
| 4 | **Assinatura B2B** | Lançamento simultâneo | ~85% | Starter R$97/mês · Pro R$297/mês · Enterprise R$997/mês. Receita recorrente previsível. Churn baixo — ferramenta de trabalho diário. |
| 5 | **Assinatura de leitura** | Ano 2+ | Recorrente | R$19,90/mês · R$149/ano. SuperFan R$9,90+/mês por autor (autor recebe 70%). Lançar após 1.000+ títulos. Maior potencial no longo prazo. |
| 6 | **Coins e gifting** | Ano 2+ | 30% retido | Leitores compram coins para desbloquear capítulos ou presentear autores. Converte usuário gratuito em pagante. Validado por Pratilipi Coins, Pocket FM (US$150M/ano). |
| 7 | **Licensing de IP** | Ano 3+ | 20–30% retido | Obras com alto engajamento licenciadas para série, filme, audiolivro premium. Autor recebe 70–80%. Validado por Pratilipi (Disney Star), Inkitt (Hollywood), Wattpad (Sony). |

---

## 08 — Tabela de preços

### B2C · Por obra (esteira de produção)

| Plano | Preço | Inclui |
|---|---|---|
| **Diagnóstico** | Grátis | Análise de qualidade textual, detecção de capítulos, diagnóstico de mercado, gênero provável. Sem cartão de crédito. |
| **Essencial** | R$197/obra | Revisão Claude Sonnet · Sinopse (3 formatos) + ficha CBL · 3 opções de capa por IA · Diagramação EPUB 3.0 · Publicação em 15+ plataformas · Painel de royalties |
| **Completo** ⭐ | R$397/obra | Tudo do Essencial + PDF para impressão + Capa completa (frente + contra + lombada + orelhas) + Audiolivro voz neural + ISBN + POD no Brasil |
| **Pro** | R$697/obra | Tudo do Completo + Clonagem de voz do autor + Tradução para 1 idioma + Marketing kit IA + Gerente de conta dedicado |

**Comissão 10% · "90% para o autor"** sobre cada venda de eBook ou audiolivro. ISBN, direitos autorais e propriedade da obra permanecem 100% com o autor.

### B2B · Assinatura mensal (suite editorial)

| Plano | Preço | Inclui |
|---|---|---|
| **Starter** | R$97/mês · até 10 projetos | Revisão em lote · RGB→CMYK automático · Diagramação em templates · Ficha catalográfica em lote · Verificação ABNT |
| **Pro** ⭐ | R$297/mês · ilimitado | Tudo do Starter + API de revisão + Relatórios de produção + 5 usuários inclusos + Suporte em 48h |
| **Enterprise** | R$997/mês · white label | Tudo do Pro + White label completo + Treinamento de estilo próprio + SLA garantido + API completa + onboarding |

### Leitores · Assinatura de catálogo (ano 2+)

| Plano | Preço | Inclui |
|---|---|---|
| Mensal | R$19,90/mês | Acesso ilimitado ao catálogo de eBooks. Autores recebem por páginas lidas. |
| Anual | R$149/ano (38% off) | eBooks + audiolivros + conteúdo exclusivo. |
| SuperFan | R$9,90+/mês por autor | Leitor assina autor específico. Autor recebe 70% direto. |

---

## 09 — Análise competitiva

### Posição no mercado

Única plataforma que cobre tudo — em português, com IA nativa, preço acessível, e split de 90% para o autor.

| Plataforma | Grátis | IA nativa | Capa IA | Diagramação | Audiolivro | EPUB | 15+ plat. | POD BR | B2B | PT-BR | Royalties |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Spines | Não | Sim | 70+ opções | Sim | Sim | Sim | 100+ canais | Não | Não | Inglês | 70% |
| Clube de Autores | Sim | AILA (cobrada) | Não | Não | Não | PDF conv. | Algumas | Sim | Não | Sim | 80% |
| UICLAP | Sim | StoryZap (fora) | Não | Não | Não | Não | Loja própria | Sim | Não | Sim | 100% |
| Epublik | Trial 7d | Básica | Básica | Sim | Não | Sim | Própria | Sim | Não | Sim | 100% |
| Amazon KDP | Sim | Não | Não | Não | Não | Sim | Só Amazon | Internacional | Não | Parcial | 70% |
| Draft2Digital | Sim | Não | Não | Não | Não | Sim | 15+ | Não | Não | Inglês | 90% |
| **Autoria** | **Sim** | **Claude nativo** | **Nano Banana Pro** | **Sim** | **ElevenLabs** | **EPUB 3.0** | **Via D2D** | **Sim** | **Suite dedicada** | **Sim** | **90%** |

---

## 10 — Roadmap

### Execução em 3 fases

Sem prazos arbitrários. Cada fase tem critério objetivo de avanço.

#### Fase atual · Maturação técnica (pré-lançamento)

**Critério de avanço:** 1 livro real publicado fim a fim com qualidade satisfatória

- ✅ Landing pública no ar (autoria.app)
- ✅ Sistema de blog em produção
- ✅ Login Google + e-mail
- ✅ Termos, Privacidade, Sobre, Contato
- ✅ Pessoa jurídica formalizada
- ✅ Núcleo Claude Sonnet integrado
- ✅ Geração de capa com Nano Banana Pro
- ✅ Geração de PDF e EPUB
- ✅ Gráfica brasileira parceira fechada
- 🔄 Diagramação em refinamento ativo
- ⏳ Pagamentos (Stripe + Pagar.me)
- ⏳ Audiolivro (ElevenLabs)
- ⏳ E-mail transacional (Resend)

#### Fase 2 · Lançamento e validação (3 primeiros meses pós-lançamento)

**Meta:** 30 obras publicadas + R$15k em receita acumulada + suite B2B no ar

- Onboarding automatizado de autores
- Suite B2B Starter ativa
- Integração Draft2Digital
- Painel unificado de royalties
- 10 entrevistas profundas com clientes pagantes
- Cases públicos de sucesso
- Programa de referral entre autores

#### Fase 3 · Escala e growth (meses 4–12 pós-lançamento)

**Meta:** 200 obras/mês + 30 assinantes B2B + R$150k MRR

- Clonagem de voz do autor
- Tradução para inglês e espanhol
- Marketing kit IA (assets para redes)
- Analytics de leitura por capítulo
- Parcerias: Kiwify, Eduzz, Monetizze
- Suite B2B Pro + Enterprise
- Conteúdo SEO em volume (blog ativo)
- Ano 2: produto de leitura (assinatura + SuperFan + Coins)

> **Filosofia de execução:** A Autoria não vai vender um produto que ela mesma não usaria. O fundador é o primeiro autor a publicar pela plataforma. Quando o resultado for bom o suficiente para o livro dele, é bom o suficiente para começar a vender. Esse é o único portão.

---

## 11 — Projeção financeira

### Do zero a líder de mercado

Projeção conservadora baseada em benchmarks reais. Ano 1 inclui ~2 meses de pré-lançamento + ~10 meses de operação. Referência: UICLAP fatura R$8M/ano com produto inferior.

| Ano | Receita projetada |
|---|---|
| Ano 1 | R$140k |
| Ano 2 | R$820k |
| Ano 3 | R$3,0M |
| Ano 4 | R$11M |
| Ano 5 | R$35M+ |

### Composição da receita · Ano 3 (R$3,0M)

| Fonte | Valor | % |
|---|---|---|
| Esteira B2C (obras) | R$1,3M | 43% |
| Assinatura B2B | R$540k | 18% |
| Comissão 10% digital | R$420k | 14% |
| Assinatura leitores | R$380k | 13% |
| POD (margem impressão) | R$220k | 7% |
| Coins + gifting | R$140k | 5% |

### Métricas de custo

| Métrica | Valor |
|---|---|
| Custo de produção por obra (APIs) | ~R$8 |
| Margem bruta na esteira B2C | 95%+ |
| Custo audiolivro de 80k palavras | ~R$6 |
| Margem bruta B2B assinatura | ~85% |

> **Referência:** Pratilipi atingiu R$50M em 10 anos do zero, sem IA no início. A Autoria começa com Claude + Nano Banana Pro + mercado validado + receita do dia 1.

---

## 12 — Gestão de riscos

### Riscos reais e mitigação

Identificados a partir do estudo de concorrentes e fracassos do setor — Pratilipi, Kindle Vella, Scribe Media.

| Risco | Severidade | Mitigação |
|---|---|---|
| **Atraso no lançamento permite Spines chegar ao PT primeiro** | Alto | Critério de prontidão deliberadamente objetivo (1 livro fim a fim). Vantagens locais não copiáveis: gráfica BR, comunidade lusófona, 10x mais barato, capa por IA, 90% de royalty (Spines fica com 30%). |
| **Perfeccionismo de fundador técnico — "pronto" vira "para sempre"** | Alto | Critério único e objetivo de prontidão. Sem subcritérios. Quando o livro estiver pronto, lança. |
| **Clube de Autores acelera investimento na AILA** | Alto | Construir comunidade e produto B2B rápido. Claude Sonnet superior ao ChatGPT genérico que eles usam. Nano Banana Pro (capa IA) que eles não têm. |
| **Diagramação — ponto técnico mais difícil** | Médio | Foco ativo do fundador. Templates curados reduzem superfície de variação. @react-pdf/renderer dá controle declarativo. |
| **Crescer usuários sem receita — armadilha Pratilipi** | Médio | 3 primeiras fontes de receita entram no ar simultaneamente ao lançamento. Sem "free para sempre" antes da Fase 3. |
| **Qualidade de IA abaixo da expectativa do autor** | Médio | Posicionar IA como "assistente editorial", não substituto. Modo sugerir (autor aceita/rejeita). Upsell de revisão humana profissional no Pro. |
| **Custo de API crescente — dependência de terceiros** | Médio | Camada de abstração (lib/) — troca de provider sem reescrever produto. Margem atual de 95% absorve aumentos de até 500%. |
| **Kindle Vella syndrome — tentar criar comunidade do zero** | Baixo | Comunidade em torno do processo de publicação (Discord/WhatsApp), não de leitura. Wattpad é funil de aquisição, não concorrente. |
| **Regulação de copyright e IA** | Baixo | Termos de uso claros (autoria.app/termos). Acompanhar Marco Legal da IA. Fornecedores oferecem indemnity comercial. |

---

## 13 — Defensabilidade

### Por que somos difíceis de copiar

Seis moats que se fortalecem com o tempo.

| # | Moat | Vantagem |
|---|---|---|
| 01 | **Catálogo de IP em português** | Cada obra vira ativo perpétuo. Comissão 10% gera receita passiva crescente. Catálogo vira produto de leitura. Concorrente novo leva anos para replicar 10k+ títulos. |
| 02 | **Dados editoriais do mercado BR** | Analytics de leitura por capítulo, conversão por gênero/capa/preço, prompts especializados em editorial PT-BR. Dados proprietários impossíveis de copiar sem o catálogo. |
| 03 | **Rede de parceiros BR** | Gráfica brasileira parceira (já fechada), ISBN via CBL, parcerias futuras: Kiwify, Eduzz, Monetizze. Concorrente internacional não tem isso. |
| 04 | **Comunidade de autores publicados** | Referral entre autores, cases de sucesso, reputação na cena literária BR. Amazon Kindle Vella falhou por não ter isso. |
| 05 | **Stack de IA superior** | Claude Sonnet (Anthropic) + Nano Banana Pro (Google). Prompts editoriais BR são IP proprietário. Migração DALL-E 3 → Nano Banana Pro provou agilidade. |
| 06 | **First mover B2B editorial BR** | Nenhum concorrente tem suite B2B nacional. Primeiro RGB→CMYK + revisão em lote em SaaS PT-BR. Editoras integradas via API · churn ~0. |

---

## 14 — Stack técnica real

### Arquitetura para escala com time de 1

Stack atualizada a partir do package.json real do repositório. Princípio: zero DevOps, máximo de IA, arquitetura que escala sem contratar.

| Camada | Status | Tecnologias | Detalhes |
|---|---|---|---|
| **Frontend** | ✅ Implementado | Next.js 16.2.1 · React 19 · Tailwind v4 · shadcn | Bleeding edge. App Router maduro, Server Actions nativos. Deploy Vercel. |
| **IA central** | ✅ Implementado | @anthropic-ai/sdk · @google/genai | Claude Sonnet orquestra fluxo. Nano Banana Pro renderiza capa. ~R$8 por obra. |
| **Geração de arquivos** | ✅ Implementado | @react-pdf/renderer · JSZip · Sharp · docx | PDF declarativo via React. EPUB construído como zip de XHTML. Roda em Edge. |
| **Extração de manuscrito** | ✅ Implementado | mammoth · pdf-parse | .docx via mammoth, .pdf via pdf-parse, .txt direto. Detecção automática de capítulos. |
| **Backend e auth** | ✅ Implementado | @supabase/ssr · @supabase/supabase-js · PostgreSQL | Auth (Google + e-mail), banco, storage, RLS. Zero servidor para gerenciar. |
| **UI primitives** | ✅ Implementado | @base-ui/react · lucide-react · tw-animate-css | Base UI da equipe Radix/shadcn nova geração. Acessibilidade nativa. |
| **Pagamentos** | ⏳ A implementar | Stripe · Pagar.me (PIX) | Chaves provisionadas no .env. Stripe para internacional, Pagar.me para PIX/boleto. **Bloqueador para lançamento.** |
| **Audiolivro** | ⏳ A implementar | ElevenLabs API | Custo estimado ~R$6 por audiolivro de 80k palavras. Diferencial competitivo. |
| **Distribuição** | 🔄 Manual no piloto | D2D API · KDP | Manual no início é decisão correta. Automatizar quando volume justificar. |
| **E-mail transacional** | ⏳ A implementar | Resend | Para confirmações, status de produção, royalties mensais. **Bloqueador para lançamento.** |
| **Infraestrutura** | ✅ Implementado | Vercel · Cloudflare | Deploy ao vivo. Zero ops. Cloudflare para CDN. |
| **Marketing · blog** | ✅ Implementado | lib/blog.ts | Sistema de posts em arquivo único. Categorias, gradientes, callouts. Pronto para SEO orgânico. |

> **Decisão arquitetural confirmada:** Trocar Puppeteer por @react-pdf/renderer e Calibre CLI por JSZip foi a decisão mais importante da v2. Permite rodar geração de arquivos em serverless puro (Vercel Edge), sem container Docker, sem cold start de 30 segundos, sem preocupação com timeout. Custo de geração caiu para frações de centavo por obra.

---

*Modelo de Negócio · v2.0 · Autoria Tecnologia Ltda · autoria.app · construído a partir do código real · github.com/rabbitm97/autoria · 57 commits*

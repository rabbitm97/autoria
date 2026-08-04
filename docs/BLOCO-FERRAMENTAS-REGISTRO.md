# Bloco FERRAMENTAS — Registro da Sessão de Definição (v2, 03/ago/2026)

**Status:** DEFINIÇÃO ENCERRADA — todas as marteladas dadas por Mateus em 03/ago.
Este arquivo substitui o BLOCO-FERRAMENTAS-REGISTRO.md anterior (perdido — não
estava commitado no repo). **Commitar este em `docs/` para não perder de novo.**
Fonte para os `.md` de implementação (FERR-1..T + EXPRESS-1).

---

## 1. Decisões marteladas (imutáveis sem nova sessão)

### Economia de créditos
- **1 crédito = R$ 1,00.** Regra permanente: nenhum pacote futuro com desconto
  acima de 15% sem refazer a conta de margem do catálogo inteiro.
- **Pacotes:** 100 créditos/R$ 100 · 200/R$ 180 (−10%) · 500/R$ 425 (−15%).
- **Pacotes antigos 500/R$79 e 2000/R$249 MORTOS** (precificavam o crédito a
  R$0,125–0,158 e zeravam a margem da capa — item #18 da TABELA resolvido).
- **`users.creditos` DEFAULT 0** (mata o achado do DEFAULT 100 farmável).
  Migration incremental nova na cadeia (pós-20260723; regra da verdade 24
  intacta: 21 ⇒ 23 ⇒ esta, na ordem).
- **Bônus de cadastro: 10 créditos via EVENTO DE LEDGER** (`bonus_cadastro`
  em `usage_logs`, concedido no trigger de criação de conta) — nunca default
  de coluna. Rastreável e revogável. Anti-farm: 10 < capa (20).
- **Vitrine em R$, carteira em créditos.** Telas mostram "R$ 150" com
  "ou 150 créditos" discreto. Sem saldo → checkout compra o valor exato +
  débito imediato. Autor NUNCA é obrigado a pré-comprar pacote (pacote =
  desconto opcional de recorrente, não pedágio).
- **Badge de saldo de créditos SEMPRE visível** no canto superior do
  dashboard (novo requisito, 03/ago). Lê `users.creditos` server-side;
  atualiza pós-débito. Entra junto da migration DEFAULT 0 (não expor o
  saldo-fantasma de 100 antes do fix).

### Catálogo de preços das ferramentas (em créditos = R$)
| Ferramenta | Preço | Custo real verificado |
|---|---|---|
| Diagnóstico Expresso (~10 págs) | **10** | centavos |
| Diagnóstico completo | **40** | ~R$ 1–2 |
| EPUB (arquivo → EPUB canônico) | **50** | centavos |
| Diagramação digital (PDF) | **100** | centavos (minuto de função) |
| Diagramação completa (digital + gráfica CMYK) | **150** | centavos |
| Revisão completa (batch → DOCX revisado) | **150** | ~R$ 4–6 |
| Tradução (1 idioma) | **200** | ~R$ 9–12 |
| Audiolivro | **200** | ~R$ 26–50 (depende da voz do Bloco A) |
| Capa IA 4K | **20/imagem · 4 por 60** | R$ 1,50/img |

Grátis (auth obrigatória; limite diário onde há custo de função):
RGB→CMYK e cálculo de lombada + estimativa de páginas (ilimitado);
PDF→DOCX, ficha/página de créditos, diagnóstico técnico sem LLM (1–2/dia).

Regra de coerência: cada avulso custa 50–90% do plano que o contém; soma dos
avulsos (≈ R$ 870) ≥ 2× o Pro. **Elementos avulso: CORTADO** (fraco como
produto isolado; e a versão standalone gerava ficha por IA — viola decisão CRB).

### Capa: preço unificado 20/60
- Extras de imagem passam de 10/30 para **20 créditos/img · 4 por 60 — em
  TODO lugar** (avulsa E fluxo). Uma regra, uma copy, zero arbitragem.
- Saldo INCLUSO por plano não muda (Essencial 2 frente / Pro 4+4).
- Toca: constante de preço (discovery: lib/creditos.ts ou tela de compra),
  copy em `components/plano-conversao.tsx`, telas de compra de imagens.
  Verificar se `PLANO_DESTAQUES`/textos citam valores antigos.

### Planos
- **Congelados: Essencial R$ 197 · Pro R$ 397** (proposta de baixar pra 147
  DESCARTADA — Clube cobra R$ 299 só pela revisão IA).
- **Gatilho registrado:** quando audiolivro (Bloco A) + tradução estiverem
  no ar, Pro sobe para **R$ 497**. Formalizar na reprecificação do D.4 com
  dado de conversão do beta.

### Tradução (ferramenta nova — única a criar do zero)
- **NÃO é etapa da esteira.** Motor único (`lib/traducao.ts` + rota);
  entrada = projeto existente (`capitulos_aprovados`/`texto_revisado`) OU
  arquivo avulso; saída = DOCX/EPUB traduzido.
- "1 idioma incluso" do Pro = 1 uso incluso por obra, mesmo padrão de
  partição de saldo/ledger do modelo de imagens.
- Nasce standalone, já plugada no fluxo, sem tocar `etapa_atual`.

### Trilha Express (publicação sem esteira)
- **GRÁTIS** (monetiza em impressão Graphium + comissão 10% opcional +
  upsell de avulsas). Não colide com gates de plano: eles protegem custo de
  produção IA; no Express o arquivo é do autor.
- **Escopo v1 = trilha IMPRESSA apenas**, DENTRO deste bloco. Digital
  gerenciada espera o Bloco I.
- **Criar JÁ** (porta de entrada + verificadores + Prova); o pedido de
  impressão fica "em breve" até o checkout do D.3 destravar.
- Nome na UI: **"Já tenho meu livro pronto"** (vs "Produzir com a Autoria").
- Arquitetura: projeto NORMAL com etapas puladas — nunca pipeline paralelo.
  - Miolo ganha discriminador de origem no estado do PDF
    (`"gerado" | "upload"`), espelhando o padrão do `dados_capa`
    (verdade 22 — discovery fino em `lib/project-data.ts` antes do `.md`).
  - `avancarEtapa()` intacto (forward-only permite saltar; entra em
    `upload`, avança direto). NENHUMA 4ª exceção canônica.
  - Verificador de miolo v1 = determinístico: páginas reais (pdf-parse),
    dimensão vs formato declarado, lombada calculada → valida capa contra
    ela (reusa fiscal do upload-capa). SEM validação IA de sangria/fontes
    na v1.
  - Prova precisa aceitar PDF externo — discovery mais delicado do bloco
    (checagens hoje leem estado produzido pela esteira).
- Preparado para o futuro: Prova → publicação → marketplace (modelo Clube:
  autor define ganho, sistema precifica) é convergência do fim da esteira
  com o Express — mesmo funil, duas portas.

## 2. Inventário das standalone (11 rotas em app/api/ferramentas/)

| Rota | Veredito | Nota |
|---|---|---|
| `rgb-cmyk` | VIVE (grátis) | Correta, já no hub |
| `pdf-para-docx` | VIVE (grátis 1–2/dia) | Alinhar `require("pdf-parse")` CJS com o pin canônico (API v2) |
| `creditos` | VIVE (grátis) | Única já apontada pro motor canônico (`buildCreditosContentHtml`) |
| `diagnostico` | VIRA o Expresso (10) | Já é ~90%; Completo (40) = rota nova no agente canônico |
| `revisor` | MORRE | Síncrono, trecho 8k; Revisão (150) = envelope novo no motor batch |
| `elementos` | MORRE | Cortado + ficha por IA viola decisão CRB |
| `capa` | MORRE | 2K, prompt pré-B2; avulsa = motor B2 em contexto sem projeto |
| `epub` | MORRE | EPUB from-scratch; avulsa (50) = builder canônico do gerar-epub |
| `pdf` | MORRE (prioridade) | `@react-pdf/renderer` (lib descartada) + formato `a5` (viola verdade 2) |
| `audio` | MORRE | ElevenLabs (descartado); espera provider do Bloco A |
| `parse-file` | VIVE | Helper de upload — vira peça do envelope comum |

**Regra do bloco:** ferramenta nunca tem motor próprio; motor mora em `lib/`
e serve esteira E ferramenta. Envelope comum das pagas: auth → parse-file →
débito via `lib/creditos.ts` (ledger `contexto: "ferramenta"`, sem
project_id) → motor canônico → download.

## 3. Hub / vitrine

Três estados por card, registry único em `dashboard/ferramentas/page.tsx`:
1. **Grátis** (ativo já): RGB→CMYK, lombada+páginas (tela nova sobre
   `lib/formatos`), PDF→DOCX, ficha/créditos.
2. **Pago** (card completo com preço; botão "disponível em breve" até o
   checkout existir): Expresso, Diagnóstico, EPUB, Diagramações, Revisão,
   Tradução, Capa.
3. **Em breve** (sem preço): Audiolivro.

Regras: preço em R$ grande + "ou N créditos" discreto; categorias
"Análise e texto / Arquivos e formatos / Capa e imagem / Áudio"; NENHUMA
promessa numérica de tempo (verdade 36); limites grátis exibidos com
honestidade ("1 por dia"); banner de boas-vindas do bônus 10 apontando pro
Expresso.

## 4. Fatiamento de implementação

| Bloco | Escopo | Dependência |
|---|---|---|
| **FERR-1** | Hub vitrine (3 estados) + telas grátis novas + 410 nas 7 rotas mortas + fix pdf-parse | Nenhuma — pré-beta |
| **EXPRESS-1** | Porta "Já tenho meu livro pronto" + verificador de miolo + discriminador origem no estado + Prova com PDF externo + CTA pedido "em breve" | Nenhuma pro build; D.3 destrava o pedido |
| **FERR-2** | Migration DEFAULT 0 + bônus 10 (ledger) + badge de saldo no header + capa 20/60 unificado + pacotes novos | Migration entra na cadeia; COMPRA de créditos precisa do D.4 |
| **FERR-3.x** | Um `.md` por reapontamento: Expresso → Revisão → Diagramação → EPUB → Capa avulsa (ordem de valor) | FERR-2 (débito) + D.4 (compra) |
| **FERR-T** | Tradução (motor novo + incluso Pro) | FERR-2/D.4 pra cobrar; motor pode nascer antes |
| Audiolivro avulso | — | Bloco A |
| Express digital | — | Bloco I |

**Proposta de ordem na fila geral (pendente de martelada):**
FERR-1 + EXPRESS-1 agora → E (dashboard) → D.3 → D.4 → FERR-2 → FERR-3.x/T.

## 5. Benchmarks capturados (03/ago/2026 — fontes verificadas)

- **Clube de Autores AILA (IA, flat, livro 200 págs):** Revisão R$ 299 ·
  Análise R$ 69 · Tradução R$ 399 · Raio-X R$ 99 · Conversão EPUB R$ 109.
  Âncora exibida por eles: humano R$ 5.000 (revisão) / R$ 15.000 (tradução).
- **UICLAP marketplace (humanos):** Revisão R$ 230–400 · Capa R$ 405–540 ·
  Diagramação R$ 780–980 · Pacote completo R$ 560–600. StoryZap (IA via
  WhatsApp): 1000 créditos grátis na entrada, planos de créditos (valores
  não públicos — vigia).
- **Custos de API:** Nano Banana Pro 4K $0,24/img (≈R$1,50 com pré-pago) ·
  2K $0,134 · Chirp 3 HD $30/1M chars (livro ≈ R$50) · Neural2 $16/1M
  (≈R$26) · Gemini Flash TTS ≈R$10–15/livro · Revisão Sonnet batch ≈R$4–6 ·
  Tradução Sonnet ≈R$9–12.

## 6. Vigias e pendências criadas nesta sessão

- Preços dos planos de créditos do StoryZap (não públicos) — capturar
  quando possível.
- Backstage do Clube (validação de arquivo, metadados, ISBN) — prints de
  Mateus ou navegação de sessão logada ANTES do `.md` do EXPRESS-1.
- Copy de valores antigos de imagem extra (10/30) — grep no discovery do
  FERR-2.
- Volume de ferramenta grátis pressiona minutos de função do Vercel Hobby —
  observar; upgrade Vercel Pro (~US$20/mês) antes de custo de API virar tema.
- Escolha de voz do Bloco A mexe 5× no custo do audiolivro (Chirp R$50 vs
  Flash TTS R$10–15) — decidir lá com amostra de qualidade.

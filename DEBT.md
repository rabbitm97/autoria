# Dívida técnica — Autoria

## Legal

### Verdade 41 — Registro imutável de notificação e providência (LEGAL-1D)

Toda notificação recebida via `POST /api/denuncia` gera **registro de entrada imutável** em `public.content_reports` — só a coluna `status` é mutável (trigger `guard_content_report_mutation` bloqueia UPDATE do restante e todo DELETE). Toda providência do compliance vira linha em `public.content_report_actions`, append-only integral (trigger `guard_content_report_action_mutation` bloqueia UPDATE e DELETE para todos os papéis, inclusive `service_role`).

**Por quê:** desde a decisão parcial do STF sobre o art. 19 do MCI (junho/2025), a proteção da plataforma contra responsabilização por conteúdo de terceiro depende de **procedimento com registro**, não de cláusula contratual. O log existe para ser oposto a terceiros — a Autoria pode errar na decisão; não pode não ter registro.

Enforcement:
- Ambas as tabelas têm RLS habilitada e **nenhuma policy** — leitura e escrita só via `service_role` nas rotas `/api/denuncia`, `/api/admin/notificacoes/*`.
- Rota pública sem autenticação: defesas de abuso são honeypot (`website`, `aria-hidden`), rate limit por IP (5/h in-memory por instância), validação de `trecho` mínimo (20 chars).
- SLA de 2 dias úteis (confirmação) e 5 dias úteis (decisão) vem da Política de Conteúdo; a tela `/admin/notificacoes` destaca em âmbar/vermelho o que passou do prazo, ordenando pela mais antiga primeiro.
- E-mail via Resend HTTP API (`lib/email.ts`) — falha de envio nunca impede gravação da notificação.
- Consulta somente-leitura de aceites vive em `/admin/aceites` (residual do LEGAL-1C resolvido pelo LEGAL-1D).

---

### Verdade 42 — Tabela append-only não tem FK com ação referencial (FIX-LEGAL-1C-02)

Corolário da Verdade 40. `ON DELETE SET NULL` e `ON DELETE CASCADE` são executados como UPDATE/DELETE na tabela filha e disparam o trigger de imutabilidade, abortando a transação. Efeito prático descoberto em `legal_acceptances`: com pelo menos um aceite gravado, apagar o projeto ou a conta que originaram o aceite passava a falhar — sendo que exclusão de conta é obrigação de LGPD prometida em `/privacidade`.

**Regra:** em tabela append-only, referências a outras entidades (`user_id`, `project_id`, etc.) são **históricas** — coluna solta, sem FK. A integridade é garantida na escrita (rota valida sessão + ownership antes de inserir). O registro sobrevive à exclusão do que o originou; se precisar de rótulo legível, snapshot em coluna própria (`user_email`).

Aplicação:
- `legal_acceptances`: FKs removidas por `supabase/migrations/20260807010000_fix_legal_acceptances_fks.sql`. `user_id` promovido a `NOT NULL` (nunca mais é anulado). Migration original (`20260807000000`) fica intocada como registro do aplicado.
- **Aplicar a mesma regra em LEGAL-1D** (`content_reports`, `content_report_actions`): definir sem FK desde a criação. O prompt daquele bloco já os define assim; a regra agora é explícita.

---

### Verdade 40 — Versionamento imutável de documentos legais (LEGAL-1C)

Regra de ouro da camada legal: **alterar o texto de qualquer documento em `app/(legal)/` exige bump de `versao` em `lib/legal-docs.ts`**. Aceites antigos gravados em `public.legal_acceptances` NUNCA são migrados, reescritos ou recategorizados — eles ficam para sempre presos à `versao` + `conteudoHash` vigentes no momento em que o usuário clicou.

Enforcement:
- `lib/legal-docs.ts` é a fonte única (slug, titulo, rota, versao, vigenciaISO, conteudoHash).
- `scripts/legal-hash.mjs` calcula o SHA-256 dos arquivos-fonte e reescreve `conteudoHash`. Modo `--check` (via `npm run legal:check`) sai com 1 se algum hash está desatualizado — sinal de que o texto mudou sem bump de versão.
- Tabela `public.legal_acceptances` é **append-only**: triggers `block_legal_acceptance_mutation` bloqueiam UPDATE e DELETE para TODOS os papéis, inclusive `service_role`. Correção de dado exige `DISABLE TRIGGER` explícito no Studio.
- Writes só via `POST /api/legal/aceite` (Node runtime, service role). RLS impede insert de authenticated/anon. Cliente NÃO carimba versao/hash — o servidor resolve a partir de `LEGAL_DOCS[slug]`.

Gates ativos hoje:
- **Cadastro** (`app/cadastro`): checkbox obrigatório de Termos + Privacidade; 2 POSTs `contexto: "cadastro"` após signUp.
- **Upload normal** (`app/dashboard/novo-projeto`): componente `DeclaracaoTitularidade` com os 7 itens do Anexo I; POST `declaracao-titularidade` `contexto: "upload"` após INSERT projects.
- **Upload Express** (`app/dashboard/livro-pronto`): mesmo padrão.
- **Checkout** (`app/checkout`): destaque Cláusulas 5 e 7 + checkbox obrigatório do Contrato. POSTs `contexto: "checkout"` ficam pré-implementados (`registrarAceitesCheckout`) — a rota do provedor de pagamento (D.3/D.4) os dispara antes de iniciar a intent.
- **Prova** (`app/dashboard/prova/[id]`): em `handleAprovarEPublicar`, além do `qa_aprovado_em`, POST `contrato-servicos` `contexto: "prova"` com `artefatoRef: "preview-pdf:<projectId>"`.

---

## Editor de Capa

### Smart fields sem fonte de dados confiável (Onda 3)

Os campos `titulo`, `autor`, `bio` não existem como colunas dedicadas no schema. Hoje:

- `titulo` vem de `dados_elementos.titulo_escolhido` (string) ou `dados_elementos.opcoes_titulo[]` (array); a fonte da verdade é o agente de elementos editoriais, que retorna opções mas não a escolha final do autor.
- `autor` é montado como `autor_primeiro_nome + autor_sobrenome` do `manuscripts`; não existe coluna `author_public_name` separada.
- `bio` não existe em nenhuma tabela atual.

Solução temporária: modal pede o autor digitar quando o smart field não acha dado. Texto vive apenas em `editor_data.elements`, não persiste em outras partes do sistema.

**Resolver junto com o refator da esteira editorial** (agente `elementos-editoriais` retornando `titulo_escolhido` como string definitiva; criação de `author_public_name` e `author_bio` em `projects` ou `manuscripts`).

---

### Bucket Supabase Storage para assets do editor

Criar manualmente no Supabase Studio **antes de usar imagens em produção**:

- **Nome:** `editor-assets`
- **Tipo:** privado
- **Política RLS:**
  - `SELECT`: `authenticated` — `(storage.foldername(name))[1] = auth.uid()::text`
  - `INSERT`: `authenticated` — `(storage.foldername(name))[1] = auth.uid()::text`
  - `DELETE`: `authenticated` — `(storage.foldername(name))[1] = auth.uid()::text`
- **Path padrão:** `{user_id}/{project_id}/{nanoid}.{ext}`

Até a criação do bucket, uploads de imagem no editor falharão com mensagem de erro clara (sem quebrar o editor).

---

### Migração de imagens data URL → Storage

Projetos editados na Onda 2 (antes desta onda) podem ter imagens em data URL em `editor_data.elements`. A hidratação detecta `src` começando com `data:` e marca o elemento com `_needsMigration: true`. O próximo salvamento tenta migrar silenciosamente para o Storage. Se falhar, mantém a data URL (com log de warning).

---

### PDF/X-1a certificado

Onda 3 entrega PDF "gráfica-pronto" em RGB sem certificação X-1a formal.

Para certificação X-1a estrita quando necessário:
1. Pós-processar PDF gerado com **Ghostscript** (`gs -dPDFX -dBATCH -dNOPAUSE -sDEVICE=pdfwrite ...`)
2. Embutir perfil de cor **ISO Coated v2** (Fogra39)
3. Converter todas as fontes para curvas (vetores)

Implementar quando uma gráfica parceira rejeitar o PDF atual.

---

### Timeout do PDF no Vercel

Puppeteer com capas pesadas (muitas imagens em alta resolução) pode estourar o timeout de 60s na função serverless.

Plano B:
- Mover geração para **worker assíncrono** (Inngest ou QStash)
- Notificar o autor por **e-mail** (Resend) quando o PDF ficar pronto
- Frontend faz polling ou usa webhook

Implementar se timeout ocorrer com frequência em uso real.

---

### createStore por instância (zustand)

Hoje o store é **singleton** com `reset()` no mount. Funciona, mas tem risco teórico de race condition em navegação rápida entre projetos diferentes.

Refatorar para `createStore` por componente (usando `createContext` + Provider) quando aparecer bug real relacionado.

---

### export-pdf no outputFileTracingIncludes

`next.config.ts` já inclui o binário do Chromium para `/api/agentes/gerar-pdf`. O novo `/api/projects/[id]/cover-editor/export-pdf` foi adicionado na Onda 3. Verificar em produção (Vercel) se o deploy copia corretamente o binário para ambas as rotas — pode ser necessário ajuste se a wildcarded no `outputFileTracingIncludes` não cobrir paths dinâmicos.

---

## Residuais LEGAL-1C

1. **`vigenciaISO` como `[DATA]` em todos os slugs** — hardcoded como placeholder aguardando revisão jurídica final. Trocar por data ISO real antes da estreia comercial (mesma nota do rodapé "Rascunho v1.0 · sujeito a revisão jurídica").
2. **`[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`, `[NOME DO ENCARREGADO]`** — placeholders visíveis nos documentos legais aguardando definição societária/DPO.
3. **`legal:check` não roda em CI** — só existe local (`npm run legal:check`). Amarrar no pré-commit ou pipeline quando houver CI configurado, para que edições silenciosas de texto sejam pegas antes do merge.
4. **Aceite `contexto: "cadastro"` só é gravado se `data.session` existir após `signUp`** — se a confirmação de email do Supabase estiver ligada, a sessão vem depois e o aceite não é registrado no mesmo request. Hoje logamos um warning; o correto é retentar no primeiro login pós-confirmação (ou em um `middleware`/`callback` server).
5. **Checkout usa cart multi-item** — `registrarAceitesCheckout()` está no arquivo mas é `void` até a implementação real do pagamento (D.3/D.4). Ligar como pré-requisito da criação da payment intent do provedor.
6. **`artefatoRef` do aceite de prova é `preview-pdf:<projectId>`** — string composta para dar rastreabilidade sem exigir hash do PDF. Quando gerarmos hash do artefato final entregue (miolo assinado), substituir por `sha256:...`.

---

## Residuais LEGAL (pós-1D — bloco encerrado)

Pontos que ficam abertos após LEGAL-1D:

1. **Autor não é notificado por e-mail** quando sua obra é reportada — hoje o alerta vai só para `denuncia@useautoria.com` e para o notificante. Ciência ao autor é manual.
2. **Sem tela de contestação do autor** — a Política de Conteúdo aponta `contato@useautoria.com`; não há fluxo próprio.
3. **Sem exportação de comprovante de aceite** para o autor (PDF/e-mail com hash e versão).
4. **Sem rotina de re-aceite** quando `versao` de um documento é bumpada — precisa gate no login que compara aceites do usuário com a `versao` corrente.
5. **Blog** (`app/blog/`) nunca auditado quanto a afirmação de obrigação legal.
6. **Base de conhecimento do suporte** (`agent_prompts`) nunca auditada — pode estar respondendo "ISBN é obrigatório por lei" em produção.
7. **`waitlist-form.tsx`** coleta e-mail sem aviso de privacidade nem base legal declarada.
8. **Modo "oficial" da ficha CRB** na página de créditos não auditado.
9. **Termo de Distribuição Não Exclusiva** pendente (D.3/D.4). Base arquivada em `docs/legal/arquivo/contrato-edicao-v0.1.md`.
10. **Placeholders de CNPJ** e as três decisões humanas do LEGAL-1B seguem abertos.
11. **Badge "Rascunho · sujeito a revisão jurídica"** permanece até validação por advogado.
12. **Rate limit de `/api/denuncia` é in-memory por instância** — em serverless, cada instância tem sua janela. Aceitável para 5/h; se o volume crescer, migrar para tabela (`rate_limits`) ou KV.
13. **`AUTORIA-CONTEXTO.md`, `DICIONARIO.md`, `TABELA.md`** — canônicos citados nos prompts continuam ausentes do repo. Decisão pendente sobre criar ou remover das referências.

# Dívida técnica — Autoria

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

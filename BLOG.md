# Como adicionar um novo post ao blog

O blog da Autoria é gerenciado por um único arquivo: **`lib/blog.ts`**

Não é necessário criar páginas, rotas ou arquivos extras. Basta editar esse arquivo.

---

## Passo a passo

### 1. Abra o arquivo `lib/blog.ts`

### 2. Localize o comentário de modelo no final do array `POSTS`

```ts
// ── MODELO PARA NOVO POST — copie e cole abaixo desta linha ───────────────
// {
//   slug: "meu-novo-post",
//   ...
// },
```

### 3. Cole um novo objeto **antes** do comentário de modelo e preencha os campos

```ts
{
  slug: "meu-novo-post",                         // URL: /blog/meu-novo-post
  title: "Título completo do post",
  excerpt: "Resumo curto exibido no card (máx 2 linhas).",
  date: "22 Abril 2025",
  category: "Publicação",                        // etiqueta no card
  readTime: "5 min",
  coverColor: "from-indigo-800 to-violet-900",   // gradiente Tailwind
  content: [
    { type: "p", text: "Primeiro parágrafo." },
    { type: "h2", text: "Subtítulo da seção" },
    { type: "p", text: "Segundo parágrafo." },
    { type: "ul", items: ["Item 1", "Item 2", "Item 3"] },
    { type: "callout", text: "Dica ou destaque importante." },
  ],
},
```

### 4. Salve o arquivo

O post aparece automaticamente em `/blog` e em `/blog/meu-novo-post`.

---

## Tipos de bloco de conteúdo

| Tipo       | Uso                                | Campos obrigatórios |
|------------|------------------------------------|---------------------|
| `p`        | Parágrafo de texto                 | `text`              |
| `h2`       | Subtítulo de seção                 | `text`              |
| `ul`       | Lista com marcadores               | `items: string[]`   |
| `callout`  | Destaque / caixa de dica dourada   | `text`              |

---

## Opções de `coverColor` (gradientes sugeridos)

```
from-indigo-800 to-violet-900   → roxo/azul
from-rose-900 to-orange-900     → vermelho/laranja
from-brand-primary to-zinc-800  → azul escuro (cor da Autoria)
from-emerald-800 to-teal-900    → verde
from-amber-700 to-yellow-900    → dourado
from-zinc-700 to-zinc-900       → cinza neutro
```

---

## Ordem dos posts

Os posts são exibidos na ordem em que aparecem no array `POSTS`.
Coloque o mais novo **no final** para que ele apareça por último,
ou **no início** se quiser que fique em destaque (primeiro card).

---

## Commit após adicionar um post

```bash
git add lib/blog.ts
git commit -m "blog: adicionar post 'Título do post'"
git push
```

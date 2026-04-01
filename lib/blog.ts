// ─────────────────────────────────────────────────────────────────────────────
// BLOG — Como adicionar um novo post
// ─────────────────────────────────────────────────────────────────────────────
// 1. Copie o bloco de exemplo abaixo e cole no final do array POSTS.
// 2. Preencha cada campo (veja descrição ao lado).
// 3. Salve o arquivo — o post aparece automaticamente no blog.
// 4. Não é necessário criar arquivos extras nem mexer em mais nada.
//
// CAMPOS:
//   slug        → URL do post: /blog/meu-slug  (só letras minúsculas, hifens)
//   title       → Título exibido no card e no topo do post
//   excerpt     → Resumo curto (≤ 2 linhas) exibido no card
//   date        → Data no formato "DD Mês AAAA"  ex: "15 Janeiro 2025"
//   category    → Etiqueta exibida no card  ex: "Publicação", "IA", "Mercado"
//   readTime    → Tempo de leitura estimado  ex: "5 min"
//   coverColor  → Cor de fundo do card quando não há imagem (Tailwind bg-*)
//   content     → Array de blocos de conteúdo (veja tipos abaixo)
//
// TIPOS DE BLOCO:
//   { type: "h2",   text: "Subtítulo" }
//   { type: "p",    text: "Parágrafo normal." }
//   { type: "ul",   items: ["Item 1", "Item 2", "Item 3"] }
//   { type: "callout", text: "Destaque ou dica importante." }
// ─────────────────────────────────────────────────────────────────────────────

export type Block =
  | { type: "h2";      text: string }
  | { type: "p";       text: string }
  | { type: "ul";      items: string[] }
  | { type: "callout"; text: string };

export interface Post {
  slug:       string;
  title:      string;
  excerpt:    string;
  date:       string;
  category:   string;
  readTime:   string;
  coverColor: string;
  content:    Block[];
}

export const POSTS: Post[] = [
  // ── Post 1 ────────────────────────────────────────────────────────────────
  {
    slug: "como-publicar-seu-primeiro-livro",
    title: "Como publicar seu primeiro livro: o guia completo para autores brasileiros",
    excerpt: "Da ideia ao leitor: tudo o que você precisa saber para autopublicar seu livro no Brasil em 2025, sem precisar de uma editora.",
    date: "1 Abril 2025",
    category: "Publicação",
    readTime: "8 min",
    coverColor: "from-indigo-800 to-violet-900",
    content: [
      {
        type: "p",
        text: "Publicar um livro nunca foi tão acessível. Em 2025, autores brasileiros têm à disposição ferramentas e plataformas que, há dez anos, existiam apenas para grandes editoras. Mas o excesso de opções também gera confusão. Este guia vai direto ao ponto.",
      },
      {
        type: "h2",
        text: "1. Finalize o manuscrito antes de tudo",
      },
      {
        type: "p",
        text: "O erro mais comum de quem vai publicar pela primeira vez é começar a pensar em capa e distribuição antes de ter um texto revisado. A qualidade do conteúdo é o que faz leitores recomendarem seu livro — invista tempo nessa etapa.",
      },
      {
        type: "ul",
        items: [
          "Faça pelo menos duas rodadas de revisão própria antes de enviar para terceiros",
          "Utilize ferramentas de revisão com IA para capturar erros gramaticais e de estilo",
          "Se possível, peça a leitores beta para dar feedback antes da publicação",
        ],
      },
      {
        type: "h2",
        text: "2. Escolha o formato: eBook, impresso ou audiolivro?",
      },
      {
        type: "p",
        text: "Cada formato tem seu público e sua plataforma de distribuição. O eBook é o ponto de entrada mais simples e barato. O impresso (via Print on Demand) permite que leitores tenham o livro físico sem que você precise gerenciar estoque. O audiolivro é o formato que mais cresce no Brasil.",
      },
      {
        type: "callout",
        text: "Dica: comece pelo eBook para validar o interesse do público. Expanda para impresso e audiolivro conforme as vendas crescerem.",
      },
      {
        type: "h2",
        text: "3. ISBN e direitos autorais",
      },
      {
        type: "p",
        text: "O ISBN (International Standard Book Number) é necessário para vender em livrarias físicas e em algumas plataformas digitais. No Brasil, o ISBN é gratuito e emitido pela Fundação Biblioteca Nacional. Você pode registrá-lo em seu próprio nome, mantendo 100% dos seus direitos autorais.",
      },
      {
        type: "h2",
        text: "4. Distribua para múltiplas plataformas",
      },
      {
        type: "p",
        text: "Amazon KDP, Kobo, Apple Books, Google Play Books, Scribd — cada plataforma tem sua audiência. Distribuir para todas ao mesmo tempo maximiza sua visibilidade e receita. Plataformas como a Autoria fazem essa distribuição de forma centralizada, sem que você precise criar contas e gerenciar cada loja individualmente.",
      },
      {
        type: "ul",
        items: [
          "Amazon KDP: maior volume de vendas de eBook no Brasil",
          "Kobo: forte em leitores internacionais e dispositivos dedicados",
          "Apple Books: boa margem e audiência fiel em dispositivos Apple",
          "Spotify Audiobooks: crescimento acelerado no mercado brasileiro",
        ],
      },
    ],
  },

  // ── Post 2 ────────────────────────────────────────────────────────────────
  {
    slug: "revisao-textual-com-ia",
    title: "Revisão textual com IA: como a tecnologia está transformando a edição de livros",
    excerpt: "A inteligência artificial já consegue revisar ortografia, gramática e estilo com precisão comparável à de revisores profissionais. Entenda como isso funciona.",
    date: "8 Abril 2025",
    category: "Inteligência Artificial",
    readTime: "6 min",
    coverColor: "from-brand-primary to-zinc-800",
    content: [
      {
        type: "p",
        text: "Por décadas, a revisão textual foi um gargalo no processo editorial. Um bom revisor leva dias ou semanas para revisar um romance de 80 mil palavras — e cobra por isso. A IA mudou essa equação de forma definitiva.",
      },
      {
        type: "h2",
        text: "O que a IA consegue revisar hoje",
      },
      {
        type: "ul",
        items: [
          "Ortografia e gramática: com precisão superior a 95% para o português brasileiro",
          "Estilo e clareza: identifica frases truncadas, repetições e ambiguidades",
          "Coesão narrativa: sinaliza inconsistências de tempo verbal e voz",
          "Adequação ao gênero: compara seu texto com padrões do gênero literário escolhido",
        ],
      },
      {
        type: "h2",
        text: "O que a IA ainda não substitui",
      },
      {
        type: "p",
        text: "A IA é excelente para identificar erros técnicos, mas ainda tem limitações quando se trata de julgamentos subjetivos profundos: o arco emocional de um personagem, se um diálogo soa natural para aquela época histórica, ou se o ritmo de um capítulo está correto para o gênero.",
      },
      {
        type: "callout",
        text: "Recomendamos usar a IA como primeira passagem de revisão — ela captura a maioria dos erros técnicos — e complementar com um olhar humano para obras de maior exigência literária.",
      },
      {
        type: "h2",
        text: "Como a Autoria usa IA na revisão",
      },
      {
        type: "p",
        text: "A Autoria utiliza Claude Sonnet, um dos modelos de linguagem mais avançados disponíveis, treinado e ajustado especificamente para o português brasileiro. O resultado é uma revisão que entende regionalismos, expressões idiomáticas e nuances do nosso idioma.",
      },
      {
        type: "p",
        text: "Além da revisão, o modelo gera automaticamente sinopse, palavras-chave e ficha catalográfica no padrão CBL — documentos que levariam horas para escrever manualmente.",
      },
    ],
  },

  // ── Post 3 ────────────────────────────────────────────────────────────────
  {
    slug: "generos-literarios-que-mais-vendem-no-brasil",
    title: "Os gêneros literários que mais vendem no Brasil em 2025",
    excerpt: "Entenda quais categorias lideram as vendas de eBook e impresso no Brasil, e como posicionar seu livro para alcançar o público certo.",
    date: "15 Abril 2025",
    category: "Mercado Editorial",
    readTime: "5 min",
    coverColor: "from-rose-900 to-orange-900",
    content: [
      {
        type: "p",
        text: "O mercado editorial brasileiro cresceu 12% em 2024, com o segmento digital crescendo três vezes mais rápido que o impresso. Mas nem todos os gêneros crescem na mesma velocidade. Saber onde seu livro se encaixa pode fazer a diferença entre 100 e 10.000 vendas.",
      },
      {
        type: "h2",
        text: "Top 5 gêneros em volume de vendas (eBook, 2024)",
      },
      {
        type: "ul",
        items: [
          "1. Romance (todos os subgêneros): 34% do mercado digital brasileiro",
          "2. Autoajuda e desenvolvimento pessoal: 22%",
          "3. Thriller e suspense: 14%",
          "4. Fantasia e ficção científica: 11%",
          "5. Não-ficção (negócios, finanças, saúde): 9%",
        ],
      },
      {
        type: "h2",
        text: "Romance: o rei absoluto das vendas digitais",
      },
      {
        type: "p",
        text: "O romance — especialmente nos subgêneros contemporâneo, histórico e paranormal — domina o mercado de eBook no Brasil. Leitores de romance são os mais fiéis e os que mais compram: a média é de 2,3 livros por mês por leitor ativo.",
      },
      {
        type: "callout",
        text: "Se você escreve romance, considere séries de 3 ou mais livros. A fidelização do leitor entre volumes é o maior impulsionador de receita para autores independentes.",
      },
      {
        type: "h2",
        text: "A ascensão do audiolivro",
      },
      {
        type: "p",
        text: "O mercado de audiolivro no Brasil cresceu 67% em 2024, puxado pela popularização do Spotify Audiobooks. Os gêneros que mais crescem nesse formato são thriller, autoajuda e narrativas de não-ficção. Se você ainda não tem uma versão em áudio do seu livro, está deixando receita na mesa.",
      },
      {
        type: "h2",
        text: "Como posicionar seu livro corretamente",
      },
      {
        type: "p",
        text: "Escolher o gênero e subgênero correto nas plataformas de distribuição é tão importante quanto a qualidade do texto. Livros mal categorizados não aparecem para o leitor certo — e não vendem. A Autoria auxilia nessa categorização automaticamente durante o processo de publicação.",
      },
    ],
  },

  // ── MODELO PARA NOVO POST — copie e cole abaixo desta linha ───────────────
  // {
  //   slug: "meu-novo-post",
  //   title: "Título do novo post",
  //   excerpt: "Resumo curto exibido no card do blog (máximo 2 linhas).",
  //   date: "22 Abril 2025",
  //   category: "Categoria",
  //   readTime: "5 min",
  //   coverColor: "from-zinc-700 to-zinc-900",
  //   content: [
  //     { type: "p", text: "Primeiro parágrafo..." },
  //     { type: "h2", text: "Subtítulo" },
  //     { type: "p", text: "Segundo parágrafo..." },
  //     { type: "ul", items: ["Item 1", "Item 2"] },
  //     { type: "callout", text: "Destaque ou dica." },
  //   ],
  // },
];

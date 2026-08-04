/**
 * Taxonomia compartilhada de gêneros literários e títulos de autor.
 *
 * Fonte única — extraído do `app/dashboard/novo-projeto/page.tsx` no
 * EXPRESS-1A para ser reusado pela porta "Já tenho meu livro pronto"
 * (`app/dashboard/livro-pronto/page.tsx`) sem drift.
 *
 * Consumidores: novo-projeto (esteira) e livro-pronto (Express). Insumo dos
 * campos `manuscripts.genero_principal / _sub / _detalhe` — mantidos para
 * as categorias KDP/Apple/Kobo do Bloco I (decisão 14/jul).
 */

export const AUTHOR_TITLES = ["Sr.", "Sra.", "Dr.", "Dra.", "Prof.", "Profa.", "Rev."];

export const GENRES: Record<string, Record<string, string[]>> = {
  "Ficção": {
    "Romance": ["Romance Contemporâneo", "Romance Histórico", "Romance Suspense", "Romance Paranormal", "Chick Lit"],
    "Thriller e Suspense": ["Thriller Policial", "Thriller Psicológico", "Suspense", "Crime"],
    "Terror e Horror": ["Terror Sobrenatural", "Horror Psicológico", "Terror Gótico"],
    "Ficção Científica": ["Space Opera", "Distopia", "Cyberpunk", "Hard Sci-Fi", "Ficção Científica Soft"],
    "Fantasia": ["Fantasia Épica", "Fantasia Urbana", "Dark Fantasy", "Steampunk"],
    "Mistério": ["Mistério Policial", "Cozy Mystery", "Noir"],
    "Aventura": ["Aventura de Ação", "Aventura Histórica"],
    "Ficção Literária": ["Ficção Contemporânea", "Ficção Histórica"],
    "Humor e Sátira": ["Humor", "Sátira"],
  },
  "Não Ficção": {
    "Autoajuda e Desenvolvimento Pessoal": ["Autoajuda", "Motivação", "Mindfulness", "Produtividade", "Coaching"],
    "Negócios e Empreendedorismo": ["Empreendedorismo", "Marketing", "Finanças Pessoais", "Liderança", "Gestão"],
    "Biografia e Memórias": ["Autobiografia", "Biografia", "Memórias", "Diário"],
    "História": ["História do Brasil", "História Mundial", "História Regional"],
    "Ciência e Natureza": ["Ciência Popular", "Física", "Biologia", "Astronomia", "Meio Ambiente"],
    "Saúde e Bem-estar": ["Saúde", "Nutrição", "Fitness", "Medicina Alternativa"],
    "Espiritualidade e Religião": ["Espiritualidade", "Religião", "Esoterismo"],
    "Filosofia": ["Filosofia Geral", "Filosofia Prática", "Ética"],
  },
  "Infantil e Juvenil": {
    "Infantil": ["Livro Ilustrado", "Conto Infantil", "Fábula", "Livro de Atividades"],
    "Jovem Adulto (YA)": ["YA Romance", "YA Fantasia", "YA Ficção Científica", "YA Contemporâneo"],
  },
  "Poesia e Literatura": {
    "Poesia": ["Poesia Lírica", "Poesia Épica", "Haiku", "Poesia Contemporânea"],
    "Contos": ["Contos Literários", "Contos de Terror", "Contos Românticos", "Contos de Ficção Científica"],
    "Crônicas": ["Crônicas Literárias", "Crônicas Humorísticas"],
  },
  "Arte e Fotografia": {
    "Arte": ["Arte Visual", "Arquitetura", "Design", "Moda e Estilo"],
    "Fotografia": ["Fotografia Artística", "Fotografia Documental"],
  },
  "Culinária e Estilo de Vida": {
    "Culinária": ["Receitas Gerais", "Cozinha Regional Brasileira", "Culinária Internacional", "Vegano e Vegetariano"],
    "Estilo de Vida": ["Casa e Jardim", "Viagem", "Artesanato"],
  },
};

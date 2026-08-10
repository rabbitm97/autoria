import Link from "next/link";
import type { Metadata } from "next";
import PublicNavbar from "@/app/_components/public-navbar";

export const metadata: Metadata = {
  title: "Ficha catalográfica: o que é, quem pode fazer e como obter | Autoria",
  description:
    "Guia direto sobre ficha catalográfica de livro: quando ela é exigida, por que só bibliotecários com CRB podem elaborá-la e o passo a passo pra obter a sua.",
};

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Ficha catalográfica e ISBN são a mesma coisa?",
    a: "Não. O ISBN é o registro numérico do livro, emitido pela Câmara Brasileira do Livro. A ficha catalográfica é a descrição bibliográfica padronizada, elaborada por bibliotecário — e ela inclui o ISBN entre os dados.",
  },
  {
    q: "Posso publicar sem ficha catalográfica?",
    a: "Pode. Ela só se torna exigência em contextos institucionais (editais, bibliotecas, compras públicas). Muitos livros vendidos online não têm ficha — mas ter é sinal de edição cuidada.",
  },
  {
    q: "Quanto custa uma ficha catalográfica?",
    a: "Varia por profissional e prazo. Consulte bibliotecários registrados — o orçamento é rápido e o serviço costuma ser acessível.",
  },
  {
    q: "Onde a ficha entra no livro?",
    a: "No verso da página de rosto (a chamada página de créditos), na parte inferior, dentro de um retângulo — posição padronizada que os bibliotecários e as gráficas conhecem.",
  },
];

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function FichaCatalograficaPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <PublicNavbar />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />

      <article className="pt-24 pb-16 mx-auto px-6 max-w-[42rem]">
        <p className="text-brand-gold text-xs font-semibold tracking-widest uppercase mb-3">
          Guia
        </p>
        <h1 className="font-heading text-3xl md:text-4xl text-brand-primary leading-tight mb-4">
          Ficha catalográfica: o que é e como obter a sua
        </h1>
        <p className="text-lg text-zinc-600 leading-relaxed mb-10">
          Antes de procurar um &ldquo;gerador grátis&rdquo;, leia isto — vai te poupar retrabalho e
          uma ficha sem validade.
        </p>

        <section className="space-y-4">
          <h2 className="font-heading text-2xl text-brand-primary mt-2">
            O que é a ficha catalográfica
          </h2>
          <p className="text-zinc-700 leading-relaxed">
            A ficha catalográfica é aquele bloco padronizado de dados que aparece no verso da
            página de rosto do livro: título, autor, edição, editora, ano, ISBN, número de páginas,
            assuntos e os códigos de classificação usados por bibliotecas (como CDD ou CDU). Ela
            existe pra que qualquer biblioteca do país catalogue seu livro do mesmo jeito, sem
            precisar interpretar nada.
          </p>
        </section>

        <section className="space-y-4 mt-10">
          <h2 className="font-heading text-2xl text-brand-primary">Ela é obrigatória?</h2>
          <p className="text-zinc-700 leading-relaxed">
            Depende do destino do livro. Nenhuma lei obriga um livro a ter ficha catalográfica pra
            ser publicado ou vendido. Na prática, ela é exigida ou fortemente recomendada quando o
            livro vai circular por instituições: editais e prêmios literários, compras
            governamentais, doação e distribuição pra bibliotecas, acervos universitários. Pra
            vender em loja online ou no seu próprio site, ela não é requisito — mas dá ao livro
            acabamento profissional e abre essas portas desde a primeira edição.
          </p>
        </section>

        <section className="space-y-4 mt-10">
          <h2 className="font-heading text-2xl text-brand-primary">
            Quem pode elaborar (e por que &ldquo;gerador grátis&rdquo; não vale)
          </h2>
          <p className="text-zinc-700 leading-relaxed">
            A elaboração de ficha catalográfica é atividade privativa de bibliotecário registrado
            no Conselho Regional de Biblioteconomia (CRB) — é o que estabelecem a Lei 4.084/62 e a
            Lei 9.674/98, que regulamentam a profissão, e a Resolução CFB 184/2017, que trata
            especificamente da ficha. Uma ficha válida sai com o nome e o número de registro do
            bibliotecário responsável.
          </p>
          <p className="text-zinc-700 leading-relaxed">
            É por isso que a Autoria não oferece um &ldquo;gerador automático de ficha&rdquo;: um
            bloco de texto imitando ficha, sem bibliotecário responsável, não tem validade — e é
            exatamente o que os geradores gratuitos entregam. Se o seu livro precisa de ficha, ele
            precisa de um bibliotecário.
          </p>
        </section>

        <section className="space-y-4 mt-10">
          <h2 className="font-heading text-2xl text-brand-primary">
            Como obter a sua (passo a passo)
          </h2>
          <ol className="space-y-4 list-decimal pl-5 marker:text-brand-gold marker:font-semibold">
            <li className="text-zinc-700 leading-relaxed pl-1">
              <strong className="text-brand-primary">Reúna os dados do livro.</strong> Título e
              subtítulo, nome do autor como vai impresso, edição, cidade e ano de publicação, ISBN,
              número de páginas, formato em centímetros e de 3 a 5 palavras-chave sobre o tema. Com
              isso em mãos, o trabalho do bibliotecário flui.
            </li>
            <li className="text-zinc-700 leading-relaxed pl-1">
              <strong className="text-brand-primary">Encontre um bibliotecário com CRB.</strong> Há
              profissionais autônomos que atendem online em todo o Brasil — busque por
              &ldquo;ficha catalográfica bibliotecário CRB&rdquo; ou consulte o site do CRB da sua
              região. Confirme que a ficha virá com nome e número de registro.
            </li>
            <li className="text-zinc-700 leading-relaxed pl-1">
              <strong className="text-brand-primary">Receba e posicione.</strong> A ficha chega
              como texto ou imagem diagramável. Ela entra no verso da página de rosto, na metade
              inferior — junto dos créditos da edição.
            </li>
            <li className="text-zinc-700 leading-relaxed pl-1">
              <strong className="text-brand-primary">Confira o ISBN.</strong> O ISBN que aparece na
              ficha precisa ser o mesmo do código de barras e do cadastro do livro. Divergência aí
              é o erro mais comum — e o mais chato de corrigir depois de impresso.
            </li>
          </ol>
          <p className="text-zinc-700 leading-relaxed">
            O serviço é rápido (em geral poucos dias) e o investimento é pequeno perto do custo de
            uma edição — consulte os valores diretamente com o profissional.
          </p>
        </section>

        <section className="space-y-6 mt-12">
          <h2 className="font-heading text-2xl text-brand-primary">Perguntas frequentes</h2>
          {FAQ.map((item) => (
            <div key={item.q} className="space-y-2">
              <h3 className="font-heading text-lg text-brand-primary">{item.q}</h3>
              <p className="text-zinc-700 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </section>

        <aside className="mt-12 bg-brand-primary/5 rounded-2xl border border-brand-primary/10 p-6 md:p-7">
          <h3 className="font-heading text-xl text-brand-primary mb-2">Publicando seu livro?</h3>
          <p className="text-zinc-700 leading-relaxed mb-5">
            Verifique grátis se o PDF está pronto pra gráfica e simule o preço de impressão — sem
            cadastro.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/ferramentas/verificador-pdf"
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-brand-primary text-white text-sm font-semibold hover:bg-brand-primary/90 transition-colors"
            >
              Verificar meu PDF
            </Link>
            <Link
              href="/simulador"
              className="inline-flex items-center px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-brand-primary text-sm font-semibold hover:bg-zinc-50 transition-colors"
            >
              Simular preço
            </Link>
          </div>
        </aside>

        <div className="mt-10 text-center">
          <Link
            href="/ferramentas"
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors underline underline-offset-4"
          >
            ← Todas as ferramentas
          </Link>
        </div>
      </article>

      {/* Footer strip */}
      <footer className="bg-brand-primary py-8 px-8 mt-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-white/30 text-sm">© {new Date().getFullYear()} Autoria. Todos os direitos reservados.</p>
          <div className="flex items-center gap-6 text-sm text-white/35">
            <Link href="/termos" className="hover:text-white/60 transition-colors">Termos</Link>
            <Link href="/privacidade" className="hover:text-white/60 transition-colors">Privacidade</Link>
            <Link href="/#precos" className="hover:text-white/60 transition-colors">Preços</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

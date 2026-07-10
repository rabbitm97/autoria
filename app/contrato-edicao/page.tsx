import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contrato de Edição Não Exclusiva — Autoria",
  description: "Contrato de edição não exclusiva aplicável aos autores que optarem pela publicação delegada à Autoria em plataformas terceiras. Rascunho versão 0.1 sujeito a revisão jurídica.",
};

export default function ContratoEdicaoPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-zinc-100 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-heading text-lg text-brand-primary hover:opacity-70 transition-opacity">
            Autoria
          </Link>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors">
            ← Voltar ao início
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Badge de rascunho */}
        <div className="mb-8 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b8760a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
            Rascunho v0.1 · sujeito a revisão jurídica
          </span>
        </div>

        <h1 className="font-heading text-4xl text-brand-primary mb-3 leading-tight">
          Contrato de Edição Não Exclusiva
        </h1>
        <p className="text-zinc-500 text-base leading-relaxed mb-10">
          Aplicável aos autores que optarem pela publicação delegada à Autoria em plataformas terceiras. Base normativa: Lei nº 9.610/98, art. 53, com afastamento expresso da exclusividade.
        </p>

        <article className="space-y-8 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Preâmbulo</h2>
            <p className="mb-3">
              Pelo presente instrumento particular, de um lado a <strong className="text-brand-primary font-semibold">AUTORIA TECNOLOGIA LTDA.</strong>, pessoa jurídica de direito privado, com sede em <em>[endereço da sede]</em>, inscrita no CNPJ sob nº <em>[CNPJ]</em>, doravante denominada simplesmente <strong className="text-brand-primary font-semibold">AUTORIA</strong>; e de outro lado o <strong className="text-brand-primary font-semibold">AUTOR</strong>, pessoa física ou jurídica identificada e qualificada em seu cadastro no Portal Autoria, aderindo a este contrato por meio de aceite eletrônico ao clicar em "Publicar via Autoria" na plataforma.
            </p>
            <p>
              Considerando que o AUTOR criou obra literária, doravante denominada <strong className="text-brand-primary font-semibold">OBRA</strong>, e é titular integral dos direitos autorais sobre ela; que a AUTORIA opera plataforma tecnológica que facilita a publicação, distribuição e comercialização de livros por autores independentes; e que ambas as partes desejam celebrar contrato de edição não exclusiva na forma do art. 53 da Lei 9.610/98, as partes ajustam o seguinte:
            </p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 1 — Objeto</h2>
            <p className="mb-3"><strong className="font-semibold">1.1.</strong> O AUTOR autoriza a AUTORIA, em caráter <strong className="font-semibold">não exclusivo</strong>, a reproduzir, editar, distribuir e comercializar a OBRA nos formatos digital (e-book, audiolivro) e impresso (impressão sob demanda), diretamente pela plataforma da AUTORIA e por meio de plataformas terceiras indicadas pelo AUTOR (a exemplo de Amazon KDP, Apple Books, Kobo, Google Play Books, entre outras).</p>
            <p className="mb-3"><strong className="font-semibold">1.2.</strong> A autorização é concedida com base no art. 53 da Lei 9.610/98, com afastamento expresso da exclusividade prevista no caput daquele artigo. Este contrato <strong className="font-semibold">não configura cessão de direitos autorais</strong> nos termos do art. 49 da mesma lei.</p>
            <p><strong className="font-semibold">1.3.</strong> O AUTOR mantém plena e integral titularidade dos direitos morais e patrimoniais sobre a OBRA, podendo publicá-la e comercializá-la simultaneamente por qualquer outro meio, editora, plataforma ou canal, sem necessidade de comunicação prévia à AUTORIA.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 2 — Território e prazo</h2>
            <p className="mb-3"><strong className="font-semibold">2.1.</strong> A autorização vale mundialmente, para todos os idiomas em que o AUTOR disponibilizar a OBRA por meio da plataforma.</p>
            <p className="mb-3"><strong className="font-semibold">2.2.</strong> O prazo é <strong className="font-semibold">indeterminado</strong>.</p>
            <p className="mb-3"><strong className="font-semibold">2.3.</strong> O AUTOR pode rescindir este contrato a qualquer tempo, <strong className="font-semibold">sem qualquer multa, penalidade ou taxa</strong>, por comando de "Encerrar publicação" no painel do Portal Autoria ou por comunicação escrita para <a href="mailto:contato@useautoria.com" className="underline hover:text-brand-primary">contato@useautoria.com</a>.</p>
            <p className="mb-3"><strong className="font-semibold">2.4.</strong> A rescisão terá efeito de retirada da OBRA em até 5 dias úteis nos canais controlados diretamente pela AUTORIA e em até 60 dias corridos nas plataformas terceiras, sujeito ao prazo interno de cada plataforma.</p>
            <p><strong className="font-semibold">2.5.</strong> Vendas e pedidos já contratados com terceiros antes da rescisão serão honrados nos termos vigentes até a produção e entrega finais.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 3 — Obrigações da Autoria</h2>
            <p className="mb-3"><strong className="font-semibold">3.1.</strong> Produzir, quando aplicável, os arquivos técnicos necessários (PDF para impressão, PDF digital, EPUB, capa, audiolivro) a partir do material fornecido pelo AUTOR ou gerado com auxílio das ferramentas da plataforma.</p>
            <p className="mb-3"><strong className="font-semibold">3.2.</strong> Publicar a OBRA nas plataformas terceiras expressamente indicadas pelo AUTOR, quando este optar pela publicação delegada.</p>
            <p className="mb-3"><strong className="font-semibold">3.3.</strong> Prestar contas mensais ao AUTOR sobre vendas, valores brutos, custos operacionais deduzidos e valor líquido devido, com detalhamento por plataforma, conforme art. 61 da Lei 9.610/98.</p>
            <p className="mb-3"><strong className="font-semibold">3.4.</strong> Realizar o repasse mensal dos valores devidos ao AUTOR via PIX, na conta cadastrada no Portal Autoria, até o 15º dia útil do mês subsequente à apuração.</p>
            <p className="mb-3"><strong className="font-semibold">3.5.</strong> Mencionar em cada exemplar impresso e em cada arquivo digital produzido, quando cabível, o título da OBRA, o nome do AUTOR e a marca AUTORIA na condição de serviço de intermediação de publicação, em atendimento ao art. 53, parágrafo único, da Lei 9.610/98.</p>
            <p><strong className="font-semibold">3.6.</strong> Manter em ambiente seguro os arquivos da OBRA fornecidos ou gerados durante o uso da plataforma, com política de privacidade específica publicada em <Link href="/privacidade" className="underline hover:text-brand-primary">autoria.app/privacidade</Link>.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 4 — Obrigações do Autor</h2>
            <p className="mb-3"><strong className="font-semibold">4.1.</strong> Declarar, sob as penas da lei, ser o único titular dos direitos patrimoniais da OBRA ou possuir autorização escrita e expressa de todos os coautores e titulares de direitos incidentes.</p>
            <p className="mb-3"><strong className="font-semibold">4.2.</strong> Garantir que a OBRA não infringe direitos autorais de terceiros, direitos de marca, imagem, honra ou privacidade, e não contém conteúdo ilícito, discurso de ódio, apologia a crime, pornografia infantil ou qualquer material vedado por lei brasileira ou pelas políticas das plataformas terceiras onde a OBRA será distribuída.</p>
            <p className="mb-3"><strong className="font-semibold">4.3.</strong> Toda responsabilidade civil, penal e administrativa por infração de direitos de terceiros ou por conteúdo ilícito na OBRA é <strong className="font-semibold">exclusiva do AUTOR</strong>. Em caso de reclamação, notificação extrajudicial ou processo judicial de terceiros contra a AUTORIA em razão da OBRA, o AUTOR concorda em ressarcir integralmente a AUTORIA de despesas incorridas, incluindo honorários advocatícios e custas judiciais.</p>
            <p className="mb-3"><strong className="font-semibold">4.4.</strong> Fornecer os metadados necessários (título, subtítulo, sinopse, categoria, palavras-chave, autor, biografia) com veracidade e completude.</p>
            <p className="mb-3"><strong className="font-semibold">4.5.</strong> Manter atualizados os dados cadastrais e a conta bancária de recebimento no Portal Autoria.</p>
            <p><strong className="font-semibold">4.6.</strong> Cumprir a legislação tributária pertinente à sua renda decorrente de vendas da OBRA. A AUTORIA emitirá relatório mensal de repasse, mas o cumprimento das obrigações fiscais do AUTOR é de sua exclusiva responsabilidade.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 5 — Remuneração</h2>
            <p className="mb-3"><strong className="font-semibold">5.1. Vendas em canais controlados pela AUTORIA</strong> (marketplace próprio, impressão sob demanda via gráfica parceira, venda direta): o AUTOR recebe <strong className="font-semibold">90%</strong> do valor líquido de cada venda, após dedução dos custos operacionais diretos (impressão, taxa de pagamento, frete). A AUTORIA retém <strong className="font-semibold">10%</strong> a título de comissão de intermediação.</p>
            <p className="mb-3"><strong className="font-semibold">5.2. Vendas em plataformas terceiras nas quais a OBRA tenha sido publicada por delegação à AUTORIA</strong> (Trilha Delegada): o AUTOR recebe <strong className="font-semibold">90%</strong> do royalty líquido efetivamente recebido pela AUTORIA daquela plataforma. A AUTORIA retém <strong className="font-semibold">10%</strong> a título de intermediação.</p>
            <p className="mb-3"><strong className="font-semibold">5.3. Vendas em plataformas terceiras nas quais o AUTOR mantém conta própria</strong> (Trilha Faça Você Mesmo): a AUTORIA <strong className="font-semibold">NÃO retém</strong> qualquer comissão. O AUTOR recebe 100% do que a plataforma repassar diretamente a ele.</p>
            <p className="mb-3"><strong className="font-semibold">5.4.</strong> Impostos incidentes sobre a renda decorrente das vendas são de responsabilidade exclusiva do AUTOR.</p>
            <p><strong className="font-semibold">5.5.</strong> O AUTOR pode consultar, a qualquer momento, o histórico completo de vendas e repasses no painel de royalties do Portal Autoria.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 6 — Isenção sobre plataformas terceiras</h2>
            <p className="mb-3"><strong className="font-semibold">6.1.</strong> A AUTORIA facilita, mas <strong className="font-semibold">não garante</strong>, a aprovação da OBRA em plataformas terceiras. Cada plataforma tem critérios editoriais, técnicos e comerciais próprios, podendo rejeitar, suspender ou remover obras a seu exclusivo critério.</p>
            <p className="mb-3"><strong className="font-semibold">6.2.</strong> A AUTORIA não se responsabiliza por eventuais atrasos, indisponibilidades, alterações de políticas, cancelamentos de conta ou remoção de obras por parte das plataformas terceiras.</p>
            <p><strong className="font-semibold">6.3.</strong> Em caso de rejeição ou remoção da OBRA por plataforma terceira, a AUTORIA comunicará o AUTOR e, quando possível, indicará o motivo informado pela plataforma. Não haverá reembolso de créditos, taxas ou qualquer valor decorrente dessa rejeição, exceto se decorrente de erro comprovadamente atribuível à AUTORIA.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 7 — Direitos autorais, adaptação e marca</h2>
            <p className="mb-3"><strong className="font-semibold">7.1.</strong> O AUTOR mantém integralmente a titularidade dos direitos autorais sobre a OBRA. Este contrato <strong className="font-semibold">não configura cessão nem transferência de direitos patrimoniais</strong>.</p>
            <p className="mb-3"><strong className="font-semibold">7.2.</strong> A AUTORIA <strong className="font-semibold">não adquire</strong> direitos de adaptação para outros meios (cinema, televisão, teatro, jogos), tradução, dramatização, adaptação audiovisual, desenvolvimento de obras derivadas, ou qualquer outro direito derivado não previsto expressamente neste contrato. Todos esses direitos permanecem integralmente com o AUTOR.</p>
            <p className="mb-3"><strong className="font-semibold">7.3.</strong> O AUTOR autoriza a AUTORIA a exibir a capa, a sinopse e trechos promocionais da OBRA em seus canais de marketing próprios (site, redes sociais, comunicações comerciais) enquanto vigente este contrato, com exclusiva finalidade de promover a venda da própria OBRA.</p>
            <p><strong className="font-semibold">7.4.</strong> A AUTORIA <strong className="font-semibold">não utilizará</strong> a OBRA, no todo ou em parte, para treinamento de modelos de inteligência artificial, sem autorização expressa e específica do AUTOR em documento apartado.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 8 — Rescisão e ausência de multa</h2>
            <p className="mb-3"><strong className="font-semibold">8.1.</strong> Este contrato pode ser rescindido a qualquer tempo pelo AUTOR, <strong className="font-semibold">sem qualquer multa, penalidade ou taxa rescisória</strong>, conforme prazos da Cláusula 2.</p>
            <p className="mb-3"><strong className="font-semibold">8.2.</strong> A AUTORIA pode rescindir este contrato mediante notificação prévia de 15 dias caso identifique violação das obrigações previstas na Cláusula 4, com abertura de prazo para regularização quando cabível.</p>
            <p><strong className="font-semibold">8.3.</strong> A AUTORIA pode rescindir este contrato imediatamente, sem prazo de regularização, em caso de constatação de plágio ou infração inequívoca de direitos autorais, ordem judicial, ou notificação de plataforma terceira apontando violação grave da OBRA.</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 9 — Disposições gerais</h2>
            <p className="mb-3"><strong className="font-semibold">9.1.</strong> Alterações destes termos serão comunicadas ao AUTOR por e-mail com pelo menos 30 dias de antecedência da entrada em vigor. Caso o AUTOR discorde das alterações, poderá rescindir este contrato sem multa dentro desse prazo.</p>
            <p className="mb-3"><strong className="font-semibold">9.2.</strong> Este contrato <strong className="font-semibold">não exige exclusividade</strong> em nenhuma modalidade. O AUTOR pode publicar simultaneamente por outras editoras, plataformas ou meios.</p>
            <p className="mb-3"><strong className="font-semibold">9.3.</strong> Este contrato não se enquadra como contrato de cessão de direitos autorais para fins do art. 11 da Lei 10.753/2003, uma vez que preserva integralmente a titularidade autoral do AUTOR. Não se aplica, portanto, o cadastro obrigatório na Fundação Biblioteca Nacional.</p>
            <p className="mb-3"><strong className="font-semibold">9.4.</strong> As comunicações formais entre as partes devem ser feitas para os endereços cadastrados no Portal Autoria e para <a href="mailto:contato@useautoria.com" className="underline hover:text-brand-primary">contato@useautoria.com</a> no caso da AUTORIA.</p>
            <p><strong className="font-semibold">9.5.</strong> Este contrato é regido pela legislação brasileira, em especial pela Lei 9.610/98 (Direitos Autorais), Lei 10.753/2003 (Política Nacional do Livro) e Lei 13.709/2018 (LGPD).</p>
          </section>

          <section>
            <h2 className="font-heading text-2xl text-brand-primary mb-4">Cláusula 10 — Foro</h2>
            <p><strong className="font-semibold">10.1.</strong> Fica eleito o foro da Comarca de <em>[cidade-UF da sede da Autoria]</em> para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro por mais privilegiado que seja.</p>
          </section>

        </article>

        {/* Rodapé de aceite */}
        <div className="mt-16 p-6 bg-zinc-50 border border-zinc-100 rounded-2xl">
          <p className="text-sm text-zinc-600 leading-relaxed">
            <strong>Como o aceite funciona.</strong> Ao clicar em "Publicar via Autoria" no fluxo de publicação da plataforma, o AUTOR declara ter lido e aceitado integralmente este contrato. O aceite fica registrado com data, hora e versão do documento em sua conta.
          </p>
          <p className="text-xs text-zinc-400 mt-4">
            Versão 0.1 · Última atualização: 10 de julho de 2026 · Este texto está sujeito a revisão jurídica antes da ativação da Trilha Delegada de Publicação.
          </p>
        </div>

        <div className="mt-8 flex items-center gap-4 text-sm">
          <Link href="/termos" className="text-zinc-500 hover:text-brand-primary underline underline-offset-4 transition-colors">
            Termos de Uso
          </Link>
          <span className="text-zinc-300">·</span>
          <Link href="/privacidade" className="text-zinc-500 hover:text-brand-primary underline underline-offset-4 transition-colors">
            Política de Privacidade
          </Link>
          <span className="text-zinc-300">·</span>
          <Link href="/" className="text-zinc-500 hover:text-brand-primary underline underline-offset-4 transition-colors">
            Início
          </Link>
        </div>
      </main>
    </div>
  );
}

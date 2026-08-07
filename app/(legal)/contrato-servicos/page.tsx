import Link from "next/link";
import type { Metadata } from "next";
import LegalDocFrame from "../_frame";
import { LEGAL_DOCS } from "@/lib/legal-docs";
import { AnexoIContent } from "./_anexo-i";

const DOC = LEGAL_DOCS["contrato-servicos"];

export const metadata: Metadata = {
  title: `${DOC.titulo} — Autoria`,
  description:
    "Contrato de serviços editoriais entre a Autoria e o autor. A Autoria não é editora — presta serviço técnico. O editor responsável pela obra é o autor.",
};

export default function ContratoServicosPage() {
  return (
    <LegalDocFrame slug="contrato-servicos">
      <p>
        De um lado <strong>[RAZÃO SOCIAL]</strong>, CNPJ <strong>[CNPJ]</strong>, sede em <strong>[ENDEREÇO]</strong> (&quot;AUTORIA&quot;); de outro
        o <strong>AUTOR</strong>, identificado no cadastro da plataforma, que adere a este contrato por
        aceite eletrônico no momento da contratação do plano, com registro de data, hora,
        versão e IP.
      </p>

      <section id="clausula-1">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 1 — Objeto e natureza do serviço</h2>
        <p className="mb-3"><strong>1.1.</strong> A AUTORIA presta ao AUTOR <strong>serviços técnicos de editoração</strong> sobre obra de titularidade do AUTOR: diagnóstico editorial, revisão assistida por IA, geração de elementos editoriais, geração de capa, diagramação de miolo, geração de arquivos digitais e de impressão, e prova — conforme o plano contratado.</p>
        <p className="mb-3"><strong>1.2. A AUTORIA não é editora da obra.</strong> Este contrato não é contrato de edição e não se rege pelo art. 53 da Lei 9.610/98. A AUTORIA não adquire, não recebe em cessão e não licencia para exploração própria qualquer direito patrimonial sobre a obra.</p>
        <p className="mb-3"><strong>1.3.</strong> O <strong>editor responsável</strong> pela obra é o AUTOR, inclusive para efeito das obrigações que a legislação atribui ao editor, tais como ISBN, ficha catalográfica e depósito legal.</p>
        <p className="mb-3"><strong>1.4.</strong> A AUTORIA não figura como editora no colofão, na página de créditos, na ficha catalográfica ou em qualquer elemento da obra. Quando houver crédito à AUTORIA, será exclusivamente como <strong>prestadora de serviço técnico</strong> (ex.: diagramação).</p>
        <p><strong>1.5.</strong> A AUTORIA <strong>não faz curadoria editorial</strong> e não recusa obras por mérito, tese ou qualidade. As únicas recusas possíveis são as da <Link href="/politica-de-conteudo" className="underline hover:text-brand-primary">Política de Conteúdo</Link>.</p>
      </section>

      <section id="clausula-2">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 2 — Licença de uso limitada</h2>
        <p className="mb-3"><strong>2.1.</strong> O AUTOR concede à AUTORIA licença <strong>não exclusiva, revogável, gratuita e limitada</strong> para armazenar, processar, converter, diagramar e exibir a obra <strong>exclusivamente para executar os serviços contratados</strong>.</p>
        <p className="mb-3"><strong>2.2.</strong> A licença não abrange: publicação em nome próprio, comercialização, adaptação para outros meios, tradução, obras derivadas, sublicenciamento a terceiros para exploração, ou uso promocional. Todos esses direitos permanecem integralmente com o AUTOR.</p>
        <p className="mb-3"><strong>2.3. A obra não é utilizada para treinamento de modelos de inteligência artificial</strong>, por nenhuma das partes ou fornecedores.</p>
        <p><strong>2.4.</strong> A licença extingue-se com a conclusão do serviço ou com a exclusão do projeto pelo AUTOR, o que ocorrer primeiro.</p>
      </section>

      <section id="clausula-3">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 3 — Obrigação de meio</h2>
        <p className="mb-3"><strong>3.1.</strong> Os serviços são <strong>obrigação de meio</strong>, não de resultado. A AUTORIA se obriga a executar as etapas com diligência técnica, não a produzir um resultado editorial ou comercial determinado.</p>
        <p className="mb-3"><strong>3.2.</strong> A AUTORIA <strong>não garante</strong>: texto isento de erros após a revisão; aceitação da obra em livrarias, marketplaces, bibliotecas, editais ou prêmios; volume de vendas; retorno financeiro; ou opinião favorável de leitores e críticos.</p>
        <p className="mb-3"><strong>3.3.</strong> Toda saída gerada por IA é sugestão sujeita à aprovação do AUTOR. A decisão editorial final é sempre do AUTOR.</p>
        <p><strong>3.4. Imagens geradas por IA.</strong> A titularidade e a proteção autoral de imagens geradas por inteligência artificial são juridicamente incertas. A AUTORIA <strong>não garante</strong> exclusividade, originalidade absoluta, registrabilidade ou ausência de semelhança com outras imagens.</p>
      </section>

      <section id="clausula-4">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 4 — Deveres do AUTOR</h2>
        <p className="mb-3"><strong>4.1.</strong> Fornecer manuscrito e metadados verdadeiros e completos.</p>
        <p className="mb-3"><strong>4.2.</strong> Firmar a <strong>Declaração de Titularidade e Originalidade</strong> (<a href="#anexo-i" className="underline hover:text-brand-primary">Anexo I</a>) no envio do manuscrito.</p>
        <p className="mb-3"><strong>4.3.</strong> Conferir e aprovar cada etapa nos pontos de aprovação da plataforma.</p>
        <p className="mb-3"><strong>4.4.</strong> Manter cópia própria do manuscrito original.</p>
        <p className="mb-3"><strong>4.5.</strong> Cumprir a Política de Conteúdo e as obrigações que a legislação atribui ao editor da obra.</p>
        <p><strong>4.6.</strong> Responder integralmente, inclusive em regresso perante a AUTORIA, por reclamação, notificação extrajudicial, processo judicial ou administrativo de terceiro fundado no conteúdo da obra — incluindo custas e honorários efetivamente incorridos.</p>
      </section>

      <section id="clausula-5">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 5 — Aprovação da prova e transferência de risco</h2>
        <p className="mb-3"><strong>5.1.</strong> Antes da geração dos arquivos finais e de qualquer impressão, a AUTORIA disponibiliza <strong>prova</strong> — versão integral do miolo e da capa como serão produzidos.</p>
        <p className="mb-3"><strong>5.2. A aprovação da prova pelo AUTOR é o marco de transferência de risco editorial.</strong> A partir dela, erros remanescentes de texto, ortografia, pontuação, ordem de capítulos, dados da página de créditos, grafia de nomes, ISBN e ficha catalográfica são de responsabilidade do AUTOR.</p>
        <p className="mb-3"><strong>5.3.</strong> A aprovação é registrada com data, hora, usuário e identificador do arquivo aprovado.</p>
        <p className="mb-3"><strong>5.4.</strong> Correções solicitadas após a aprovação da prova são serviço novo, orçado à parte. Se já houver impressão em curso, o custo da reimpressão é do AUTOR.</p>
        <p><strong>5.5.</strong> Erros <strong>introduzidos pela AUTORIA após</strong> a aprovação da prova são corrigidos sem custo.</p>
      </section>

      <section id="clausula-6">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 6 — Impressão e tolerâncias industriais</h2>
        <p className="mb-3 italic text-zinc-500">Aplica-se quando o AUTOR contrata livro impresso.</p>
        <p className="mb-3"><strong>6.1.</strong> A impressão é executada por gráfica parceira — atualmente <strong>Graphium Editora e Gráfica Ltda.</strong> —, sob responsabilidade técnica da AUTORIA perante o AUTOR. A AUTORIA pode substituir a gráfica parceira mediante aviso prévio no painel do projeto, mantendo o padrão de qualidade contratado.</p>
        <p className="mb-3"><strong>6.2. Prazos de produção</strong> contam a partir da aprovação da prova e da confirmação do pagamento, variando conforme a tiragem: até <strong>300 exemplares</strong>, aproximadamente <strong>15 dias úteis</strong>; acima de <strong>300 exemplares</strong>, aproximadamente <strong>20 dias úteis</strong>. Prazos não incluem transporte.</p>
        <p className="mb-3"><strong>6.3. Tolerâncias que não caracterizam defeito</strong>, por serem inerentes ao processo gráfico:</p>
        <ul className="list-disc pl-6 space-y-1 mb-3">
          <li>variação de cor entre prova digital em tela e impresso, e entre tiragens distintas;</li>
          <li>deslocamento de corte de até <strong>2 mm</strong>;</li>
          <li>variação de gramatura e tonalidade do papel dentro da faixa do fabricante;</li>
          <li>variação de espessura de lombada de até <strong>1 mm</strong> em relação ao calculado;</li>
          <li>pequenas variações de refile e esquadro dentro do padrão da indústria.</li>
        </ul>
        <p className="mb-3"><strong>6.4. Defeitos que geram reimpressão sem custo:</strong> falha de impressão que comprometa a leitura, páginas faltantes, trocadas ou invertidas, falha de encadernação, e divergência entre o arquivo aprovado e o produto entregue.</p>
        <p className="mb-3"><strong>6.5.</strong> Reclamações de qualidade devem ser feitas em até <strong>7 dias corridos</strong> do recebimento, com fotos. A AUTORIA pode solicitar devolução de exemplar para análise.</p>
        <p><strong>6.6.</strong> A escolha de papel, formato e acabamento é do AUTOR. A AUTORIA informa características e limitações técnicas, mas <strong>não recomenda escolha</strong> — a decisão editorial é do AUTOR.</p>
      </section>

      <section id="clausula-7">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 7 — Preço, cancelamento e reembolso</h2>
        <p className="mb-3"><strong>7.1.</strong> O preço é o exibido no momento da contratação, pago <strong>uma vez, por obra</strong>. Não há assinatura nem cobrança recorrente.</p>
        <p className="mb-3"><strong>7.2. Direito de arrependimento (CDC, art. 49).</strong> O AUTOR pode desistir em <strong>7 dias corridos</strong> contados da contratação.</p>
        <p className="mb-3"><strong>7.3. Efeito do arrependimento.</strong> Exercido o direito nos 7 dias corridos previstos na Cláusula 7.2, o AUTOR tem direito ao <strong>reembolso integral</strong> dos valores pagos, na forma do art. 49, parágrafo único, do CDC, independentemente das etapas já executadas pela AUTORIA nesse período.</p>
        <p className="mb-3"><strong>7.4.</strong> Após 7 dias, não há reembolso de etapas executadas. Etapas contratadas e não executadas são reembolsadas a qualquer tempo.</p>
        <p><strong>7.5. Autorização expressa de produção.</strong> O livro impresso é produto <strong>sob encomenda</strong>, personalizado para o AUTOR. Ao aprovar a prova e confirmar o pagamento, o AUTOR <strong>autoriza expressamente</strong> o início imediato da produção gráfica, mesmo dentro do prazo de arrependimento previsto na Cláusula 7.2. Iniciada a produção, a tiragem impressa não é passível de reembolso após o prazo de arrependimento, salvo defeito nos termos da Cláusula 6.</p>
      </section>

      <section id="clausula-8">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 8 — Responsabilidade</h2>
        <p className="mb-3"><strong>8.1.</strong> A AUTORIA responde por danos diretos comprovadamente decorrentes de falha na execução do serviço, limitados ao valor pago pelo serviço em questão. Esta limitação não se aplica onde a lei a afaste, em especial nas relações de consumo.</p>
        <p><strong>8.2.</strong> A AUTORIA não responde por: conteúdo da obra; decisões editoriais do AUTOR; rejeição por canais externos; resultado comercial; ou perda de arquivo não mantido em cópia pelo AUTOR.</p>
      </section>

      <section id="clausula-9">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 9 — Vigência e rescisão</h2>
        <p className="mb-3"><strong>9.1.</strong> O contrato vigora até a conclusão dos serviços contratados.</p>
        <p className="mb-3"><strong>9.2.</strong> O AUTOR pode rescindir a qualquer tempo, sem multa, aplicando-se a <a href="#clausula-7" className="underline hover:text-brand-primary">Cláusula 7</a>.</p>
        <p className="mb-3"><strong>9.3.</strong> A AUTORIA pode rescindir mediante aviso de 15 dias por descumprimento da Cláusula 4, com prazo de regularização — ou <strong>imediatamente</strong>, sem prazo, nas hipóteses de remoção imediata da Política de Conteúdo.</p>
        <p><strong>9.4.</strong> Rescindido o contrato, o AUTOR pode baixar os arquivos gerados por <strong>30 dias</strong>.</p>
      </section>

      <section id="clausula-10">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Cláusula 10 — Disposições finais</h2>
        <p className="mb-3">
          <strong>10.1.</strong> Integram este contrato:{" "}
          <Link href="/termos" className="underline hover:text-brand-primary">Termos de Uso</Link>,{" "}
          <Link href="/privacidade" className="underline hover:text-brand-primary">Política de Privacidade</Link>,{" "}
          <Link href="/politica-de-conteudo" className="underline hover:text-brand-primary">Política de Conteúdo</Link> e o{" "}
          <a href="#anexo-i" className="underline hover:text-brand-primary">Anexo I</a>.
        </p>
        <p className="mb-3"><strong>10.2.</strong> Alterações são comunicadas com 30 dias de antecedência e não retroagem a obras já contratadas.</p>
        <p><strong>10.3.</strong> Aplica-se a legislação brasileira. Nas relações de consumo, fica assegurado ao AUTOR demandar no foro do seu domicílio (CDC, art. 101, I).</p>
      </section>

      <section id="anexo-i" className="mt-16 pt-8 border-t-2 border-brand-gold/30">
        <p className="text-brand-gold text-xs font-semibold uppercase tracking-widest mb-3">Anexo I</p>
        <h2 className="font-heading text-3xl text-brand-primary mb-3">Declaração de Titularidade e Originalidade</h2>
        <p className="italic text-zinc-500 mb-6">Aceita separadamente, no momento do envio do manuscrito.</p>

        <AnexoIContent />

        <p className="italic text-zinc-500 mt-6 text-sm">
          Registro do aceite: data, hora, versão do documento, IP e identificador do projeto.
        </p>
      </section>
    </LegalDocFrame>
  );
}

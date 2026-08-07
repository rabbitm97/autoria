import Link from "next/link";
import type { Metadata } from "next";
import LegalDocFrame from "../_frame";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const DOC = LEGAL_DOCS["termos-de-uso"];

export const metadata: Metadata = {
  title: `${DOC.titulo} — Autoria`,
  description:
    "Termos que regem o uso da plataforma Autoria: o que a Autoria é, o que não é, direitos autorais do autor, uso da inteligência artificial e limitações.",
};

export default function TermosPage() {
  return (
    <LegalDocFrame slug="termos-de-uso">
      <p>
        Estes Termos regem o uso da plataforma Autoria, disponível em useautoria.com,
        operada por <strong>[RAZÃO SOCIAL]</strong>, inscrita no CNPJ sob nº <strong>[CNPJ]</strong>,
        com sede em <strong>[ENDEREÇO]</strong> (&quot;Autoria&quot;).
      </p>
      <p>
        Ao criar uma conta, você concorda com estes Termos. Se não concordar, não use a
        plataforma.
      </p>

      <section id="clausula-1">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">1. O que a Autoria é — e o que não é</h2>
        <p className="mb-3"><strong>1.1.</strong> A Autoria é uma plataforma de <strong>serviços de editoração</strong>: diagnóstico editorial, revisão assistida por inteligência artificial, geração de capa, diagramação de miolo, geração de arquivos digitais e de impressão, e prova.</p>
        <p className="mb-3"><strong>1.2.</strong> A Autoria <strong>não é editora</strong>. A Autoria não adquire, não licencia para si e não explora os direitos autorais da sua obra. Você é o titular integral dos direitos e o <strong>editor responsável</strong> pela obra que publicar — inclusive para efeito das obrigações que a legislação atribui ao editor.</p>
        <p className="mb-3"><strong>1.3.</strong> A Autoria <strong>não faz curadoria editorial</strong>. Não avaliamos o mérito literário da sua obra e não recusamos manuscritos por qualidade. As únicas recusas possíveis são as previstas na Política de Conteúdo.</p>
        <p><strong>1.4.</strong> A Autoria <strong>não garante vendas, aceitação em canais externos, aprovação em editais ou qualquer resultado comercial</strong>.</p>
      </section>

      <section id="clausula-2">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">2. Conta</h2>
        <p className="mb-3"><strong>2.1.</strong> Você precisa ter 18 anos ou mais, ou estar representado por responsável legal.</p>
        <p className="mb-3"><strong>2.2.</strong> Você é responsável pela veracidade dos dados cadastrais e pela guarda das suas credenciais. Atividades realizadas na sua conta são presumidamente suas.</p>
        <p className="mb-3"><strong>2.3.</strong> Uma conta por pessoa. É vedado compartilhar, revender ou ceder acesso.</p>
        <p><strong>2.4.</strong> Você pode encerrar sua conta a qualquer momento. O encerramento não gera reembolso de serviços já executados e não apaga registros que a Autoria precise manter por obrigação legal.</p>
      </section>

      <section id="clausula-3">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">3. Uso da inteligência artificial</h2>
        <p className="mb-3"><strong>3.1.</strong> Várias etapas da esteira usam modelos de inteligência artificial de terceiros. As etapas com uso de IA são identificadas na própria interface.</p>
        <p className="mb-3"><strong>3.2.</strong> <strong>A Autoria não usa sua obra para treinar modelos de inteligência artificial</strong>, nem autoriza que seus fornecedores o façam.</p>
        <p className="mb-3"><strong>3.3.</strong> Toda saída gerada por IA é <strong>sugestão</strong>. Nada é aplicado à sua obra sem sua aprovação explícita na interface. A decisão editorial final é sempre sua.</p>
        <p className="mb-3"><strong>3.4.</strong> Revisão e diagnóstico são <strong>obrigação de meio</strong>, não de resultado. A revisão assistida por IA reduz erros, mas não garante um texto isento de erros. A conferência final do texto é sua responsabilidade.</p>
        <p><strong>3.5. Imagens geradas por IA:</strong> a titularidade e a proteção autoral de imagens geradas por inteligência artificial são juridicamente incertas no Brasil e no mundo. A Autoria não garante que uma capa gerada por IA seja exclusiva, registrável como obra autoral, ou imune a semelhança com outras imagens. Se a exclusividade for essencial para você, use capa própria ou contrate um ilustrador.</p>
      </section>

      <section id="clausula-4">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">4. Seus arquivos e seus direitos</h2>
        <p className="mb-3"><strong>4.1.</strong> Você mantém <strong>100% dos direitos autorais</strong>, morais e patrimoniais, sobre a sua obra. Estes Termos não transferem, não cedem e não licenciam esses direitos para exploração pela Autoria.</p>
        <p className="mb-3"><strong>4.2.</strong> Você concede à Autoria uma <strong>licença limitada, não exclusiva, revogável e gratuita</strong> para armazenar, processar, converter e exibir sua obra <strong>exclusivamente para executar os serviços que você contratou</strong>. A licença termina quando o serviço termina ou quando você apaga o projeto, o que ocorrer primeiro.</p>
        <p className="mb-3"><strong>4.3.</strong> A Autoria não usará sua obra em material de marketing sem sua autorização específica e por escrito, obtida em documento apartado.</p>
        <p><strong>4.4.</strong> Ao enviar um manuscrito, você declara que é titular dos direitos ou que possui autorização de todos os titulares, nos termos da Declaração de Titularidade (Anexo I do <Link href="/contrato-servicos#anexo-i" className="underline hover:text-brand-primary">Contrato de Prestação de Serviços Editoriais</Link>).</p>
      </section>

      <section id="clausula-5">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">5. Conteúdo</h2>
        <p className="mb-3"><strong>5.1.</strong> Você é o único responsável pelo conteúdo da sua obra — texto, imagens, citações, uso de nome e imagem de terceiros.</p>
        <p className="mb-3"><strong>5.2.</strong> A <Link href="/politica-de-conteudo" className="underline hover:text-brand-primary">Política de Conteúdo</Link> integra estes Termos e define o que não é aceito na plataforma, além do procedimento de notificação e retirada.</p>
        <p><strong>5.3.</strong> A Autoria pode suspender um projeto mediante notificação fundamentada de terceiro, ordem judicial ou constatação inequívoca de ilicitude, conforme a Política de Conteúdo.</p>
      </section>

      <section id="clausula-6">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">6. Pagamentos</h2>
        <p className="mb-3"><strong>6.1.</strong> Os planos e valores vigentes são os exibidos na plataforma no momento da contratação. Pagamento único por obra — não há assinatura.</p>
        <p className="mb-3"><strong>6.2.</strong> As condições de execução, entrega, prova, impressão, cancelamento e reembolso estão no <Link href="/contrato-servicos" className="underline hover:text-brand-primary"><strong>Contrato de Prestação de Serviços Editoriais</strong></Link>, aceito no momento da contratação.</p>
        <p><strong>6.3.</strong> Alterações de preço não afetam obras já contratadas.</p>
      </section>

      <section id="clausula-7">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">7. Disponibilidade e limitações</h2>
        <p className="mb-3"><strong>7.1.</strong> A plataforma é fornecida no estado em que se encontra, com esforço razoável de disponibilidade. Manutenções, indisponibilidades de fornecedores e falhas de terceiros podem ocorrer.</p>
        <p className="mb-3"><strong>7.2.</strong> A Autoria não se responsabiliza por perda de arquivos que você não tenha mantido em cópia própria. <strong>Mantenha sempre uma cópia do seu manuscrito original.</strong></p>
        <p><strong>7.3.</strong> A responsabilidade da Autoria por qualquer prejuízo relacionado ao uso da plataforma limita-se ao valor efetivamente pago por você pelo serviço em questão. Esta limitação não se aplica nas hipóteses em que a lei a afaste, em especial nas relações de consumo.</p>
      </section>

      <section id="clausula-8">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">8. Alterações</h2>
        <p className="mb-3"><strong>8.1.</strong> Estes Termos podem ser alterados. Alterações relevantes serão comunicadas por e-mail com <strong>30 dias de antecedência</strong>.</p>
        <p className="mb-3"><strong>8.2.</strong> Cada versão fica registrada com data de vigência. O aceite que vale para você é o da versão vigente quando você aceitou, registrado na sua conta.</p>
        <p><strong>8.3.</strong> Se você não concordar com uma alteração, pode encerrar a conta antes da entrada em vigor, sem qualquer penalidade.</p>
      </section>

      <section id="clausula-9">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">9. Legislação e foro</h2>
        <p className="mb-3"><strong>9.1.</strong> Aplica-se a legislação brasileira, em especial o Código de Defesa do Consumidor (Lei 8.078/90), a Lei de Direitos Autorais (Lei 9.610/98), o Marco Civil da Internet (Lei 12.965/14) e a LGPD (Lei 13.709/18).</p>
        <p><strong>9.2.</strong> Nas relações de consumo, fica assegurado ao autor o direito de demandar no foro do seu próprio domicílio, nos termos do art. 101, I, do CDC.</p>
      </section>

      <section id="clausula-10">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">10. Contato</h2>
        <p className="mb-3">Dúvidas, notificações e solicitações: <a href="mailto:contato@useautoria.com" className="underline hover:text-brand-primary"><strong>contato@useautoria.com</strong></a></p>
        <p>
          Documentos relacionados: <Link href="/privacidade" className="underline hover:text-brand-primary">Política de Privacidade</Link> ·{" "}
          <Link href="/politica-de-conteudo" className="underline hover:text-brand-primary">Política de Conteúdo</Link> ·{" "}
          <Link href="/contrato-servicos" className="underline hover:text-brand-primary">Contrato de Prestação de Serviços Editoriais</Link>.
        </p>
      </section>
    </LegalDocFrame>
  );
}

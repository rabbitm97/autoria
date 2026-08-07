import type { Metadata } from "next";
import LegalDocFrame from "../_frame";
import { LEGAL_DOCS } from "@/lib/legal-docs";

const DOC = LEGAL_DOCS["politica-privacidade"];

export const metadata: Metadata = {
  title: `${DOC.titulo} — Autoria`,
  description:
    "Como a Autoria trata seus dados pessoais e sua obra. Sua obra não é usada para treinar modelos de IA. Base legal, prazos de retenção e seus direitos como titular.",
};

export default function PrivacidadePage() {
  return (
    <LegalDocFrame slug="politica-privacidade">
      <p>
        Controladora: <strong>[RAZÃO SOCIAL]</strong>, CNPJ <strong>[CNPJ]</strong>, <strong>[ENDEREÇO]</strong>.
        <br />
        Encarregado (DPO): <a href="mailto:privacidade@useautoria.com" className="underline hover:text-brand-primary"><strong>privacidade@useautoria.com</strong></a>
      </p>

      <section id="clausula-1">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">1. O ponto principal, antes de tudo</h2>
        <p>
          <strong>Sua obra não é usada para treinar modelos de inteligência artificial.</strong> Nem pela
          Autoria, nem pelos nossos fornecedores. Isso está contratualmente vedado com os
          provedores de IA que utilizamos e é uma decisão de produto, não uma concessão.
        </p>
      </section>

      <section id="clausula-2">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">2. Que dados tratamos</h2>
        <p className="mb-3"><strong>2.1. Dados de cadastro.</strong> Nome, e-mail, senha (armazenada de forma criptografada), e, quando você contrata impressão, endereço de entrega e telefone.</p>
        <p className="mb-3"><strong>2.2. Dados de pagamento.</strong> Processados diretamente pelo provedor de pagamento. A Autoria <strong>não armazena</strong> número de cartão.</p>
        <p className="mb-3"><strong>2.3. Sua obra.</strong> Manuscrito, títulos, sinopse, biografia, imagens, arquivos gerados (PDF, EPUB, DOCX, capas) e os metadados do projeto.</p>
        <p className="mb-3"><strong>2.4. Dados de terceiros contidos na obra.</strong> Se sua obra menciona pessoas reais — memórias, biografias, relatos — esses dados pessoais são tratados por nós como operadores da sua decisão editorial. <strong>Você é responsável por ter base legal para incluí-los.</strong></p>
        <p><strong>2.5. Dados de uso.</strong> Logs de acesso (obrigatórios pelo Marco Civil), IP, dispositivo, navegador, eventos de navegação e registros de aceite de documentos legais.</p>
      </section>

      <section id="clausula-3">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">3. Para que tratamos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left py-2 pr-4 font-semibold text-brand-primary">Finalidade</th>
                <th className="text-left py-2 font-semibold text-brand-primary">Base legal (LGPD)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Executar os serviços contratados</td><td className="py-2">Execução de contrato (art. 7º, V)</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Criar e manter sua conta</td><td className="py-2">Execução de contrato</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Cobrança e emissão fiscal</td><td className="py-2">Obrigação legal (art. 7º, II)</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Registro de aceites e logs de acesso</td><td className="py-2">Obrigação legal / exercício de direitos</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Suporte e comunicação sobre seu projeto</td><td className="py-2">Execução de contrato</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Segurança, prevenção a fraude e abuso</td><td className="py-2">Legítimo interesse (art. 7º, IX)</td></tr>
              <tr><td className="py-2 pr-4">Comunicações de marketing</td><td className="py-2">Consentimento (art. 7º, I), revogável</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4">Não usamos seus dados para publicidade comportamental e não os vendemos.</p>
      </section>

      <section id="clausula-4">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">4. Com quem compartilhamos</h2>
        <p className="mb-4">
          Compartilhamos o mínimo necessário, com operadores contratualmente obrigados a
          proteger os dados:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left py-2 pr-4 font-semibold text-brand-primary">Fornecedor</th>
                <th className="text-left py-2 pr-4 font-semibold text-brand-primary">Para quê</th>
                <th className="text-left py-2 font-semibold text-brand-primary">Onde</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Supabase</td><td className="py-2 pr-4">Banco de dados e armazenamento de arquivos</td><td className="py-2">Exterior</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Vercel</td><td className="py-2 pr-4">Hospedagem da aplicação</td><td className="py-2">Exterior</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Anthropic</td><td className="py-2 pr-4">Modelos de IA (diagnóstico, revisão, capa, elementos)</td><td className="py-2">Exterior</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Google Cloud</td><td className="py-2 pr-4">Modelos de IA e serviços de infraestrutura</td><td className="py-2">Exterior</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Provedor de pagamento</td><td className="py-2 pr-4">Processamento de cobrança</td><td className="py-2">Brasil</td></tr>
              <tr><td className="py-2 pr-4">Graphium Editora Ltda</td><td className="py-2 pr-4">Impressão e expedição, quando você contrata livro impresso</td><td className="py-2">Brasil</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 mb-3"><strong>4.1. Transferência internacional.</strong> Parte dos fornecedores acima opera fora do Brasil. As transferências ocorrem com base em cláusulas contratuais de proteção, conforme art. 33 da LGPD.</p>
        <p className="mb-3"><strong>4.2. Quando você contrata impressão</strong>, os dados necessários à produção e à entrega (arquivos finais, nome, endereço) são transmitidos à gráfica parceira, exclusivamente para esse fim.</p>
        <p><strong>4.3.</strong> Também podemos compartilhar dados mediante ordem judicial ou requisição de autoridade competente.</p>
      </section>

      <section id="clausula-5">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">5. Por quanto tempo guardamos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left py-2 pr-4 font-semibold text-brand-primary">Dado</th>
                <th className="text-left py-2 font-semibold text-brand-primary">Prazo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Conta e projetos</td><td className="py-2">Enquanto a conta existir</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Arquivos da obra</td><td className="py-2">Até você apagar o projeto, ou 12 meses após o encerramento da conta</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Registros de aceite (documento, versão, hash, data, IP)</td><td className="py-2">5 anos após o fim da relação</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Logs de acesso</td><td className="py-2">6 meses (Marco Civil, art. 15)</td></tr>
              <tr><td className="py-2 pr-4">Documentos fiscais</td><td className="py-2">Conforme prazo da legislação tributária</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4">Após o prazo, os dados são eliminados ou anonimizados.</p>
      </section>

      <section id="clausula-6">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">6. Seus direitos</h2>
        <p className="mb-3">
          Você pode, a qualquer momento, pedir: confirmação de tratamento, acesso, correção,
          anonimização, portabilidade, eliminação, informação sobre compartilhamento, e
          revogação de consentimento.
        </p>
        <p className="mb-3">
          Basta escrever para <a href="mailto:privacidade@useautoria.com" className="underline hover:text-brand-primary"><strong>privacidade@useautoria.com</strong></a>. Respondemos em até 15 dias.
        </p>
        <p>
          Alguns dados não podem ser eliminados por obrigação legal — nesse caso explicamos
          qual é a obrigação e por quanto tempo ela dura.
        </p>
      </section>

      <section id="clausula-7">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">7. Segurança</h2>
        <p className="mb-3">
          Criptografia em trânsito e em repouso, controle de acesso por linha (RLS) no banco
          de dados, URLs assinadas e de validade curta para arquivos, e princípio do menor
          privilégio nas credenciais internas.
        </p>
        <p>
          Nenhum sistema é infalível. Em caso de incidente de segurança com risco relevante,
          comunicaremos você e a ANPD nos prazos legais.
        </p>
      </section>

      <section id="clausula-8">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">8. Cookies</h2>
        <p>
          Usamos cookies essenciais (sessão e autenticação) e, quando aplicável, cookies
          analíticos. Cookies não essenciais dependem do seu consentimento e podem ser
          recusados sem prejuízo ao uso da plataforma.
        </p>
      </section>

      <section id="clausula-9">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">9. Menores</h2>
        <p>
          A plataforma não se destina a menores de 18 anos. Se identificarmos conta de menor
          sem representação legal, ela será encerrada.
        </p>
      </section>

      <section id="clausula-10">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">10. Alterações</h2>
        <p>
          Alterações relevantes serão comunicadas por e-mail com 30 dias de antecedência. Cada
          versão fica registrada com data de vigência.
        </p>
      </section>

      <section id="contato">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Contato</h2>
        <p>
          <a href="mailto:privacidade@useautoria.com" className="underline hover:text-brand-primary"><strong>privacidade@useautoria.com</strong></a> · <strong>Encarregado:</strong> [NOME DO ENCARREGADO]
        </p>
      </section>
    </LegalDocFrame>
  );
}

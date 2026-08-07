import type { Metadata } from "next";
import LegalDocFrame from "../_frame";
import { LEGAL_DOCS } from "@/lib/legal-docs";
import FormDenuncia from "./_form-denuncia";

const DOC = LEGAL_DOCS["politica-conteudo"];

export const metadata: Metadata = {
  title: `${DOC.titulo} — Autoria`,
  description:
    "O que não é aceito na Autoria — limite de legalidade, não de curadoria. Como reportar uma obra e prazos de resposta.",
};

export default function PoliticaConteudoPage() {
  return (
    <LegalDocFrame slug="politica-conteudo">
      <section id="clausula-1">
        <h2 className="font-heading text-2xl text-brand-primary mt-4 mb-4">1. Princípio</h2>
        <p className="mb-3">
          A Autoria <strong>não faz curadoria editorial</strong>. Não julgamos mérito literário, tese,
          posição política, religiosa ou estética de nenhuma obra, e não recusamos manuscritos
          por qualidade. A autonomia do autor sobre a obra é integral.
        </p>
        <p>
          O que esta política define é o <strong>limite de legalidade</strong> — e só ele.
        </p>
      </section>

      <section id="clausula-2">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">2. Conteúdo não aceito</h2>
        <p className="mb-3">Não processamos, não imprimimos e não hospedamos obras que contenham:</p>
        <ol className="list-decimal pl-6 space-y-2 mb-4">
          <li>Material de abuso sexual infantil ou qualquer sexualização de menores.</li>
          <li>Apologia, incitação ou instrução prática a crime, terrorismo ou violência contra pessoa ou grupo.</li>
          <li>Discurso de ódio dirigido a pessoa ou grupo por raça, cor, etnia, religião, procedência nacional, deficiência, orientação sexual ou identidade de gênero.</li>
          <li>Instruções operacionais para fabricação de armas, explosivos ou agentes químicos, biológicos ou nucleares.</li>
          <li>Conteúdo que viole direito autoral de terceiro — inclusive plágio e reprodução não autorizada.</li>
          <li>Conteúdo que viole direito de imagem, honra, nome ou privacidade de pessoa identificável, sem autorização.</li>
          <li>Dados pessoais de terceiros divulgados sem base legal.</li>
          <li>Conteúdo destinado a fraude, estelionato ou desinformação sobre saúde pública ou processo eleitoral, apresentado como fato.</li>
        </ol>
        <p>
          <strong>Ficção não é exceção nem é alvo.</strong> Obras literárias podem retratar violência,
          crime, sexo entre adultos, preconceito e qualquer tema difícil. O que está vedado é
          o material ilícito em si — não a representação literária dele.
        </p>
      </section>

      <section id="clausula-3">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">3. Como verificamos</h2>
        <p className="mb-3"><strong>3.1.</strong> Não há leitura prévia editorial de manuscritos. A Autoria não lê sua obra para julgá-la.</p>
        <p className="mb-3"><strong>3.2.</strong> Há verificação automatizada mínima, restrita à detecção de ilicitude do item 2. Isso é <strong>compliance</strong>, não curadoria.</p>
        <p><strong>3.3.</strong> A ausência de bloqueio automático não é aprovação, chancela ou atestado de legalidade da obra.</p>
      </section>

      <section id="clausula-4">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">4. Notificação — como reportar uma obra</h2>

        <div className="mb-5 rounded-2xl border border-brand-gold/40 bg-brand-gold/5 p-5">
          <p className="text-sm text-brand-primary mb-1 font-semibold uppercase tracking-widest">Canal de notificações</p>
          <p className="text-base">
            <a href="mailto:denuncia@useautoria.com" className="font-heading text-2xl text-brand-primary underline underline-offset-4 hover:text-brand-gold">
              denuncia@useautoria.com
            </a>
          </p>
        </div>

        <p className="mb-4">
          Qualquer pessoa pode notificar conteúdo que considere ilícito ou violador de direito
          próprio, por <strong>denuncia@useautoria.com</strong> ou pelo formulário em
          useautoria.com/politica-de-conteudo.
        </p>

        <p className="mb-3">A notificação deve conter:</p>
        <ul className="list-disc pl-6 space-y-2 mb-4">
          <li>identificação do notificante e forma de contato;</li>
          <li>identificação da obra (título, autor, link ou identificador);</li>
          <li><strong>descrição específica</strong> do que é ilícito e onde está na obra (página, capítulo, trecho);</li>
          <li>fundamento — qual direito é violado e por quê;</li>
          <li>se for direito autoral: prova de titularidade;</li>
          <li>declaração de boa-fé e de veracidade das informações.</li>
        </ul>

        <p>
          Notificações genéricas, sem indicação específica do trecho, ou sem fundamento não
          permitem análise e serão respondidas pedindo complementação.
        </p>

        <FormDenuncia />
      </section>

      <section id="clausula-5">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">5. Como respondemos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left py-2 pr-4 font-semibold text-brand-primary">Etapa</th>
                <th className="text-left py-2 font-semibold text-brand-primary">Prazo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Confirmação de recebimento</td><td className="py-2">2 dias úteis</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Análise e decisão</td><td className="py-2">5 dias úteis (prorrogável, com aviso)</td></tr>
              <tr className="border-b border-zinc-100"><td className="py-2 pr-4">Ciência ao autor da obra</td><td className="py-2">junto com a decisão</td></tr>
              <tr><td className="py-2 pr-4">Resposta a ordem judicial</td><td className="py-2">no prazo determinado</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 mb-3">
          Decisões possíveis: manter a obra; suspender a comercialização; remover a obra;
          solicitar ajuste ao autor.
        </p>
        <p className="mb-3">
          <strong>Casos de remoção imediata, sem espera:</strong> material de abuso sexual infantil, ordem
          judicial, e infração de direito autoral inequívoca e comprovada.
        </p>
        <p>
          O autor é sempre informado e pode contestar por <a href="mailto:contato@useautoria.com" className="underline hover:text-brand-primary"><strong>contato@useautoria.com</strong></a>. A
          contestação é analisada e respondida no mesmo prazo.
        </p>
      </section>

      <section id="clausula-6">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">6. Registro</h2>
        <p>
          Toda notificação, decisão e providência é registrada com data, conteúdo e resultado.
          Esse registro é mantido por 5 anos.
        </p>
      </section>

      <section id="clausula-7">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">7. Limites da atuação da Autoria</h2>
        <p className="mb-3"><strong>7.1.</strong> A Autoria não é titular dos direitos das obras e não responde por elas originariamente. A responsabilidade pelo conteúdo é do autor.</p>
        <p className="mb-3"><strong>7.2.</strong> A suspensão ou remoção de uma obra é medida de compliance e <strong>não constitui juízo sobre o mérito</strong> da obra nem reconhecimento de ilicitude.</p>
        <p><strong>7.3.</strong> Notificação de má-fé, com informação falsa, sujeita o notificante a responsabilização.</p>
      </section>

      <section id="contatos">
        <h2 className="font-heading text-2xl text-brand-primary mt-10 mb-4">Contatos</h2>
        <p className="mb-2"><strong>Notificações:</strong> <a href="mailto:denuncia@useautoria.com" className="underline hover:text-brand-primary">denuncia@useautoria.com</a></p>
        <p><strong>Contato geral:</strong> <a href="mailto:contato@useautoria.com" className="underline hover:text-brand-primary">contato@useautoria.com</a></p>
      </section>
    </LegalDocFrame>
  );
}

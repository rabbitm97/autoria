// LEGAL-1C — Anexo I do Contrato de Prestação de Serviços.
// Fonte única do texto dos 7 itens da Declaração de Titularidade e
// Originalidade. Consumido por:
//   - app/(legal)/contrato-servicos/page.tsx (âncora #anexo-i)
//   - components/declaracao-titularidade.tsx (gate de upload)
//
// Também é o arquivo-fonte do hash de LEGAL_DOCS["declaracao-titularidade"]
// (ver lib/legal-docs.ts → LEGAL_DOC_SOURCES). Alterar qualquer palavra
// aqui muda o hash e exige bump de `versao` do slug — Verdade 40.

import Link from "next/link";

export function AnexoIContent() {
  return (
    <>
      <p>Declaro, sob as penas da lei, em relação à obra que envio à plataforma Autoria:</p>
      <ol className="list-decimal pl-6 space-y-3">
        <li>Sou titular dos direitos patrimoniais de autor sobre a obra, ou possuo autorização escrita e expressa de todos os coautores e titulares.</li>
        <li>A obra é original. Não contém plágio, reprodução não autorizada nem trecho de terceiro além do permitido em lei, sempre com indicação de fonte e autoria.</li>
        <li>Possuo autorização para todas as imagens, ilustrações, fotografias, gráficos, tabelas e demais elementos de terceiros incluídos na obra.</li>
        <li>Possuo autorização para uso de nome, imagem, voz e dados pessoais de qualquer pessoa identificável mencionada na obra, quando exigida por lei.</li>
        <li>
          A obra não contém material vedado pela{" "}
          <Link href="/politica-de-conteudo" className="underline hover:text-brand-primary">
            Política de Conteúdo
          </Link>
          .
        </li>
        <li>Sou o editor responsável pela obra e assumo as obrigações que a legislação atribui ao editor.</li>
        <li>
          <strong>
            Estou ciente de que declaração falsa configura falsidade ideológica
            (art. 299 do Código Penal)
          </strong>{" "}
          e gera responsabilidade civil e criminal integral, além de direito de regresso
          da Autoria por todos os prejuízos.
        </li>
      </ol>
    </>
  );
}

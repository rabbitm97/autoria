import { NextRequest, NextResponse } from "next/server";
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  BorderStyle, WidthType, TableLayoutType,
  convertMillimetersToTwip,
} from "docx";
import type { CreditosConfig, FichaOficialCRB } from "@/app/api/agentes/creditos/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORMATO_SIZES: Record<string, { w: number; h: number }> = {
  bolso:     { w: 110, h: 180 },
  a5:        { w: 148, h: 210 },
  padrao_br: { w: 160, h: 230 },
  quadrado:  { w: 200, h: 200 },
  a4:        { w: 210, h: 297 },
};

const mm = convertMillimetersToTwip;
const hp = (pt: number) => pt * 2; // half-points (docx unit)

function run(text: string, opts?: { italic?: boolean; bold?: boolean; pt?: number }): TextRun {
  return new TextRun({
    text,
    font: "Times New Roman",
    size: hp(opts?.pt ?? 9),
    italics: opts?.italic,
    bold: opts?.bold,
  });
}

function para(children: TextRun[], afterMm = 0): Paragraph {
  return new Paragraph({
    children,
    spacing: afterMm ? { after: mm(afterMm) } : undefined,
  });
}

// ─── POST /api/creditos/docx ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: {
    config: CreditosConfig;
    fichaOficial?: FichaOficialCRB | null;
    titulo?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { config, fichaOficial, titulo = "Sem título" } = body;

  if (!config?.titular_direitos) {
    return NextResponse.json({ error: "Config inválida." }, { status: 400 });
  }

  const dim = FORMATO_SIZES[config.formato] ?? FORMATO_SIZES.padrao_br;
  const children: (Paragraph | Table)[] = [];

  // ── Copyright ───────────────────────────────────────────────────────────────
  children.push(para([run(`Copyright © ${config.ano_copyright} ${config.titular_direitos}`)], 2));

  // ── Equipe técnica ───────────────────────────────────────────────────────────
  const teamFields: [string, string | undefined][] = [
    ["Título original",          config.titulo_original],
    ["Idioma original",          config.idioma_original],
    ["Tradução",                 config.traducao],
    ["Revisão técnica",          config.revisao_tecnica],
    ["Revisão",                  config.revisao],
    ["Preparação de texto",      config.preparacao],
    ["Diagramação",              config.diagramacao],
    ["Projeto gráfico de capa",  config.projeto_capa],
    ["Ilustração de capa",       config.ilustracao_capa],
    ["Produção editorial",       config.producao_editorial],
  ];

  teamFields.filter(([, v]) => v?.trim()).forEach(([label, value]) => {
    children.push(para([run(`${label}: `, { italic: true }), run(value!)]));
  });

  config.outros_creditos?.split("\n").filter(l => l.trim()).forEach(line => {
    children.push(para([run(line)]));
  });

  // ── Ficha oficial CRB (só quando fornecida) ─────────────────────────────────
  if (fichaOficial?.numero_chamada) {
    children.push(para([], 8)); // spacer

    const isbnOficial = config.isbn?.trim() || "";
    const assuntosLinhas = fichaOficial.assuntos
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const fichaLines: string[] = [
      "CATALOGAÇÃO NA PUBLICAÇÃO",
      "",
      fichaOficial.numero_chamada,
      fichaOficial.entrada_autor,
      fichaOficial.descricao_bibliografica,
    ];
    if (fichaOficial.notas_gerais) fichaLines.push(fichaOficial.notas_gerais);
    if (isbnOficial) { fichaLines.push(""); fichaLines.push(`ISBN ${isbnOficial}`); }
    if (assuntosLinhas.length) { fichaLines.push(""); assuntosLinhas.forEach(a => fichaLines.push(a)); }
    fichaLines.push("");
    fichaLines.push(`CDD: ${fichaOficial.cdd}`);
    fichaLines.push(`CDU: ${fichaOficial.cdu}`);

    const border = { style: BorderStyle.SINGLE, size: 4, color: "555555" };
    const fichaParagraphs: Paragraph[] = [
      ...fichaLines.map(line =>
        new Paragraph({
          children: [new TextRun({ text: line, font: "Times New Roman", size: hp(8) })],
          spacing: { before: 0, after: 0 },
        })
      ),
      new Paragraph({
        children: [new TextRun({ text: "", font: "Times New Roman", size: hp(6) })],
        spacing: { before: 0, after: 0 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Ficha catalográfica elaborada por ${fichaOficial.bibliotecario_nome} — ${fichaOficial.bibliotecario_crb}`,
            font: "Times New Roman",
            size: hp(7.5),
            italics: true,
            color: "555555",
          }),
        ],
        spacing: { before: mm(2), after: 0 },
      }),
    ];
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          margins: { top: mm(7), bottom: mm(7), left: mm(9), right: mm(9) },
          children: fichaParagraphs,
        })],
      })],
    }));
  }

  // ── Editora ───────────────────────────────────────────────────────────────────
  const pubLines: [string, boolean?][] = [];
  if (config.ano_edicao || config.ano_copyright)
    pubLines.push([String(config.ano_edicao || config.ano_copyright)]);
  if (config.nome_editora?.trim()) {
    pubLines.push(["Todos os direitos desta edição reservados à"]);
    pubLines.push([config.nome_editora.toUpperCase(), true]);
  }
  if (config.endereco_editora?.trim()) pubLines.push([config.endereco_editora]);
  const cepCidade = [config.cep, config.cidade_estado].filter(Boolean).join(" — ");
  if (cepCidade) pubLines.push([cepCidade]);
  if (config.site_editora?.trim())  pubLines.push([config.site_editora]);
  if (config.email_editora?.trim()) pubLines.push([config.email_editora]);

  if (pubLines.length > 0) {
    children.push(para([], 16)); // spacer before publisher
    pubLines.forEach(([text, bold]) => {
      children.push(para([run(text, { pt: 8, bold })]));
    });
  }

  // ── Build document ────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: {
            width:  mm(dim.w),
            height: mm(dim.h),
          },
          margin: {
            top:    mm(30),
            right:  mm(22),
            bottom: mm(25),
            left:   mm(25),
          },
        },
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = titulo.replace(/[^a-zA-Z0-9À-ſ\s]/g, "").replace(/\s+/g, "_").slice(0, 40);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="creditos_${safeName}.docx"`,
    },
  });
}

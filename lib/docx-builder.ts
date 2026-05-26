import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  Header,
  HeadingLevel,
  BorderStyle, WidthType, TableLayoutType,
  BookmarkStart, BookmarkEnd,
  PageBreak, SectionType,
  LeaderType, TabStopType,
  TableOfContents, StyleLevel,
  convertMillimetersToTwip,
} from "docx";
import type { ISectionOptions, IRunOptions } from "docx";
import type { CreditosConfig } from "@/app/api/agentes/creditos/route";
import {
  type MioloConfig, type TemplateId, type FormatoId,
  deveExibirSumario, fixTypography,
} from "./miolo-builder";
import { buildCustomXmlAnchors } from "./docx-anchors";

export type { MioloConfig, TemplateId, FormatoId };

// ─── Format specs (mirrors FORMATO_SPECS in miolo-builder, minus BLEED_MM) ───

const FORMATO_SPECS: Record<FormatoId, {
  w_mm: number; h_mm: number;
  top_mm: number; outer_mm: number; bottom_mm: number; inner_mm: number;
}> = {
  bolso:     { w_mm: 110, h_mm: 180, top_mm: 20, outer_mm: 14, bottom_mm: 22, inner_mm: 18 },
  a5:        { w_mm: 148, h_mm: 210, top_mm: 22, outer_mm: 16, bottom_mm: 25, inner_mm: 20 },
  padrao_br: { w_mm: 160, h_mm: 230, top_mm: 25, outer_mm: 18, bottom_mm: 28, inner_mm: 22 },
  quadrado:  { w_mm: 200, h_mm: 200, top_mm: 22, outer_mm: 18, bottom_mm: 25, inner_mm: 22 },
  a4:        { w_mm: 210, h_mm: 297, top_mm: 30, outer_mm: 20, bottom_mm: 30, inner_mm: 25 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mm = convertMillimetersToTwip;
const hp = (pt: number) => pt * 2; // half-points (docx size unit)

// ─── Font map ─────────────────────────────────────────────────────────────────

const FONT_MAP: Record<TemplateId, string> = {
  literario:  "Cambria",
  nao_ficcao: "Georgia",
  abnt:       "Times New Roman",
  infantil:   "Verdana",
  poesia:     "Cambria",
  religioso:  "Cambria",
};

// ─── Template style config ────────────────────────────────────────────────────

interface TemplateStyles {
  align: "both" | "left";
  indent_twip: number;
  space_after_twip: number;
  line_value: number;
  ch_size_em: number;
  ch_bold: boolean;
  ch_allcaps: boolean;
  ch_italic: boolean;
  ch_align: "both" | "left" | "center";
  ch_letter_spacing_twip: number;
  ch_space_before_em: number;
  ch_space_after_em: number;
  drop_cap: { size_em: number; weight_bold: boolean } | null;
}

const TEMPLATE_STYLES: Record<TemplateId, TemplateStyles> = {
  literario: {
    align: "both", indent_twip: mm(8.5), space_after_twip: 0,
    line_value: Math.round(1.65 * 240),
    ch_size_em: 1.25, ch_bold: false, ch_allcaps: true, ch_italic: false,
    ch_align: "center", ch_letter_spacing_twip: 18, ch_space_before_em: 2, ch_space_after_em: 3,
    drop_cap: { size_em: 3.2, weight_bold: false },
  },
  nao_ficcao: {
    align: "both", indent_twip: 0, space_after_twip: mm(4.5),
    line_value: Math.round(1.6 * 240),
    ch_size_em: 1.55, ch_bold: true, ch_allcaps: false, ch_italic: false,
    ch_align: "left", ch_letter_spacing_twip: 0, ch_space_before_em: 1, ch_space_after_em: 2,
    drop_cap: { size_em: 3.2, weight_bold: true },
  },
  abnt: {
    align: "both", indent_twip: mm(12.5), space_after_twip: 0,
    line_value: Math.round(1.5 * 240),
    ch_size_em: 1.0, ch_bold: true, ch_allcaps: true, ch_italic: false,
    ch_align: "left", ch_letter_spacing_twip: 0, ch_space_before_em: 1, ch_space_after_em: 1.5,
    drop_cap: null,
  },
  infantil: {
    align: "left", indent_twip: 0, space_after_twip: mm(5.5),
    line_value: Math.round(1.85 * 240),
    ch_size_em: 1.5, ch_bold: true, ch_allcaps: false, ch_italic: false,
    ch_align: "center", ch_letter_spacing_twip: 0, ch_space_before_em: 2, ch_space_after_em: 2,
    drop_cap: null,
  },
  poesia: {
    align: "left", indent_twip: 0, space_after_twip: 0,
    line_value: Math.round(1.55 * 240),
    ch_size_em: 1.15, ch_bold: false, ch_allcaps: false, ch_italic: true,
    ch_align: "center", ch_letter_spacing_twip: 5, ch_space_before_em: 0, ch_space_after_em: 3,
    drop_cap: null,
  },
  religioso: {
    align: "both", indent_twip: mm(6.8), space_after_twip: 0,
    line_value: Math.round(1.6 * 240),
    ch_size_em: 1.3, ch_bold: true, ch_allcaps: false, ch_italic: false,
    ch_align: "center", ch_letter_spacing_twip: 0, ch_space_before_em: 1, ch_space_after_em: 2.5,
    drop_cap: { size_em: 2.8, weight_bold: true },
  },
};

// ─── Paragraph builders ────────────────────────────────────────────────────────

function emptyPara(): Paragraph {
  return new Paragraph({ children: [] });
}

function trun(text: string, opts: Omit<IRunOptions, "text"> & { font?: string }): TextRun {
  return new TextRun({ text, ...opts });
}

// ─── Paragraph segmentation (mirrors buildParagraphsForChapter) ───────────────

function segmentParagraphs(text: string): { text: string; isFirst: boolean; isDialogue: boolean }[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parasDuplo = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const parasSimples = normalized.split("\n").map(p => p.trim()).filter(Boolean);
  const finalParas = parasSimples.length >= parasDuplo.length * 3
    ? parasSimples : parasDuplo.length >= 2 ? parasDuplo : parasSimples;

  return finalParas.map((para, idx) => {
    const t = fixTypography(para.trim());
    return { text: t, isFirst: idx === 0, isDialogue: t.startsWith("—") || t.startsWith("- ") };
  });
}

// ─── Body paragraph ───────────────────────────────────────────────────────────

function bodyPara(
  text: string,
  isFirst: boolean,
  isDialogue: boolean,
  st: TemplateStyles,
  font: string,
  corpo_pt: number,
  withDropCap: boolean,
): Paragraph {
  const size_hp = hp(corpo_pt);
  const hasIndent = !isFirst && !isDialogue && st.indent_twip > 0;
  const align = st.align === "both" ? "both" : "left";

  const afterSpacing = st.space_after_twip > 0
    ? { line: st.line_value, lineRule: "auto" as const, after: st.space_after_twip }
    : { line: st.line_value, lineRule: "auto" as const };

  // LIMITAÇÃO LIB: docx 9.x não suporta Frame flutuante para capitular real.
  // Reproduzimos o drop cap aplicando tamanho maior ao primeiro caractere.
  if (withDropCap && isFirst && st.drop_cap && text.length > 0) {
    const firstChar = text[0];
    const rest = text.slice(1);
    return new Paragraph({
      alignment: align,
      spacing: afterSpacing,
      children: [
        trun(firstChar, { font, size: hp(corpo_pt * st.drop_cap.size_em), bold: st.drop_cap.weight_bold }),
        trun(rest, { font, size: size_hp }),
      ],
    });
  }

  return new Paragraph({
    alignment: align,
    spacing: afterSpacing,
    indent: hasIndent ? { firstLine: st.indent_twip } : undefined,
    children: [trun(text, { font, size: size_hp })],
  });
}

// ─── Credits paragraphs (mirrors app/api/creditos/docx/route.ts logic) ────────

function buildCreditosParagraphs(
  creditosConfig: CreditosConfig,
  ficha: unknown,
  titulo: string,
  autor: string,
  font: string,
): (Paragraph | Table)[] {
  const f = ficha as {
    numero_chamada?: string; entrada_autor?: string; descricao_bibliografica?: string;
    extensao?: string; isbn_formatado?: string; assuntos?: string[]; cdd?: string; cdu?: string;
  } | null;

  const size_hp = hp(9);
  const run = (text: string, bold?: boolean, italic?: boolean) =>
    trun(text, { font, size: size_hp, bold, italics: italic });
  const para = (runs: TextRun[], afterMm = 0) =>
    new Paragraph({
      children: runs,
      spacing: afterMm ? { after: mm(afterMm) } : undefined,
    });

  const children: (Paragraph | Table)[] = [];
  children.push(para([run(`Copyright © ${creditosConfig.ano_copyright} ${creditosConfig.titular_direitos}`)], 2));

  const teamFields: [string, string | undefined][] = [
    ["Título original", creditosConfig.titulo_original],
    ["Idioma original", creditosConfig.idioma_original],
    ["Tradução", creditosConfig.traducao],
    ["Revisão técnica", creditosConfig.revisao_tecnica],
    ["Revisão", creditosConfig.revisao],
    ["Preparação de texto", creditosConfig.preparacao],
    ["Diagramação", creditosConfig.diagramacao],
    ["Projeto gráfico de capa", creditosConfig.projeto_capa],
    ["Ilustração de capa", creditosConfig.ilustracao_capa],
    ["Produção editorial", creditosConfig.producao_editorial],
  ];

  teamFields.filter(([, v]) => v?.trim()).forEach(([label, value]) => {
    children.push(para([run(`${label}: `, false, true), run(value!)]));
  });

  creditosConfig.outros_creditos?.split("\n").filter(l => l.trim()).forEach(line => {
    children.push(para([run(line)]));
  });

  if (creditosConfig.incluir_ficha) {
    children.push(para([], 8));
    const isbn = creditosConfig.isbn?.trim() || f?.isbn_formatado || "";
    const assuntos = creditosConfig.assuntos_livres?.trim()
      ? creditosConfig.assuntos_livres.split("\n").filter(l => l.trim())
      : (f?.assuntos ?? []);
    const cdd = creditosConfig.cdd?.trim() || f?.cdd || "";
    const cdu = creditosConfig.cdu?.trim() || f?.cdu || "";

    const fichaLines: string[] = [
      "CIP-BRASIL. CATALOGAÇÃO-NA-FONTE",
      "SINDICATO NACIONAL DOS EDITORES DE LIVROS, RJ",
      "",
    ];

    if (f?.numero_chamada) {
      fichaLines.push(f.numero_chamada);
      if (f.entrada_autor) fichaLines.push(f.entrada_autor);
      if (f.descricao_bibliografica) fichaLines.push(f.descricao_bibliografica);
      if (f.extensao) fichaLines.push(f.extensao);
      if (isbn) { fichaLines.push(""); fichaLines.push(isbn); }
      if (assuntos.length) { fichaLines.push(""); assuntos.forEach(a => fichaLines.push(a)); }
      if (cdd || cdu) { fichaLines.push(""); if (cdd) fichaLines.push(`CDD: ${cdd}`); if (cdu) fichaLines.push(`CDU: ${cdu}`); }
    } else {
      fichaLines.push(autor);
      fichaLines.push(
        `${titulo}. – ${creditosConfig.numero_edicao ? creditosConfig.numero_edicao + " – " : ""}` +
        `${creditosConfig.local_edicao || "São Paulo"} : ${creditosConfig.nome_editora || "Autoria"}, ${creditosConfig.ano_edicao || creditosConfig.ano_copyright}.`
      );
      if (isbn) fichaLines.push(isbn);
      assuntos.forEach(a => fichaLines.push(a));
      if (cdd) fichaLines.push(`CDD: ${cdd}`);
      if (cdu) fichaLines.push(`CDU: ${cdu}`);
    }

    const border = { style: BorderStyle.SINGLE, size: 4, color: "555555" };
    children.push(new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: [new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          margins: { top: mm(7), bottom: mm(7), left: mm(9), right: mm(9) },
          children: fichaLines.map(line =>
            new Paragraph({
              children: [trun(line, { font, size: hp(8) })],
              spacing: { before: 0, after: 0 },
            })
          ),
        })],
      })],
    }));
  }

  const pubLines: [string, boolean?][] = [];
  if (creditosConfig.ano_edicao || creditosConfig.ano_copyright)
    pubLines.push([String(creditosConfig.ano_edicao || creditosConfig.ano_copyright)]);
  if (creditosConfig.nome_editora?.trim()) {
    pubLines.push(["Todos os direitos desta edição reservados à"]);
    pubLines.push([creditosConfig.nome_editora.toUpperCase(), true]);
  }
  if (creditosConfig.endereco_editora?.trim()) pubLines.push([creditosConfig.endereco_editora]);
  const cepCidade = [creditosConfig.cep, creditosConfig.cidade_estado].filter(Boolean).join(" — ");
  if (cepCidade) pubLines.push([cepCidade]);
  if (creditosConfig.site_editora?.trim()) pubLines.push([creditosConfig.site_editora]);
  if (creditosConfig.email_editora?.trim()) pubLines.push([creditosConfig.email_editora]);

  if (pubLines.length > 0) {
    children.push(para([], 16));
    pubLines.forEach(([text, bold]) => { children.push(para([run(text, bold)])); });
  }

  return children;
}

// ─── Section factory helpers ──────────────────────────────────────────────────

function blankSection(pageSize: { width: number; height: number }, pageMargin: object): ISectionOptions {
  return {
    properties: { page: { size: pageSize, margin: pageMargin as Parameters<typeof buildBookDocx>[0]["config"] } } as ISectionOptions["properties"],
    children: [emptyPara()],
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export async function buildBookDocx(params: {
  titulo: string;
  subtitulo: string;
  autor: string;
  texto: string;
  capitulos: { titulo: string; pos: number }[];
  config: MioloConfig;
  creditosConfig?: unknown | null;
  ficha?: unknown | null;
  projectId: string;
}): Promise<Buffer> {
  const { titulo, subtitulo, autor, texto, capitulos, config, creditosConfig, ficha, projectId } = params;

  const spec = FORMATO_SPECS[config.formato];
  const font = FONT_MAP[config.template];
  const st = TEMPLATE_STYLES[config.template];
  const corpo_pt = config.corpo_pt;
  const size_hp = hp(corpo_pt);

  // ── Segment text into chapters ────────────────────────────────────────────

  const textoNorm = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const capitulosNorm = capitulos.map(c => {
    const novaPos = textoNorm.indexOf(c.titulo);
    return { ...c, pos: novaPos >= 0 ? novaPos : c.pos };
  });

  const segments: { titulo: string; texto: string }[] = [];
  if (capitulosNorm.length === 0) {
    segments.push({ titulo: titulo || "Capítulo 1", texto: textoNorm });
  } else {
    for (let i = 0; i < capitulosNorm.length; i++) {
      const start = capitulosNorm[i].pos;
      const end = i < capitulosNorm.length - 1 ? capitulosNorm[i + 1].pos : textoNorm.length;
      let segTexto = textoNorm.slice(start, end).trim();
      const markerEnd = segTexto.indexOf("\n");
      segTexto = markerEnd > -1 ? segTexto.slice(markerEnd).trim() : segTexto;
      segments.push({ titulo: capitulosNorm[i].titulo, texto: segTexto });
    }
  }

  // ── Page layout ───────────────────────────────────────────────────────────

  const pageSize = { width: mm(spec.w_mm), height: mm(spec.h_mm) };
  const pageMargin = {
    top: mm(spec.top_mm), right: mm(spec.outer_mm),
    bottom: mm(spec.bottom_mm), left: mm(spec.inner_mm),
    header: mm(10), footer: mm(10),
  };

  // ── Headers (even/odd) ────────────────────────────────────────────────────

  const headerSize_hp = hp(9);
  const evenHeader = new Header({
    children: [new Paragraph({
      alignment: "left",
      children: [trun(autor, { font, size: headerSize_hp })],
    })],
  });
  const oddHeader = new Header({
    children: [new Paragraph({
      alignment: "right",
      children: [trun(titulo, { font, size: headerSize_hp })],
    })],
  });
  const emptyHeader = new Header({ children: [emptyPara()] });

  // ── Bookmark ID counter ────────────────────────────────────────────────────

  let bmkId = 0;
  const nextBmkId = () => ++bmkId;

  // ── Shared section page props ────────────────────────────────────────────

  const frontProps: ISectionOptions["properties"] = {
    page: { size: pageSize, margin: pageMargin },
    titlePage: true,
  };

  // ── Build sections ────────────────────────────────────────────────────────

  const docSections: ISectionOptions[] = [];

  // Helper to build a front-matter section with empty headers
  const frontSection = (children: (Paragraph | Table)[]): ISectionOptions => ({
    properties: frontProps,
    headers: { default: emptyHeader, even: emptyHeader, first: emptyHeader },
    children,
  });

  // ── 1. Half-title ─────────────────────────────────────────────────────────

  const htId = nextBmkId();
  docSections.push(frontSection([
    emptyPara(), emptyPara(), emptyPara(), emptyPara(),
    new Paragraph({
      alignment: "center",
      children: [
        new BookmarkStart("autoria_half_title", htId),
        trun(titulo, { font, size: hp(corpo_pt * 1.7), allCaps: true }),
        new BookmarkEnd(htId),
      ],
    }),
    ...(subtitulo ? [new Paragraph({
      alignment: "center",
      children: [trun(subtitulo, { font, size: hp(corpo_pt), italics: true, color: "555555" })],
    })] : []),
  ]));

  // ── 2. Blank verso ────────────────────────────────────────────────────────

  docSections.push(frontSection([emptyPara()]));

  // ── 3. Title page ─────────────────────────────────────────────────────────

  const tpId = nextBmkId();
  docSections.push(frontSection([
    emptyPara(), emptyPara(), emptyPara(),
    new Paragraph({
      alignment: "center",
      children: [
        new BookmarkStart("autoria_title_page", tpId),
        trun(titulo, { font, size: hp(corpo_pt * 2), allCaps: true }),
        new BookmarkEnd(tpId),
      ],
    }),
    ...(subtitulo ? [new Paragraph({
      alignment: "center",
      spacing: { before: mm(3) },
      children: [trun(subtitulo, { font, size: hp(corpo_pt * 1.15), italics: true, color: "555555" })],
    })] : []),
    new Paragraph({
      alignment: "center",
      spacing: { before: mm(28) },
      children: [trun(autor, { font, size: hp(corpo_pt * 1.25), color: "444444" })],
    }),
  ]));

  // ── 4. Credits ────────────────────────────────────────────────────────────

  const crId = nextBmkId();
  let creditosChildren: (Paragraph | Table)[];

  if (creditosConfig) {
    creditosChildren = buildCreditosParagraphs(
      creditosConfig as CreditosConfig, ficha, titulo, autor, font,
    );
    creditosChildren.unshift(new Paragraph({
      children: [new BookmarkStart("autoria_creditos", crId), new BookmarkEnd(crId)],
    }));
  } else {
    creditosChildren = [
      new Paragraph({ children: [new BookmarkStart("autoria_creditos", crId), new BookmarkEnd(crId)] }),
      emptyPara(), emptyPara(), emptyPara(),
      new Paragraph({ children: [trun(`© ${new Date().getFullYear()} ${autor}`, { font, size: hp(9) })] }),
      new Paragraph({ children: [trun("Todos os direitos reservados.", { font, size: hp(9) })] }),
      new Paragraph({ children: [trun("Publicado pela plataforma Autoria.", { font, size: hp(9) })] }),
    ];
  }

  docSections.push(frontSection(creditosChildren));

  // ── 5. Dedicatória ────────────────────────────────────────────────────────

  if (config.dedicatoria?.trim()) {
    const dedId = nextBmkId();
    docSections.push(frontSection([
      emptyPara(), emptyPara(), emptyPara(), emptyPara(), emptyPara(), emptyPara(),
      new Paragraph({
        alignment: "right",
        children: [
          new BookmarkStart("autoria_dedicatoria", dedId),
          trun(config.dedicatoria, { font, size: size_hp, italics: true, color: "555555" }),
          new BookmarkEnd(dedId),
        ],
      }),
    ]));
    docSections.push(frontSection([emptyPara()]));
  }

  // ── 6. Epígrafe ───────────────────────────────────────────────────────────

  if (config.epigrafe_texto?.trim()) {
    const epId = nextBmkId();
    docSections.push(frontSection([
      emptyPara(), emptyPara(), emptyPara(), emptyPara(),
      new Paragraph({
        alignment: "right",
        children: [
          new BookmarkStart("autoria_epigrafe", epId),
          trun(config.epigrafe_texto, { font, size: size_hp, italics: true }),
          new BookmarkEnd(epId),
        ],
      }),
      ...(config.epigrafe_autor ? [new Paragraph({
        alignment: "right",
        children: [trun(`— ${config.epigrafe_autor}`, { font, size: hp(corpo_pt * 0.85), color: "777777" })],
      })] : []),
    ]));
    docSections.push(frontSection([emptyPara()]));
  }

  // ── 7. Sumário ────────────────────────────────────────────────────────────

  if (deveExibirSumario(config) && segments.length > 1) {
    const tocId = nextBmkId();
    docSections.push(frontSection([
      new Paragraph({
        alignment: "center",
        spacing: { before: mm(15), after: mm(14) },
        children: [
          new BookmarkStart("autoria_sumario", tocId),
          trun("Sumário", { font, size: hp(corpo_pt * 1.3), bold: true }),
          new BookmarkEnd(tocId),
        ],
      }),
      new TableOfContents("Sumário", {
        hyperlink: true,
        headingStyleRange: "2-2",
        stylesWithLevels: [new StyleLevel("Heading2", 1)],
      }),
    ]));
  }

  // ── 8. Chapters ───────────────────────────────────────────────────────────

  segments.forEach((seg, i) => {
    const capBmkId = nextBmkId();
    const bmkName = `autoria_capitulo_${i + 1}`;
    const ch = st;
    const chSize = hp(corpo_pt * ch.ch_size_em);
    const chAlignMap: Record<string, "left" | "center" | "both"> = {
      both: "both", left: "left", center: "center",
    };
    const chAlign = chAlignMap[ch.ch_align] ?? "left";

    // em to mm conversion: 1em ≈ corpo_pt × 0.353mm
    const emToMm = (em: number) => em * corpo_pt * 0.353;

    const chTitlePara = new Paragraph({
      heading: HeadingLevel.HEADING_2,
      alignment: chAlign,
      spacing: {
        before: mm(emToMm(ch.ch_space_before_em)),
        after: mm(emToMm(ch.ch_space_after_em)),
      },
      pageBreakBefore: true,
      children: [
        new BookmarkStart(bmkName, capBmkId),
        trun(seg.titulo, {
          font, size: chSize, bold: ch.ch_bold, italics: ch.ch_italic,
          allCaps: ch.ch_allcaps, characterSpacing: ch.ch_letter_spacing_twip,
        }),
        new BookmarkEnd(capBmkId),
      ],
    });

    const segs = segmentParagraphs(seg.texto);
    const bodyParas = segs.map(({ text, isFirst, isDialogue }) =>
      bodyPara(text, isFirst, isDialogue, st, font, corpo_pt, config.capitular && isFirst && st.drop_cap !== null)
    );

    const chChildren: (Paragraph | Table)[] = [chTitlePara, ...bodyParas];

    docSections.push({
      properties: {
        page: { size: pageSize, margin: pageMargin },
        type: SectionType.NEXT_PAGE,
        titlePage: true,
      },
      headers: { default: oddHeader, even: evenHeader, first: emptyHeader },
      children: chChildren,
    });
  });

  // ── 9. Bio do autor ────────────────────────────────────────────────────────

  if (config.bio_autor?.trim()) {
    const bioId = nextBmkId();
    docSections.push({
      properties: {
        page: { size: pageSize, margin: pageMargin },
        type: SectionType.NEXT_PAGE,
        titlePage: true,
      },
      headers: { default: oddHeader, even: evenHeader, first: emptyHeader },
      children: [
        emptyPara(), emptyPara(),
        new Paragraph({
          spacing: { after: mm(5) },
          children: [
            new BookmarkStart("autoria_bio", bioId),
            trun("Sobre o autor", { font, size: size_hp, allCaps: true }),
            new BookmarkEnd(bioId),
          ],
        }),
        new Paragraph({
          spacing: { line: st.line_value, lineRule: "auto" },
          children: [trun(config.bio_autor, { font, size: size_hp })],
        }),
      ],
    });
  }

  // ── Custom properties (Autoria metadata) ────────────────────────────────────
  // LIMITAÇÃO LIB: docx 9.x não expõe API para Custom XML Parts.
  // Usando customProperties como fallback — a Fase 2 lê daqui.

  const anchorsXml = buildCustomXmlAnchors({
    project_id: projectId,
    template: config.template,
    formato: config.formato,
    capitulos: segments.map(s => ({ titulo: s.titulo })),
  });

  const doc = new Document({
    evenAndOddHeaderAndFooters: true,
    sections: docSections,
    customProperties: [
      { name: "AutoriaMetadata", value: anchorsXml },
      { name: "AutoriaVersion", value: "1.0" },
      { name: "AutoriaProjectId", value: projectId },
    ],
  });

  return Packer.toBuffer(doc);
}

import { FORMATS, SANGRIA_MM, ORELHA_MM, calcularLombada } from "./dimensions";
import { createTextElement } from "./elements";
import type { TextElement, RegionFills } from "./elements";
import type { SmartField } from "./elements";
import type { FormatKey } from "../types";
import { nanoid } from "nanoid";

const MARGIN_MM = 8;
const PT_TO_KONVA = 300 / 72;

interface SmartFieldConfig {
  smartField: SmartField;
  content: string;
  fontId: TextElement["fontId"];
  fontSize_pt: number;
  fontWeight: TextElement["fontWeight"];
  textAlign: TextElement["textAlign"];
  color: string;
}

const SMART_FIELD_DEFAULTS: Record<SmartField, Omit<SmartFieldConfig, "content" | "color">> = {
  titulo: {
    smartField: "titulo",
    fontId: "fraunces",
    fontSize_pt: 36,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitulo: {
    smartField: "subtitulo",
    fontId: "cormorant",
    fontSize_pt: 18,
    fontWeight: "400",
    textAlign: "center",
  },
  autor: {
    smartField: "autor",
    fontId: "inter",
    fontSize_pt: 14,
    fontWeight: "400",
    textAlign: "center",
  },
  sinopse_curta: {
    smartField: "sinopse_curta",
    fontId: "inter",
    fontSize_pt: 10,
    fontWeight: "400",
    textAlign: "left",
  },
  bio: {
    smartField: "bio",
    fontId: "inter",
    fontSize_pt: 10,
    fontWeight: "400",
    textAlign: "left",
  },
};

export interface SmartFieldContentMap {
  titulo?: string;
  subtitulo?: string;
  autor?: string;
  sinopse_curta?: string;
  bio?: string;
}

export function createSmartFieldElement(
  field: SmartField,
  format: FormatKey,
  pages: number,
  comOrelhas: boolean,
  fills: RegionFills,
  content: SmartFieldContentMap,
  existingZIndex: number,
): TextElement {
  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;

  const sangria = SANGRIA_MM;
  const xCapaStart = sangria + orelhaMm + f.width_mm + lombadaMm;
  const xContraStart = sangria + orelhaMm;
  const xOrelhaFrenteStart = xCapaStart + f.width_mm;

  const { PT_TO_KONVA: _pt } = { PT_TO_KONVA };

  const defaults = SMART_FIELD_DEFAULTS[field];
  const fillColor = field === "sinopse_curta" ? (fills.contracapa ?? null) : (fills.capa ?? null);
  const textColor = fillColor
    ? (fillColor.toLowerCase() === "#ffffff" || !fillColor ? "#1a1a2e" : "#1a1a2e")
    : "#1a1a2e";

  let x_mm: number;
  let y_mm: number;
  let width_mm: number;
  let height_mm: number;

  switch (field) {
    case "titulo":
      x_mm = xCapaStart + MARGIN_MM;
      y_mm = sangria + 25;
      width_mm = f.width_mm - MARGIN_MM * 2;
      height_mm = 40;
      break;
    case "subtitulo":
      x_mm = xCapaStart + MARGIN_MM;
      y_mm = sangria + 72;
      width_mm = f.width_mm - MARGIN_MM * 2;
      height_mm = 20;
      break;
    case "autor":
      x_mm = xCapaStart + MARGIN_MM;
      y_mm = sangria + f.height_mm - 28;
      width_mm = f.width_mm - MARGIN_MM * 2;
      height_mm = 12;
      break;
    case "sinopse_curta":
      x_mm = xContraStart + MARGIN_MM;
      y_mm = sangria + 25;
      width_mm = f.width_mm - MARGIN_MM * 2;
      height_mm = 80;
      break;
    case "bio":
      x_mm = xOrelhaFrenteStart + 5;
      y_mm = sangria + 30;
      width_mm = orelhaMm - 10;
      height_mm = 80;
      break;
    default:
      x_mm = xCapaStart + MARGIN_MM;
      y_mm = sangria + 25;
      width_mm = f.width_mm - MARGIN_MM * 2;
      height_mm = 20;
  }

  return createTextElement({
    id: nanoid(),
    x_mm,
    y_mm,
    width_mm,
    height_mm,
    content: content[field] ?? "",
    color: textColor,
    zIndex: existingZIndex,
    ...defaults,
  });
}

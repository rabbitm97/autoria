import type { FontId } from "./fonts";

export type SmartField = "titulo" | "subtitulo" | "autor" | "sinopse_curta" | "bio" | "sinopse_longa" | "lombada";

export interface BaseElement {
  id: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  rotation_deg: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
}

export interface TextElement extends BaseElement {
  type: "text";
  content: string;
  fontId: FontId;
  fontSize_pt: number;
  fontWeight: "400" | "700";
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  color: string;
  smartField: SmartField | null;
}

export interface ImageElement extends BaseElement {
  type: "image";
  src: string;
  objectFit: "fill" | "cover" | "contain";
}

export interface LogoElement extends BaseElement {
  type: "logo";
  variant: "dourado" | "azul";
}

export interface BarcodeElement extends BaseElement {
  type: "barcode";
  isbn: string;
  cachedDataUrl: string | null;
}

export type ShapeKind = "rect" | "ellipse" | "line" | "triangle";

export interface ShapeElement extends BaseElement {
  type: "shape";
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth_pt: number;
}

// NOTE: future extensibility — RegionFill elements may be added to this union
export type AnyElement = TextElement | ImageElement | LogoElement | BarcodeElement | ShapeElement;

export type Region = "capa" | "contracapa" | "lombada" | "orelha_frente" | "orelha_verso";
export type RegionFills = Partial<Record<Region, string>>;

export function createTextElement(
  overrides: Partial<TextElement> & { id: string; x_mm: number; y_mm: number; width_mm: number; height_mm: number },
): TextElement {
  return {
    type: "text",
    zIndex: 0,
    rotation_deg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    content: "",
    fontId: "inter",
    fontSize_pt: 14,
    fontWeight: "400",
    fontStyle: "normal",
    textAlign: "left",
    color: "#1a1a2e",
    smartField: null,
    ...overrides,
  };
}

export function createImageElement(
  overrides: Partial<ImageElement> & { id: string; src: string; x_mm: number; y_mm: number; width_mm: number; height_mm: number },
): ImageElement {
  return {
    type: "image",
    zIndex: 0,
    rotation_deg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    objectFit: "cover",
    ...overrides,
  };
}

export function createLogoElement(
  overrides: Partial<LogoElement> & { id: string; x_mm: number; y_mm: number; width_mm: number; height_mm: number },
): LogoElement {
  return {
    type: "logo",
    zIndex: 0,
    rotation_deg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    variant: "dourado",
    ...overrides,
  };
}

export function createShapeElement(
  overrides: Partial<ShapeElement> & { id: string; shape: ShapeKind; x_mm: number; y_mm: number; width_mm: number; height_mm: number },
): ShapeElement {
  return {
    type: "shape",
    zIndex: 0,
    rotation_deg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: "#c9a84c",
    stroke: null,
    strokeWidth_pt: 0,
    ...overrides,
  };
}

export function createBarcodeElement(
  overrides: Partial<BarcodeElement> & { id: string; isbn: string; x_mm: number; y_mm: number; width_mm: number; height_mm: number },
): BarcodeElement {
  return {
    type: "barcode",
    zIndex: 0,
    rotation_deg: 0,
    opacity: 1,
    visible: true,
    locked: false,
    cachedDataUrl: null,
    ...overrides,
  };
}

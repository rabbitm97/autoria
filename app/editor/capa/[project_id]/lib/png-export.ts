import type Konva from "konva";
import { FORMATS, SANGRIA_MM, calcularLombada } from "./dimensions";
import type { FormatKey } from "../types";

async function captureStageRegion(
  stage: Konva.Stage,
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  mimeType: "image/png" | "image/jpeg",
  quality: number,
): Promise<string> {
  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhas = orelhaMm > 0 ? orelhaMm * 2 : 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhas + SANGRIA_MM * 2;
  const totalWPx = totalWMm * (300 / 25.4);
  const totalHPx = (f.height_mm + SANGRIA_MM * 2) * (300 / 25.4);

  // Paper sits at (0,0) in Konva content space; pan/zoom moves it to screen space.
  // pixelRatio = 1/zoom maps screen-space capture region back to content resolution (300 DPI).
  const zoom = stage.scaleX();
  const panX = stage.x();
  const panY = stage.y();
  const pixelRatio = 1 / zoom;

  const layers = stage.getLayers();
  const guideLayer = layers[layers.length - 1];
  const labelLayer = layers[layers.length - 2];
  const wasGuideVisible = guideLayer?.visible();
  const wasLabelVisible = labelLayer?.visible();
  guideLayer?.visible(false);
  labelLayer?.visible(false);

  const transformer = stage.findOne("Transformer");
  const wasTransformerVisible = transformer?.visible();
  transformer?.visible(false);

  stage.batchDraw();

  const dataUrl = stage.toDataURL({
    mimeType,
    pixelRatio,
    quality,
    x: panX,
    y: panY,
    width: totalWPx * zoom,
    height: totalHPx * zoom,
  });

  guideLayer?.visible(wasGuideVisible ?? true);
  labelLayer?.visible(wasLabelVisible ?? true);
  transformer?.visible(wasTransformerVisible ?? true);
  stage.batchDraw();

  return dataUrl;
}

// PNG for "Baixar PNG" download — lossless, client-side only
export async function captureStageAsDataUrl(
  stage: Konva.Stage,
  format: FormatKey,
  pages: number,
  orelhaMm: number,
): Promise<string> {
  return captureStageRegion(stage, format, pages, orelhaMm, "image/png", 1);
}

// JPEG for server-bound PDF pipeline — substantially smaller than PNG
export async function captureStageAsJpegDataUrl(
  stage: Konva.Stage,
  format: FormatKey,
  pages: number,
  orelhaMm: number,
  quality = 0.92,
): Promise<string> {
  return captureStageRegion(stage, format, pages, orelhaMm, "image/jpeg", quality);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function captureStageAsBlob(
  stage: Konva.Stage,
  format: FormatKey,
  pages: number,
  orelhaMm: number,
): Promise<Blob> {
  const dataUrl = await captureStageAsDataUrl(stage, format, pages, orelhaMm);
  return dataUrlToBlob(dataUrl);
}

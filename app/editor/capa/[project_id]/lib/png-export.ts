import type Konva from "konva";
import { FORMATS, SANGRIA_MM, ORELHA_MM, calcularLombada } from "./dimensions";
import type { FormatKey } from "../types";

export async function captureStageAsDataUrl(
  stage: Konva.Stage,
  format: FormatKey,
  pages: number,
  comOrelhas: boolean,
): Promise<string> {
  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;
  const totalWMm = f.width_mm * 2 + lombadaMm + orelhaMm * 2 + SANGRIA_MM * 2;
  const totalWPx = totalWMm * (300 / 25.4);
  const totalHPx = (f.height_mm + SANGRIA_MM * 2) * (300 / 25.4);

  // Paper sits at (0,0) in Konva content space; the stage pan/zoom moves it to
  // screen space. pixelRatio=1/zoom makes the output exactly 300 DPI.
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
    mimeType: "image/png",
    pixelRatio,
    quality: 1,
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
  comOrelhas: boolean,
): Promise<Blob> {
  const dataUrl = await captureStageAsDataUrl(stage, format, pages, comOrelhas);
  return dataUrlToBlob(dataUrl);
}

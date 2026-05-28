"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  Stage,
  Layer,
  Rect,
  Line,
  Text as KonvaText,
  Image as KonvaImage,
  Transformer,
  Group,
} from "react-konva";
import useImage from "use-image";
import { useEditorStore } from "../lib/editor-store";
import {
  FORMATS,
  MM_TO_PX,
  SANGRIA_MM,
  ORELHA_MM,
  calcularLombada,
} from "../lib/dimensions";
import {
  GUIDE_SANGRIA_COLOR,
  GUIDE_DOBRA_COLOR,
  GUIDE_ORELHA_COLOR,
  GUIDE_LOMBADA_CENTER_COLOR,
  GUIDE_LABEL_COLOR,
  CANVAS_BG_COLOR,
  PAPER_COLOR,
} from "../lib/constants";
import { getStructuralGuides, snapToGuides } from "../lib/snap";
import { FONT_CATALOG_BY_ID, useFontsReady } from "../lib/fonts";
import { isEditableTarget } from "../lib/keyboard-utils";
import { hasElementsInXRange, shouldShowLabel } from "../lib/region-utils";
import { getFillRect } from "../lib/region-rects";
import { EditorLegendTooltip, type TooltipInfo } from "./editor-legend-tooltip";
import { EditorEmptyState } from "./editor-empty-state";
import { EditorZoomControls } from "./editor-zoom-controls";
import { EditorPropertyPanel } from "./editor-property-panel";
import type { FormatKey } from "../types";
import type {
  AnyElement,
  TextElement,
  ImageElement,
  LogoElement,
  BarcodeElement,
  Region,
} from "../lib/elements";
import type Konva from "konva";

// PT → paper px at 300 DPI
const PT_TO_PX = 300 / 72;

interface EditorCanvasProps {
  format: FormatKey;
  pages: number;
}

// ── Image element node ────────────────────────────────────────────────────────
function ImageNode({
  el,
  selected,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: {
  el: ImageElement;
  selected: boolean;
  onSelect: () => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
  onTransformEnd: (e: any) => void;
}) {
  const [img] = useImage(el.src, "anonymous");
  if (!img) return null;
  return (
    <KonvaImage
      id={el.id}
      image={img}
      x={el.x_mm * MM_TO_PX}
      y={el.y_mm * MM_TO_PX}
      width={el.width_mm * MM_TO_PX}
      height={el.height_mm * MM_TO_PX}
      rotation={el.rotation_deg}
      opacity={el.opacity}
      visible={el.visible}
      draggable={!el.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
}

// ── Logo element node ─────────────────────────────────────────────────────────
function LogoNode({
  el,
  selected,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: {
  el: LogoElement;
  selected: boolean;
  onSelect: () => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
  onTransformEnd: (e: any) => void;
}) {
  const src = `/brand/logo-autoria-${el.variant}.png`;
  const [img] = useImage(src, "anonymous");
  if (!img) return null;
  return (
    <KonvaImage
      id={el.id}
      image={img}
      x={el.x_mm * MM_TO_PX}
      y={el.y_mm * MM_TO_PX}
      width={el.width_mm * MM_TO_PX}
      height={el.height_mm * MM_TO_PX}
      rotation={el.rotation_deg}
      opacity={el.opacity}
      visible={el.visible}
      draggable={!el.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
}

// ── Barcode element node ──────────────────────────────────────────────────────
function BarcodeNode({
  el,
  onSelect,
  onDragMove,
  onDragEnd,
  onTransformEnd,
}: {
  el: BarcodeElement;
  onSelect: () => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
  onTransformEnd: (e: any) => void;
}) {
  const [img] = useImage(el.cachedDataUrl ?? "");
  if (!img) return null;
  return (
    <KonvaImage
      id={el.id}
      image={img}
      x={el.x_mm * MM_TO_PX}
      y={el.y_mm * MM_TO_PX}
      width={el.width_mm * MM_TO_PX}
      height={el.height_mm * MM_TO_PX}
      rotation={el.rotation_deg}
      opacity={el.opacity}
      visible={el.visible}
      draggable={!el.locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    />
  );
}

// ── Main canvas ───────────────────────────────────────────────────────────────
export function EditorCanvas({ format: _format, pages: _pages }: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [mounted, setMounted] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  const [snapLines, setSnapLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  const {
    format,
    pages,
    comOrelhas,
    zoom,
    panX,
    panY,
    legendasAtivas,
    snapEnabled,
    snapThreshold,
    elements,
    selectedId,
    fills,
    setPan,
    fitToScreen,
    updateElement,
    setSelectedId,
  } = useEditorStore();

  const [tooltip, setTooltip] = useState<TooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    region: "",
    message: "",
  });

  const fontsReady = useFontsReady();
  const isPanningRef = useRef(false);
  const spaceDownRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => { setMounted(true); }, []);

  // Register Stage in Zustand so ExportDropdown can access it
  useEffect(() => {
    if (!mounted || !stageRef.current) return;
    useEditorStore.getState().setStageInstance(stageRef.current);
    return () => { useEditorStore.getState().setStageInstance(null); };
  }, [mounted]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fit when container or paper dimensions change
  useEffect(() => {
    if (!mounted || containerSize.w <= 0 || containerSize.h <= 0) return;
    fitToScreen(containerSize.w, containerSize.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, format, pages, comOrelhas]);

  // Attach Transformer to selected node
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (selectedId) {
      const node = stageRef.current.findOne(`#${selectedId}`);
      if (node) {
        transformerRef.current.nodes([node]);
        transformerRef.current.getLayer()?.batchDraw();
        return;
      }
    }
    transformerRef.current.nodes([]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedId, elements]);

  // Keyboard: space for pan cursor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e)) return;
      if (e.code === "Space" && !spaceDownRef.current) {
        e.preventDefault();
        spaceDownRef.current = true;
        if (containerRef.current) containerRef.current.style.cursor = "grab";
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        isPanningRef.current = false;
        if (containerRef.current) containerRef.current.style.cursor = "";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Non-passive wheel listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom, panX, panY, setZoom, setPan } = useEditorStore.getState();
      const isZoom = e.ctrlKey || e.metaKey;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (isZoom) {
        const delta = e.deltaY < 0 ? 1.08 : 0.92;
        const newZoom = Math.max(0.1, Math.min(4, zoom * delta));
        const newPanX = px - (px - panX) * (newZoom / zoom);
        const newPanY = py - (py - panY) * (newZoom / zoom);
        setZoom(newZoom);
        setPan(newPanX, newPanY);
      } else {
        setPan(panX - e.deltaX, panY - e.deltaY);
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Dimensions
  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;
  const sangriaPx = SANGRIA_MM * MM_TO_PX;
  const orelhaPx = orelhaMm * MM_TO_PX;
  const lombadaPx = lombadaMm * MM_TO_PX;
  const frontePx = f.width_mm * MM_TO_PX;
  const totalWPx = f.width_mm * 2 * MM_TO_PX + lombadaPx + orelhaPx * 2 + sangriaPx * 2;
  const totalHPx = f.height_mm * MM_TO_PX + sangriaPx * 2;

  const xSangriaR = totalWPx - sangriaPx;
  const xOrelhaVersoEnd = sangriaPx + orelhaPx;
  const xContraEnd = xOrelhaVersoEnd + frontePx;
  const xLombadaEnd = xContraEnd + lombadaPx;
  const xFrenteEnd = xLombadaEnd + frontePx;
  const xOrelhaFrenteEnd = xFrenteEnd + orelhaPx;
  const xLombadaCenter = (xContraEnd + xLombadaEnd) / 2;
  const gs = 1.5 / zoom;

  const ALL_REGIONS: Region[] = ["orelha_verso", "contracapa", "lombada", "capa", "orelha_frente"];

  // Tooltip region detection
  function getRegionAt(xPaper: number, yPaper: number): { region: string; message: string } | null {
    if (!legendasAtivas) return null;
    const inSangria =
      xPaper < sangriaPx ||
      xPaper > xSangriaR ||
      yPaper < sangriaPx ||
      yPaper > totalHPx - sangriaPx;
    if (inSangria) return { region: "SANGRIA", message: "3mm de margem de corte. Não coloque texto importante aqui." };
    if (comOrelhas && xPaper >= sangriaPx && xPaper < xOrelhaVersoEnd) return { region: "ORELHA TRASEIRA", message: "Dobra de 8cm. Outros livros do autor ou texto institucional." };
    if (xPaper >= xOrelhaVersoEnd && xPaper < xContraEnd) return { region: "CONTRACAPA", message: "Verso. Sinopse, código de barras ISBN e logo da editora." };
    if (xPaper >= xContraEnd && xPaper < xLombadaEnd) return { region: "LOMBADA", message: `${lombadaMm.toFixed(1)}mm, calculada a partir de ${pages} páginas.` };
    if (xPaper >= xLombadaEnd && xPaper < xFrenteEnd) return { region: "CAPA", message: "Frente do livro. Aqui ficam título, autor e imagem principal." };
    if (comOrelhas && xPaper >= xFrenteEnd && xPaper < xOrelhaFrenteEnd) return { region: "ORELHA FRONTAL", message: "Dobra de 8cm. Foto e bio do autor." };
    return null;
  }

  // Drag helpers
  function handleDragMove(e: any, elId: string) {
    if (!snapEnabled) return;
    const node = e.target;
    const guides = getStructuralGuides(format, pages, comOrelhas);
    const bounds = {
      x: node.x(),
      y: node.y(),
      width: node.width() * (node.scaleX?.() ?? 1),
      height: node.height() * (node.scaleY?.() ?? 1),
    };
    const snapped = snapToGuides(bounds, guides, snapThreshold);
    node.x(snapped.x);
    node.y(snapped.y);
    setSnapLines({ x: snapped.activeX, y: snapped.activeY });
  }

  function handleDragEnd(e: any, elId: string) {
    setSnapLines({ x: null, y: null });
    const node = e.target;
    updateElement(elId, {
      x_mm: node.x() / MM_TO_PX,
      y_mm: node.y() / MM_TO_PX,
    });
  }

  function handleTransformEnd(e: any, elId: string) {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Reset scale BEFORE state update to avoid double-scale on re-render
    node.scaleX(1);
    node.scaleY(1);
    const el = elements.find((el) => el.id === elId);
    const newW = Math.max(20, node.width() * scaleX) / MM_TO_PX;
    if (el?.type === "text") {
      // For text: scaleX widens the text box; scaleY scales the font size
      const newFontSizePt = Math.max(6, (el as TextElement).fontSize_pt * scaleY);
      updateElement(elId, {
        x_mm: node.x() / MM_TO_PX,
        y_mm: node.y() / MM_TO_PX,
        width_mm: newW,
        fontSize_pt: newFontSizePt,
        rotation_deg: node.rotation(),
      } as any);
    } else {
      const newH = Math.max(20, node.height() * scaleY) / MM_TO_PX;
      updateElement(elId, {
        x_mm: node.x() / MM_TO_PX,
        y_mm: node.y() / MM_TO_PX,
        width_mm: newW,
        height_mm: newH,
        rotation_deg: node.rotation(),
      });
    }
  }

  // Inline text editing
  function openInlineEdit(el: TextElement) {
    if (!stageRef.current || !containerRef.current) return;
    const node = stageRef.current.findOne(`#${el.id}`) as Konva.Text | undefined;
    if (!node) return;
    const container = containerRef.current.getBoundingClientRect();
    const absPos = node.getAbsolutePosition();
    setInlineEdit({
      id: el.id,
      x: el.x_mm * MM_TO_PX * zoom + panX,
      y: el.y_mm * MM_TO_PX * zoom + panY,
      w: el.width_mm * MM_TO_PX * zoom,
      h: Math.max(40, el.height_mm * MM_TO_PX * zoom),
    });
  }

  function closeInlineEdit() {
    setInlineEdit(null);
  }

  const handleStageMouseMove = useCallback(
    (e: any) => {
      if (isPanningRef.current) {
        const stage = e.target.getStage();
        const ptr = stage.getPointerPosition();
        if (!ptr) return;
        const { panX, panY, setPan } = useEditorStore.getState();
        setPan(panX + ptr.x - lastPointerRef.current.x, panY + ptr.y - lastPointerRef.current.y);
        lastPointerRef.current = ptr;
      }
      if (!legendasAtivas) return;
      const stage = e.target.getStage();
      const ptr = stage.getPointerPosition();
      if (!ptr) return;
      const { zoom, panX, panY } = useEditorStore.getState();
      const xPaper = (ptr.x - panX) / zoom;
      const yPaper = (ptr.y - panY) / zoom;
      const info = getRegionAt(xPaper, yPaper);
      if (info) {
        setTooltip({ visible: true, x: ptr.x, y: ptr.y, region: info.region, message: info.message });
      } else {
        setTooltip((t) => ({ ...t, visible: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legendasAtivas, comOrelhas, lombadaMm, pages, zoom, panX, panY],
  );

  const handleStageMouseDown = useCallback((e: any) => {
    const isMiddle = e.evt.button === 1;
    if (spaceDownRef.current || isMiddle) {
      e.evt.preventDefault();
      isPanningRef.current = true;
      const stage = e.target.getStage();
      const ptr = stage.getPointerPosition();
      if (ptr) lastPointerRef.current = ptr;
      if (containerRef.current) containerRef.current.style.cursor = "grabbing";
    }
    // Deselect only when clicking the Stage background (Transformer handles are also
    // Rect nodes without ids — excluding them here prevents the transformer from
    // being detached the moment the user clicks a resize handle).
    if (e.target === e.target.getStage()) {
      setSelectedId(null);
    }
  }, [setSelectedId]);

  const handleStageMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (containerRef.current && spaceDownRef.current) {
      containerRef.current.style.cursor = "grab";
    } else if (containerRef.current) {
      containerRef.current.style.cursor = "";
    }
  }, []);

  const handleStageMouseLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
    isPanningRef.current = false;
  }, []);

  if (!mounted || !fontsReady) {
    return (
      <div ref={containerRef} className="absolute inset-0 bg-[#e8e6e0]">
        <div className="flex h-full items-center justify-center text-sm text-zinc-400">
          Carregando editor…
        </div>
      </div>
    );
  }

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 select-none overflow-hidden"
      style={{ background: CANVAS_BG_COLOR }}
    >
      <Stage
        ref={stageRef}
        width={containerSize.w}
        height={containerSize.h}
        x={panX}
        y={panY}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseLeave}
      >
        {/* Paper background */}
        <Layer listening={false}>
          <Rect
            x={0}
            y={0}
            width={totalWPx}
            height={totalHPx}
            fill={PAPER_COLOR}
            shadowBlur={24 / zoom}
            shadowColor="rgba(0,0,0,0.18)"
            shadowOffset={{ x: 0, y: 3 / zoom }}
            shadowOpacity={1}
          />
        </Layer>

        {/* Region fill layer — rects extend into bleed on outer edges, stop at inner folds */}
        <Layer listening={false}>
          {ALL_REGIONS.map((key) => {
            const color = fills[key];
            if (!color) return null;
            const rect = getFillRect(key, format, pages, comOrelhas);
            if (!rect) return null;
            return (
              <Rect
                key={key}
                x={rect.x * MM_TO_PX}
                y={rect.y * MM_TO_PX}
                width={rect.width * MM_TO_PX}
                height={rect.height * MM_TO_PX}
                fill={color}
              />
            );
          })}
        </Layer>

        {/* Content layer */}
        <Layer>
          {sortedElements.map((el) => {
            const isSelected = el.id === selectedId;
            const commonDragProps = {
              onDragMove: (e: any) => handleDragMove(e, el.id),
              onDragEnd: (e: any) => handleDragEnd(e, el.id),
              onTransformEnd: (e: any) => handleTransformEnd(e, el.id),
            };

            if (el.type === "text") {
              const t = el as TextElement;
              const fontEntry = FONT_CATALOG_BY_ID[t.fontId];
              const konvaFontStyle =
                t.fontStyle === "italic" && t.fontWeight === "700"
                  ? "italic bold"
                  : t.fontStyle === "italic"
                  ? "italic"
                  : t.fontWeight === "700"
                  ? "bold"
                  : "normal";
              return (
                <KonvaText
                  key={el.id}
                  id={el.id}
                  x={t.x_mm * MM_TO_PX}
                  y={t.y_mm * MM_TO_PX}
                  width={t.width_mm * MM_TO_PX}
                  text={t.content}
                  fontFamily={fontEntry?.family ?? "Inter"}
                  fontSize={t.fontSize_pt * PT_TO_PX}
                  fontStyle={konvaFontStyle}
                  align={t.textAlign}
                  fill={t.color}
                  opacity={t.opacity}
                  rotation={t.rotation_deg}
                  visible={t.visible}
                  draggable={!t.locked}
                  wrap="word"
                  onClick={() => setSelectedId(el.id)}
                  onTap={() => setSelectedId(el.id)}
                  onDblClick={() => openInlineEdit(t)}
                  {...commonDragProps}
                />
              );
            }

            if (el.type === "image") {
              return (
                <ImageNode
                  key={el.id}
                  el={el as ImageElement}
                  selected={isSelected}
                  onSelect={() => setSelectedId(el.id)}
                  {...commonDragProps}
                />
              );
            }

            if (el.type === "logo") {
              return (
                <LogoNode
                  key={el.id}
                  el={el as LogoElement}
                  selected={isSelected}
                  onSelect={() => setSelectedId(el.id)}
                  {...commonDragProps}
                />
              );
            }

            if (el.type === "barcode") {
              return (
                <BarcodeNode
                  key={el.id}
                  el={el as BarcodeElement}
                  onSelect={() => setSelectedId(el.id)}
                  {...commonDragProps}
                />
              );
            }

            return null;
          })}

          {/* Transformer */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={true}
            resizeEnabled={true}
            keepRatio={false}
            enabledAnchors={[
              "top-left",
              "top-center",
              "top-right",
              "middle-left",
              "middle-right",
              "bottom-left",
              "bottom-center",
              "bottom-right",
            ]}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 20) return oldBox;
              return newBox;
            }}
          />
        </Layer>

        {/* Snap guide lines */}
        <Layer listening={false}>
          {snapLines.x !== null && (
            <Line
              points={[snapLines.x, 0, snapLines.x, totalHPx]}
              stroke="#f97316"
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 4 / zoom]}
            />
          )}
          {snapLines.y !== null && (
            <Line
              points={[0, snapLines.y, totalWPx, snapLines.y]}
              stroke="#f97316"
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 4 / zoom]}
            />
          )}
        </Layer>

        {/* Guide lines */}
        <Layer listening={false}>
          <Rect
            x={sangriaPx}
            y={sangriaPx}
            width={totalWPx - sangriaPx * 2}
            height={totalHPx - sangriaPx * 2}
            stroke={GUIDE_SANGRIA_COLOR}
            strokeWidth={gs}
            dash={[5 / zoom, 4 / zoom]}
            fill="transparent"
          />
          <Line points={[xContraEnd, 0, xContraEnd, totalHPx]} stroke={GUIDE_DOBRA_COLOR} strokeWidth={gs} dash={[7 / zoom, 4 / zoom]} />
          <Line points={[xLombadaEnd, 0, xLombadaEnd, totalHPx]} stroke={GUIDE_DOBRA_COLOR} strokeWidth={gs} dash={[7 / zoom, 4 / zoom]} />
          <Line points={[xLombadaCenter, 0, xLombadaCenter, totalHPx]} stroke={GUIDE_LOMBADA_CENTER_COLOR} strokeWidth={gs * 0.8} dash={[2 / zoom, 5 / zoom]} />
          {comOrelhas && (
            <>
              <Line points={[xOrelhaVersoEnd, 0, xOrelhaVersoEnd, totalHPx]} stroke={GUIDE_ORELHA_COLOR} strokeWidth={gs} dash={[7 / zoom, 4 / zoom]} />
              <Line points={[xFrenteEnd, 0, xFrenteEnd, totalHPx]} stroke={GUIDE_ORELHA_COLOR} strokeWidth={gs} dash={[7 / zoom, 4 / zoom]} />
            </>
          )}
        </Layer>

        {/* Region labels — shown when legendasAtivas OR (no fill AND no elements in that region) */}
        <Layer listening={false}>
          {(() => {
            // Region x-bounds in mm for element detection
            const xContracapaStartMm = SANGRIA_MM + orelhaMm;
            const xContracapaEndMm = xContracapaStartMm + f.width_mm;
            const xLombadaStartMm = xContracapaEndMm;
            const xLombadaEndMm = xLombadaStartMm + lombadaMm;
            const xCapaStartMm = xLombadaEndMm;
            const xCapaEndMm = xCapaStartMm + f.width_mm;
            const xOrelhaFrenteStartMm = xCapaEndMm;
            const xOrelhaFrenteEndMm = xOrelhaFrenteStartMm + orelhaMm;
            return (
              <>
                {shouldShowLabel(!!fills.capa, hasElementsInXRange(elements, xCapaStartMm, xCapaEndMm), legendasAtivas) && (
                  <KonvaText x={xLombadaEnd} y={totalHPx / 2} width={frontePx} align="center" offsetY={8 / zoom} text="CAPA" fontSize={14 / zoom} fill={GUIDE_LABEL_COLOR} fontFamily="serif" fontStyle="italic" />
                )}
                {shouldShowLabel(!!fills.contracapa, hasElementsInXRange(elements, xContracapaStartMm, xContracapaEndMm), legendasAtivas) && (
                  <KonvaText x={xOrelhaVersoEnd} y={totalHPx / 2} width={frontePx} align="center" offsetY={8 / zoom} text="CONTRACAPA" fontSize={14 / zoom} fill={GUIDE_LABEL_COLOR} fontFamily="serif" fontStyle="italic" />
                )}
                {lombadaPx * zoom > 18 && shouldShowLabel(!!fills.lombada, hasElementsInXRange(elements, xLombadaStartMm, xLombadaEndMm), legendasAtivas) && (
                  <KonvaText x={xLombadaCenter} y={totalHPx / 2} text="LOMBADA" fontSize={9 / zoom} fill={GUIDE_LABEL_COLOR} fontFamily="serif" fontStyle="italic" rotation={-90} align="center" />
                )}
                {comOrelhas && orelhaPx * zoom > 30 && (
                  <>
                    {shouldShowLabel(!!fills.orelha_verso, hasElementsInXRange(elements, SANGRIA_MM, xContracapaStartMm), legendasAtivas) && (
                      <KonvaText x={sangriaPx} y={totalHPx / 2} width={orelhaPx} align="center" offsetY={10 / zoom} text={"ORELHA\nTRASEIRA"} fontSize={11 / zoom} fill={GUIDE_LABEL_COLOR} fontFamily="serif" fontStyle="italic" />
                    )}
                    {shouldShowLabel(!!fills.orelha_frente, hasElementsInXRange(elements, xOrelhaFrenteStartMm, xOrelhaFrenteEndMm), legendasAtivas) && (
                      <KonvaText x={xFrenteEnd} y={totalHPx / 2} width={orelhaPx} align="center" offsetY={10 / zoom} text={"ORELHA\nFRONTAL"} fontSize={11 / zoom} fill={GUIDE_LABEL_COLOR} fontFamily="serif" fontStyle="italic" />
                    )}
                  </>
                )}
              </>
            );
          })()}
        </Layer>
      </Stage>

      {/* Inline text editor */}
      {inlineEdit && (() => {
        const el = elements.find((e) => e.id === inlineEdit.id) as TextElement | undefined;
        if (!el) return null;
        return (
          <textarea
            autoFocus
            value={el.content}
            onChange={(e) => updateElement(inlineEdit.id, { content: e.target.value } as any)}
            onBlur={closeInlineEdit}
            style={{
              position: "absolute",
              left: inlineEdit.x,
              top: inlineEdit.y,
              width: inlineEdit.w,
              minHeight: inlineEdit.h,
              fontSize: el.fontSize_pt * PT_TO_PX * zoom,
              fontFamily: FONT_CATALOG_BY_ID[el.fontId]?.family ?? "Inter",
              fontWeight: el.fontWeight === "700" ? "bold" : "normal",
              fontStyle: el.fontStyle,
              textAlign: el.textAlign,
              color: el.color,
              background: "rgba(255,255,255,0.92)",
              border: "2px solid #c9a84c",
              borderRadius: 4,
              padding: "2px 4px",
              resize: "none",
              outline: "none",
              lineHeight: 1.4,
              zIndex: 30,
            }}
          />
        );
      })()}

      {/* HTML overlays */}
      {legendasAtivas && <EditorLegendTooltip tooltip={tooltip} />}
      <EditorEmptyState />
      <EditorZoomControls containerW={containerSize.w} containerH={containerSize.h} />
      <EditorPropertyPanel />
    </div>
  );
}

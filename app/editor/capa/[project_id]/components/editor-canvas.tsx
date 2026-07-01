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
  Ellipse as KonvaEllipse,
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
  ShapeElement,
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
  onSelect,
  onDragMove,
  onDragEnd,
}: {
  el: ImageElement;
  selected: boolean;
  onSelect: (shift: boolean) => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
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
      onClick={(e) => onSelect(e.evt.shiftKey)}
      onTap={(e) => onSelect(e.evt.shiftKey)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    />
  );
}

// ── Logo element node ─────────────────────────────────────────────────────────
function LogoNode({
  el,
  onSelect,
  onDragMove,
  onDragEnd,
}: {
  el: LogoElement;
  selected: boolean;
  onSelect: (shift: boolean) => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
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
      onClick={(e) => onSelect(e.evt.shiftKey)}
      onTap={(e) => onSelect(e.evt.shiftKey)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    />
  );
}

// ── Barcode element node ──────────────────────────────────────────────────────
function BarcodeNode({
  el,
  onSelect,
  onDragMove,
  onDragEnd,
}: {
  el: BarcodeElement;
  onSelect: (shift: boolean) => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
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
      onClick={(e) => onSelect(e.evt.shiftKey)}
      onTap={(e) => onSelect(e.evt.shiftKey)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    />
  );
}

// ── Shape element node ────────────────────────────────────────────────────────
function ShapeNode({
  el,
  onSelect,
  onDragMove,
  onDragEnd,
}: {
  el: ShapeElement;
  selected: boolean;
  onSelect: (shift: boolean) => void;
  onDragMove: (e: any) => void;
  onDragEnd: (e: any) => void;
}) {
  const w = el.width_mm * MM_TO_PX;
  const h = el.height_mm * MM_TO_PX;
  const strokeWidth = el.strokeWidth_pt * PT_TO_PX;
  const fill = el.fill ?? "transparent";
  const stroke = el.stroke ?? "transparent";
  const common = {
    id: el.id,
    opacity: el.opacity,
    rotation: el.rotation_deg,
    visible: el.visible,
    draggable: !el.locked,
    onClick: (e: any) => onSelect(e.evt.shiftKey),
    onTap: (e: any) => onSelect(e.evt.shiftKey),
    onDragMove,
    onDragEnd,
  };

  if (el.shape === "rect") {
    return <Rect x={el.x_mm * MM_TO_PX} y={el.y_mm * MM_TO_PX} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...common} />;
  }
  if (el.shape === "ellipse") {
    return <KonvaEllipse x={(el.x_mm + el.width_mm / 2) * MM_TO_PX} y={(el.y_mm + el.height_mm / 2) * MM_TO_PX} radiusX={w / 2} radiusY={h / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} {...common} />;
  }
  if (el.shape === "line") {
    return <Rect x={el.x_mm * MM_TO_PX} y={el.y_mm * MM_TO_PX} width={w} height={h} fill={el.fill ?? "#c9a84c"} stroke="transparent" strokeWidth={0} {...common} />;
  }
  return (
    <Line
      x={el.x_mm * MM_TO_PX}
      y={el.y_mm * MM_TO_PX}
      points={[w / 2, 0, w, h, 0, h]}
      closed={true}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      {...common}
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

  // Marquee state: start in paper-px coords, rect for visual rendering
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeRectDataRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const {
    format,
    pages,
    orelhaMm,
    zoom,
    panX,
    panY,
    legendasAtivas,
    snapEnabled,
    snapThreshold,
    elements,
    selectedIds,
    fills,
    backgroundUrl,
    setPan,
    fitToScreen,
    updateElement,
    selectElement,
    toggleElementInSelection,
    selectElements,
    clearSelection,
  } = useEditorStore();

  const [backgroundImage] = useImage(backgroundUrl ?? "", "anonymous");

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
  }, [mounted, fontsReady]);

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
  }, [containerSize.w, containerSize.h, format, pages, orelhaMm]);

  // Attach Transformer to selected nodes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    if (selectedIds.length > 0) {
      const nodes = selectedIds
        .map((id) => stageRef.current!.findOne(`#${id}`))
        .filter(Boolean) as Konva.Node[];
      transformerRef.current.nodes(nodes);
    } else {
      transformerRef.current.nodes([]);
    }
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedIds, elements]);

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
  const temOrelhas = orelhaMm > 0;
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

  function getRegionAt(xPaper: number, yPaper: number): { region: string; message: string } | null {
    if (!legendasAtivas) return null;
    const inSangria =
      xPaper < sangriaPx || xPaper > xSangriaR || yPaper < sangriaPx || yPaper > totalHPx - sangriaPx;
    if (inSangria) return { region: "SANGRIA", message: "3mm de margem de corte. Não coloque texto importante aqui." };
    const orelhaCm = Math.round(orelhaMm / 10);
    if (temOrelhas && xPaper >= sangriaPx && xPaper < xOrelhaVersoEnd) return { region: "ORELHA TRASEIRA", message: `Dobra de ${orelhaCm}cm. Outros livros do autor ou texto institucional.` };
    if (xPaper >= xOrelhaVersoEnd && xPaper < xContraEnd) return { region: "CONTRACAPA", message: "Verso. Sinopse, código de barras ISBN e logo da editora." };
    if (xPaper >= xContraEnd && xPaper < xLombadaEnd) return { region: "LOMBADA", message: `${lombadaMm.toFixed(1)}mm, calculada a partir de ${pages} páginas.` };
    if (xPaper >= xLombadaEnd && xPaper < xFrenteEnd) return { region: "CAPA", message: "Frente do livro. Aqui ficam título, autor e imagem principal." };
    if (temOrelhas && xPaper >= xFrenteEnd && xPaper < xOrelhaFrenteEnd) return { region: "ORELHA FRONTAL", message: `Dobra de ${orelhaCm}cm. Foto e bio do autor.` };
    return null;
  }

  // Drag helpers
  function handleDragMove(e: any, elId: string) {
    if (!snapEnabled) return;
    const node = e.target;
    const guides = getStructuralGuides(format, pages, orelhaMm);
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
    const el = elements.find((el) => el.id === elId);
    const isEllipse = el?.type === "shape" && (el as ShapeElement).shape === "ellipse";
    updateElement(elId, {
      x_mm: node.x() / MM_TO_PX - (isEllipse ? (el as ShapeElement).width_mm / 2 : 0),
      y_mm: node.y() / MM_TO_PX - (isEllipse ? (el as ShapeElement).height_mm / 2 : 0),
    });
  }

  // Single transformer-level handler for resize/rotate (handles both single and multi-node)
  function handleGroupTransformEnd() {
    const nodes = transformerRef.current?.nodes() ?? [];
    const storeElements = useEditorStore.getState().elements;
    nodes.forEach((node) => {
      const elId = node.id();
      if (!elId) return;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      const el = storeElements.find((e) => e.id === elId);
      if (!el) return;

      if (el.type === "shape") {
        const sh = el as ShapeElement;
        const isEllipse = sh.shape === "ellipse";
        const minH = sh.shape === "line" ? 0.1 : 2;
        const newW = Math.max(2, sh.width_mm * scaleX);
        const newH = Math.max(minH, sh.height_mm * scaleY);
        updateElement(elId, {
          x_mm: node.x() / MM_TO_PX - (isEllipse ? newW / 2 : 0),
          y_mm: node.y() / MM_TO_PX - (isEllipse ? newH / 2 : 0),
          width_mm: newW,
          height_mm: newH,
          rotation_deg: node.rotation(),
        });
        return;
      }

      const newW = Math.max(20, node.width() * scaleX) / MM_TO_PX;
      if (el.type === "text") {
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
    });
  }

  // Inline text editing
  function openInlineEdit(el: TextElement) {
    if (!stageRef.current || !containerRef.current) return;
    const node = stageRef.current.findOne(`#${el.id}`) as Konva.Text | undefined;
    if (!node) return;
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

      // Update marquee
      if (marqueeStartRef.current !== null) {
        const stage = e.target.getStage?.() ?? e.target.getStage?.();
        const ptr = stage?.getPointerPosition();
        if (!ptr) return;
        const { zoom: z, panX: px, panY: py } = useEditorStore.getState();
        const paperX = (ptr.x - px) / z;
        const paperY = (ptr.y - py) / z;
        const startX = marqueeStartRef.current.x;
        const startY = marqueeStartRef.current.y;
        const rect = {
          x: Math.min(startX, paperX),
          y: Math.min(startY, paperY),
          w: Math.abs(paperX - startX),
          h: Math.abs(paperY - startY),
        };
        marqueeRectDataRef.current = rect;
        setMarqueeRect(rect);
      }

      if (!legendasAtivas) return;
      const stage = e.target.getStage();
      const ptr = stage.getPointerPosition();
      if (!ptr) return;
      const { zoom: z, panX: px, panY: py } = useEditorStore.getState();
      const xPaper = (ptr.x - px) / z;
      const yPaper = (ptr.y - py) / z;
      const info = getRegionAt(xPaper, yPaper);
      if (info) {
        setTooltip({ visible: true, x: ptr.x, y: ptr.y, region: info.region, message: info.message });
      } else {
        setTooltip((t) => ({ ...t, visible: false }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legendasAtivas, orelhaMm, lombadaMm, pages, zoom, panX, panY],
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
      return;
    }

    if (e.target === e.target.getStage()) {
      // Clicked on empty canvas
      if (!e.evt.shiftKey) {
        clearSelection();
      }
      // Start marquee
      const stage = e.target.getStage();
      const ptr = stage.getPointerPosition();
      if (!ptr) return;
      const { zoom: z, panX: px, panY: py } = useEditorStore.getState();
      const paperX = (ptr.x - px) / z;
      const paperY = (ptr.y - py) / z;
      marqueeStartRef.current = { x: paperX, y: paperY };
      marqueeRectDataRef.current = { x: paperX, y: paperY, w: 0, h: 0 };
      setMarqueeRect({ x: paperX, y: paperY, w: 0, h: 0 });
    }
  }, [clearSelection]);

  const handleStageMouseUp = useCallback((e: any) => {
    isPanningRef.current = false;
    if (containerRef.current && spaceDownRef.current) {
      containerRef.current.style.cursor = "grab";
    } else if (containerRef.current) {
      containerRef.current.style.cursor = "";
    }

    // Finish marquee
    if (marqueeStartRef.current !== null) {
      const rect = marqueeRectDataRef.current;
      marqueeStartRef.current = null;
      marqueeRectDataRef.current = null;
      setMarqueeRect(null);

      // Ignore tiny movements (treat as click)
      if (!rect || (rect.w < 5 && rect.h < 5)) return;

      const { elements: els } = useEditorStore.getState();
      const intersecting = els.filter((el) => {
        const elX = el.x_mm * MM_TO_PX;
        const elY = el.y_mm * MM_TO_PX;
        const elW = el.width_mm * MM_TO_PX;
        const elH = el.height_mm * MM_TO_PX;
        return !(elX + elW < rect.x || elX > rect.x + rect.w || elY + elH < rect.y || elY > rect.y + rect.h);
      });

      if (intersecting.length > 0) {
        const newIds = intersecting.map((el) => el.id);
        if (e.evt.shiftKey) {
          const current = useEditorStore.getState().selectedIds;
          selectElements([...new Set([...current, ...newIds])]);
        } else {
          selectElements(newIds);
        }
      }
    }
  }, [selectElements]);

  const handleStageMouseLeave = useCallback(() => {
    setTooltip((t) => ({ ...t, visible: false }));
    isPanningRef.current = false;
    // Cancel marquee if mouse leaves stage
    marqueeStartRef.current = null;
    marqueeRectDataRef.current = null;
    setMarqueeRect(null);
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

  // Disable resize anchors if any selected element has rotation (group resize is unreliable)
  const hasRotatedInSelection = selectedIds.length >= 2 && elements.some(
    (e) => selectedIds.includes(e.id) && e.rotation_deg !== 0,
  );
  const transformerAnchors = hasRotatedInSelection
    ? []
    : ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"];

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
          {backgroundImage && (
            <KonvaImage
              image={backgroundImage}
              x={0}
              y={0}
              width={totalWPx}
              height={totalHPx}
              listening={false}
            />
          )}
        </Layer>

        {/* Region fill layer */}
        <Layer listening={false}>
          {ALL_REGIONS.map((key) => {
            const color = fills[key];
            if (!color) return null;
            const rect = getFillRect(key, format, pages, orelhaMm);
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
            const isSelected = selectedIds.includes(el.id);
            const commonDragProps = {
              onDragMove: (e: any) => handleDragMove(e, el.id),
              onDragEnd: (e: any) => handleDragEnd(e, el.id),
            };

            const handleSelect = (shift: boolean) => {
              if (shift) {
                toggleElementInSelection(el.id);
              } else {
                selectElement(el.id);
              }
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
                  lineHeight={t.lineHeight}
                  fill={t.color}
                  opacity={t.opacity}
                  rotation={t.rotation_deg}
                  visible={t.visible}
                  draggable={!t.locked}
                  wrap="word"
                  onClick={(e) => handleSelect(e.evt.shiftKey)}
                  onTap={(e) => handleSelect(e.evt.shiftKey)}
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
                  onSelect={handleSelect}
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
                  onSelect={handleSelect}
                  {...commonDragProps}
                />
              );
            }

            if (el.type === "barcode") {
              return (
                <BarcodeNode
                  key={el.id}
                  el={el as BarcodeElement}
                  onSelect={handleSelect}
                  {...commonDragProps}
                />
              );
            }

            if (el.type === "shape") {
              return (
                <ShapeNode
                  key={el.id}
                  el={el as ShapeElement}
                  selected={isSelected}
                  onSelect={handleSelect}
                  {...commonDragProps}
                />
              );
            }

            return null;
          })}

          {/* Transformer — single handler for all resize/rotate operations */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={true}
            resizeEnabled={true}
            keepRatio={false}
            enabledAnchors={transformerAnchors}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 20) return oldBox;
              return newBox;
            }}
            onTransformEnd={handleGroupTransformEnd}
            onDragEnd={(e) => {
              // Group drag via transformer — update all attached nodes
              const nodes = transformerRef.current?.nodes() ?? [];
              const storeElements = useEditorStore.getState().elements;
              nodes.forEach((node) => {
                const elId = node.id();
                if (!elId) return;
                const el = storeElements.find((el) => el.id === elId);
                const isEllipse = el?.type === "shape" && (el as ShapeElement).shape === "ellipse";
                updateElement(elId, {
                  x_mm: node.x() / MM_TO_PX - (isEllipse ? (el as ShapeElement).width_mm / 2 : 0),
                  y_mm: node.y() / MM_TO_PX - (isEllipse ? (el as ShapeElement).height_mm / 2 : 0),
                });
              });
              setSnapLines({ x: null, y: null });
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

        {/* Marquee selection rectangle */}
        <Layer listening={false}>
          {marqueeRect && marqueeRect.w > 1 && marqueeRect.h > 1 && (
            <Rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.w}
              height={marqueeRect.h}
              fill="rgba(100,130,255,0.08)"
              stroke="rgba(100,130,255,0.6)"
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
          {temOrelhas && (
            <>
              <Line points={[xOrelhaVersoEnd, 0, xOrelhaVersoEnd, totalHPx]} stroke={GUIDE_ORELHA_COLOR} strokeWidth={gs} dash={[7 / zoom, 4 / zoom]} />
              <Line points={[xFrenteEnd, 0, xFrenteEnd, totalHPx]} stroke={GUIDE_ORELHA_COLOR} strokeWidth={gs} dash={[7 / zoom, 4 / zoom]} />
            </>
          )}
        </Layer>

        {/* Region labels */}
        <Layer listening={false}>
          {(() => {
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
                {temOrelhas && orelhaPx * zoom > 30 && (
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
              lineHeight: el.lineHeight,
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

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect, Line, Text } from "react-konva";
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
import { EditorLegendTooltip, type TooltipInfo } from "./editor-legend-tooltip";
import { EditorEmptyState } from "./editor-empty-state";
import { EditorZoomControls } from "./editor-zoom-controls";
import type { FormatKey } from "../types";

interface EditorCanvasProps {
  format: FormatKey;
  pages: number;
}

export function EditorCanvas({ format: _format, pages: _pages }: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [mounted, setMounted] = useState(false);

  const {
    format,
    pages,
    comOrelhas,
    zoom,
    panX,
    panY,
    legendasAtivas,
    setPan,
    fitToScreen,
  } = useEditorStore();

  const [tooltip, setTooltip] = useState<TooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    region: "",
    message: "",
  });

  const isPanningRef = useRef(false);
  const spaceDownRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  // ResizeObserver — updates container size and triggers re-fit
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

  // Keyboard: space for pan cursor
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !spaceDownRef.current) {
        e.preventDefault();
        spaceDownRef.current = true;
        if (containerRef.current) {
          containerRef.current.style.cursor = "grab";
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        isPanningRef.current = false;
        if (containerRef.current) {
          containerRef.current.style.cursor = "";
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Native non-passive wheel listener for zoom/pan (passive:false required for preventDefault)
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

  // Dimensions in native px (at 300 DPI, 1:1 scale)
  const f = FORMATS[format];
  const lombadaMm = calcularLombada(pages);
  const orelhaMm = comOrelhas ? ORELHA_MM : 0;
  const sangriaPx = SANGRIA_MM * MM_TO_PX;
  const orelhaPx = orelhaMm * MM_TO_PX;
  const lombadaPx = lombadaMm * MM_TO_PX;
  const frontePx = f.width_mm * MM_TO_PX;
  const totalWPx = f.width_mm * 2 * MM_TO_PX + lombadaPx + orelhaPx * 2 + sangriaPx * 2;
  const totalHPx = f.height_mm * MM_TO_PX + sangriaPx * 2;

  // Region X boundaries in paper (Konva) coordinates
  const xSangriaR = totalWPx - sangriaPx;
  const xOrelhaVersoEnd = sangriaPx + orelhaPx;
  const xContraEnd = xOrelhaVersoEnd + frontePx;
  const xLombadaEnd = xContraEnd + lombadaPx;
  const xFrenteEnd = xLombadaEnd + frontePx;
  const xOrelhaFrenteEnd = xFrenteEnd + orelhaPx;
  const xLombadaCenter = (xContraEnd + xLombadaEnd) / 2;

  // Guide stroke — constant at ~1.5px on screen regardless of zoom
  const gs = 1.5 / zoom;

  function getRegionAt(xPaper: number, yPaper: number): { region: string; message: string } | null {
    if (!legendasAtivas) return null;
    const inSangria =
      xPaper < sangriaPx ||
      xPaper > xSangriaR ||
      yPaper < sangriaPx ||
      yPaper > totalHPx - sangriaPx;
    if (inSangria) {
      return {
        region: "SANGRIA",
        message: "3mm de margem de corte. Não coloque texto importante aqui.",
      };
    }
    if (comOrelhas && xPaper >= sangriaPx && xPaper < xOrelhaVersoEnd) {
      return {
        region: "ORELHA TRASEIRA",
        message: "Dobra de 8cm. Outros livros do autor ou texto institucional.",
      };
    }
    if (xPaper >= xOrelhaVersoEnd && xPaper < xContraEnd) {
      return {
        region: "CONTRACAPA",
        message: "Verso. Sinopse, código de barras ISBN e logo da editora.",
      };
    }
    if (xPaper >= xContraEnd && xPaper < xLombadaEnd) {
      return {
        region: "LOMBADA",
        message: `${lombadaMm.toFixed(1)}mm, calculada a partir de ${pages} páginas. Título e autor lidos na estante.`,
      };
    }
    if (xPaper >= xLombadaEnd && xPaper < xFrenteEnd) {
      return {
        region: "CAPA",
        message: "Frente do livro. Aqui ficam título, autor e imagem principal.",
      };
    }
    if (comOrelhas && xPaper >= xFrenteEnd && xPaper < xOrelhaFrenteEnd) {
      return {
        region: "ORELHA FRONTAL",
        message: "Dobra de 8cm. Foto e bio do autor.",
      };
    }
    return null;
  }

  const handleStageMouseMove = useCallback(
    (e: any) => {
      // Pan while dragging
      if (isPanningRef.current) {
        const stage = e.target.getStage();
        const ptr = stage.getPointerPosition();
        if (!ptr) return;
        const { panX, panY, setPan } = useEditorStore.getState();
        setPan(panX + ptr.x - lastPointerRef.current.x, panY + ptr.y - lastPointerRef.current.y);
        lastPointerRef.current = ptr;
      }

      // Tooltip
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
  }, []);

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

  if (!mounted) {
    return (
      <div ref={containerRef} className="absolute inset-0 bg-[#e8e6e0]">
        <div className="flex h-full items-center justify-center text-sm text-zinc-400">
          Carregando editor…
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 select-none overflow-hidden"
      style={{ background: CANVAS_BG_COLOR }}
    >
      <Stage
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
        {/* Paper: white rect with drop shadow */}
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

        {/* Guide lines */}
        <Layer listening={false}>
          {/* Sangria — dashed red rectangle */}
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

          {/* Lombada left fold — blue dashed */}
          <Line
            points={[xContraEnd, 0, xContraEnd, totalHPx]}
            stroke={GUIDE_DOBRA_COLOR}
            strokeWidth={gs}
            dash={[7 / zoom, 4 / zoom]}
          />
          {/* Lombada right fold — blue dashed */}
          <Line
            points={[xLombadaEnd, 0, xLombadaEnd, totalHPx]}
            stroke={GUIDE_DOBRA_COLOR}
            strokeWidth={gs}
            dash={[7 / zoom, 4 / zoom]}
          />
          {/* Lombada center — gray dotted */}
          <Line
            points={[xLombadaCenter, 0, xLombadaCenter, totalHPx]}
            stroke={GUIDE_LOMBADA_CENTER_COLOR}
            strokeWidth={gs * 0.8}
            dash={[2 / zoom, 5 / zoom]}
          />

          {/* Orelha folds — green dashed (only when active) */}
          {comOrelhas && (
            <>
              <Line
                points={[xOrelhaVersoEnd, 0, xOrelhaVersoEnd, totalHPx]}
                stroke={GUIDE_ORELHA_COLOR}
                strokeWidth={gs}
                dash={[7 / zoom, 4 / zoom]}
              />
              <Line
                points={[xFrenteEnd, 0, xFrenteEnd, totalHPx]}
                stroke={GUIDE_ORELHA_COLOR}
                strokeWidth={gs}
                dash={[7 / zoom, 4 / zoom]}
              />
            </>
          )}
        </Layer>

        {/* Region labels */}
        <Layer listening={false}>
          {/* CAPA */}
          <Text
            x={xLombadaEnd}
            y={totalHPx / 2}
            width={frontePx}
            align="center"
            offsetY={8 / zoom}
            text="CAPA"
            fontSize={14 / zoom}
            fill={GUIDE_LABEL_COLOR}
            fontFamily="serif"
            fontStyle="italic"
          />
          {/* CONTRACAPA */}
          <Text
            x={xOrelhaVersoEnd}
            y={totalHPx / 2}
            width={frontePx}
            align="center"
            offsetY={8 / zoom}
            text="CONTRACAPA"
            fontSize={14 / zoom}
            fill={GUIDE_LABEL_COLOR}
            fontFamily="serif"
            fontStyle="italic"
          />
          {/* LOMBADA — only if wide enough on screen */}
          {lombadaPx * zoom > 18 && (
            <Text
              x={xLombadaCenter}
              y={totalHPx / 2}
              offsetY={0}
              text="LOMBADA"
              fontSize={9 / zoom}
              fill={GUIDE_LABEL_COLOR}
              fontFamily="serif"
              fontStyle="italic"
              rotation={-90}
              align="center"
            />
          )}
          {/* ORELHA labels */}
          {comOrelhas && orelhaPx * zoom > 30 && (
            <>
              <Text
                x={sangriaPx}
                y={totalHPx / 2}
                width={orelhaPx}
                align="center"
                offsetY={10 / zoom}
                text={"ORELHA\nTRASEIRA"}
                fontSize={11 / zoom}
                fill={GUIDE_LABEL_COLOR}
                fontFamily="serif"
                fontStyle="italic"
              />
              <Text
                x={xFrenteEnd}
                y={totalHPx / 2}
                width={orelhaPx}
                align="center"
                offsetY={10 / zoom}
                text={"ORELHA\nFRONTAL"}
                fontSize={11 / zoom}
                fill={GUIDE_LABEL_COLOR}
                fontFamily="serif"
                fontStyle="italic"
              />
            </>
          )}
        </Layer>

        {/* Content layer — empty in Onda 1, Onda 2 adds elements here */}
        <Layer />
      </Stage>

      {/* HTML overlays (outside Stage, positioned over canvas) */}
      {legendasAtivas && <EditorLegendTooltip tooltip={tooltip} />}
      <EditorEmptyState />
      <EditorZoomControls containerW={containerSize.w} containerH={containerSize.h} />
    </div>
  );
}

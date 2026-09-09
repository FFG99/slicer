import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GridData } from "../types";
import { drawHeatmapLayers, gridValueAtWorld } from "../lib/canvasDraw";
import { useSquareCanvasSize } from "../lib/useSquareCanvasSize";
import { HeatmapColorLegends } from "./ColorLegend";
import { isDivergentValue } from "../lib/colormap";
import {
  canvasRectToWorld,
  canvasToWorld,
  fullWindowFromViewport,
  panWindow,
  type Frame,
  type Viewport,
  type WorldRect,
  viewportFromFrames,
  viewportFromWindow,
  worldToCanvas,
  zoomWindowAt,
} from "../lib/frame";

export interface HeatmapLayer {
  id: string;
  label: string;
  grid: GridData;
  calculationType: string;
  opacity: number;
  visible: boolean;
  lyapunovZero?: number;
  attractionMapDisplayMode?: "count" | "composition" | "periods";
}

interface HeatmapViewerProps {
  toolbarTools?: ReactNode;
  pointToolActive?: boolean;
  onNavigationToolSelect?: () => void;
  layers: HeatmapLayer[];
  selection: WorldRect | null;
  onSelectionChange: (rect: WorldRect | null) => void;
  onPointSelect?: (world: { x: number; y: number }) => void;
  onContextMenuRequest?: (
    world: { x: number; y: number },
    client: { x: number; y: number },
  ) => void;
  segment?: { x: number; y: number }[];
  clickMarker?: { x: number; y: number } | null;
  interactive?: boolean;
  enableZoom?: boolean;
  selectionEnabled?: boolean;
}

const CLICK_THRESHOLD_PX = 6;
const MIN_ZOOM_FACTOR = 0.05;

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toPrecision(7).replace(/(?:\.0+|(?:(\.\d*?)0+))(?=e|$)/, "$1");
}

function selectedValueLabel(layer: HeatmapLayer, value: number | null): string {
  if (value === null) {
    return "нет данных";
  }
  if (isDivergentValue(value, layer.grid.value_dtype)) {
    return Number.isNaN(value) ? "div" : `${formatNumber(value)} (div)`;
  }

  const category = layer.grid.categories?.find(
    (item) => item.value === Math.round(value),
  );
  if (category) {
    return category.label;
  }
  return formatNumber(value);
}

function drawClickMarker(
  ctx: CanvasRenderingContext2D,
  marker: { x: number; y: number },
  viewport: Viewport,
  size: number,
) {
  const point = worldToCanvas(marker.x, marker.y, viewport, size);
  ctx.fillStyle = "#fdd663";
  ctx.strokeStyle = "#111318";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.px, point.py, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  selection: WorldRect,
  viewport: Viewport,
  size: number,
) {
  const tl = worldToCanvas(selection.xMin, selection.yMax, viewport, size);
  const br = worldToCanvas(selection.xMax, selection.yMin, viewport, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(tl.px, tl.py, br.px - tl.px, br.py - tl.py);
  ctx.setLineDash([]);
}

export function HeatmapViewer({
  toolbarTools,
  pointToolActive = false,
  onNavigationToolSelect,
  layers,
  selection,
  onSelectionChange,
  onPointSelect,
  onContextMenuRequest,
  clickMarker,
  segment,
  interactive = true,
  enableZoom = true,
  selectionEnabled = true,
}: HeatmapViewerProps) {
  const [paletteRevision, setPaletteRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPaletteRevision((value) => value + 1);
    window.addEventListener("slicer-palette-change", refresh);
    return () => window.removeEventListener("slicer-palette-change", refresh);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { rowRef, slotRef, infoRef, cssSide, drawSide, infoBeside } =
    useSquareCanvasSize();
  const CANVAS_SIZE = drawSide;
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [viewWindow, setViewWindow] = useState<WorldRect | null>(null);
  const [panMode, setPanMode] = useState(false);
  useEffect(()=>{if(pointToolActive)setPanMode(false);},[pointToolActive]);
  const panStartRef = useRef<{ px: number; py: number; window: WorldRect } | null>(null);

  const visibleLayers = layers.filter((layer) => layer.visible);
  const legendLayers = visibleLayers.map((layer) => ({
    calculationType: layer.calculationType,
    lyapunovZero: layer.lyapunovZero,
    categories: layer.grid.categories,
  }));
  const selectedLayer = visibleLayers[visibleLayers.length - 1];
  const selectedValue =
    clickMarker && selectedLayer
      ? selectedValueLabel(
          selectedLayer,
          gridValueAtWorld(selectedLayer.grid, clickMarker),
        )
      : null;
  const frames = visibleLayers.map((layer) => layer.grid.frame as Frame);
  const baseViewport = useMemo(
    () =>
      frames.length > 0
        ? viewportFromFrames(frames)
        : { x: { min: 0, max: 1, name: "x" }, y: { min: 0, max: 1, name: "y" } },
    [frames],
  );

  const displayViewport = useMemo(
    () =>
      viewWindow
        ? viewportFromWindow(viewWindow, {
            x: baseViewport.x.name,
            y: baseViewport.y.name,
          })
        : baseViewport,
    [viewWindow, baseViewport],
  );

  const layerKey = visibleLayers.map((layer) => layer.id).join(",");
  useEffect(() => {
    setViewWindow(null);
  }, [layerKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    drawHeatmapLayers(
      ctx,
      visibleLayers.map((layer) => ({
        grid: layer.grid,
        calculationType: layer.calculationType,
        opacity: layer.opacity,
        lyapunovZero: layer.lyapunovZero,
      })),
      displayViewport,
      CANVAS_SIZE,
    );

    if (selection) {
      drawSelection(ctx, selection, displayViewport, CANVAS_SIZE);
    } else if (dragStart && dragCurrent && selectionEnabled && !panMode) {
      const rect = canvasRectToWorld(
        dragStart.x,
        dragStart.y,
        dragCurrent.x,
        dragCurrent.y,
        displayViewport,
        CANVAS_SIZE,
      );
      drawSelection(ctx, rect, displayViewport, CANVAS_SIZE);
    }

    if (segment?.length) {
      ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 3; ctx.font = "bold 18px sans-serif";
      ctx.beginPath();
      segment.forEach((p, i) => { const q = worldToCanvas(p.x, p.y, displayViewport, CANVAS_SIZE); if(i===0)ctx.moveTo(q.px,q.py);else ctx.lineTo(q.px,q.py); ctx.fillText(i===0?"A":"B",q.px+8,q.py-8); });
      ctx.stroke(); segment.forEach(p => drawClickMarker(ctx,p,displayViewport,CANVAS_SIZE)); ctx.restore();
    }
    if (clickMarker) {
      drawClickMarker(ctx, clickMarker, displayViewport, CANVAS_SIZE);
    }
  }, [
    visibleLayers,
    paletteRevision,
    displayViewport,
    selection,
    dragStart,
    dragCurrent,
    clickMarker,
    segment,
    selectionEnabled,
    panMode,
    CANVAS_SIZE,
  ]);

  function pointerPos(event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function handleWheel(event: React.WheelEvent<HTMLCanvasElement>) {
    if (!interactive || !enableZoom) {
      return;
    }
    event.preventDefault();
    const pos = pointerPos(event);
    const world = canvasToWorld(pos.x, pos.y, displayViewport, CANVAS_SIZE);
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    setViewWindow((current) => {
      const next = zoomWindowAt(current, baseViewport, factor, world);
      const full = fullWindowFromViewport(baseViewport);
      const width = next.xMax - next.xMin;
      const height = next.yMax - next.yMin;
      const fullWidth = full.xMax - full.xMin;
      const fullHeight = full.yMax - full.yMin;
      if (width > fullWidth * 50 || height > fullHeight * 50) {
        return current;
      }
      if (width < fullWidth * MIN_ZOOM_FACTOR || height < fullHeight * MIN_ZOOM_FACTOR) {
        return current;
      }
      return next;
    });
  }

  if (visibleLayers.length === 0) {
    return (
      <div className="heatmap-placeholder">
        Запустите карту из сайдбара, затем кликните точку для закрепления.
      </div>
    );
  }

  const zoomedIn = viewWindow !== null;

  return (
    <div className="heatmap-wrap">
      {interactive && (
        <div className="canvas-toolbar map-tools" role="toolbar" aria-label="Инструменты карты">
          {selectionEnabled && <button type="button" className="toolbar-btn" title="Выбрать диапазон перетаскиванием" aria-pressed={!panMode && !pointToolActive}
            onClick={()=>{setPanMode(false);onNavigationToolSelect?.();}}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3"/></svg>Выделение
          </button>}
          {enableZoom && <>
            <button type="button" className="toolbar-btn" title="Перемещение карты · Shift + перетаскивание" aria-pressed={panMode && !pointToolActive}
              onClick={()=>{setPanMode(true);onNavigationToolSelect?.();}}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>Перемещение
            </button>
            <button type="button" className="toolbar-btn" title="Вернуть исходный масштаб" disabled={!zoomedIn} onClick={()=>setViewWindow(null)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/></svg>Сброс масштаба
            </button>
          </>}
          {toolbarTools}
        </div>
      )}
      <div
        className={infoBeside ? "viz-canvas-row info-beside" : "viz-canvas-row"}
        ref={rowRef}
      >
      <div className="viz-canvas-slot" ref={slotRef}>
        <canvas
          ref={canvasRef}
          className={
            interactive
              ? "heatmap-canvas heatmap-canvas-interactive"
              : "heatmap-canvas"
          }
          style={{ width: cssSide, height: cssSide, cursor: interactive ? (panMode ? "grab" : "crosshair") : undefined }}
          onWheel={handleWheel}
          onContextMenu={(event) => {
          if (!interactive || !onContextMenuRequest) {
            return;
          }
          event.preventDefault();
          const pos = pointerPos(event);
          const world = canvasToWorld(pos.x, pos.y, displayViewport, CANVAS_SIZE);
          onContextMenuRequest(world, { x: event.clientX, y: event.clientY });
        }}
        onPointerDown={(event) => {
          if (!interactive) {
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          const pos = pointerPos(event);
          const isPan = panMode || event.shiftKey;
          if (isPan && enableZoom) {
            panStartRef.current = {
              px: pos.x,
              py: pos.y,
              window: viewWindow ?? fullWindowFromViewport(baseViewport),
            };
            return;
          }
          if (!selectionEnabled) {
            if (onPointSelect) {
              const world = canvasToWorld(pos.x, pos.y, displayViewport, CANVAS_SIZE);
              onPointSelect(world);
            }
            return;
          }
          setDragStart(pos);
          setDragCurrent(pos);
          onSelectionChange(null);
        }}
        onPointerMove={(event) => {
          if (!interactive) {
            return;
          }
          const pos = pointerPos(event);
          const panStart = panStartRef.current;
          if (panStart && enableZoom) {
            const dxPx = pos.x - panStart.px;
            const dyPx = pos.y - panStart.py;
            const startViewport = viewportFromWindow(panStart.window, {
              x: baseViewport.x.name,
              y: baseViewport.y.name,
            });
            const worldDx =
              -(dxPx / CANVAS_SIZE) * (startViewport.x.max - startViewport.x.min);
            const worldDy =
              (dyPx / CANVAS_SIZE) * (startViewport.y.max - startViewport.y.min);
            setViewWindow(
              panWindow(panStart.window, baseViewport, worldDx, worldDy),
            );
            return;
          }
          if (!dragStart) {
            return;
          }
          setDragCurrent(pos);
        }}
        onPointerUp={(event) => {
          if (!interactive) {
            return;
          }
          if (panStartRef.current) {
            panStartRef.current = null;
            return;
          }
          if (!dragStart) {
            return;
          }
          const end = pointerPos(event);
          const dx = end.x - dragStart.x;
          const dy = end.y - dragStart.y;
          const distance = Math.hypot(dx, dy);

          if (distance < CLICK_THRESHOLD_PX && onPointSelect) {
            const world = canvasToWorld(end.x, end.y, displayViewport, CANVAS_SIZE);
            onPointSelect(world);
            setDragStart(null);
            setDragCurrent(null);
            return;
          }

          if (!selectionEnabled) {
            setDragStart(null);
            setDragCurrent(null);
            return;
          }

          const world = canvasRectToWorld(
            dragStart.x,
            dragStart.y,
            end.x,
            end.y,
            displayViewport,
            CANVAS_SIZE,
          );
          const width = Math.abs(world.xMax - world.xMin);
          const height = Math.abs(world.yMax - world.yMin);
          if (width > 0 && height > 0) {
            onSelectionChange(world);
          }
          setDragStart(null);
          setDragCurrent(null);
        }}
      />
      </div>
      <div className="viz-canvas-info" ref={infoRef}>
        <div className="heatmap-axes">
          <span>
            X: {displayViewport.x.name} [{displayViewport.x.min.toFixed(4)},{" "}
            {displayViewport.x.max.toFixed(4)}]
          </span>
          <span>
            Y: {displayViewport.y.name} [{displayViewport.y.min.toFixed(4)},{" "}
            {displayViewport.y.max.toFixed(4)}]
          </span>
          {clickMarker && selectedValue !== null && (
            <>
              <span>
                Выбрано: {displayViewport.x.name} = {clickMarker.x.toFixed(4)} ·{" "}
                {displayViewport.y.name} = {clickMarker.y.toFixed(4)}
              </span>
              <span>Значение: {selectedValue}</span>
            </>
          )}
        </div>
        <HeatmapColorLegends layers={legendLayers} />
        {interactive && (
          <p className="muted heatmap-hint">
            Клик — выбор точки
            {visibleLayers[0]?.grid.downsample > 1
              ? ` · preview downsample ×${visibleLayers[0]?.grid.downsample}`
              : ""}
          </p>
        )}
      </div>
      </div>
    </div>
  );
}

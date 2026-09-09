import { useEffect, useMemo, useRef, useState } from "react";
import {
  drawHeatmapGrid,
  drawPhasePortraitPath,
  drawWorldMarker,
  viewportFromTrajectories,
} from "../lib/canvasDraw";
import { useSquareCanvasSize } from "../lib/useSquareCanvasSize";
import { resolveLyapunovZero } from "../lib/colormap";
import type { PortraitOverlay } from "../lib/portraitOverlay";
import {
  canvasToWorld,
  fullWindowFromViewport,
  panWindow,
  type Frame,
  type Viewport,
  type WorldRect,
  viewportFromFrames,
  viewportFromWindow,
  zoomWindowAt,
} from "../lib/frame";
import type { PhasePortraitSettings } from "../lib/phasePortraitSettings";
import {
  poolLegendCalculationType,
  resolvePoolClassificationMode,
  type PoolClassificationMode,
} from "../lib/poolSettings";
import type { GridData } from "../types";
import { HeatmapColorLegends } from "./ColorLegend";
import { NumberInput } from "./NumberInput";

interface StatePlaneViewerProps {
  poolGrid: GridData | null;
  poolRunId: string | null;
  poolClassificationMode?: PoolClassificationMode;
  poolLyapunovZero?: number;
  onPoolLyapunovZeroChange?: (zero: number) => void;
  overlays: PortraitOverlay[];
  portraitSettings: PhasePortraitSettings;
  showPortraitOverlay: boolean;
  clickMarker?: { x: number; y: number } | null;
  poolReady?: boolean;
  workflowHint?: string;
  onPointSelect?: (world: { x: number; y: number }) => void;
  enableZoom?: boolean;
}

const CLICK_THRESHOLD_PX = 6;
const MIN_ZOOM_FACTOR = 0.05;

export function StatePlaneViewer({
  poolGrid,
  poolRunId,
  poolClassificationMode,
  poolLyapunovZero,
  onPoolLyapunovZeroChange,
  overlays,
  portraitSettings,
  showPortraitOverlay,
  clickMarker,
  poolReady = false,
  workflowHint,
  onPointSelect,
  enableZoom = true,
}: StatePlaneViewerProps) {
  const [paletteRevision, setPaletteRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setPaletteRevision((value) => value + 1);
    window.addEventListener("slicer-palette-change", refresh);
    return () => window.removeEventListener("slicer-palette-change", refresh);
  }, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { rowRef, slotRef, infoRef, cssSide, drawSide, infoBeside } =
    useSquareCanvasSize();
  const CANVAS_DRAW_SIZE = drawSide;
  const [viewWindow, setViewWindow] = useState<WorldRect | null>(null);
  const panStartRef = useRef<{ px: number; py: number; window: WorldRect } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const hasPool = poolGrid !== null;
  const resolvedPoolMode = resolvePoolClassificationMode(
    poolClassificationMode,
    poolGrid?.value_dtype,
  );
  const poolLegendType = poolLegendCalculationType(resolvedPoolMode);
  const resolvedLyapunovZero = resolveLyapunovZero(poolLyapunovZero);
  const showLyapunovZeroControl =
    resolvedPoolMode === "lyapunov" && onPoolLyapunovZeroChange !== undefined;
  const visibleOverlays = overlays.filter((overlay) => overlay.visible);
  const hasPortrait = visibleOverlays.some(
    (overlay) =>
      overlay.trajectory.frame.space === "phase_plane" && overlay.trajectory.points > 0,
  );

  const baseViewport = useMemo((): Viewport | null => {
    if (poolGrid) {
      return viewportFromFrames([poolGrid.frame as Frame]);
    }
    if (visibleOverlays.length > 0) {
      return viewportFromTrajectories(visibleOverlays.map((o) => o.trajectory));
    }
    return null;
  }, [poolGrid, visibleOverlays]);

  const displayViewport = useMemo(() => {
    if (!baseViewport) {
      return null;
    }
    return viewWindow
      ? viewportFromWindow(viewWindow, {
          x: baseViewport.x.name,
          y: baseViewport.y.name,
        })
      : baseViewport;
  }, [viewWindow, baseViewport]);

  useEffect(() => {
    setViewWindow(null);
  }, [poolRunId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayViewport) {
      return;
    }

    canvas.width = CANVAS_DRAW_SIZE;
    canvas.height = CANVAS_DRAW_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, CANVAS_DRAW_SIZE, CANVAS_DRAW_SIZE);

    if (poolGrid) {
      drawHeatmapGrid(
        ctx,
        poolGrid,
        "pool_of_attraction",
        displayViewport,
        CANVAS_DRAW_SIZE,
        1,
        resolvedPoolMode === "lyapunov" ? resolvedLyapunovZero : undefined,
        resolvedPoolMode,
      );
    }

    if (showPortraitOverlay && hasPortrait) {
      for (const overlay of visibleOverlays) {
        if (overlay.trajectory.frame.space !== "phase_plane" || overlay.trajectory.points < 1) {
          continue;
        }
        drawPhasePortraitPath(ctx, overlay.trajectory, displayViewport, CANVAS_DRAW_SIZE, {
          color: overlay.color,
          dotSize: portraitSettings.dotSize,
          onPool: hasPool,
        });
      }
    }

    if (clickMarker) {
      drawWorldMarker(ctx, clickMarker, displayViewport, CANVAS_DRAW_SIZE);
    }
  }, [
    poolGrid,
    paletteRevision,
    overlays,
    visibleOverlays,
    displayViewport,
    portraitSettings.dotSize,
    showPortraitOverlay,
    hasPortrait,
    hasPool,
    clickMarker,
    resolvedPoolMode,
    resolvedLyapunovZero,
    CANVAS_DRAW_SIZE,
  ]);

  function pointerPos(
    event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>,
  ) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_DRAW_SIZE / rect.width;
    const scaleY = CANVAS_DRAW_SIZE / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  if (!baseViewport || !displayViewport) {
    return (
      <div className="trajectory-placeholder">
        {workflowHint ??
          "Выберите точку на карте параметров и вычислите pool of attraction."}
      </div>
    );
  }

  const zoomedIn = viewWindow !== null;
  return (
    <div className="state-plane-wrap">
      {enableZoom && (
        <div className="canvas-toolbar">
          <button
            type="button"
            className="toolbar-btn secondary"
            disabled={!zoomedIn}
            onClick={() => setViewWindow(null)}
          >
            Reset zoom
          </button>
          <span className="muted toolbar-hint">
            Wheel zoom · Shift+drag pan
            {poolReady && onPointSelect ? " · клик — портрет" : ""}
          </span>
        </div>
      )}
      <div
        className={infoBeside ? "viz-canvas-row info-beside" : "viz-canvas-row"}
        ref={rowRef}
      >
      <div className="viz-canvas-slot" ref={slotRef}>
        <canvas
          ref={canvasRef}
          className="heatmap-canvas heatmap-canvas-interactive"
          style={{ width: cssSide, height: cssSide }}
          onWheel={(event) => {
          if (!enableZoom || !baseViewport) {
            return;
          }
          event.preventDefault();
          const pos = pointerPos(event);
          const world = canvasToWorld(pos.x, pos.y, displayViewport, CANVAS_DRAW_SIZE);
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
        }}
        onPointerDown={(event) => {
          if (!onPointSelect) {
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          const pos = pointerPos(event);
          if (event.shiftKey && enableZoom && baseViewport) {
            panStartRef.current = {
              px: pos.x,
              py: pos.y,
              window: viewWindow ?? fullWindowFromViewport(baseViewport),
            };
            return;
          }
          dragStartRef.current = pos;
        }}
        onPointerMove={(event) => {
          const panStart = panStartRef.current;
          if (panStart && enableZoom && baseViewport) {
            const pos = pointerPos(event);
            const dxPx = pos.x - panStart.px;
            const dyPx = pos.y - panStart.py;
            const startViewport = viewportFromWindow(panStart.window, {
              x: baseViewport.x.name,
              y: baseViewport.y.name,
            });
            const worldDx =
              -(dxPx / CANVAS_DRAW_SIZE) * (startViewport.x.max - startViewport.x.min);
            const worldDy =
              (dyPx / CANVAS_DRAW_SIZE) * (startViewport.y.max - startViewport.y.min);
            setViewWindow(
              panWindow(panStart.window, baseViewport, worldDx, worldDy),
            );
            return;
          }
        }}
        onPointerUp={(event) => {
          if (panStartRef.current) {
            panStartRef.current = null;
            return;
          }
          const start = dragStartRef.current;
          if (!start || !onPointSelect) {
            return;
          }
          const end = pointerPos(event);
          const distance = Math.hypot(end.x - start.x, end.y - start.y);
          if (distance < CLICK_THRESHOLD_PX) {
            const world = canvasToWorld(end.x, end.y, displayViewport, CANVAS_DRAW_SIZE);
            onPointSelect(world);
          }
          dragStartRef.current = null;
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
        </div>
        {hasPool && (
          <>
            {showLyapunovZeroControl && (
              <div className="layer-viz-row state-plane-viz-row">
                <NumberInput
                  className="field layer-viz-field"
                  label="Ноль (виз.)"
                  value={resolvedLyapunovZero}
                  disabled={false}
                  min={1e-9}
                  max={10}
                  onChange={onPoolLyapunovZeroChange}
                />
                <span className="muted layer-viz-hint">Q ∈ [−z, z]</span>
              </div>
            )}
            <HeatmapColorLegends
              layers={[
                {
                  calculationType: poolLegendType,
                  lyapunovZero:
                    resolvedPoolMode === "lyapunov" ? resolvedLyapunovZero : undefined,
                },
              ]}
            />
          </>
        )}
      </div>
      </div>
    </div>
  );
}

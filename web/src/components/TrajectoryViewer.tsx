import { useEffect, useMemo, useRef, useState } from "react";
import type { TrajectoryData } from "../types";
import {
  canvasToWorld,
  fullWindowFromViewport,
  panWindow,
  type Frame,
  type Viewport,
  type WorldRect,
  viewportFromWindow,
  worldToCanvas,
  zoomWindowAt,
} from "../lib/frame";
import {
  PHASE_PORTRAIT_DOT_COLOR,
  type PhasePortraitSettings,
} from "../lib/phasePortraitSettings";

interface TrajectoryViewerProps {
  data: TrajectoryData | null;
  displaySettings: PhasePortraitSettings;
  label?: string;
  enableZoom?: boolean;
}

const CANVAS_SIZE = 480;

function viewportForTrajectory(data: TrajectoryData): Viewport {
  const frame = data.frame as Frame;
  if (data.frame.space === "time_series") {
    const tAxis = frame.axes[0];
    const valueAxis = frame.axes[1];
    const tMin = data.t.length ? Math.min(...data.t) : (tAxis?.min ?? 0);
    const tMax = data.t.length ? Math.max(...data.t) : (tAxis?.max ?? 1);
    const values = data.state.map((row) => row[0] ?? 0);
    const vMin = values.length ? Math.min(...values) : (valueAxis?.min ?? -1);
    const vMax = values.length ? Math.max(...values) : (valueAxis?.max ?? 1);
    return {
      x: { min: tMin, max: tMax, name: tAxis?.name ?? "t" },
      y: { min: vMin, max: vMax, name: valueAxis?.name ?? "value" },
    };
  }

  const xAxis = frame.axes[0];
  const yAxis = frame.axes[1];
  const xIndex = xAxis?.index ?? 0;
  const yIndex = yAxis?.index ?? 1;
  const xs = data.state.map((row) => row[xIndex] ?? 0);
  const ys = data.state.map((row) => row[yIndex] ?? 0);
  const pad = 0.05;
  const xMin = xs.length ? Math.min(...xs) : (xAxis?.min ?? -1);
  const xMax = xs.length ? Math.max(...xs) : (xAxis?.max ?? 1);
  const yMin = ys.length ? Math.min(...ys) : (yAxis?.min ?? -1);
  const yMax = ys.length ? Math.max(...ys) : (yAxis?.max ?? 1);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  return {
    x: {
      min: xMin - xRange * pad,
      max: xMax + xRange * pad,
      name: xAxis?.name ?? "x",
    },
    y: {
      min: yMin - yRange * pad,
      max: yMax + yRange * pad,
      name: yAxis?.name ?? "y",
    },
  };
}

function drawPhasePortraitDots(
  ctx: CanvasRenderingContext2D,
  data: TrajectoryData,
  displayViewport: Viewport,
  dotSize: number,
) {
  const frame = data.frame as Frame;
  const xIndex = frame.axes[0]?.index ?? 0;
  const yIndex = frame.axes[1]?.index ?? 1;

  ctx.fillStyle = PHASE_PORTRAIT_DOT_COLOR;
  for (let i = 0; i < data.points; i++) {
    const x = data.state[i]![xIndex]!;
    const y = data.state[i]![yIndex]!;
    const point = worldToCanvas(x, y, displayViewport, CANVAS_SIZE);
    ctx.beginPath();
    ctx.arc(point.px, point.py, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function TrajectoryViewer({
  data,
  displaySettings,
  label,
  enableZoom = false,
}: TrajectoryViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewWindow, setViewWindow] = useState<WorldRect | null>(null);
  const panStartRef = useRef<{ px: number; py: number; window: WorldRect } | null>(null);

  const isPhasePlane = data?.frame.space === "phase_plane";

  const baseViewport = useMemo(() => (data ? viewportForTrajectory(data) : null), [data]);

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
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || !displayViewport) {
      return;
    }

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.fillStyle = "#111318";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (data.points < 1) {
      return;
    }

    const isTimeSeries = data.frame.space === "time_series";

    if (isPhasePlane) {
      drawPhasePortraitDots(ctx, data, displayViewport, displaySettings.dotSize);
      return;
    }

    if (data.points < 2) {
      return;
    }

    const frame = data.frame as Frame;
    const xIndex = isTimeSeries ? -1 : (frame.axes[0]?.index ?? 0);
    const yIndex = isTimeSeries ? 0 : (frame.axes[1]?.index ?? 1);

    ctx.strokeStyle = "#5b8def";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < data.points; i++) {
      const x = isTimeSeries ? data.t[i]! : data.state[i]![xIndex]!;
      const y = isTimeSeries ? data.state[i]![0]! : data.state[i]![yIndex]!;
      const point = worldToCanvas(x, y, displayViewport, CANVAS_SIZE);
      if (i === 0) {
        ctx.moveTo(point.px, point.py);
      } else {
        ctx.lineTo(point.px, point.py);
      }
    }
    ctx.stroke();

    const last = data.points - 1;
    const lx = isTimeSeries ? data.t[last]! : data.state[last]![xIndex]!;
    const ly = isTimeSeries ? data.state[last]![0]! : data.state[last]![yIndex]!;
    const lastPoint = worldToCanvas(lx, ly, displayViewport, CANVAS_SIZE);
    ctx.fillStyle = "#fdd663";
    ctx.beginPath();
    ctx.arc(lastPoint.px, lastPoint.py, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [data, displayViewport, displaySettings.dotSize, isPhasePlane]);

  if (!data || !displayViewport) {
    return (
      <div className="trajectory-placeholder">
        Закрепите точку на карте и откройте портрет.
      </div>
    );
  }

  function pointerPos(event: React.PointerEvent<HTMLCanvasElement> | React.WheelEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    };
  }

  return (
    <div className="trajectory-wrap">
      {label && <h3 className="trajectory-title">{label}</h3>}
      {enableZoom && (
        <div className="canvas-toolbar">
          <button
            type="button"
            className="toolbar-btn secondary"
            disabled={viewWindow === null}
            onClick={() => setViewWindow(null)}
          >
            Reset zoom
          </button>
          <span className="muted toolbar-hint">Wheel zoom · Shift+drag pan</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="heatmap-canvas heatmap-canvas-interactive"
        onWheel={(event) => {
          if (!enableZoom || !baseViewport) {
            return;
          }
          event.preventDefault();
          const pos = pointerPos(event);
          const world = canvasToWorld(pos.x, pos.y, displayViewport, CANVAS_SIZE);
          const factor = event.deltaY > 0 ? 1.12 : 0.88;
          setViewWindow((current) => zoomWindowAt(current, baseViewport, factor, world));
        }}
        onPointerDown={(event) => {
          if (!enableZoom || !event.shiftKey || !baseViewport) {
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          const pos = pointerPos(event);
          panStartRef.current = {
            px: pos.x,
            py: pos.y,
            window: viewWindow ?? fullWindowFromViewport(baseViewport),
          };
        }}
        onPointerMove={(event) => {
          const panStart = panStartRef.current;
          if (!panStart || !baseViewport) {
            return;
          }
          const pos = pointerPos(event);
          const dxPx = pos.x - panStart.px;
          const dyPx = pos.y - panStart.py;
          const startViewport = viewportFromWindow(panStart.window, {
            x: baseViewport.x.name,
            y: baseViewport.y.name,
          });
          const worldDx = -(dxPx / CANVAS_SIZE) * (startViewport.x.max - startViewport.x.min);
          const worldDy = (dyPx / CANVAS_SIZE) * (startViewport.y.max - startViewport.y.min);
          setViewWindow(panWindow(panStart.window, baseViewport, worldDx, worldDy));
        }}
        onPointerUp={() => {
          panStartRef.current = null;
        }}
      />
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
      <p className="muted heatmap-hint">
        {data.full_points.toLocaleString()} points
        {data.downsample > 1 ? ` (downsample ×${data.downsample})` : ""}
      </p>
    </div>
  );
}

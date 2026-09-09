import type { GridData, TrajectoryData } from "../types";
import { colorToRgbBytes, gridValueToColor, layerValueRange } from "./colormap";
import type { PoolClassificationMode } from "./poolSettings";
import type { Frame, Viewport } from "./frame";
import { canvasToWorld, worldToCanvas } from "./frame";

export const CANVAS_DRAW_SIZE = 480;
const HEATMAP_BACKGROUND = [0x11, 0x13, 0x18] as const;

export interface HeatmapDrawLayer {
  grid: GridData;
  calculationType: string;
  opacity: number;
  lyapunovZero?: number;
  poolClassificationMode?: PoolClassificationMode;
}

export function gridCellIndex(
  world: number,
  axisMin: number,
  axisMax: number,
  count: number,
): number {
  if (count <= 1) {
    return world >= axisMin && world <= axisMax ? 0 : -1;
  }
  const step = (axisMax - axisMin) / (count - 1);
  const index = Math.floor((world - (axisMin - step / 2)) / step);
  if (index < 0 || index >= count) {
    return -1;
  }
  return index;
}

/** Return the value of the rendered grid cell under a world-space point. */
export function gridValueAtWorld(
  grid: GridData,
  world: { x: number; y: number },
): number | null {
  const xAxis = grid.frame.axes[0];
  const yAxis = grid.frame.axes[1];
  if (
    xAxis?.min === undefined ||
    xAxis.max === undefined ||
    yAxis?.min === undefined ||
    yAxis.max === undefined
  ) {
    return null;
  }

  const col = gridCellIndex(world.x, xAxis.min, xAxis.max, grid.cols);
  const row = gridCellIndex(world.y, yAxis.min, yAxis.max, grid.rows);
  if (row < 0 || col < 0) {
    return null;
  }

  return grid.values[row]?.[col] ?? null;
}

function rasterizeHeatmapLayer(
  grid: GridData,
  calculationType: string,
  viewport: Viewport,
  size: number,
  lyapunovZero?: number,
  poolClassificationMode?: PoolClassificationMode,
): ImageData | null {
  const xAxis = grid.frame.axes[0];
  const yAxis = grid.frame.axes[1];
  if (
    xAxis?.min === undefined ||
    xAxis.max === undefined ||
    yAxis?.min === undefined ||
    yAxis.max === undefined
  ) {
    return null;
  }

  const rows = grid.rows;
  const cols = grid.cols;
  const { min: layerMin, max: layerMax } = layerValueRange(grid.values);
  const image = new ImageData(size, size);
  const data = image.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const world = canvasToWorld(px + 0.5, py + 0.5, viewport, size);
      const j = gridCellIndex(world.x, xAxis.min, xAxis.max, cols);
      const i = gridCellIndex(world.y, yAxis.min, yAxis.max, rows);
      if (i < 0 || j < 0) {
        continue;
      }

      const value = grid.values[i]?.[j] ?? 0;
      const [r, g, b] = colorToRgbBytes(
        gridValueToColor(
          value,
          calculationType,
          grid.value_dtype,
          layerMin,
          layerMax,
          lyapunovZero,
          poolClassificationMode,
        ),
      );
      const offset = (py * size + px) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }

  return image;
}

/** Composite heatmap layers in one pass — aligned by world coords, no seam grid. */
export function drawHeatmapLayers(
  ctx: CanvasRenderingContext2D,
  layers: HeatmapDrawLayer[],
  viewport: Viewport,
  size: number,
) {
  const output = ctx.createImageData(size, size);
  const out = output.data;
  const pixelCount = size * size;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    out[offset] = HEATMAP_BACKGROUND[0];
    out[offset + 1] = HEATMAP_BACKGROUND[1];
    out[offset + 2] = HEATMAP_BACKGROUND[2];
    out[offset + 3] = 255;
  }

  for (const layer of layers) {
    if (layer.opacity <= 0) {
      continue;
    }
    const source = rasterizeHeatmapLayer(
      layer.grid,
      layer.calculationType,
      viewport,
      size,
      layer.lyapunovZero,
      layer.poolClassificationMode,
    );
    if (!source) {
      continue;
    }

    const src = source.data;
    const alpha = layer.opacity;
    const inv = 1 - alpha;

    for (let i = 0; i < pixelCount; i++) {
      const offset = i * 4;
      if (src[offset + 3] === 0) {
        continue;
      }
      out[offset] = Math.round(src[offset]! * alpha + out[offset]! * inv);
      out[offset + 1] = Math.round(src[offset + 1]! * alpha + out[offset + 1]! * inv);
      out[offset + 2] = Math.round(src[offset + 2]! * alpha + out[offset + 2]! * inv);
    }
  }

  ctx.putImageData(output, 0, 0);
}

export interface PhasePortraitDrawStyle {
  color: string;
  dotSize?: number;
  onPool?: boolean;
}

export function viewportForTrajectory(data: TrajectoryData): Viewport {
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

export function viewportFromTrajectories(datasets: TrajectoryData[]): Viewport | null {
  const planes = datasets.filter((d) => d.frame.space === "phase_plane");
  if (!planes.length) {
    return null;
  }
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let xName = "x";
  let yName = "y";

  for (const data of planes) {
    const vp = viewportForTrajectory(data);
    xMin = Math.min(xMin, vp.x.min);
    xMax = Math.max(xMax, vp.x.max);
    yMin = Math.min(yMin, vp.y.min);
    yMax = Math.max(yMax, vp.y.max);
    xName = vp.x.name;
    yName = vp.y.name;
  }

  return {
    x: { min: xMin, max: xMax, name: xName },
    y: { min: yMin, max: yMax, name: yName },
  };
}

export function drawHeatmapGrid(
  ctx: CanvasRenderingContext2D,
  grid: GridData,
  calculationType: string,
  viewport: Viewport,
  size: number,
  opacity = 1,
  lyapunovZero?: number,
  poolClassificationMode?: PoolClassificationMode,
) {
  drawHeatmapLayers(
    ctx,
    [{ grid, calculationType, opacity, lyapunovZero, poolClassificationMode }],
    viewport,
    size,
  );
}

/** Phase portrait: discrete attractor points (no connecting lines). */
export function drawPhasePortraitPath(
  ctx: CanvasRenderingContext2D,
  data: TrajectoryData,
  viewport: Viewport,
  size: number,
  style: PhasePortraitDrawStyle,
) {
  if (data.frame.space !== "phase_plane" || data.points < 1) {
    return;
  }

  const frame = data.frame as Frame;
  const xIndex = frame.axes[0]?.index ?? 0;
  const yIndex = frame.axes[1]?.index ?? 1;
  const dotSize = style.dotSize ?? 2.5;
  const color = style.color;

  for (let i = 0; i < data.points; i++) {
    const x = data.state[i]![xIndex]!;
    const y = data.state[i]![yIndex]!;
    const point = worldToCanvas(x, y, viewport, size);
    ctx.beginPath();
    ctx.arc(point.px, point.py, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

export function drawPhasePortraitOverlay(
  ctx: CanvasRenderingContext2D,
  data: TrajectoryData,
  viewport: Viewport,
  size: number,
  dotSize: number,
  strokeForContrast = false,
) {
  drawPhasePortraitPath(ctx, data, viewport, size, {
    color: "#7aa3f5",
    dotSize,
    onPool: strokeForContrast,
  });
}

export function drawWorldMarker(
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

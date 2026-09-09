import type { GridData, TrajectoryData } from "../types";
import type { PortraitOverlay } from "./portraitOverlay";
import {
  colorToRgbBytes,
  gridValueToColor,
  layerValueRange,
  paletteLegendEntries,
} from "./colormap";
import type { PoolClassificationMode } from "./poolSettings";
import { poolLegendCalculationType, resolvePoolClassificationMode } from "./poolSettings";
import { viewportFromFrames, type Frame, type Viewport } from "./frame";

const SVG_FONT = "Times New Roman, Times, serif";
const PLOT_SIZE = 720;
const MARGIN = { left: 80, top: 44, bottom: 76, right: 48 };
const COLORBAR_WIDTH = 22;
const COLORBAR_GAP = 14;
const COLORBAR_LABEL_GAP = 6;
const COLORBAR_RIGHT_PADDING = 8;
const COLORBAR_LABEL_FONT_SIZE = 11;
/** Slight overlap so adjacent heatmap cells do not show grid gaps. */
const CELL_OVERLAP = 0.6;

export interface HeatmapSvgLayer {
  grid: GridData;
  calculationType: string;
  lyapunovZero?: number;
  poolClassificationMode?: PoolClassificationMode;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colorToSvgFill(color: string): string {
  const [r, g, b] = colorToRgbBytes(color);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * SVG does not expose text measurement while it is being assembled. This is a
 * conservative Times-like estimate, with a tight padding so the exported page
 * ends at the legend instead of keeping a fixed blank strip on the right.
 */
function estimateSvgTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const character of text) {
    if (character === " ") {
      width += 0.28;
    } else if (/[ilI1.,:+]/.test(character)) {
      width += 0.32;
    } else if (/[MW@#]/.test(character)) {
      width += 0.9;
    } else {
      width += 0.58;
    }
  }
  return Math.ceil(width * fontSize);
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
    return value.toExponential(2);
  }
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function viewportFromGrid(grid: GridData): Viewport {
  return viewportFromFrames([grid.frame as Frame]);
}

function worldToPlot(x: number, y: number, viewport: Viewport): { x: number; y: number } {
  const xSpan = viewport.x.max - viewport.x.min || 1;
  const ySpan = viewport.y.max - viewport.y.min || 1;
  return {
    x: ((x - viewport.x.min) / xSpan) * PLOT_SIZE,
    y: ((viewport.y.max - y) / ySpan) * PLOT_SIZE,
  };
}

function plotLayout(
  colorbarType?: string,
  categories?: Array<{ value: number; label: string }>,
) {
  const entries = colorbarType ? paletteLegendEntries(colorbarType, categories) : [];
  const right =
    entries.length > 0
      ? COLORBAR_GAP +
        COLORBAR_WIDTH +
        COLORBAR_LABEL_GAP +
        Math.max(...entries.map((entry) => estimateSvgTextWidth(entry.label, COLORBAR_LABEL_FONT_SIZE))) +
        COLORBAR_RIGHT_PADDING
      : MARGIN.right;
  return {
    width: MARGIN.left + PLOT_SIZE + right,
    height: MARGIN.top + PLOT_SIZE + MARGIN.bottom,
    showColorbar: entries.length > 0,
  };
}

function svgHeatmapRects(
  grid: GridData,
  calculationType: string,
  viewport: Viewport,
  lyapunovZero?: number,
  poolClassificationMode?: PoolClassificationMode,
): string {
  const xAxis = grid.frame.axes[0];
  const yAxis = grid.frame.axes[1];
  if (
    xAxis?.min === undefined ||
    xAxis.max === undefined ||
    yAxis?.min === undefined ||
    yAxis.max === undefined
  ) {
    return "";
  }

  const rows = grid.rows;
  const cols = grid.cols;
  const xMin = Number(xAxis.min);
  const xMax = Number(xAxis.max);
  const yMin = Number(yAxis.min);
  const yMax = Number(yAxis.max);
  const xStep = cols > 1 ? (xMax - xMin) / (cols - 1) : 0;
  const yStep = rows > 1 ? (yMax - yMin) / (rows - 1) : 0;
  const { min: layerMin, max: layerMax } = layerValueRange(grid.values);

  const parts: string[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const cx = xMin + j * xStep;
      const cy = yMin + i * yStep;
      const wx0 = cx - xStep / 2;
      const wx1 = cx + xStep / 2;
      const wy0 = cy - yStep / 2;
      const wy1 = cy + yStep / 2;

      const tl = worldToPlot(wx0, wy1, viewport);
      const br = worldToPlot(wx1, wy0, viewport);
      const w = br.x - tl.x + CELL_OVERLAP;
      const h = br.y - tl.y + CELL_OVERLAP;
      if (w <= 0 || h <= 0) {
        continue;
      }

      const value = grid.values[i]?.[j] ?? 0;
      const fill = colorToSvgFill(
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
      parts.push(
        `<rect x="${tl.x.toFixed(4)}" y="${tl.y.toFixed(4)}" width="${w.toFixed(4)}" height="${h.toFixed(4)}" fill="${fill}" />`,
      );
    }
  }
  return parts.join("\n");
}

function svgAxes(viewport: Viewport): string {
  const tickCount = 5;
  const parts: string[] = [
    `<rect x="0" y="0" width="${PLOT_SIZE}" height="${PLOT_SIZE}" fill="none" stroke="#222222" stroke-width="1.2" />`,
  ];

  for (let i = 0; i <= tickCount; i++) {
    const t = i / tickCount;
    const xVal = viewport.x.min + t * (viewport.x.max - viewport.x.min);
    const yVal = viewport.y.min + t * (viewport.y.max - viewport.y.min);
    const xPos = t * PLOT_SIZE;
    const yPos = PLOT_SIZE - t * PLOT_SIZE;

    parts.push(
      `<line x1="${xPos.toFixed(2)}" y1="${PLOT_SIZE}" x2="${xPos.toFixed(2)}" y2="${(PLOT_SIZE + 6).toFixed(2)}" stroke="#222222" stroke-width="1" />`,
    );
    parts.push(
      `<text x="${xPos.toFixed(2)}" y="${(PLOT_SIZE + 22).toFixed(2)}" text-anchor="middle" font-family="${SVG_FONT}" font-size="13" fill="#111111">${escapeXml(formatTick(xVal))}</text>`,
    );

    parts.push(
      `<line x1="-6" y1="${yPos.toFixed(2)}" x2="0" y2="${yPos.toFixed(2)}" stroke="#222222" stroke-width="1" />`,
    );
    parts.push(
      `<text x="-10" y="${(yPos + 4).toFixed(2)}" text-anchor="end" font-family="${SVG_FONT}" font-size="13" fill="#111111">${escapeXml(formatTick(yVal))}</text>`,
    );
  }

  parts.push(
    `<text x="${(PLOT_SIZE / 2).toFixed(2)}" y="${(PLOT_SIZE + 52).toFixed(2)}" text-anchor="middle" font-family="${SVG_FONT}" font-size="16" fill="#111111">${escapeXml(viewport.x.name)}</text>`,
  );
  parts.push(
    `<text transform="translate(-56 ${(PLOT_SIZE / 2).toFixed(2)}) rotate(-90)" text-anchor="middle" font-family="${SVG_FONT}" font-size="16" fill="#111111">${escapeXml(viewport.y.name)}</text>`,
  );

  return parts.join("\n");
}

function svgDiscreteColorbar(
  calculationType: string,
  categories?: Array<{ value: number; label: string }>,
): string {
  const entries = paletteLegendEntries(calculationType, categories);
  const step = PLOT_SIZE / entries.length;
  const parts: string[] = [];

  entries.forEach((entry, index) => {
    const y = index * step;
    parts.push(
      `<rect x="0" y="${y.toFixed(2)}" width="${COLORBAR_WIDTH}" height="${(step + 0.01).toFixed(2)}" fill="${colorToSvgFill(entry.color)}" />`,
    );
    parts.push(
      `<text x="${(COLORBAR_WIDTH + COLORBAR_LABEL_GAP).toFixed(2)}" y="${(y + step * 0.72).toFixed(2)}" font-family="${SVG_FONT}" font-size="${COLORBAR_LABEL_FONT_SIZE}" fill="#111111">${escapeXml(entry.label)}</text>`,
    );
  });

  return parts.join("\n");
}

function wrapPlot(
  content: string,
  viewport: Viewport,
  colorbarType?: string,
  categories?: Array<{ value: number; label: string }>,
): string {
  const { width, height, showColorbar } = plotLayout(colorbarType, categories);

  const colorbarMarkup =
    showColorbar && colorbarType
      ? `<g transform="translate(${MARGIN.left + PLOT_SIZE + COLORBAR_GAP} ${MARGIN.top})">${svgDiscreteColorbar(colorbarType, categories)}</g>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <clipPath id="plot-clip">
      <rect x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_SIZE}" height="${PLOT_SIZE}" />
    </clipPath>
  </defs>
  <rect width="100%" height="100%" fill="#ffffff" />
  <rect x="${MARGIN.left}" y="${MARGIN.top}" width="${PLOT_SIZE}" height="${PLOT_SIZE}" fill="#ffffff" />
  <g clip-path="url(#plot-clip)">
    <g transform="translate(${MARGIN.left} ${MARGIN.top})">
      ${content}
    </g>
  </g>
  <g transform="translate(${MARGIN.left} ${MARGIN.top})">
    ${svgAxes(viewport)}
  </g>
  ${colorbarMarkup}
</svg>`;
}

/** Export a single grid computation at full frame extent (not explorer zoom/overlays). */
export function buildHeatmapSvg(layer: HeatmapSvgLayer): string {
  const viewport = viewportFromGrid(layer.grid);
  const content = svgHeatmapRects(
    layer.grid,
    layer.calculationType,
    viewport,
    layer.lyapunovZero,
    layer.poolClassificationMode,
  );
  return wrapPlot(content, viewport, layer.calculationType, layer.grid.categories);
}

function svgColor(color: string): string {
  if (color.startsWith("#")) {
    return color;
  }
  return colorToSvgFill(color);
}

function svgPortraitOverlays(
  overlays: PortraitOverlay[],
  viewport: Viewport,
  dotSize: number,
): string {
  const parts: string[] = [];
  for (const overlay of overlays) {
    if (!overlay.visible) {
      continue;
    }
    const data: TrajectoryData = overlay.trajectory;
    if (data.frame.space !== "phase_plane" || data.points < 1) {
      continue;
    }
    const xIndex = data.frame.axes[0]?.index ?? 0;
    const yIndex = data.frame.axes[1]?.index ?? 1;
    const fill = svgColor(overlay.color);
    const r = Math.max(0.5, dotSize);
    for (let i = 0; i < data.points; i++) {
      const x = data.state[i]![xIndex]!;
      const y = data.state[i]![yIndex]!;
      const p = worldToPlot(x, y, viewport);
      parts.push(
        `<circle cx="${p.x.toFixed(4)}" cy="${p.y.toFixed(4)}" r="${r.toFixed(2)}" fill="${fill}" />`,
      );
    }
  }
  return parts.join("\n");
}

export interface PoolSvgExportOptions {
  poolClassificationMode?: PoolClassificationMode;
  lyapunovZero?: number;
  overlays?: PortraitOverlay[];
  showPortraitOverlay?: boolean;
  dotSize?: number;
}

/** Export pool-of-attraction grid at full frame extent; optional trajectory overlays. */
export function buildPoolSvg(
  grid: GridData,
  poolClassificationMode?: PoolClassificationMode,
  lyapunovZero?: number,
  exportOptions?: Omit<PoolSvgExportOptions, "poolClassificationMode" | "lyapunovZero">,
): string {
  const mode = resolvePoolClassificationMode(poolClassificationMode, grid.value_dtype);
  const viewport = viewportFromGrid(grid);
  let content = svgHeatmapRects(
    grid,
    "pool_of_attraction",
    viewport,
    mode === "lyapunov" ? lyapunovZero : undefined,
    mode,
  );
  if (
    exportOptions?.showPortraitOverlay &&
    exportOptions.overlays &&
    exportOptions.overlays.length > 0
  ) {
    const trajectories = svgPortraitOverlays(
      exportOptions.overlays,
      viewport,
      exportOptions.dotSize ?? 2.5,
    );
    if (trajectories) {
      content = `${content}\n${trajectories}`;
    }
  }
  return wrapPlot(content, viewport, poolLegendCalculationType(mode));
}

export function downloadHeatmapLayer(layer: HeatmapSvgLayer, filename?: string): void {
  downloadSvgFile(filename ?? `${layer.calculationType}.svg`, buildHeatmapSvg(layer));
}

export function downloadPoolGrid(
  grid: GridData,
  poolClassificationMode?: PoolClassificationMode,
  lyapunovZero?: number,
  exportOptions?: Omit<PoolSvgExportOptions, "poolClassificationMode" | "lyapunovZero">,
): void {
  downloadSvgFile(
    "pool_of_attraction.svg",
    buildPoolSvg(grid, poolClassificationMode, lyapunovZero, exportOptions),
  );
}

export function downloadSvgFile(filename: string, svg: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

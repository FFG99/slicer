export interface AxisFrame {
  name: string;
  role: string;
  min?: number;
  max?: number;
  steps?: number;
  index?: number;
}

export interface Frame {
  system: string;
  space: string;
  axes: AxisFrame[];
  parameters?: Record<string, number>;
}

function parametersMatch(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): boolean {
  const aEntries = Object.entries(a ?? {}).sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  const bEntries = Object.entries(b ?? {}).sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
  return (
    aEntries.length === bEntries.length &&
    aEntries.every(
      ([key, value], index) => key === bEntries[index]?.[0] && value === bEntries[index]?.[1],
    )
  );
}

export interface WorldRect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Viewport {
  x: { min: number; max: number; name: string };
  y: { min: number; max: number; name: string };
}

export function framesCompatible(a: Frame, b: Frame): boolean {
  return (
    a.system === b.system &&
    a.space === b.space &&
    a.axes[0]?.name === b.axes[0]?.name &&
    a.axes[1]?.name === b.axes[1]?.name &&
    parametersMatch(a.parameters, b.parameters)
  );
}

export function parseRunFrame(run: {
  system: string;
  frame: Record<string, unknown> | null;
}): Frame | null {
  const raw = run.frame;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const space = raw.space;
  const axes = raw.axes;
  if (typeof space !== "string" || !Array.isArray(axes)) {
    return null;
  }
  return {
    system: run.system,
    space,
    axes: axes as AxisFrame[],
    parameters:
      raw.parameters && typeof raw.parameters === "object"
        ? (raw.parameters as Record<string, number>)
        : undefined,
  };
}

export function canOverlayRunOnParameterLayers(
  run: { system: string; frame: Record<string, unknown> | null },
  baseFrame: Frame | null,
): boolean {
  const frame = parseRunFrame(run);
  if (!frame) {
    return baseFrame === null;
  }
  if (frame.space !== "parameter_plane") {
    return false;
  }
  if (!baseFrame) {
    return true;
  }
  return framesCompatible(baseFrame, frame);
}

export function viewportFromFrames(frames: Frame[]): Viewport {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let xName = "x";
  let yName = "y";

  for (const frame of frames) {
    const x = frame.axes[0];
    const y = frame.axes[1];
    if (x?.min !== undefined && x.max !== undefined) {
      xMin = Math.min(xMin, x.min);
      xMax = Math.max(xMax, x.max);
      xName = x.name;
    }
    if (y?.min !== undefined && y.max !== undefined) {
      yMin = Math.min(yMin, y.min);
      yMax = Math.max(yMax, y.max);
      yName = y.name;
    }
  }

  return {
    x: { min: xMin, max: xMax, name: xName },
    y: { min: yMin, max: yMax, name: yName },
  };
}

export function worldToCanvas(
  x: number,
  y: number,
  viewport: Viewport,
  size: number,
): { px: number; py: number } {
  const px =
    ((x - viewport.x.min) / (viewport.x.max - viewport.x.min)) * size;
  const py =
    ((viewport.y.max - y) / (viewport.y.max - viewport.y.min)) * size;
  return { px, py };
}

export function canvasToWorld(
  px: number,
  py: number,
  viewport: Viewport,
  size: number,
): { x: number; y: number } {
  const x =
    viewport.x.min + (px / size) * (viewport.x.max - viewport.x.min);
  const y =
    viewport.y.max - (py / size) * (viewport.y.max - viewport.y.min);
  return { x, y };
}

export function normalizeRect(rect: WorldRect): WorldRect {
  return {
    xMin: Math.min(rect.xMin, rect.xMax),
    xMax: Math.max(rect.xMin, rect.xMax),
    yMin: Math.min(rect.yMin, rect.yMax),
    yMax: Math.max(rect.yMin, rect.yMax),
  };
}

export function canvasRectToWorld(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  viewport: Viewport,
  size: number,
): WorldRect {
  const a = canvasToWorld(x0, y0, viewport, size);
  const b = canvasToWorld(x1, y1, viewport, size);
  return normalizeRect({
    xMin: a.x,
    xMax: b.x,
    yMin: a.y,
    yMax: b.y,
  });
}

export function viewportFromWindow(window: WorldRect, names: { x: string; y: string }): Viewport {
  return {
    x: { min: window.xMin, max: window.xMax, name: names.x },
    y: { min: window.yMin, max: window.yMax, name: names.y },
  };
}

export function fullWindowFromViewport(viewport: Viewport): WorldRect {
  return {
    xMin: viewport.x.min,
    xMax: viewport.x.max,
    yMin: viewport.y.min,
    yMax: viewport.y.max,
  };
}

export function zoomWindowAt(
  window: WorldRect | null,
  base: Viewport,
  factor: number,
  focal: { x: number; y: number },
): WorldRect {
  const current = window ?? fullWindowFromViewport(base);
  const width = current.xMax - current.xMin;
  const height = current.yMax - current.yMin;
  const newWidth = width * factor;
  const newHeight = height * factor;
  const relX = width > 0 ? (focal.x - current.xMin) / width : 0.5;
  const relY = height > 0 ? (focal.y - current.yMin) / height : 0.5;
  return normalizeRect({
    xMin: focal.x - relX * newWidth,
    xMax: focal.x + (1 - relX) * newWidth,
    yMin: focal.y - relY * newHeight,
    yMax: focal.y + (1 - relY) * newHeight,
  });
}

export function panWindow(
  window: WorldRect | null,
  base: Viewport,
  dx: number,
  dy: number,
): WorldRect {
  const current = window ?? fullWindowFromViewport(base);
  return {
    xMin: current.xMin + dx,
    xMax: current.xMax + dx,
    yMin: current.yMin + dy,
    yMax: current.yMax + dy,
  };
}

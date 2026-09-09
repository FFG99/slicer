/** Legacy gnuplot palettes from PhaseSlicer visualizators. */

import type { PoolClassificationMode } from "./poolSettings";
import { resolvePoolClassificationMode } from "./poolSettings";

export type GridPaletteId =
  | "attraction_map"
  | "attraction_map_composition"
  | "attraction_map_periods"
  | "pool_of_attraction"
  | "dynamic_modes_discrete"
  | "dynamic_modes_continuous"
  | "lyapunov_spectrum";

// AM / DM discrete: indices 1..14 (index 0 unused).
export const ATTRACTOR_COUNT_PALETTE: Record<number, string> = {
  1: "#B3B3B3", // gray70
  2: "#FFC0CB", // pink
  3: "#0000FF", // blue
  4: "#ADD8E6", // light-blue
  5: "#00FFFF", // cyan
  6: "#A52A2A", // brown
  7: "#F0E68C", // khaki
  8: "#006400", // dark-green
  9: "#228B22", // forest-green
  10: "#FFC0CB", // pink
  11: "#FF0000", // red
  12: "#FF00FF", // magenta
  13: "#FFFFFF", // white — bucket 13..119
  14: "#000000", // black — bucket 120+
};

const ATTRACTOR_COMPOSITION_PALETTE: Record<number, string> = {
  1: "#e76f51", 2: "#2a9d8f", 3: "#e9c46a", 4: "#457b9d", 5: "#f4a261",
  6: "#8ab17d", 7: "#9b5de5", 8: "#ef476f", 9: "#118ab2", 10: "#06d6a0",
  11: "#ff9f1c", 12: "#5e548e", 13: "#bc6c25", 14: "#588157", 15: "#d62828",
  16: "#0077b6", 17: "#c77dff", 18: "#ff70a6", 19: "#3a86ff", 20: "#8338ec",
  21: "#fb5607", 22: "#43aa8b", 23: "#577590", 24: "#f94144", 25: "#90be6d",
  26: "#277da1", 27: "#f9844a", 28: "#4d908e", 29: "#b56576", 30: "#6d597a",
};

// AP: indices 0..13 (0 = divergence).
export const POOL_PALETTE: Record<number, string> = {
  0: "#B3B3B3", // gray70 — divergence
  1: "#FFC0CB",
  2: "#0000FF",
  3: "#ADD8E6",
  4: "#00FFFF",
  5: "#A52A2A",
  6: "#F0E68C",
  7: "#006400",
  8: "#228B22",
  9: "#FFC0CB",
  10: "#FF0000",
  11: "#FF00FF",
  12: "#FFFFFF", // bucket 12..119
  13: "#000000", // bucket 120+
};

// DM discrete: indices 1..14.
export const DYNAMIC_MODES_DISCRETE_PALETTE: Record<number, string> = {
  1: "#708090", // slategray
  2: "#FFB761", // tan1
  3: "#0000FF",
  4: "#ADD8E6",
  5: "#00FFFF",
  6: "#A52A2A",
  7: "#F0E68C",
  8: "#006400",
  9: "#228B22",
  10: "#FFC0CB",
  11: "#FF0000",
  12: "#FF00FF",
  13: "#000000", // bucket 13..119
  14: "#B3B3B3", // gray — bucket 120+
};

export const LLE_NEGATIVE = "#FF0000";
export const LLE_ZERO = "#FFFF00";
export const LLE_POSITIVE = "#000000";

/** Shared divergence color used across every grid calculation (iPhone 17 Pro "Cosmic Orange"). */
export const DIVERGENCE_COLOR = "#F77E2D";
const paletteOverrides = new Map<string, string>();

export function paletteColor(calculationType: string, index: number | "div", fallback: string): string {
  return paletteOverrides.get(`${calculationType}:${index}`) ?? fallback;
}

export function setPaletteColor(calculationType: string, index: number | "div", color: string): void {
  paletteOverrides.set(`${calculationType}:${index}`, color);
  window.dispatchEvent(new Event("slicer-palette-change"));
}

/** Divergence sentinel for integer grids; NaN is the sentinel for float grids. */
export function isDivergentValue(value: number, valueDtype: "uint64" | "float64" | undefined): boolean {
  if (Number.isNaN(value)) {
    return true;
  }
  return valueDtype !== "float64" && Math.round(value) === 0;
}

const DEFAULT_LYAPUNOV_ZERO = 0.001;

export { DEFAULT_LYAPUNOV_ZERO };

export function resolveLyapunovZero(zero?: number): number {
  return zero !== undefined && zero > 0 ? zero : DEFAULT_LYAPUNOV_ZERO;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function paletteLookup(table: Record<number, string>, index: number, fallback: string): string {
  return table[index] ?? fallback;
}

/** Map raw attractor / period counts to legacy gnuplot palette indices. */
export function bucketDiscreteGridValue(
  value: number,
  paletteId: Exclude<GridPaletteId, "dynamic_modes_continuous" | "lyapunov_spectrum">,
): number {
  const v = Math.round(value);

  if (paletteId === "pool_of_attraction") {
    if (v === 0) {
      return 0;
    }
    if (v >= 120) {
      return 13;
    }
    if (v >= 12) {
      return 12;
    }
    return clamp(v, 1, 11);
  }

  if (paletteId === "dynamic_modes_discrete") {
    if (v >= 120) {
      return 14;
    }
    if (v >= 13) {
      return 13;
    }
    return clamp(v, 1, 12);
  }

  // attraction_map
  if (v >= 120) {
    return 14;
  }
  if (v >= 13) {
    return 13;
  }
  return clamp(v, 1, 12);
}

/** Gnuplot `set palette rgbformulae 7,5,15` (DM continuous mode). */
export function dynamicModesContinuousColor(value: number, min: number, max: number): string {
  if (max <= min) {
    return dynamicModesContinuousColor(0, 0, 1);
  }
  const gray = clamp((value - min) / (max - min), 0, 1);
  const r = Math.round(gray * 255);
  const g = Math.round(Math.sqrt(gray) * 255);
  const b = Math.round((0.5 + 0.5 * Math.sin(2 * Math.PI * gray)) * 255);
  return `rgb(${r},${g},${b})`;
}

/** Gnuplot LLE palette: red (P) → yellow (Q) → black (C) over [-zero, zero]. */
export function lyapunovSpectrumColor(value: number, zero = DEFAULT_LYAPUNOV_ZERO): string {
  const bound = zero > 0 ? zero : DEFAULT_LYAPUNOV_ZERO;
  const clamped = clamp(value, -bound, bound);
  const t = (clamped + bound) / (2 * bound);
  if (t <= 0.5) {
    return mixHex(
      paletteColor("lyapunov_spectrum", 1, LLE_NEGATIVE),
      paletteColor("lyapunov_spectrum", 2, LLE_ZERO),
      t / 0.5,
    );
  }
  return mixHex(
    paletteColor("lyapunov_spectrum", 2, LLE_ZERO),
    paletteColor("lyapunov_spectrum", 3, LLE_POSITIVE),
    (t - 0.5) / 0.5,
  );
}

function mixHex(from: string, to: string, t: number): string {
  const a = clamp(t, 0, 1);
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [r0, g0, b0] = parse(from);
  const [r1, g1, b1] = parse(to);
  const r = Math.round(r0 + (r1 - r0) * a);
  const g = Math.round(g0 + (g1 - g0) * a);
  const b = Math.round(b0 + (b1 - b0) * a);
  return `rgb(${r},${g},${b})`;
}

export function paletteForCalculation(calculationType: string): GridPaletteId | null {
  switch (calculationType) {
    case "attraction_map":
      return "attraction_map";
    case "attraction_map_composition":
      return "attraction_map_composition";
    case "attraction_map_periods":
      return "attraction_map_periods";
    case "pool_of_attraction":
      return "pool_of_attraction";
    case "dynamic_modes":
      return "dynamic_modes_discrete";
    case "lyapunov_spectrum":
      return "lyapunov_spectrum";
    default:
      return null;
  }
}

export function gridValueToColor(
  value: number,
  calculationType: string,
  valueDtype: "uint64" | "float64" | undefined,
  layerMin: number,
  layerMax: number,
  lyapunovZero = DEFAULT_LYAPUNOV_ZERO,
  poolClassificationMode?: PoolClassificationMode,
): string {
  const paletteId = paletteForCalculation(calculationType);

  // Uniform divergence handling across every calculation: integer grids use 0 as
  // the divergence sentinel, float grids use NaN. Always paint it gray.
  if (isDivergentValue(value, valueDtype)) {
    return paletteColor(calculationType, "div", DIVERGENCE_COLOR);
  }

  const resolvedPoolMode =
    calculationType === "pool_of_attraction"
      ? resolvePoolClassificationMode(poolClassificationMode, valueDtype)
      : undefined;

  if (paletteId === "pool_of_attraction") {
    if (resolvedPoolMode === "lyapunov") {
      return lyapunovSpectrumColor(value, resolveLyapunovZero(lyapunovZero));
    }
    if (resolvedPoolMode === "period") {
      const index = bucketDiscreteGridValue(value, "dynamic_modes_discrete");
      return paletteColor("dynamic_modes", index, paletteLookup(DYNAMIC_MODES_DISCRETE_PALETTE, index, "#708090"));
    }
    const index = bucketDiscreteGridValue(value, "pool_of_attraction");
    return paletteColor("pool_of_attraction", index, paletteLookup(POOL_PALETTE, index, "#B3B3B3"));
  }

  if (paletteId === "lyapunov_spectrum" || valueDtype === "float64") {
    return lyapunovSpectrumColor(value, resolveLyapunovZero(lyapunovZero));
  }

  if (paletteId === "dynamic_modes_continuous") {
    return dynamicModesContinuousColor(value, layerMin, layerMax);
  }

  if (paletteId === "dynamic_modes_discrete") {
    const index = bucketDiscreteGridValue(value, "dynamic_modes_discrete");
    return paletteColor("dynamic_modes", index, paletteLookup(DYNAMIC_MODES_DISCRETE_PALETTE, index, "#708090"));
  }

  if (paletteId === "attraction_map") {
    const index = bucketDiscreteGridValue(value, "attraction_map");
    return paletteColor("attraction_map", index, paletteLookup(ATTRACTOR_COUNT_PALETTE, index, "#B3B3B3"));
  }

  if (paletteId === "attraction_map_composition" || paletteId === "attraction_map_periods") {
    const index = Math.round(value);
    const fallback =
      ATTRACTOR_COMPOSITION_PALETTE[index] ??
      `hsl(${(index * 47) % 360} 58% 48%)`;
    return paletteColor(calculationType, index, fallback);
  }

  // Fallback for unknown grid types.
  if (layerMax <= layerMin) {
    return ATTRACTOR_COUNT_PALETTE[1]!;
  }
  const t = clamp((value - layerMin) / (layerMax - layerMin), 0, 1);
  const idx = 1 + Math.round(t * 12);
  return paletteLookup(ATTRACTOR_COUNT_PALETTE, idx, "#B3B3B3");
}

export function layerValueRange(values: number[][]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const row of values) {
    for (const value of row) {
      if (!Number.isFinite(value)) {
        continue;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  if (!Number.isFinite(min)) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}

/** @deprecated Use gridValueToColor — kept for any external imports. */
export function valueToColor(value: number, min: number, max: number): string {
  return dynamicModesContinuousColor(value, min, max);
}

export interface PaletteLegendEntry {
  label: string;
  color: string;
  index: number | "div";
}

/** Discrete colorbox entries matching legacy gnuplot visualizators. */
export function paletteLegendEntries(
  calculationType: string,
  categories?: Array<{ value: number; label: string }>,
): PaletteLegendEntry[] {
  if (
    calculationType === "attraction_map_composition" ||
    calculationType === "attraction_map_periods"
  ) {
    return [
      { label: "div", color: paletteColor(calculationType, "div", DIVERGENCE_COLOR), index: "div" },
      ...(categories ?? []).map((category) => ({
        label: category.label,
        color: paletteColor(
          calculationType,
          category.value,
          ATTRACTOR_COMPOSITION_PALETTE[category.value] ??
            `hsl(${(category.value * 47) % 360} 58% 48%)`,
        ),
        index: category.value,
      })),
    ];
  }
  if (calculationType === "lyapunov_spectrum") {
    return [
      { label: "P", color: paletteColor(calculationType, 1, LLE_NEGATIVE), index: 1 },
      { label: "Q", color: paletteColor(calculationType, 2, LLE_ZERO), index: 2 },
      { label: "C", color: paletteColor(calculationType, 3, LLE_POSITIVE), index: 3 },
      { label: "div", color: paletteColor(calculationType, "div", DIVERGENCE_COLOR), index: "div" },
    ];
  }

  if (calculationType === "pool_of_attraction") {
    return [
      { label: "div", color: paletteColor(calculationType, "div", DIVERGENCE_COLOR), index: "div" },
      ...Array.from({ length: 11 }, (_, i) => ({
        label: String(i + 1),
        color: paletteColor(calculationType, i + 1, POOL_PALETTE[i + 1]!), index: i + 1,
      })),
      { label: "13-120", color: paletteColor(calculationType, 12, POOL_PALETTE[12]!), index: 12 },
      { label: "120+", color: paletteColor(calculationType, 13, POOL_PALETTE[13]!), index: 13 },
    ];
  }

  if (calculationType === "dynamic_modes") {
    return [
      { label: "div", color: paletteColor(calculationType, "div", DIVERGENCE_COLOR), index: "div" },
      ...Array.from({ length: 14 }, (_, i) => ({
        label: i === 12 ? "13-120" : i === 13 ? "120+" : String(i + 1),
        color: paletteColor(calculationType, i + 1, DYNAMIC_MODES_DISCRETE_PALETTE[i + 1]!), index: i + 1,
      })),
    ];
  }

  if (calculationType === "attraction_map") {
    return [
      { label: "div", color: paletteColor(calculationType, "div", DIVERGENCE_COLOR), index: "div" },
      ...Array.from({ length: 12 }, (_, i) => ({
        label: String(i + 1),
        color: paletteColor(calculationType, i + 1, ATTRACTOR_COUNT_PALETTE[i + 1]!), index: i + 1,
      })),
      { label: "13-120", color: paletteColor(calculationType, 13, ATTRACTOR_COUNT_PALETTE[13]!), index: 13 },
      { label: "120+", color: paletteColor(calculationType, 14, ATTRACTOR_COUNT_PALETTE[14]!), index: 14 },
    ];
  }

  return [];
}

export function hasPaletteLegend(
  calculationType: string,
  categories?: Array<{ value: number; label: string }>,
): boolean {
  return paletteLegendEntries(calculationType, categories).length > 0;
}

export function globalValueRange(values: number[][][]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const grid of values) {
    const range = layerValueRange(grid);
    min = Math.min(min, range.min);
    max = Math.max(max, range.max);
  }
  if (!Number.isFinite(min)) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}

/** Parse CSS colors used by palettes into byte components for canvas ImageData. */
export function colorToRgbBytes(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const match = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (match) {
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const hslMatch = color.match(
    /hsl\(\s*(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*\)/i,
  );
  if (hslMatch) {
    const hue = ((Number(hslMatch[1]) % 360) + 360) % 360;
    const saturation = clamp(Number(hslMatch[2]) / 100, 0, 1);
    const lightness = clamp(Number(hslMatch[3]) / 100, 0, 1);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = hue / 60;
    const secondary = chroma * (1 - Math.abs((segment % 2) - 1));
    const [r, g, b] =
      segment < 1 ? [chroma, secondary, 0] :
      segment < 2 ? [secondary, chroma, 0] :
      segment < 3 ? [0, chroma, secondary] :
      segment < 4 ? [0, secondary, chroma] :
      segment < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
    const offset = lightness - chroma / 2;
    return [r, g, b].map((value) => Math.round((value + offset) * 255)) as [number, number, number];
  }
  return [179, 179, 179];
}

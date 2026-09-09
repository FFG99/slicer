import { isDivergentValue } from "./colormap";
import type { PoolClassificationMode } from "./poolSettings";
import type { GridData } from "../types";

export interface PoolAttractorSample {
  key: string;
  label: string;
  world: { x: number; y: number };
}

function cellCenter(min: number, max: number, count: number, index: number): number {
  if (count <= 1) {
    return (min + max) / 2;
  }
  const step = (max - min) / (count - 1);
  return min + index * step;
}

export function cellWorldFromGrid(grid: GridData, row: number, col: number): { x: number; y: number } {
  const xAxis = grid.frame.axes[0];
  const yAxis = grid.frame.axes[1];
  if (!xAxis || !yAxis || xAxis.min === undefined || xAxis.max === undefined || yAxis.min === undefined || yAxis.max === undefined) {
    return { x: 0, y: 0 };
  }
  return {
    x: cellCenter(xAxis.min, xAxis.max, grid.cols, col),
    y: cellCenter(yAxis.min, yAxis.max, grid.rows, row),
  };
}

export function supportsUniqueAttractorPortraits(mode: PoolClassificationMode): boolean {
  return mode === "ncf" || mode === "period";
}

/** One representative IC per distinct pool class (NCF id or period label). */
export function uniquePoolAttractorSamples(
  grid: GridData,
  mode: PoolClassificationMode,
): PoolAttractorSample[] {
  if (!supportsUniqueAttractorPortraits(mode)) {
    return [];
  }

  const seen = new Map<string, PoolAttractorSample>();

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const value = grid.values[row]?.[col];
      if (value === undefined || isDivergentValue(value, grid.value_dtype)) {
        continue;
      }

      let key: string;
      let label: string;
      if (mode === "ncf") {
        const id = Math.round(value);
        if (id <= 0) {
          continue;
        }
        key = `ncf:${id}`;
        label = `#${id}`;
      } else {
        const period = Math.round(value);
        if (period <= 0) {
          continue;
        }
        key = `period:${period}`;
        label = `P=${period}`;
      }

      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label,
          world: cellWorldFromGrid(grid, row, col),
        });
      }
    }
  }

  return [...seen.values()].sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
}

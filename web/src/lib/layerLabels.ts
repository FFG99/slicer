import { calculationLabel } from "./labels";
import type { Run } from "../types";

const DIRECTION_ARROWS: Record<string, string> = {
  n: "↑",
  r: "→",
  l: "←",
  u: "↓",
  d: "↘",
};

export function defaultLayerLabel(run: Run): string {
  const parts = [calculationLabel(run.calculation_type)];
  const direction = run.parameters.direction;
  if (typeof direction === "string" && direction) {
    const arrow = DIRECTION_ARROWS[direction];
    parts.push(direction === "n" ? "Не продолжать" : arrow ? `${arrow} ${direction}` : direction);
  }
  parts.push(run.id.slice(0, 8));
  return parts.join(" · ");
}

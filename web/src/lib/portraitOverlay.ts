import type { PhasePortraitContext } from "./linked";
import type { TrajectoryData } from "../types";

export const PORTRAIT_OVERLAY_COLORS = [
  "#7aa3f5",
  "#f28b82",
  "#fdd663",
  "#6bc995",
  "#c58af9",
  "#78d7ee",
  "#e6a85c",
  "#b8a0e8",
] as const;

export interface PortraitOverlay {
  id: string;
  label: string;
  color: string;
  trajectory: TrajectoryData;
  context: PhasePortraitContext;
  ic: { x: number; y: number };
  visible: boolean;
  /** Unpinned overlays are replaced on the next pool click; pinned ones stay in the stack. */
  pinned: boolean;
}

export function icLabel(
  ic: { x: number; y: number },
  axisNames?: { x: string; y: string },
): string {
  const xName = axisNames?.x ?? "x";
  const yName = axisNames?.y ?? "y";
  return `${xName}=${ic.x.toFixed(3)}, ${yName}=${ic.y.toFixed(3)}`;
}

export function overlayColor(index: number): string {
  return PORTRAIT_OVERLAY_COLORS[index % PORTRAIT_OVERLAY_COLORS.length];
}

export function createOverlayId(): string {
  return `portrait-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
